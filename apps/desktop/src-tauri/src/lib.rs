pub mod access;
pub mod app_state;
pub mod audio;
pub mod audio_check;
pub mod auto;
pub mod bindings;
pub mod capture;
pub mod capture_service;
pub mod chat;
pub mod chat_images;
pub mod chats;
pub mod clipboard;
pub mod context_import;
pub mod error;
pub mod events;
pub mod hotkey;
pub mod hotkeys;
pub mod http;
pub mod llm;
pub mod llm_service;
pub mod platform;
pub mod permissions;
pub mod preferences;
pub mod preview_protocol;
pub mod recording;
pub mod recording_service;
pub mod relay_error;
pub mod remote_presets;
pub mod screenshot;
pub mod secrets;
pub mod settings;
pub mod state;
pub mod storage;
pub mod stt;
pub mod sync;
pub mod system;
pub mod update;
pub mod window;
pub mod window_geom;
pub mod window_service;
pub mod window_tween;

use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};

use crate::app_state::App;

const PREVIEW_URI_SCHEME: &str = "preview";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta_builder = bindings::builder();
    tauri::Builder::default()
        .device_event_filter(tauri::DeviceEventFilter::Always)
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_uri_scheme_protocol(PREVIEW_URI_SCHEME, |ctx, _request| {
            let html = ctx.app_handle().state::<App>().window.preview_html();
            preview_protocol::preview_response(&html)
        })
        .setup(|app| {
            setup_app(app.handle());
            Ok(())
        })
        .invoke_handler(specta_builder.invoke_handler())
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("не удалось запустить приложение: {e}");
            std::process::exit(1);
        });
}

/// `app_data_dir()` failing means the machine has no resolvable home directory.
/// The app can still run — it just cannot persist — so it degrades to a
/// throwaway location and says so, instead of the `expect` that used to abort
/// the process before the first window.
fn app_data_path_or_fallback(
    handle: &AppHandle,
    resolve: fn(&AppHandle) -> Result<std::path::PathBuf, crate::error::AppError>,
    file_name: &str,
) -> std::path::PathBuf {
    match resolve(handle) {
        Ok(path) => path,
        Err(e) => {
            eprintln!("{}; {file_name} будет писаться во временную папку", e.message);
            std::env::temp_dir()
                .join(handle.config().identifier.clone())
                .join(file_name)
        }
    }
}

fn setup_app(handle: &AppHandle) {
    preferences::load_dotenv_files();
    let path = app_data_path_or_fallback(
        handle,
        app_state::settings_path,
        app_state::SETTINGS_FILE_NAME,
    );
    let secrets_path = app_data_path_or_fallback(
        handle,
        app_state::secrets_path,
        secrets::SECRETS_FILE_NAME,
    );
    let startup = preferences::load_settings_and_secrets(&path, &secrets_path);
    let official_presets = remote_presets::load_initial(handle);
    let models: llm::ModelCatalog = Arc::new(Mutex::new(llm::fallback_models()));
    let stt = app_state::build_stt_client(&startup.settings, &startup.secrets);
    let llm = app_state::build_llm_client(&startup.secrets, Arc::clone(&models));
    spawn_startup_warm_up_and_model_fetch(Arc::clone(&stt), Arc::clone(&llm));
    handle.manage(app_state::build_app_state(
        preferences::build_settings_service(path, startup.settings, startup.recovery),
        preferences::build_secrets_store(secrets_path, startup.secrets),
        official_presets,
        stt,
        llm,
        models,
    ));
    if let Err(e) = window::create_launcher_window(handle, &app_state::current_settings(handle)) {
        eprintln!("не удалось создать окно лаунчера: {e}");
    }
    permissions::warm_cache(handle);
    recording::install_default_output_device_listener(handle);
    platform::install_move_keys_monitor(handle.clone());
    platform::disable_cursor_autohide_on_typing();
    update::spawn_auto_check(handle.clone());
    remote_presets::spawn_refresh(handle.clone());
}

fn spawn_startup_warm_up_and_model_fetch(
    stt: Arc<dyn stt::SttEngine>,
    llm: Arc<dyn llm::LlmProvider>,
) {
    tauri::async_runtime::spawn(async move {
        let _ = tokio::join!(stt.warm_up(), llm.list_models());
    });
}
