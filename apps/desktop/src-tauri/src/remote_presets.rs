use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::settings::{write_atomic_owner_only, PromptPreset};

const PRESETS_URL: &str =
    "https://wkbp547fx6lrgcth.public.blob.vercel-storage.com/harpyhare/presets.json";
const CACHE_FILE_NAME: &str = "presets.cache.json";
const FETCH_TIMEOUT: Duration = Duration::from_secs(10);
const REFRESH_INTERVAL: Duration = Duration::from_secs(30 * 60);
const EVENT_OFFICIAL_PRESETS_UPDATED: &str = "official-presets-updated";
const LOG_TAG: &str = "[presets]";

const BUNDLED_PRESETS_JSON: &str = include_str!("../../../../config/presets.json");

#[derive(Default, Serialize, Deserialize)]
pub struct PresetPool {
    pub version: u32,
    pub presets: Vec<PromptPreset>,
}

impl PresetPool {
    pub fn parse(raw: &str) -> Option<Self> {
        let pool: PresetPool = serde_json::from_str(raw).ok()?;
        if pool.presets.iter().any(|p| p.id.trim().is_empty()) {
            return None;
        }
        Some(pool)
    }

    fn bundled() -> Self {
        Self::parse(BUNDLED_PRESETS_JSON).unwrap_or_default()
    }
}

fn cache_path(app: &AppHandle) -> PathBuf {
    crate::app_data_file(app, CACHE_FILE_NAME)
}

pub fn load_initial(app: &AppHandle) -> Vec<PromptPreset> {
    std::fs::read_to_string(cache_path(app))
        .ok()
        .and_then(|raw| PresetPool::parse(&raw))
        .unwrap_or_else(PresetPool::bundled)
        .presets
}

pub fn spawn_refresh(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            match fetch().await {
                Ok(pool) => apply(&app, pool),
                Err(e) => eprintln!("{LOG_TAG} не удалось обновить пул: {e}"),
            }
            tokio::time::sleep(REFRESH_INTERVAL).await;
        }
    });
}

async fn fetch() -> Result<PresetPool, String> {
    let raw = fetch_raw().await.map_err(|e| e.to_string())?;
    PresetPool::parse(&raw).ok_or_else(|| "битый JSON пула пресетов".to_string())
}

async fn fetch_raw() -> reqwest::Result<String> {
    let client = reqwest::Client::builder().timeout(FETCH_TIMEOUT).build()?;
    client
        .get(PRESETS_URL)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await
}

fn apply(app: &AppHandle, pool: PresetPool) {
    let st = app.state::<crate::App>();
    {
        let mut current = st.official_presets.lock().unwrap();
        if *current == pool.presets {
            return;
        }
        *current = pool.presets.clone();
    }
    if let Ok(json) = serde_json::to_string(&pool) {
        let _ = write_atomic_owner_only(&cache_path(app), &json);
    }
    eprintln!("{LOG_TAG} пул обновлён (version {})", pool.version);
    let _ = app.emit(EVENT_OFFICIAL_PRESETS_UPDATED, pool.presets);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_presets_are_valid() {
        let pool = PresetPool::parse(BUNDLED_PRESETS_JSON).expect("вшитый presets.json валиден");
        assert!(!pool.presets.is_empty());
        assert!(pool.presets.iter().any(|p| p.id == "golang"));
    }

    #[test]
    fn parse_rejects_empty_id() {
        assert!(
            PresetPool::parse(r#"{"version":1,"presets":[{"id":" ","name":"x","text":"y"}]}"#)
                .is_none()
        );
    }

    #[test]
    fn parse_rejects_malformed_json() {
        assert!(PresetPool::parse("не json").is_none());
    }

    #[test]
    fn parse_accepts_valid_pool() {
        let pool =
            PresetPool::parse(r#"{"version":2,"presets":[{"id":"a","name":"A","text":"t"}]}"#)
                .unwrap();
        assert_eq!(pool.version, 2);
        assert_eq!(pool.presets.len(), 1);
    }
}
