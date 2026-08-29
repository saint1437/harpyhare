use serde::Serialize;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::events;
use crate::sync::MutexExt;
use crate::error::AppError;

const ENDPOINT_OVERRIDE_ENV: &str = "ITECH_UPDATE_ENDPOINT";
const LOG_TAG: &str = "[update]";
const AUTO_CHECK_INITIAL_DELAY: Duration = Duration::from_secs(5);
const AUTO_CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const PRE_RESTART_RENDER_DELAY: Duration = Duration::from_millis(300);
const ERR_ALREADY_INSTALLING: &str = "Обновление уже устанавливается";
const ERR_NOTHING_TO_INSTALL: &str = "Обновление не найдено — сначала проверьте новую версию";
const PERCENT_SCALE: u64 = 100;
const BYTES_PER_MIB: u64 = 1024 * 1024;

/// The update found between a check and an install, and the flag that keeps a
/// second install from starting on top of the first.
#[derive(Default)]
pub struct UpdateState {
    pending: std::sync::Mutex<Option<tauri_plugin_updater::Update>>,
    installing: std::sync::atomic::AtomicBool,
}

impl UpdateState {
    fn store_pending(&self, update: Option<tauri_plugin_updater::Update>) {
        *self.pending.lock_safe() = update;
    }

    /// Takes the pending update AND the install lock, or says why not. The two
    /// go together: a claim that took the lock and found nothing to install
    /// would wedge the button until a restart.
    fn claim_for_install(&self) -> Result<tauri_plugin_updater::Update, AppError> {
        use crate::error::{subject, ErrorCode};
        if self.installing.swap(true, Ordering::SeqCst) {
            return Err(AppError::with_subject(
                ErrorCode::Internal,
                ERR_ALREADY_INSTALLING,
                subject::UPDATE_INSTALLING,
            ));
        }
        let Some(update) = self.pending.lock_safe().take() else {
            self.installing.store(false, Ordering::SeqCst);
            return Err(AppError::with_subject(
                ErrorCode::Internal,
                ERR_NOTHING_TO_INSTALL,
                subject::UPDATE_MISSING,
            ));
        };
        Ok(update)
    }

    fn release_install_lock(&self) {
        self.installing.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
}

pub async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, AppError> {
    let updater = build_updater(app).map_err(crate::error::internal)?;
    let update = updater
        .check()
        .await
        .map_err(|e| crate::error::internal(e.to_string()))?;
    let info = update.as_ref().map(update_info);
    if let Some(i) = &info {
        eprintln!("{LOG_TAG} найдена версия {}", i.version);
    }
    app.state::<crate::app_state::App>().update.store_pending(update);
    Ok(info)
}

fn build_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let mut builder = app.updater_builder();
    if let Ok(endpoint) = std::env::var(ENDPOINT_OVERRIDE_ENV) {
        let url = endpoint
            .parse()
            .map_err(|e| format!("{ENDPOINT_OVERRIDE_ENV}: {e}"))?;
        builder = builder.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    builder.build().map_err(|e| e.to_string())
}

fn update_info(update: &tauri_plugin_updater::Update) -> UpdateInfo {
    UpdateInfo {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
    }
}

pub async fn install(app: AppHandle) -> Result<(), AppError> {
    let update = app
        .state::<crate::app_state::App>()
        .update
        .claim_for_install()?;
    let version = update.version.clone();
    let result = update
        .download_and_install(throttled_progress_emitter(app.clone()), || {})
        .await;
    match result {
        Ok(()) => {
            events::update_done(&app, version);
            tokio::time::sleep(PRE_RESTART_RENDER_DELAY).await;
            app.restart()
        }
        Err(e) => {
            app.state::<crate::app_state::App>()
                .update
                .release_install_lock();
            Err(crate::error::internal(e.to_string()))
        }
    }
}

fn throttled_progress_emitter(app: AppHandle) -> impl FnMut(usize, Option<u64>) {
    let mut downloaded: u64 = 0;
    let mut last_mark: u64 = 0;
    move |chunk, total| {
        downloaded += chunk as u64;
        if let Some(mark) = progress_step(downloaded, total, last_mark) {
            last_mark = mark;
            events::update_progress(&app, downloaded, total);
        }
    }
}

pub fn spawn_auto_check(app: AppHandle) {
    if auto_check_disabled_in_this_build() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(AUTO_CHECK_INITIAL_DELAY).await;
        loop {
            notify_if_update_found(&app).await;
            tokio::time::sleep(AUTO_CHECK_INTERVAL).await;
        }
    });
}

fn auto_check_disabled_in_this_build() -> bool {
    cfg!(debug_assertions) && std::env::var(ENDPOINT_OVERRIDE_ENV).is_err()
}

async fn notify_if_update_found(app: &AppHandle) {
    match check(app).await {
        Ok(Some(info)) => {
            if should_notify(&info.version, &skipped_version(app)) {
                events::update_available(app, info);
            }
        }
        Ok(None) => {}
        Err(e) => eprintln!("{LOG_TAG} автопроверка не удалась: {e}"),
    }
}

fn skipped_version(app: &AppHandle) -> String {
    // `current_settings` hands out an `Arc`, so the one field this wants has to
    // be copied out rather than moved.
    crate::app_state::current_settings(app).skipped_version.clone()
}

pub fn should_notify(found_version: &str, skipped_version: &str) -> bool {
    found_version != skipped_version
}

pub fn progress_step(downloaded: u64, total: Option<u64>, last_mark: u64) -> Option<u64> {
    let mark = match total {
        Some(t) if t > 0 => downloaded * PERCENT_SCALE / t,
        _ => downloaded / BYTES_PER_MIB,
    };
    (mark != last_mark).then_some(mark)
}

/// Схема имён релизных ассетов живёт одним JSON-манифестом в
/// `packages/release-contract` — тем же приёмом, что и `config/presets.json`:
/// TS-половина импортирует его (лендинг + `scripts/release.mjs`), Rust
/// вшивает через `include_str!`. Здесь он нужен только тестам: имена ассетов
/// собирает релиз-скрипт, а updater ходит по endpoint'у из tauri.conf.json —
/// и именно эту пару тест и сверяет с манифестом.
#[cfg(test)]
const RELEASE_CONTRACT_JSON: &str =
    include_str!("../../../../packages/release-contract/release-assets.json");

#[cfg(test)]
const TAURI_CONF_JSON: &str = include_str!("../tauri.conf.json");

#[cfg(test)]
mod tests;
