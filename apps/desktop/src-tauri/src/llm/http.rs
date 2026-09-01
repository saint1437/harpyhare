use serde_json::Value;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

use super::{
    build_http_client, build_probe_http_client, pump_sse_stream,
    require_ok_status, LlmError, LlmStreamSink, SseParser, DEFAULT_READ_TIMEOUT, WARM_UP_TIMEOUT,
};

/// How a request proves who it is.
///
/// `Bearer` covers two different things on purpose: a vendor whose own scheme is
/// bearer auth, and the relay's `itk_` token, which replaces the vendor
/// credential entirely. `LlmHttp::proxy` is what tells them apart, and it only
/// matters for error mapping — a 401 from the relay is an API error, a 401 from
/// the vendor means the user's key is wrong.
#[derive(Clone)]
pub enum Credential {
    ApiKeyHeader { header: &'static str, key: String },
    Bearer(String),
}

pub type StaticHeaders = &'static [(&'static str, &'static str)];

/// Everything about talking to an LLM HTTP API that is not vendor-specific:
/// the pooled client, auth, error mapping, cancellation and SSE pumping.
///
/// A vendor module owns its request body, its SSE dialect and its catalogue —
/// and nothing else. Before this existed each new vendor re-implemented client
/// construction, header plumbing, status mapping, the cancel/select dance and
/// the reachability probe, which is roughly half of what a vendor module used
/// to be.
#[derive(Clone)]
pub struct LlmHttp {
    client: reqwest::Client,
    base_url: String,
    credential: Credential,
    key_label: &'static str,
    headers: StaticHeaders,
    proxy: bool,
}

impl LlmHttp {
    /// Straight at the vendor with the user's own credential.
    pub fn direct(base_url: impl Into<String>, credential: Credential, key_label: &'static str) -> Self {
        Self {
            client: build_http_client(DEFAULT_READ_TIMEOUT),
            base_url: base_url.into(),
            credential,
            key_label,
            headers: &[],
            proxy: false,
        }
    }

    /// Through the relay, authenticated by an access token.
    pub fn proxied(base_url: impl Into<String>, access_token: String, key_label: &'static str) -> Self {
        Self {
            proxy: true,
            ..Self::direct(base_url, Credential::Bearer(access_token), key_label)
        }
    }

    /// Headers every request to this vendor carries (`anthropic-version`).
    pub fn with_headers(mut self, headers: StaticHeaders) -> Self {
        self.headers = headers;
        self
    }

    pub fn with_read_timeout(mut self, d: Duration) -> Self {
        self.client = build_http_client(d);
        self
    }

    pub fn with_base_url(mut self, base_url: String) -> Self {
        self.base_url = base_url;
        self
    }

    pub fn is_proxy(&self) -> bool {
        self.proxy
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.base_url)
    }

    fn prepared(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let req = self
            .headers
            .iter()
            .fold(req, |acc, (name, value)| acc.header(*name, *value));
        match &self.credential {
            Credential::ApiKeyHeader { header, key } => req.header(*header, key),
            Credential::Bearer(token) => req.bearer_auth(token),
        }
    }

    async fn send(&self, req: reqwest::RequestBuilder) -> Result<reqwest::Response, LlmError> {
        self.prepared(req)
            .send()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))
    }

    async fn json_of(resp: reqwest::Response) -> Result<Value, LlmError> {
        resp.json().await.map_err(|e| LlmError::Network(e.to_string()))
    }

    /// `path` carries its own query string when the vendor needs one.
    pub async fn get_json(&self, path: &str, timeout: Duration) -> Result<Value, LlmError> {
        let resp = self.send(self.client.get(self.url(path)).timeout(timeout)).await?;
        let resp = require_ok_status(resp, self.key_label, self.proxy).await?;
        Self::json_of(resp).await
    }

    pub async fn post_json(&self, path: &str, body: &Value) -> Result<Value, LlmError> {
        let resp = self.send(self.client.post(self.url(path)).json(body)).await?;
        let resp = require_ok_status(resp, self.key_label, self.proxy).await?;
        Self::json_of(resp).await
    }

    /// POST a body and pump the SSE answer into `sink`, honouring `cancel` both
    /// while the request is in flight and while the stream is running — without
    /// which "Stop" would still be billed for a whole generation.
    pub async fn post_sse(
        &self,
        path: &str,
        body: &Value,
        parser: SseParser,
        cancel: CancellationToken,
        sink: &mut dyn LlmStreamSink,
    ) -> Result<(), LlmError> {
        let send = self.prepared(self.client.post(self.url(path)).json(body)).send();
        let resp = tokio::select! {
            r = send => r.map_err(|e| LlmError::Network(e.to_string()))?,
            _ = cancel.cancelled() => return Err(LlmError::Cancelled),
        };
        let resp = require_ok_status(resp, self.key_label, self.proxy).await?;
        pump_sse_stream(resp, parser, &cancel, sink).await
    }

    /// Connectivity probe. Deliberately its own short-timeout, pool-less client:
    /// a probe issued on the shared pool can park behind a dead keep-alive
    /// connection and hang far past its own timeout.
    pub async fn reachable(&self, path: &str) -> bool {
        let probe = build_probe_http_client();
        self.prepared(probe.get(self.url(path))).send().await.is_ok()
    }

    /// Opens the connection so the first real request does not pay for TLS.
    /// Unauthenticated on purpose — only the socket is being warmed, and the
    /// answer is thrown away.
    pub async fn warm_up(&self, path: &str) {
        let _ = self.client.get(self.url(path)).timeout(WARM_UP_TIMEOUT).send().await;
    }
}

#[cfg(test)]
mod tests;
