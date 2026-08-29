use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
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
/// The first fetch waits as long as `update::spawn_auto_check` does. Cold start
/// already fires the STT warm-up and the model list at once; a third request in
/// the same instant competed with them for the shared connection pool while the
/// launcher was still painting.
const FIRST_REFRESH_DELAY: Duration = Duration::from_secs(5);
const LOG_TAG: &str = "[presets]";

const BUNDLED_PRESETS_JSON: &str = include_str!("../../../../config/presets.json");

/// The pool, handed around by reference count rather than by copy.
///
/// `get_official_presets` deep-copied up to ~145 KB of preset text on every
/// call before serde serialized it again for the IPC reply, and the refresh
/// copied it twice more — once to compare, once for the event payload. serde's
/// own `Arc` impls sit behind its `rc` feature, which this crate does not
/// enable, so the delegations are spelled out here. **The wire shape stays
/// exactly `Vec<PromptPreset>`**, which is what keeps `bindings.ts` identical:
/// `Serialize` writes the inner vector and `specta::Type` reports the inner
/// vector's definition.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PresetList(Arc<Vec<PromptPreset>>);

impl PresetList {
    fn new(presets: Vec<PromptPreset>) -> Self {
        Self(Arc::new(presets))
    }
}

impl std::ops::Deref for PresetList {
    type Target = [PromptPreset];

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Serialize for PresetList {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        (*self.0).serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for PresetList {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Vec::<PromptPreset>::deserialize(deserializer).map(Self::new)
    }
}

impl specta::Type for PresetList {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        <Vec<PromptPreset> as specta::Type>::definition(types)
    }
}

/// The official prompt presets the app is running with right now: the bundled
/// pool at first, then whatever the 30-minute refresh last accepted.
///
/// **`None` means "not read yet", and that is the point.** Filling this used to
/// happen on the setup thread thirteen lines before `create_launcher_window`:
/// `load_initial` reads the cache file or, failing that, parses the 145 KB
/// `include_str!` of the bundled pool and allocates the whole `Vec`. Nothing
/// needs a preset until the webview asks for one, so the window is created first
/// and `spawn_warm_up` fills the slot on a blocking thread; whichever reader
/// gets here before it fills the slot itself.
#[derive(Default)]
pub struct PresetCache(std::sync::Mutex<Option<PresetList>>);

impl PresetCache {
    pub fn get(&self, app: &AppHandle) -> PresetList {
        self.0
            .lock_safe()
            .get_or_insert_with(|| load_initial(app))
            .clone()
    }

    /// `false` = the pool is unchanged, so there is nothing to cache on disk and
    /// nothing to tell the frontend about. The comparison is against the pool
    /// actually in force, so the lazy slot is filled first — otherwise the first
    /// refresh would always look like a change.
    fn adopt(&self, app: &AppHandle, presets: &PresetList) -> bool {
        let mut slot = self.0.lock_safe();
        let current = slot.get_or_insert_with(|| load_initial(app));
        if current == presets {
            return false;
        }
        *current = presets.clone();
        true
    }
}

#[derive(Default, Serialize, Deserialize)]
pub struct PresetPool {
    pub version: u32,
    pub presets: PresetList,
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

fn load_initial(app: &AppHandle) -> PresetList {
    cache_path(app)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| PresetPool::parse(&raw))
        .unwrap_or_else(PresetPool::bundled)
        .presets
}

/// Fills the lazy cache off the setup thread, so the first
/// `get_official_presets` is a hit rather than the one call that pays for the
/// read and the parse.
pub fn spawn_warm_up(app: AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<crate::app_state::App>().presets.get(&app);
    });
}

pub fn spawn_refresh(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut delay = FIRST_REFRESH_DELAY;
        loop {
            tokio::time::sleep(delay).await;
            delay = REFRESH_INTERVAL;
            match fetch().await {
                Ok(pool) => apply(&app, pool),
                Err(e) => eprintln!("{LOG_TAG} не удалось обновить пул: {e}"),
            }
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
    if !app.state::<crate::app_state::App>().presets.adopt(app, &pool.presets) {
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
