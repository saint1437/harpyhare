use serde_json::Value;
use std::time::Duration;

const PROXY_BASE_URL: &str = "https://itech-relay.itech-edge.workers.dev";
const PROXY_ENDPOINT_OVERRIDE_ENV: &str = "ITECH_PROXY_ENDPOINT";
const HTTPS_PREFIX: &str = "https://";

const REDEEM_PATH: &str = "/v1/redeem";
const REDEEM_TIMEOUT: Duration = Duration::from_secs(15);
const REDEEM_MAX_ATTEMPTS: u32 = 3;
const REDEEM_RETRY_DELAY: Duration = Duration::from_millis(400);

const REDEEM_BAD_RESPONSE: &str = "Прокси вернул неожиданный ответ на активацию";
const REDEEM_GENERIC_ERROR: &str = "Не удалось активировать код доступа";
const REDEEM_EMPTY_TOKEN: &str = "Прокси вернул пустой токен";

pub fn proxy_base_url() -> String {
    #[cfg(debug_assertions)]
    {
        if let Ok(url) = std::env::var(PROXY_ENDPOINT_OVERRIDE_ENV) {
            let url = url.trim();
            if url.starts_with(HTTPS_PREFIX) {
                return url.to_string();
            }
        }
    }
    PROXY_BASE_URL.to_string()
}

#[derive(serde::Serialize)]
struct RedeemRequest<'a> {
    code: &'a str,
    idempotency_key: &'a str,
}

#[derive(serde::Deserialize)]
struct RedeemResponse {
    token: String,
}

pub async fn redeem(base_url: &str, code: &str, idempotency_key: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(REDEEM_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{base_url}{REDEEM_PATH}");
    let payload = RedeemRequest {
        code: code.trim(),
        idempotency_key,
    };
    let mut last_network_error = REDEEM_GENERIC_ERROR.to_string();
    for attempt in 0..REDEEM_MAX_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(REDEEM_RETRY_DELAY).await;
        }
        match client.post(&url).json(&payload).send().await {
            Ok(resp) => return parse_redeem(resp).await,
            Err(e) => last_network_error = e.to_string(),
        }
    }
    Err(last_network_error)
}

async fn parse_redeem(resp: reqwest::Response) -> Result<String, String> {
    let ok = resp.status().is_success();
    let body = resp.text().await.unwrap_or_default();
    if !ok {
        return Err(redeem_error_message(&body));
    }
    let token = serde_json::from_str::<RedeemResponse>(&body)
        .map(|r| r.token)
        .map_err(|_| REDEEM_BAD_RESPONSE.to_string())?;
    if token.trim().is_empty() {
        return Err(REDEEM_EMPTY_TOKEN.to_string());
    }
    Ok(token)
}

fn redeem_error_message(body: &str) -> String {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| REDEEM_GENERIC_ERROR.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn redeem_returns_token_on_success() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path(REDEEM_PATH))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"token": "itk_abc"})),
            )
            .mount(&server)
            .await;
        let token = redeem(&server.uri(), "CODE-1234", "idem-1").await.unwrap();
        assert_eq!(token, "itk_abc");
    }

    #[tokio::test]
    async fn redeem_surfaces_proxy_error_message() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(404).set_body_json(serde_json::json!({
                "error": {"message": "Код недействителен или уже использован"}
            })))
            .mount(&server)
            .await;
        let err = redeem(&server.uri(), "BAD", "idem-2").await.unwrap_err();
        assert_eq!(err, "Код недействителен или уже использован");
    }

    #[tokio::test]
    async fn redeem_rejects_empty_token() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"token": ""})))
            .mount(&server)
            .await;
        let err = redeem(&server.uri(), "CODE", "idem-3").await.unwrap_err();
        assert_eq!(err, REDEEM_EMPTY_TOKEN);
    }

    #[tokio::test]
    async fn redeem_maps_unparseable_success_body() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
            .mount(&server)
            .await;
        let err = redeem(&server.uri(), "CODE", "idem-4").await.unwrap_err();
        assert_eq!(err, REDEEM_BAD_RESPONSE);
    }
}
