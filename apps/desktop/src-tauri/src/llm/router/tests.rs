use super::*;
use crate::llm::{RequestOptions, PROVIDER_ANTHROPIC, PROVIDER_OPENAI, UNKNOWN_MAX_INPUT_TOKENS};
use std::sync::Mutex;

struct StubProvider {
    id: &'static str,
    models: Vec<ModelInfo>,
    live: bool,
    hang_reachable: bool,
    streamed: Mutex<Vec<String>>,
}

fn stub_model(id: &str, provider: &str) -> ModelInfo {
    ModelInfo {
        id: id.into(),
        display_name: id.into(),
        provider: provider.into(),
        adaptive: true,
        always_thinks: false,
        code_exec: true,
        max_input_tokens: UNKNOWN_MAX_INPUT_TOKENS,
    }
}

impl StubProvider {
    fn new(id: &'static str, model_ids: &[&str], live: bool) -> Arc<Self> {
        Arc::new(Self {
            id,
            models: model_ids.iter().map(|m| stub_model(m, id)).collect(),
            live,
            hang_reachable: false,
            streamed: Mutex::new(Vec::new()),
        })
    }

    fn hanging(id: &'static str, model_ids: &[&str]) -> Arc<Self> {
        Arc::new(Self {
            id,
            models: model_ids.iter().map(|m| stub_model(m, id)).collect(),
            live: false,
            hang_reachable: true,
            streamed: Mutex::new(Vec::new()),
        })
    }

    fn calls(&self) -> Vec<String> {
        self.streamed.lock().unwrap().clone()
    }
}

#[async_trait::async_trait]
impl LlmProvider for StubProvider {
    fn provider_id(&self) -> &'static str {
        self.id
    }

    fn known_models(&self) -> Vec<ModelInfo> {
        self.models.clone()
    }

    async fn stream(
        &self,
        request: LlmRequest,
        _cancel: CancellationToken,
        _sink: &mut dyn LlmStreamSink,
    ) -> Result<(), LlmError> {
        self.streamed.lock().unwrap().push(request.model);
        Ok(())
    }

    async fn count_tokens(&self, request: LlmRequest) -> Result<u32, LlmError> {
        self.streamed.lock().unwrap().push(request.model);
        Ok(0)
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, LlmError> {
        if self.live {
            Ok(self.models.clone())
        } else {
            Err(LlmError::Network("оффлайн".into()))
        }
    }

    async fn reachable(&self) -> bool {
        if self.hang_reachable {
            std::future::pending::<()>().await;
        }
        self.live
    }

    async fn warm_up(&self) {}
}

struct NoopSink;

impl LlmStreamSink for NoopSink {
    fn text_delta(&mut self, _delta: &str) {}
    fn input_tokens(&mut self, _total: u32) {}
}

fn request(model: &str) -> LlmRequest {
    LlmRequest {
        model: model.into(),
        system: String::new(),
        messages: Vec::new(),
        options: RequestOptions::default(),
    }
}

fn router_with(
    anthropic: Arc<StubProvider>,
    openai: Arc<StubProvider>,
) -> (ProviderRouter, ModelCatalog) {
    let catalog: ModelCatalog = Arc::new(Mutex::new(Vec::new()));
    let router = ProviderRouter::new(vec![anthropic, openai], Arc::clone(&catalog));
    (router, catalog)
}

#[tokio::test]
async fn stream_goes_to_the_provider_that_owns_the_model() {
    let anthropic = StubProvider::new(PROVIDER_ANTHROPIC, &["claude-sonnet-5"], true);
    let openai = StubProvider::new(PROVIDER_OPENAI, &["gpt-5.6-terra"], true);
    let (router, _) = router_with(Arc::clone(&anthropic), Arc::clone(&openai));

    router
        .stream(request("gpt-5.6-terra"), CancellationToken::new(), &mut NoopSink)
        .await
        .unwrap();

    assert_eq!(openai.calls(), vec!["gpt-5.6-terra"]);
    assert!(anthropic.calls().is_empty());
}

#[tokio::test]
async fn unknown_model_falls_back_to_the_first_provider() {
    let anthropic = StubProvider::new(PROVIDER_ANTHROPIC, &["claude-sonnet-5"], true);
    let openai = StubProvider::new(PROVIDER_OPENAI, &["gpt-5.6-terra"], true);
    let (router, _) = router_with(Arc::clone(&anthropic), Arc::clone(&openai));

    router
        .stream(request("claude-unreleased-9"), CancellationToken::new(), &mut NoopSink)
        .await
        .unwrap();

    assert_eq!(anthropic.calls(), vec!["claude-unreleased-9"]);
    assert!(openai.calls().is_empty());
}

#[tokio::test]
async fn live_catalog_decides_routing_for_models_absent_from_offline_tables() {
    let anthropic = StubProvider::new(PROVIDER_ANTHROPIC, &["claude-sonnet-5"], true);
    let openai = StubProvider::new(PROVIDER_OPENAI, &["gpt-5.6-terra"], true);
    let (router, catalog) = router_with(Arc::clone(&anthropic), Arc::clone(&openai));
    catalog.lock().unwrap().push(stub_model("gpt-9-future", PROVIDER_OPENAI));

    router
        .count_tokens(request("gpt-9-future"))
        .await
        .unwrap();

    assert_eq!(openai.calls(), vec!["gpt-9-future"]);
}

#[tokio::test]
async fn list_models_merges_providers_and_fills_the_catalog() {
    let anthropic = StubProvider::new(PROVIDER_ANTHROPIC, &["claude-sonnet-5"], true);
    let openai = StubProvider::new(PROVIDER_OPENAI, &["gpt-5.6-terra"], true);
    let (router, catalog) = router_with(anthropic, openai);

    let models = router.list_models().await.unwrap();

    assert_eq!(
        models.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
        vec!["claude-sonnet-5", "gpt-5.6-terra"]
    );
    assert_eq!(catalog.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn a_failing_provider_does_not_hide_the_models_of_the_others() {
    let anthropic = StubProvider::new(PROVIDER_ANTHROPIC, &["claude-sonnet-5"], true);
    let openai = StubProvider::new(PROVIDER_OPENAI, &["gpt-5.6-terra"], false);
    let (router, _) = router_with(anthropic, openai);

    let models = router.list_models().await.unwrap();

    assert_eq!(models.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(), vec!["claude-sonnet-5"]);
}

#[tokio::test]
async fn routing_survives_a_provider_that_dropped_out_of_the_catalog() {
    let anthropic = StubProvider::new(PROVIDER_ANTHROPIC, &["claude-sonnet-5"], true);
    let openai = StubProvider::new(PROVIDER_OPENAI, &["gpt-5.6-terra"], false);
    let (router, _) = router_with(Arc::clone(&anthropic), Arc::clone(&openai));
    router.list_models().await.unwrap();

    router
        .stream(request("gpt-5.6-terra"), CancellationToken::new(), &mut NoopSink)
        .await
        .unwrap();

    assert_eq!(openai.calls(), vec!["gpt-5.6-terra"]);
}

#[tokio::test]
async fn one_reachable_provider_is_enough_to_be_online() {
    let anthropic = StubProvider::new(PROVIDER_ANTHROPIC, &["claude-sonnet-5"], false);
    let openai = StubProvider::new(PROVIDER_OPENAI, &["gpt-5.6-terra"], true);
    let (router, _) = router_with(anthropic, openai);

    assert!(router.reachable().await);
}

#[tokio::test]
async fn a_hanging_provider_does_not_block_reachability_of_the_others() {
    let hanging = StubProvider::hanging(PROVIDER_ANTHROPIC, &["claude-sonnet-5"]);
    let openai = StubProvider::new(PROVIDER_OPENAI, &["gpt-5.6-terra"], true);
    let catalog: ModelCatalog = Arc::new(Mutex::new(Vec::new()));
    let router = ProviderRouter::new(vec![hanging, openai], catalog);
    let ok = tokio::time::timeout(std::time::Duration::from_millis(200), router.reachable())
        .await
        .expect("зависший провайдер не должен блокировать пробу");
    assert!(ok);
}
