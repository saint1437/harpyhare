//! Fast, non-generating provider checks used when the HUD is opened.
//!
//! These checks intentionally validate credentials, public catalogues and the
//! selected model only. They never send audio or a chat completion, so opening
//! the HUD cannot spend provider credits.

use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;
use tauri::AppHandle;

use crate::app_state::{self, SttClientPlan};
use crate::error::ErrorCode;
use crate::settings::Settings;
use crate::stt::registry::{self, SttWire};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const OPENROUTER_API: &str = "https://openrouter.ai/api";
const OPENROUTER_MODELS_PATH: &str = "/v1/models";
const OPENROUTER_STT_MODELS_PATH: &str = "/v1/models?output_modalities=transcription";

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum HealthStatus {
    Ok,
    MissingKey,
    InvalidKey,
    Billing,
    RateLimited,
    ServiceUnavailable,
    AccessDenied,
    ModelUnavailable,
    Timeout,
    Network,
    Skipped,
    Error,
}

#[derive(Clone, Debug, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    pub provider: String,
    pub model: String,
    pub status: HealthStatus,
    pub error_code: Option<ErrorCode>,
    pub http_status: Option<u16>,
}

#[derive(Clone, Debug, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StartupHealthReport {
    pub network: HealthCheck,
    pub openrouter: HealthCheck,
    pub speech: HealthCheck,
}

#[derive(Debug, Deserialize)]
struct ModelCatalog {
    data: Vec<Value>,
}

fn client() -> reqwest::Client {
    crate::net::pooled_client_builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .expect("health-check HTTP client")
}

fn check(provider: &str, model: impl Into<String>, status: HealthStatus) -> HealthCheck {
    let error_code = match status {
        HealthStatus::InvalidKey => Some(ErrorCode::BadApiKey),
        HealthStatus::Billing => Some(ErrorCode::Billing),
        HealthStatus::RateLimited => Some(ErrorCode::RateLimited),
        HealthStatus::ServiceUnavailable => Some(ErrorCode::ServiceUnavailable),
        HealthStatus::AccessDenied => Some(ErrorCode::AccessDenied),
        HealthStatus::ModelUnavailable => Some(ErrorCode::ModelUnavailable),
        HealthStatus::Timeout => Some(ErrorCode::Timeout),
        HealthStatus::Network => Some(ErrorCode::Network),
        _ => None,
    };
    HealthCheck {
        provider: provider.to_string(),
        model: model.into(),
        status,
        error_code,
        http_status: None,
    }
}

fn with_http_status(mut result: HealthCheck, status: u16) -> HealthCheck {
    result.http_status = Some(status);
    result
}

fn status_for_http(status: u16) -> HealthStatus {
    match status {
        401 => HealthStatus::InvalidKey,
        402 => HealthStatus::Billing,
        403 => HealthStatus::AccessDenied,
        408 | 504 => HealthStatus::Timeout,
        429 => HealthStatus::RateLimited,
        500..=599 => HealthStatus::ServiceUnavailable,
        _ => HealthStatus::Error,
    }
}

fn request_with_auth(
    client: &reqwest::Client,
    url: String,
    key: &str,
    token_auth: bool,
) -> reqwest::RequestBuilder {
    let request = client.get(url);
    if token_auth {
        request.header("Authorization", format!("Token {key}"))
    } else {
        request.bearer_auth(key)
    }
}

async fn openrouter_check(settings: &Settings, selected_model: &str) -> HealthCheck {
    let model = selected_model.strip_prefix("openrouter/").unwrap_or("");
    if settings.openrouter_api_key.trim().is_empty() {
        return check("openrouter", model, HealthStatus::MissingKey);
    }

    let response = request_with_auth(
        &client(),
        format!("{OPENROUTER_API}{OPENROUTER_MODELS_PATH}"),
        &settings.openrouter_api_key,
        false,
    )
    .send()
    .await;
    let response = match response {
        Ok(response) => response,
        Err(error) if error.is_timeout() => {
            return check("openrouter", model, HealthStatus::Timeout)
        }
        Err(_) => return check("openrouter", model, HealthStatus::Network),
    };
    let status = response.status().as_u16();
    if !response.status().is_success() {
        return with_http_status(check("openrouter", model, status_for_http(status)), status);
    }
    let catalog = match response.json::<ModelCatalog>().await {
        Ok(catalog) => catalog,
        Err(_) => return with_http_status(check("openrouter", model, HealthStatus::Error), status),
    };
    if !model.is_empty()
        && !catalog
            .data
            .iter()
            .any(|entry| entry["id"].as_str() == Some(model))
    {
        return with_http_status(
            check("openrouter", model, HealthStatus::ModelUnavailable),
            status,
        );
    }
    with_http_status(check("openrouter", model, HealthStatus::Ok), status)
}

async fn openrouter_stt_check(settings: &Settings) -> HealthCheck {
    let model = settings.openrouter_stt_model.clone();
    if settings.openrouter_api_key.trim().is_empty() {
        return check("openrouter", model, HealthStatus::MissingKey);
    }
    let response = request_with_auth(
        &client(),
        format!("{OPENROUTER_API}{OPENROUTER_STT_MODELS_PATH}"),
        &settings.openrouter_api_key,
        false,
    )
    .send()
    .await;
    let response = match response {
        Ok(response) => response,
        Err(error) if error.is_timeout() => {
            return check("openrouter", model, HealthStatus::Timeout)
        }
        Err(_) => return check("openrouter", model, HealthStatus::Network),
    };
    let status = response.status().as_u16();
    if !response.status().is_success() {
        return with_http_status(check("openrouter", model, status_for_http(status)), status);
    }
    let catalog = match response.json::<ModelCatalog>().await {
        Ok(catalog) => catalog,
        Err(_) => return with_http_status(check("openrouter", model, HealthStatus::Error), status),
    };
    let available = catalog.data.iter().any(|entry| {
        entry["id"].as_str() == Some(model.as_str())
            && entry["architecture"]["input_modalities"]
                .as_array()
                .is_some_and(|values| values.iter().any(|value| value == "audio"))
            && entry["architecture"]["output_modalities"]
                .as_array()
                .is_some_and(|values| values.iter().any(|value| value == "transcription"))
    });
    let result = if available {
        check("openrouter", model, HealthStatus::Ok)
    } else {
        check("openrouter", model, HealthStatus::ModelUnavailable)
    };
    with_http_status(result, status)
}

fn speech_request(plan: &SttClientPlan) -> Option<(String, bool)> {
    let spec = registry::resolve(plan.provider_id);
    let base_url = plan
        .proxy_base_url
        .clone()
        .unwrap_or_else(|| spec.wire.base_url().to_string());
    let token_auth = matches!(spec.wire, SttWire::Deepgram { .. }) && plan.proxy_base_url.is_none();
    let url = format!(
        "{}{}",
        base_url.trim_end_matches('/'),
        spec.wire.warm_up_path()
    );
    Some((url, token_auth))
}

async fn speech_check(settings: &Settings) -> HealthCheck {
    let plan = app_state::stt_client_plan(settings);
    let spec = registry::resolve(plan.provider_id);
    let model = if spec.wire.selectable_model() {
        settings.openrouter_stt_model.clone()
    } else {
        String::new()
    };
    if plan.api_key.trim().is_empty() {
        return check(plan.provider_id, model, HealthStatus::MissingKey);
    }
    let Some((url, token_auth)) = speech_request(&plan) else {
        return check(plan.provider_id, model, HealthStatus::Error);
    };
    let response = request_with_auth(&client(), url, &plan.api_key, token_auth)
        .send()
        .await;
    let response = match response {
        Ok(response) => response,
        Err(error) if error.is_timeout() => {
            return check(plan.provider_id, model, HealthStatus::Timeout)
        }
        Err(_) => return check(plan.provider_id, model, HealthStatus::Network),
    };
    let status = response.status().as_u16();
    let result = if response.status().is_success() {
        HealthStatus::Ok
    } else {
        status_for_http(status)
    };
    with_http_status(check(plan.provider_id, model, result), status)
}

#[tauri::command]
#[specta::specta]
pub async fn check_startup_health(app: AppHandle, selected_model: String) -> StartupHealthReport {
    let settings = app_state::current_settings(&app);
    let speech_check = async {
        if settings.stt_provider == registry::PROVIDER_OPENROUTER {
            openrouter_stt_check(&settings).await
        } else {
            speech_check(&settings).await
        }
    };
    let (openrouter, speech) =
        tokio::join!(openrouter_check(&settings, &selected_model), speech_check,);
    let network_status = match openrouter.status {
        HealthStatus::Network | HealthStatus::Timeout => openrouter.status,
        HealthStatus::MissingKey => HealthStatus::Skipped,
        _ => HealthStatus::Ok,
    };
    StartupHealthReport {
        network: check("network", "", network_status),
        openrouter,
        speech,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_provider_http_failures_to_user_facing_statuses() {
        assert_eq!(status_for_http(401), HealthStatus::InvalidKey);
        assert_eq!(status_for_http(402), HealthStatus::Billing);
        assert_eq!(status_for_http(403), HealthStatus::AccessDenied);
        assert_eq!(status_for_http(408), HealthStatus::Timeout);
        assert_eq!(status_for_http(429), HealthStatus::RateLimited);
        assert_eq!(status_for_http(502), HealthStatus::ServiceUnavailable);
        assert_eq!(status_for_http(400), HealthStatus::Error);
    }

    #[test]
    fn status_codes_have_matching_error_codes() {
        assert_eq!(
            check("openrouter", "", HealthStatus::InvalidKey).error_code,
            Some(ErrorCode::BadApiKey)
        );
        assert_eq!(
            check("openrouter", "", HealthStatus::Billing).error_code,
            Some(ErrorCode::Billing)
        );
        assert_eq!(
            check("openrouter", "", HealthStatus::ModelUnavailable).error_code,
            Some(ErrorCode::ModelUnavailable)
        );
        assert_eq!(check("openrouter", "", HealthStatus::Ok).error_code, None);
    }
}
