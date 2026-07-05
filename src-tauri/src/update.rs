//! Автообновление через tauri-plugin-updater: проверка релиза (latest.json из
//! itech-releases), скачивание подписанного .app.tar.gz и установка с перезапуском.
//! Glue-модуль в духе hotkey.rs: команды в lib.rs зовут check()/install(), фронт
//! слушает события update-available / update-progress / update-done / update-error.

use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
    pub date: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateDone {
    version: String,
}

/// Проверяет наличие новой версии. Найденный `Update` кладётся в
/// `App.pending_update`, чтобы install() не ходил за манифестом повторно.
/// `ITECH_UPDATE_ENDPOINT` подменяет endpoint из tauri.conf.json (тесты/дев).
pub async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
    let mut builder = app.updater_builder();
    if let Ok(endpoint) = std::env::var("ITECH_UPDATE_ENDPOINT") {
        let url = endpoint
            .parse()
            .map_err(|e| format!("ITECH_UPDATE_ENDPOINT: {e}"))?;
        builder = builder.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    let updater = builder.build().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone().unwrap_or_default(),
        date: u.date.map(|d| d.to_string()),
    });
    if let Some(i) = &info {
        eprintln!("[update] найдена версия {}", i.version);
    }
    *app.state::<crate::App>().pending_update.lock().unwrap() = update;
    Ok(info)
}

/// Скачивает и устанавливает ожидающее обновление, по успеху перезапускает
/// приложение. Прогресс троттлится (см. progress_step): сырые колбэки приходят
/// на каждый сетевой чанк, а каждый emit — IPC + пробуждение webview.
pub async fn install(app: AppHandle) -> Result<(), String> {
    let st = app.state::<crate::App>();
    if st.update_installing.swap(true, Ordering::SeqCst) {
        return Err("Обновление уже устанавливается".into());
    }
    // take, не clone: повторная установка того же Update бессмысленна, а при
    // ошибке фронт всё равно начнёт заново с check_for_update.
    let Some(update) = st.pending_update.lock().unwrap().take() else {
        st.update_installing.store(false, Ordering::SeqCst);
        return Err("Обновление не найдено — сначала проверьте новую версию".into());
    };
    let version = update.version.clone();
    let progress_app = app.clone();
    let mut downloaded: u64 = 0;
    let mut last_mark: u64 = 0;
    let res = update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                if let Some(mark) = progress_step(downloaded, total, last_mark) {
                    last_mark = mark;
                    let _ = progress_app
                        .emit("update-progress", UpdateProgress { downloaded, total });
                }
            },
            || {},
        )
        .await;
    match res {
        Ok(()) => {
            let _ = app.emit("update-done", UpdateDone { version });
            // Даём webview дорисовать «Перезапуск…» — restart() убивает процесс.
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            app.restart();
        }
        Err(e) => {
            app.state::<crate::App>()
                .update_installing
                .store(false, Ordering::SeqCst);
            Err(e.to_string())
        }
    }
}

/// Фоновая автопроверка: первая с задержкой (не конкурировать со стартовым
/// прогревом TLS/моделей), дальше раз в 6 часов. Нашли версию и она не
/// «пропущена» пользователем → update-available (бейдж в StatusBar).
pub fn spawn_auto_check(app: AppHandle) {
    // В dev-сборке установка поверх target/debug невозможна — автопроверка
    // включается только с подменённым endpoint'ом (тестовый прогон).
    if cfg!(debug_assertions) && std::env::var("ITECH_UPDATE_ENDPOINT").is_err() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        loop {
            match check(&app).await {
                Ok(Some(info)) => {
                    let skipped = {
                        let st = app.state::<crate::App>();
                        let s = st.settings.lock().unwrap();
                        s.skipped_version.clone()
                    };
                    if should_notify(&info.version, &skipped) {
                        let _ = app.emit("update-available", info);
                    }
                }
                Ok(None) => {}
                Err(e) => eprintln!("[update] автопроверка не удалась: {e}"),
            }
            tokio::time::sleep(std::time::Duration::from_secs(6 * 60 * 60)).await;
        }
    });
}

/// Показывать ли автоуведомление о найденной версии (ручная проверка из
/// настроек пропуск игнорирует и этим фильтром не пользуется).
pub fn should_notify(found_version: &str, skipped_version: &str) -> bool {
    found_version != skipped_version
}

/// Троттлинг прогресса: возвращает новую отметку, когда с прошлой эмиссии
/// сменился целый процент, либо накопился очередной MiB при неизвестном total.
pub fn progress_step(downloaded: u64, total: Option<u64>, last_mark: u64) -> Option<u64> {
    let mark = match total {
        Some(t) if t > 0 => downloaded * 100 / t,
        _ => downloaded / (1024 * 1024),
    };
    (mark != last_mark).then_some(mark)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notify_unless_version_skipped() {
        assert!(should_notify("0.2.0", ""));
        assert!(should_notify("0.2.0", "0.1.5"));
        assert!(!should_notify("0.2.0", "0.2.0"));
    }

    #[test]
    fn progress_steps_on_whole_percent() {
        let total = Some(1000u64);
        assert_eq!(progress_step(4, total, 0), None); // 0.4% — ещё 0
        assert_eq!(progress_step(10, total, 0), Some(1));
        assert_eq!(progress_step(19, total, 1), None); // всё ещё 1%
        assert_eq!(progress_step(1000, total, 99), Some(100));
    }

    #[test]
    fn progress_steps_per_mib_without_total() {
        const MIB: u64 = 1024 * 1024;
        assert_eq!(progress_step(MIB - 1, None, 0), None);
        assert_eq!(progress_step(MIB, None, 0), Some(1));
        assert_eq!(progress_step(MIB + 5, None, 1), None);
        assert_eq!(progress_step(3 * MIB, None, 1), Some(3));
        // total == 0 трактуется как неизвестный (деление на него невозможно)
        assert_eq!(progress_step(2 * MIB, Some(0), 1), Some(2));
    }
}
