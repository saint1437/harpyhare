use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::events;
use crate::settings::{write_atomic_owner_only, PromptPreset};
use crate::sync::MutexExt;

const PRESETS_URL: &str =
    "https://wkbp547fx6lrgcth.public.blob.vercel-storage.com/harpyhare/presets.json";
const CACHE_FILE_NAME: &str = "presets.cache.json";
const FETCH_TIMEOUT: Duration = Duration::from_secs(10);
const REFRESH_INTERVAL: Duration = Duration::from_secs(30 * 60);
const LOG_TAG: &str = "[presets]";

const BUNDLED_PRESETS_JSON: &str = include_str!("../../../../config/presets.json");

/// The official prompt presets the app is running with right now: the bundled
/// pool at first, then whatever the 30-minute refresh last accepted.
#[derive(Default)]
pub struct PresetCache(std::sync::Mutex<Vec<PromptPreset>>);

impl PresetCache {
    pub fn new(presets: Vec<PromptPreset>) -> Self {
        Self(std::sync::Mutex::new(presets))
    }

    pub fn get(&self) -> Vec<PromptPreset> {
        self.0.lock_safe().clone()
    }

    /// `false` = the pool is unchanged, so there is nothing to cache on disk and
    /// nothing to tell the frontend about.
    fn adopt(&self, presets: &[PromptPreset]) -> bool {
        let mut current = self.0.lock_safe();
        if *current == presets {
            return false;
        }
        *current = presets.to_vec();
        true
    }
}

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

fn cache_path(app: &AppHandle) -> Option<PathBuf> {
    crate::app_state::app_data_file(app, CACHE_FILE_NAME).ok()
}

pub fn load_initial(app: &AppHandle) -> Vec<PromptPreset> {
    cache_path(app)
        .and_then(|path| std::fs::read_to_string(path).ok())
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

/// The shared client, not a fresh one per refresh: this runs every 30 minutes
/// for the life of the process, and a new `reqwest::Client` each time meant a
/// new connection pool, a new TLS handshake and no `User-Agent`.
async fn fetch_raw() -> reqwest::Result<String> {
    crate::http::shared()
        .get(PRESETS_URL)
        .timeout(FETCH_TIMEOUT)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await
}

fn apply(app: &AppHandle, pool: PresetPool) {
    if !app.state::<crate::app_state::App>().presets.adopt(&pool.presets) {
        return;
    }
    if let (Ok(json), Some(path)) = (serde_json::to_string(&pool), cache_path(app)) {
        let _ = write_atomic_owner_only(&path, &json);
    }
    eprintln!("{LOG_TAG} пул обновлён (version {})", pool.version);
    events::official_presets_updated(app, pool.presets);
}

#[cfg(test)]
mod tests;
