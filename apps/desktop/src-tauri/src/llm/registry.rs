use serde::Serialize;

use super::{
    ModelInfo, PROVIDER_ANTHROPIC, PROVIDER_OPENAI, PROVIDER_XAI, UNKNOWN_MAX_INPUT_TOKENS,
};

pub mod xclis;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogModel {
    pub id: &'static str,
    pub display_name: &'static str,
    pub adaptive: bool,
    pub always_thinks: bool,
    pub code_exec: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LlmProviderSpec {
    pub id: &'static str,
    pub label: &'static str,
    pub key_id: &'static str,
    pub families: &'static [&'static str],
    pub catalog: &'static [CatalogModel],
    pub default_model: &'static str,
    pub proxied: bool,
    #[serde(skip)]
    #[specta(skip)]
    pub wire: LlmWire,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LlmWire {
    Anthropic {
        base_url: &'static str,
        key_label: &'static str,
    },
    Responses {
        base_url: &'static str,
        key_label: &'static str,
        effort_off: &'static str,
        effort_on: &'static str,
    },
    Xclis {
        base_url: &'static str,
        key_label: &'static str,
    },
}

impl LlmWire {
    pub fn base_url(&self) -> &'static str {
        match self {
            LlmWire::Anthropic { base_url, .. }
            | LlmWire::Responses { base_url, .. }
            | LlmWire::Xclis { base_url, .. } => base_url,
        }
    }

    pub fn key_label(&self) -> &'static str {
        match self {
            LlmWire::Anthropic { key_label, .. }
            | LlmWire::Responses { key_label, .. }
            | LlmWire::Xclis { key_label, .. } => key_label,
        }
    }
}

const CLAUDE_MODELS: &[CatalogModel] = &[
    CatalogModel {
        id: "claude-opus-4-8",
        display_name: "Claude Opus 4.8",
        adaptive: true,
        always_thinks: false,
        code_exec: true,
    },
    CatalogModel {
        id: "claude-sonnet-5",
        display_name: "Claude Sonnet 5",
        adaptive: true,
        always_thinks: false,
        code_exec: true,
    },
    CatalogModel {
        id: super::DEFAULT_MODEL,
        display_name: "Claude Haiku 4.5",
        adaptive: false,
        always_thinks: false,
        code_exec: false,
    },
];

const GPT_MODELS: &[CatalogModel] = &[
    CatalogModel {
        id: "gpt-5.6-terra",
        display_name: "GPT-5.6 Terra",
        adaptive: true,
        always_thinks: false,
        code_exec: true,
    },
    CatalogModel {
        id: "gpt-5.6-sol",
        display_name: "GPT-5.6 Sol",
        adaptive: true,
        always_thinks: false,
        code_exec: true,
    },
    CatalogModel {
        id: "gpt-5.6-luna",
        display_name: "GPT-5.6 Luna",
        adaptive: true,
        always_thinks: false,
        code_exec: true,
    },
    CatalogModel {
        id: "gpt-5.5-pro",
        display_name: "GPT-5.5 Pro",
        adaptive: true,
        always_thinks: true,
        code_exec: true,
    },
    CatalogModel {
        id: "gpt-5.4-mini",
        display_name: "GPT-5.4 mini",
        adaptive: true,
        always_thinks: false,
        code_exec: true,
    },
];

const GROK_MODELS: &[CatalogModel] = &[
    CatalogModel {
        id: "grok-4.6",
        display_name: "Grok 4.6",
        adaptive: true,
        always_thinks: false,
        code_exec: true,
    },
    CatalogModel {
        id: "grok-4.5",
        display_name: "Grok 4.5",
        adaptive: true,
        always_thinks: false,
        code_exec: true,
    },
    CatalogModel {
        id: "grok-4.3",
        display_name: "Grok 4.3",
        adaptive: true,
        always_thinks: false,
        code_exec: true,
    },
];

// Xclis models are namespaced inside the app so they never collide with a
// direct Anthropic/OpenAI model id. The prefix is stripped before the request
// leaves the process; a live `/v1/models` response replaces this fallback list.
const XCLIS_MODELS: &[CatalogModel] = &[
    CatalogModel {
        id: "xclis/claude-sonnet-5",
        display_name: "Claude Sonnet 5 · Xclis",
        adaptive: true,
        always_thinks: false,
        code_exec: false,
    },
    CatalogModel {
        id: "xclis/claude-opus-4-8",
        display_name: "Claude Opus 4.8 · Xclis",
        adaptive: true,
        always_thinks: false,
        code_exec: false,
    },
    CatalogModel {
        id: "xclis/gpt-5.6-sol",
        display_name: "GPT-5.6 Sol · Xclis",
        adaptive: false,
        always_thinks: false,
        code_exec: false,
    },
];

pub const PROVIDERS: &[LlmProviderSpec] = &[
    LlmProviderSpec {
        id: PROVIDER_ANTHROPIC,
        label: "Claude",
        key_id: "anthropic",
        families: &["opus", "sonnet", "haiku"],
        catalog: CLAUDE_MODELS,
        default_model: super::DEFAULT_MODEL,
        proxied: true,
        wire: LlmWire::Anthropic {
            base_url: "https://api.anthropic.com",
            key_label: "Anthropic",
        },
    },
    LlmProviderSpec {
        id: PROVIDER_OPENAI,
        label: "OpenAI",
        key_id: "openai",
        families: &[],
        catalog: GPT_MODELS,
        default_model: "gpt-5.4-mini",
        proxied: true,
        wire: LlmWire::Responses {
            base_url: "https://api.openai.com",
            key_label: "OpenAI",
            effort_off: "none",
            effort_on: "medium",
        },
    },
    LlmProviderSpec {
        id: PROVIDER_XAI,
        label: "Grok",
        key_id: "xai",
        families: &[],
        catalog: GROK_MODELS,
        default_model: "grok-4.3",
        proxied: true,
        wire: LlmWire::Responses {
            base_url: "https://api.x.ai",
            key_label: "xAI",
            effort_off: "minimal",
            effort_on: "high",
        },
    },
    LlmProviderSpec {
        id: xclis::PROVIDER_XCLIS,
        label: "Xclis",
        key_id: "xclis",
        families: &[],
        catalog: XCLIS_MODELS,
        default_model: "xclis/claude-sonnet-5",
        proxied: false,
        wire: LlmWire::Xclis {
            base_url: "https://jp.xclis.ai",
            key_label: "Xclis",
        },
    },
];

pub fn spec(provider_id: &str) -> Option<&'static LlmProviderSpec> {
    PROVIDERS.iter().find(|p| p.id == provider_id)
}

impl CatalogModel {
    pub fn to_model_info(self, provider: &str) -> ModelInfo {
        ModelInfo {
            id: self.id.into(),
            display_name: self.display_name.into(),
            provider: provider.into(),
            adaptive: self.adaptive,
            always_thinks: self.always_thinks,
            code_exec: self.code_exec,
            max_input_tokens: UNKNOWN_MAX_INPUT_TOKENS,
        }
    }
}

impl LlmProviderSpec {
    pub fn models(&self) -> Vec<ModelInfo> {
        self.catalog.iter().map(|m| m.to_model_info(self.id)).collect()
    }
}

pub fn catalog_models(provider_id: &str) -> Vec<ModelInfo> {
    spec(provider_id).map(LlmProviderSpec::models).unwrap_or_default()
}

#[cfg(test)]
mod tests;
