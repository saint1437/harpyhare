use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::app_state::{build_llm_client, build_stt_client, current_settings, settings_path, App};
use crate::recording::request_capture_rebuild;
use crate::window::main_window;
use crate::{access, hotkey, settings};

const ENV_FILE_NAME: &str = ".env";
const ANTHROPIC_API_KEY_ENV: &str = "ANTHROPIC_API_KEY";
const GROQ_API_KEY_ENV: &str = "GROQ_API_KEY";

pub fn load_dotenv_files() {
    let _ = dotenvy::dotenv();
    if let Some(project_env) = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|root| root.join(ENV_FILE_NAME))
    {
        let _ = dotenvy::from_path(project_env);
    }
}

pub fn load_settings_with_env_key_fallback(app: &AppHandle) -> settings::Settings {
    let mut settings = settings::Settings::load(&settings_path(app))
        .unwrap_or_else(|_| settings::Settings::default());
    settings.apply_key_fallback(
        std::env::var(ANTHROPIC_API_KEY_ENV).ok(),
        std::env::var(GROQ_API_KEY_ENV).ok(),
    );
    settings
}

#[tauri::command]
#[specta::specta]
pub fn get_settings(app: AppHandle) -> settings::Settings {
    current_settings(&app)
}

#[tauri::command]
#[specta::specta]
pub fn get_official_presets(app: AppHandle) -> Vec<settings::PromptPreset> {
    app.state::<App>().official_presets.lock().unwrap().clone()
}

#[tauri::command]
#[specta::specta]
pub fn set_settings(
    app: AppHandle,
    mut new_settings: settings::Settings,
) -> Result<settings::Settings, String> {
    new_settings.clamp();
    let st = app.state::<App>();
    let old = st.settings.lock().unwrap().clone();
    reregister_changed_hotkeys(&app, &old, &new_settings)?;
    rebuild_changed_api_clients(&st, &old, &new_settings);
    apply_screen_share_visibility_change(&app, &old, &new_settings);
    apply_buffer_settings_change(&app, &old, &new_settings);
    let auto_device_changed = crate::auto::device_changed(&old, &new_settings);
    let auto_bounds_changed = crate::auto::bounds_changed(&old, &new_settings);
    let capture_device_changed = old.capture_device_uid != new_settings.capture_device_uid;
    new_settings
        .save(&settings_path(&app))
        .map_err(|e| e.to_string())?;
    *st.settings.lock().unwrap() = new_settings.clone();
    if capture_device_changed {
        request_capture_rebuild(&app);
    }
    if auto_device_changed {
        restart_auto_mode_off_thread(&app);
    } else if auto_bounds_changed {
        crate::auto::reapply_bounds(&app);
    }
    Ok(new_settings)
}

#[tauri::command]
#[specta::specta]
pub fn set_ptt_suspended(app: AppHandle, suspended: bool) {
    let hk = crate::hotkeys::effective(
        &app.state::<App>().settings.lock().unwrap().hotkeys,
        crate::hotkeys::ACTION_RECORD,
    );
    if suspended {
        hotkey::unregister_hotkey(&app, &hk);
    } else {
        let _ = hotkey::register_ptt(&app, &hk);
    }
}

#[tauri::command]
#[specta::specta]
pub async fn redeem_access_code(
    app: AppHandle,
    code: String,
    idempotency_key: String,
) -> Result<(), String> {
    let base_url = access::proxy_base_url();
    let token = access::redeem(&base_url, &code, &idempotency_key).await?;
    apply_access_token(&app, token)
}

fn apply_access_token(app: &AppHandle, token: String) -> Result<(), String> {
    let st = app.state::<App>();
    let old = st.settings.lock().unwrap().clone();
    let mut new_settings = old.clone();
    new_settings.access_token = token;
    new_settings
        .save(&settings_path(app))
        .map_err(|e| e.to_string())?;
    rebuild_changed_api_clients(&st, &old, &new_settings);
    *st.settings.lock().unwrap() = new_settings;
    Ok(())
}

fn reregister_changed_hotkeys(
    app: &AppHandle,
    old: &settings::Settings,
    new: &settings::Settings,
) -> Result<(), String> {
    if main_window(app).is_none() {
        return Ok(());
    }
    if old.hotkeys != new.hotkeys {
        crate::window::unregister_main_window_hotkeys_for(app, old);
        crate::window::register_main_window_hotkeys(app, new);
    }
    Ok(())
}

fn rebuild_changed_api_clients(st: &App, old: &settings::Settings, new: &settings::Settings) {
    let access_token_changed = old.access_token != new.access_token;
    if access_token_changed
        || old.groq_api_key != new.groq_api_key
        || old.stt_language != new.stt_language
        || old.stt_translate != new.stt_translate
    {
        *st.stt.lock().unwrap() = build_stt_client(new);
    }
    if access_token_changed || old.anthropic_api_key != new.anthropic_api_key {
        *st.llm.lock().unwrap() = build_llm_client(new, Arc::clone(&st.models));
    }
}

fn apply_screen_share_visibility_change(
    app: &AppHandle,
    old: &settings::Settings,
    new: &settings::Settings,
) {
    if old.screen_share_visible != new.screen_share_visible {
        crate::window::apply_content_protection_all(app, new);
    }
}

// Opening a capture device is slow — the WASAPI thread start alone waits up to five
// seconds — and `set_settings` is a synchronous command, so the rebuild must not run
// on its thread. Same reason `launch_main_window` builds its capture in spawn_blocking.
fn restart_auto_mode_off_thread(app: &AppHandle) {
    if !crate::auto::is_active(app) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::auto::restart(&app));
}

fn apply_buffer_settings_change(
    app: &AppHandle,
    old: &settings::Settings,
    new: &settings::Settings,
) {
    if old.buffer_enabled == new.buffer_enabled && old.buffer_seconds == new.buffer_seconds {
        return;
    }
    let auto_holds_the_stream = crate::auto::is_active(app);
    if let Some(c) = app.state::<App>().capture.lock().unwrap().as_ref() {
        c.set_buffer_capacity_secs(new.buffer_seconds.into());
        c.set_buffering(new.buffer_enabled || auto_holds_the_stream);
    }
}

