use serde::Serialize;

/// Everything that differs between speech-to-text vendors.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SttProviderSpec {
    /// The value stored in `Settings.stt_provider`.
    pub id: &'static str,
    /// Shown in the launcher select and in the HUD model menu.
    pub label: &'static str,
    /// Which `Settings.<key_id>_api_key` this vendor needs.
    pub key_id: &'static str,
    /// How declared `[keywords]` reach this vendor, if at all.
    #[serde(skip)]
    #[specta(skip)]
    pub keyterms: SttKeyterms,
    /// Whether an access code reaches this vendor.
    pub proxied: bool,
    /// Whether the vendor can return English for speech in another language.
    pub supports_translate: bool,
    /// Vendor name inside «Неверный ключ …».
    #[serde(skip)]
    #[specta(skip)]
    pub key_label: &'static str,
    /// The protocol this vendor speaks, and where.
    #[serde(skip)]
    #[specta(skip)]
    pub wire: SttWire,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SttKeyterms {
    Unsupported,
    Repeated { field: &'static str, max: usize },
    Prompt { field: &'static str },
}

/// Wire dialect. Deepgram stays separate because its batch API is raw WAV and
/// its low-latency path is a WebSocket, unlike the multipart vendors.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SttWire {
    OpenAiMultipart {
        base_url: &'static str,
        transcribe_path: &'static str,
        translate_path: &'static str,
        warm_up_path: &'static str,
        transcribe_model: &'static str,
        translate_model: &'static str,
        temperature: Option<&'static str>,
    },
    Xai {
        base_url: &'static str,
        path: &'static str,
        warm_up_path: &'static str,
    },
    Deepgram {
        base_url: &'static str,
        listen_path: &'static str,
        warm_up_path: &'static str,
    },
}

impl SttWire {
    pub fn base_url(&self) -> &'static str {
        match self {
            SttWire::OpenAiMultipart { base_url, .. }
            | SttWire::Xai { base_url, .. }
            | SttWire::Deepgram { base_url, .. } => base_url,
        }
    }

    pub fn warm_up_path(&self) -> &'static str {
        match self {
            SttWire::OpenAiMultipart { warm_up_path, .. }
            | SttWire::Xai { warm_up_path, .. }
            | SttWire::Deepgram { warm_up_path, .. } => warm_up_path,
        }
    }

    pub fn path(&self, translate: bool) -> &'static str {
        match self {
            SttWire::OpenAiMultipart { transcribe_path, translate_path, .. } => {
                if translate { translate_path } else { transcribe_path }
            }
            SttWire::Xai { path, .. } => path,
            SttWire::Deepgram { listen_path, .. } => listen_path,
        }
    }
}

pub const PROVIDER_GROQ: &str = "groq";
pub const PROVIDER_OPENAI: &str = "openai";
pub const PROVIDER_XAI: &str = "xai";
pub const PROVIDER_DEEPGRAM: &str = "deepgram";

/// Order is UI order, and the first row is the default.
pub const PROVIDERS: &[SttProviderSpec] = &[
    SttProviderSpec {
        id: PROVIDER_GROQ,
        label: "Groq · Whisper",
        key_id: "groq",
        proxied: true,
        supports_translate: true,
        keyterms: SttKeyterms::Prompt { field: "prompt" },
        key_label: "Groq",
        wire: SttWire::OpenAiMultipart {
            base_url: "https://api.groq.com",
            transcribe_path: "/openai/v1/audio/transcriptions",
            translate_path: "/openai/v1/audio/translations",
            warm_up_path: "/openai/v1/models",
            transcribe_model: "whisper-large-v3-turbo",
            translate_model: "whisper-large-v3",
            temperature: Some("0"),
        },
    },
    SttProviderSpec {
        id: PROVIDER_OPENAI,
        label: "OpenAI · gpt-4o mini",
        key_id: "openai",
        proxied: true,
        supports_translate: true,
        keyterms: SttKeyterms::Unsupported,
        key_label: "OpenAI",
        wire: SttWire::OpenAiMultipart {
            base_url: "https://api.openai.com",
            transcribe_path: "/v1/audio/transcriptions",
            translate_path: "/v1/audio/translations",
            warm_up_path: "/v1/models",
            transcribe_model: "gpt-4o-mini-transcribe",
            translate_model: "whisper-1",
            temperature: None,
        },
    },
    SttProviderSpec {
        id: PROVIDER_XAI,
        label: "Grok · Speech-to-Text",
        key_id: "xai",
        proxied: true,
        supports_translate: false,
        keyterms: SttKeyterms::Repeated { field: "keyterm", max: 100 },
        key_label: "xAI",
        wire: SttWire::Xai {
            base_url: "https://api.x.ai",
            path: "/v1/stt",
            warm_up_path: "/v1/models",
        },
    },
    SttProviderSpec {
        id: PROVIDER_DEEPGRAM,
        label: "Deepgram · Nova-3",
        key_id: "deepgram",
        proxied: false,
        supports_translate: false,
        keyterms: SttKeyterms::Unsupported,
        key_label: "Deepgram",
        wire: SttWire::Deepgram {
            base_url: "https://api.eu.deepgram.com",
            listen_path: "/v1/listen",
            warm_up_path: "/v1/projects",
        },
    },
];

pub fn spec(provider_id: &str) -> Option<&'static SttProviderSpec> {
    PROVIDERS.iter().find(|p| p.id == provider_id)
}

pub fn default_spec() -> &'static SttProviderSpec {
    &PROVIDERS[0]
}

pub fn resolve(provider_id: &str) -> &'static SttProviderSpec {
    spec(provider_id).unwrap_or_else(default_spec)
}

impl SttKeyterms {
    pub fn accepted<'a>(&self, terms: &'a [String]) -> &'a [String] {
        match self {
            SttKeyterms::Unsupported => &[],
            SttKeyterms::Repeated { max, .. } => &terms[..terms.len().min(*max)],
            SttKeyterms::Prompt { .. } => terms,
        }
    }
}

pub fn effective_translate(spec: &SttProviderSpec, requested: bool) -> bool {
    requested && spec.supports_translate
}

#[cfg(test)]
mod tests;
