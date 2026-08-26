use tauri_specta::{collect_commands, Builder, ErrorHandlingMode};

use crate::settings::{self, SettingsLimits};
use crate::{
    audio_check, auto, chat, clipboard, events, hotkeys, permissions, preferences, recording,
    screenshot, storage, system, window,
};

pub const BINDINGS_OUTPUT_PATH: &str = "../src/ipc/bindings.ts";
const SETTINGS_LIMITS_CONSTANT: &str = "SETTINGS_LIMITS";
const SETTINGS_DEFAULTS_CONSTANT: &str = "SETTINGS_DEFAULTS";
const MODIFIER_COMBOS_CONSTANT: &str = "MODIFIER_COMBOS";
const HOTKEY_ACTIONS_CONSTANT: &str = "HOTKEY_ACTIONS";
const QUICK_ACTION_LIMIT_CONSTANT: &str = "QUICK_ACTION_LIMIT";
const SECRETS_STATUS_DEFAULTS_CONSTANT: &str = "SECRETS_STATUS_DEFAULTS";

pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            chat::send_to_claude,
            chat::cancel_stream,
            chat::count_chat_tokens,
            chat::probe_connectivity,
            chat::list_models,
            storage::load_chats,
            storage::save_chats,
            storage::load_context_library,
            storage::save_context_library,
            storage::save_chat_image,
            storage::load_chat_images,
            storage::prune_chat_images,
            storage::read_context_import_file,
            storage::read_context_pdf_bytes,
            recording::retry_transcription,
            recording::cancel_recording,
            auto::start_auto_mode,
            auto::stop_auto_mode,
            auto::auto_mode_active,
            auto::take_auto_mode_error,
            auto::list_audio_input_devices,
            audio_check::check_audio_source,
            recording::list_audio_output_devices,
            preferences::get_settings,
            preferences::set_settings,
            preferences::get_secrets_status,
            preferences::set_api_key,
            preferences::clear_api_key,
            preferences::clear_access_code,
            preferences::get_official_presets,
            preferences::set_ptt_suspended,
            preferences::redeem_access_code,
            preferences::take_settings_recovery,
            window::set_window_size,
            window::close_app,
            window::set_window_collapsed,
            window::launch_main_window,
            window::stop_main_window,
            screenshot::capture_region_screenshot,
            permissions::permissions_status,
            permissions::probe_permission,
            permissions::request_permission,
            permissions::open_permission_settings,
            clipboard::copy_image_to_clipboard,
            system::open_external,
            system::set_preview_html,
            system::check_for_update,
            system::install_update,
            system::get_app_version,
        ])
        .typ::<crate::error::AppError>()
        .typ::<crate::secrets::ApiKeyKind>()
        .typ::<crate::secrets::SecretsStatus>()
        .typ::<crate::state::RecorderState>()
        .typ::<events::LlmDelta>()
        .typ::<events::LlmDone>()
        .typ::<events::LlmUsage>()
        .typ::<events::LlmErrorEvent>()
        .typ::<events::ResizeKeyPayload>()
        .typ::<events::ResizeDim>()
        .typ::<events::UpdateProgress>()
        .typ::<events::UpdateDone>()
        .typ::<events::ScreenshotReady>()
        .typ::<events::AutoTurnPayload>()
        .typ::<events::AutoModeChanged>()
        .typ::<events::AudioLevel>()
        .typ::<events::CollapsedChanged>()
        .typ::<auto::Speaker>()
        .typ::<permissions::PermissionsStatus>()
        .typ::<permissions::PermissionState>()
        .typ::<permissions::PermissionKind>()
        .typ::<hotkeys::HotkeyBinding>()
        .typ::<hotkeys::HotkeyAction>()
        .typ::<hotkeys::HotkeyKind>()
        .typ::<hotkeys::HotkeyScope>()
        .constant(SETTINGS_LIMITS_CONSTANT, SettingsLimits::current())
        .constant(SETTINGS_DEFAULTS_CONSTANT, settings::Settings::default())
        .constant(MODIFIER_COMBOS_CONSTANT, hotkeys::MODIFIER_COMBOS)
        .constant(HOTKEY_ACTIONS_CONSTANT, hotkeys::HOTKEY_ACTIONS)
        .constant(QUICK_ACTION_LIMIT_CONSTANT, settings::QUICK_ACTION_LIMIT as u32)
        // The "nothing is configured" status, so the frontend's initial state is
        // derived from Rust like `SETTINGS_DEFAULTS` rather than typed out again.
        .constant(SECRETS_STATUS_DEFAULTS_CONSTANT, crate::secrets::SecretsStatus::default())
        .error_handling(ErrorHandlingMode::Throw)
}

#[cfg(test)]
mod tests;
