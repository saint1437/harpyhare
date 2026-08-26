use tauri::{AppHandle, Manager};

use crate::app_state::{build_llm_client, build_stt_client, App};
use crate::capture_service::CaptureMode;
use crate::error::AppError;
use crate::recording::request_capture_rebuild;
use crate::secrets::{ApiKeyKind, Secrets, SecretsStatus, SecretsStore};
use crate::settings::{SettingsRecovery, SettingsService, SettingsUpdate};
use crate::window::main_window;
use crate::{access, hotkey, secrets, settings};

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

/// Everything the startup read produced. The two files are read as a pair
/// because the secrets may still be INSIDE the old settings.json — see
/// `secrets::load_or_migrate`.
pub struct StartupState {
    pub settings: settings::Settings,
    pub secrets: Secrets,
    /// Whichever of the two files had to be renamed aside, if either did.
    pub recovery: Option<SettingsRecovery>,
}

/// The startup read. A file that exists but cannot be parsed is NOT silently
/// replaced by defaults any more — it is renamed aside and the reason travels to
/// the launcher through `take_settings_recovery`.
///
/// The order matters: the settings are read (and, if corrupt, quarantined)
/// FIRST, so the legacy scan below never reads bytes that have already been
/// judged unparseable. Both files are then brought up to the split layout before
/// anything else can touch them — `secrets.json` gets written, and `settings.json`
/// is rewritten without the three fields it must stop carrying.
pub fn load_settings_and_secrets(
    settings_path: &std::path::Path,
    secrets_path: &std::path::Path,
) -> StartupState {
    let (settings, settings_recovery) = settings::load_or_recover(settings_path);
    let load = secrets::load_or_migrate(secrets_path, settings_path);
    let mut current = load.secrets;

    // Before the env fallback, deliberately: `.env` is a developer convenience
    // for this run, not something to bake into the user's file.
    if load.needs_write {
        if let Err(e) = current.save(secrets_path) {
            eprintln!("не удалось перенести ключи в {}: {e}", secrets_path.display());
        }
    }
    if load.settings_needs_rewrite {
        if let Err(e) = settings.save(settings_path) {
            eprintln!("не удалось переписать {} без секретов: {e}", settings_path.display());
        }
    }

    current.apply_key_fallback(
        std::env::var(ANTHROPIC_API_KEY_ENV).ok(),
        std::env::var(GROQ_API_KEY_ENV).ok(),
    );
    StartupState {
        settings,
        secrets: current,
        recovery: settings_recovery.or(load.recovery),
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_settings(app: AppHandle) -> settings::Settings {
    app.state::<App>().settings.get()
}

/// What the frontend is allowed to know about the API keys and the access token:
/// three booleans and a masked tail. The values themselves never leave Rust.
#[tauri::command]
#[specta::specta]
pub fn get_secrets_status(app: AppHandle) -> SecretsStatus {
    app.state::<App>().secrets.status()
}

/// Takes (and clears) the record of a `settings.json` that could not be read at
/// startup. A command rather than an event for the same reason as
/// `take_auto_mode_error`: this happens before any window exists to listen.
#[tauri::command]
#[specta::specta]
pub fn take_settings_recovery(app: AppHandle) -> Option<SettingsRecovery> {
    app.state::<App>().settings.take_recovery()
}

#[tauri::command]
#[specta::specta]
pub fn get_official_presets(app: AppHandle) -> Vec<settings::PromptPreset> {
    app.state::<App>().presets.get()
}

/// What changing a setting has to make happen. Extracted from the seven `if`s
/// that used to live in the body of `set_settings`: they were untestable there
/// (constructing `App` needs a running Tauri) and every new setting added an
/// eighth without anyone being able to see the set as a whole.
///
/// There is no `RebuildLlm` here: nothing in `Settings` reaches the LLM client
/// any more now that the credentials live in `crate::secrets` — that rebuild is
/// `SecretsEffect`'s, and a variant nothing can produce is worse than no variant.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SettingsEffect {
    RebuildStt,
    ReregisterHotkeys,
    RebuildCapture,
    RestartAuto,
    ReapplyAutoBounds,
    ApplyContentProtection,
    ApplyBuffer,
}

pub fn settings_effects(
    old: &settings::Settings,
    new: &settings::Settings,
) -> Vec<SettingsEffect> {
    let mut effects = Vec::new();
    if old.stt_language != new.stt_language || old.stt_translate != new.stt_translate {
        effects.push(SettingsEffect::RebuildStt);
    }
    if old.hotkeys != new.hotkeys {
        effects.push(SettingsEffect::ReregisterHotkeys);
    }
    if old.capture_device_uid != new.capture_device_uid {
        effects.push(SettingsEffect::RebuildCapture);
    }
    // A device change restarts the mode wholesale, which re-arms the segmenters
    // anyway — asking for both would tear down a just-built capture.
    if crate::auto::device_changed(old, new) {
        effects.push(SettingsEffect::RestartAuto);
    } else if crate::auto::bounds_changed(old, new) {
        effects.push(SettingsEffect::ReapplyAutoBounds);
    }
    if old.screen_share_visible != new.screen_share_visible {
        effects.push(SettingsEffect::ApplyContentProtection);
    }
    if old.buffer_enabled != new.buffer_enabled || old.buffer_seconds != new.buffer_seconds {
        effects.push(SettingsEffect::ApplyBuffer);
    }
    effects
}

/// Both clients are rebuilt from the CURRENT contents of the two stores rather
/// than from an update's payload: a settings change and a secrets change lead
/// here from different doors, and each has only its own half.
fn rebuild_stt(app: &AppHandle) {
    let st = app.state::<App>();
    st.stt
        .replace(build_stt_client(&st.settings.get(), &st.secrets.get()));
}

fn rebuild_llm(app: &AppHandle) {
    let st = app.state::<App>();
    st.llm
        .replace_provider(build_llm_client(&st.secrets.get(), st.llm.catalog()));
}

fn apply_effect(app: &AppHandle, effect: SettingsEffect, update: &SettingsUpdate) {
    let new = &update.new;
    match effect {
        SettingsEffect::RebuildStt => rebuild_stt(app),
        SettingsEffect::ReregisterHotkeys => {
            if main_window(app).is_some() {
                crate::window::unregister_main_window_hotkeys_for(app, &update.old);
                crate::window::register_main_window_hotkeys(app, new);
            }
        }
        SettingsEffect::RebuildCapture => request_capture_rebuild(app),
        SettingsEffect::RestartAuto => restart_auto_mode_off_thread(app),
        SettingsEffect::ReapplyAutoBounds => crate::auto::reapply_bounds(app),
        SettingsEffect::ApplyContentProtection => {
            crate::window::apply_content_protection_all(app, new);
        }
        SettingsEffect::ApplyBuffer => apply_buffer_settings_change(app, new),
    }
}

/// The one place settings change. Everything — the clamp, the disk write and the
/// in-memory swap — happens under the service's lock, so a slow write can no
/// longer be overwritten by the launcher's autosave that cloned the settings
/// before it. The credentials go through `apply_secrets_change` instead, over
/// their own file and their own lock.
pub fn apply_settings_change<F>(app: &AppHandle, mutate: F) -> Result<settings::Settings, AppError>
where
    F: FnOnce(&mut settings::Settings),
{
    let update = app.state::<App>().settings.update(mutate)?;
    for effect in settings_effects(&update.old, &update.new) {
        apply_effect(app, effect, &update);
    }
    Ok(update.new)
}

#[tauri::command]
#[specta::specta]
pub fn set_settings(
    app: AppHandle,
    new_settings: settings::Settings,
) -> Result<settings::Settings, AppError> {
    apply_settings_change(&app, |current| *current = new_settings)
}

#[tauri::command]
#[specta::specta]
pub fn set_ptt_suspended(app: AppHandle, suspended: bool) {
    let hk = crate::hotkeys::effective(
        &app.state::<App>().settings.get().hotkeys,
        crate::hotkeys::ACTION_RECORD,
    );
    if suspended {
        hotkey::unregister_hotkey(&app, &hk);
    } else {
        let _ = hotkey::register_ptt(&app, &hk);
    }
}

/// Which client a secrets write invalidates. A separate enum from
/// `SettingsEffect` on purpose: a credential change can only ever produce these
/// two, and reusing the seven-variant enum would need a catch-all arm — the kind
/// that swallows a forgotten effect in silence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretsEffect {
    RebuildStt,
    RebuildLlm,
}

pub fn secrets_effects(old: &Secrets, new: &Secrets) -> Vec<SecretsEffect> {
    let token_changed = old.access_token != new.access_token;
    let mut effects = Vec::new();
    if token_changed || old.groq_api_key != new.groq_api_key {
        effects.push(SecretsEffect::RebuildStt);
    }
    if token_changed || old.anthropic_api_key != new.anthropic_api_key {
        effects.push(SecretsEffect::RebuildLlm);
    }
    effects
}

/// The secrets' twin of `apply_settings_change`: one write under the store's
/// lock, then whichever clients that write invalidated. It answers with the
/// status so the frontend adopts a fresh one instead of asking for it again.
pub fn apply_secrets_change<F>(app: &AppHandle, mutate: F) -> Result<SecretsStatus, AppError>
where
    F: FnOnce(&mut Secrets),
{
    let update = app.state::<App>().secrets.update(mutate)?;
    for effect in secrets_effects(&update.old, &update.new) {
        match effect {
            SecretsEffect::RebuildStt => rebuild_stt(app),
            SecretsEffect::RebuildLlm => rebuild_llm(app),
        }
    }
    Ok(update.new.status())
}

/// «Замена, не редактирование»: an empty value leaves the stored key alone.
/// The field on screen starts blank on every visit, so a form that treated its
/// own emptiness as an erase would wipe a working key whenever the user opened
/// the settings for something else — which is exactly what `set_settings` did
/// while the keys were ordinary fields of `Settings`.
#[tauri::command]
#[specta::specta]
pub fn set_api_key(
    app: AppHandle,
    kind: ApiKeyKind,
    value: String,
) -> Result<SecretsStatus, AppError> {
    apply_secrets_change(&app, |s| s.set_key(kind, &value))
}

#[tauri::command]
#[specta::specta]
pub fn clear_api_key(app: AppHandle, kind: ApiKeyKind) -> Result<SecretsStatus, AppError> {
    apply_secrets_change(&app, |s| s.clear_key(kind))
}

/// «Отвязать»: the token is dropped and both clients fall back to the user's own
/// keys. There is no `set_access_token` counterpart — a token is only ever
/// issued by the proxy, through `redeem_access_code`.
#[tauri::command]
#[specta::specta]
pub fn clear_access_code(app: AppHandle) -> Result<SecretsStatus, AppError> {
    apply_secrets_change(&app, Secrets::clear_access_token)
}

#[tauri::command]
#[specta::specta]
pub async fn redeem_access_code(
    app: AppHandle,
    code: String,
    idempotency_key: String,
) -> Result<SecretsStatus, AppError> {
    let base_url = access::proxy_base_url();
    let token = access::redeem(&base_url, &code, &idempotency_key).await?;
    apply_secrets_change(&app, |s| s.access_token = token)
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

fn apply_buffer_settings_change(app: &AppHandle, new: &settings::Settings) {
    // Auto mode's segmentation rides on the buffering loop, so switching the
    // background buffer off while it holds the capture would kill the
    // interviewer's turns silently. The mode is the question, not a flag.
    let st = app.state::<App>();
    let auto_holds_the_stream = st.capture.is_in(CaptureMode::AutoListening);
    st.capture.with(|c| {
        c.set_buffer_capacity_secs(new.buffer_seconds.into());
        c.set_buffering(new.buffer_enabled || auto_holds_the_stream);
    });
}

/// Builds the service at startup: the settings path is resolved once, here,
/// instead of being recomputed from the `AppHandle` at every write.
pub fn build_settings_service(
    path: std::path::PathBuf,
    settings: settings::Settings,
    recovery: Option<SettingsRecovery>,
) -> SettingsService {
    SettingsService::new(path, settings, recovery)
}

pub fn build_secrets_store(path: std::path::PathBuf, secrets: Secrets) -> SecretsStore {
    SecretsStore::new(path, secrets)
}

#[cfg(test)]
mod tests;
