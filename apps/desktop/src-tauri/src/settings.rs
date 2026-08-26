use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use crate::error::{AppError, CodedError, ErrorCode};
use crate::sync::MutexExt;

#[cfg(windows)]
mod windows;

#[cfg(unix)]
const OWNER_ONLY_FILE_MODE: u32 = 0o600;
pub(crate) const TMP_FILE_EXTENSION: &str = "tmp";

static TMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// A settings or secrets file we could not parse is renamed to this suffix plus
/// a unix timestamp instead of being silently replaced by defaults: the very
/// next write goes over it, and for `secrets.json` that is a paid access code
/// gone. Recovery is manual, but the bytes survive.
const CORRUPT_FILE_SUFFIX: &str = "corrupt";

/// The on-disk schema of `settings.json`. `0` is every file written before the
/// field existed — the shape the three ad-hoc migrations used to guess at.
pub const SCHEMA_VERSION_LEGACY: u32 = 0;
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

const SCHEMA_VERSION_KEY: &str = "schema_version";

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("Не удалось записать настройки: {0}")]
    Write(String),
    #[error("Файл настроек повреждён: {0}")]
    Corrupt(String),
}

impl CodedError for SettingsError {
    fn code(&self) -> ErrorCode {
        ErrorCode::Internal
    }
}

impl From<SettingsError> for AppError {
    fn from(e: SettingsError) -> Self {
        AppError::new(e.code(), e.to_string())
    }
}

/// `system` follows the OS; the two explicit values pin it. The former
/// `gray`/`black` pair were two dark themes 0.05 lightness apart and retired
/// when the palette gained a real light half — `migrate_legacy_theme` maps them.
pub const THEME_SYSTEM: &str = "system";
pub const THEME_LIGHT: &str = "light";
pub const THEME_DARK: &str = "dark";
pub const LEGACY_THEME_GRAY: &str = "gray";
pub const LEGACY_THEME_BLACK: &str = "black";

/// The mirror of the theme, one axis over: `system` follows the OS, the two
/// explicit values pin it. **Rust never resolves `system`** — that happens on
/// the frontend, from `navigator.language`, for the same reason the platform
/// does (`lib/platform.ts`): a value that depended on the machine would make
/// `bindings.ts` differ between the macOS and Windows build hosts. Rust stores
/// the choice and validates it, and nothing here reads the resolved locale.
pub const LANGUAGE_SYSTEM: &str = "system";
pub const LANGUAGE_RU: &str = "ru";
pub const LANGUAGE_EN: &str = "en";

pub const QUICK_ACTION_LIMIT: usize = 9;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
pub struct Bounds<T> {
    pub default: T,
    pub min: T,
    pub max: T,
}

impl Bounds<f64> {
    pub fn clamp(&self, value: f64) -> f64 {
        if value.is_finite() {
            value.clamp(self.min, self.max)
        } else {
            self.default
        }
    }
}

impl Bounds<u32> {
    pub fn clamp(&self, value: u32) -> u32 {
        value.clamp(self.min, self.max)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsLimits {
    pub window_width: Bounds<f64>,
    pub window_height: Bounds<f64>,
    pub window_opacity: Bounds<f64>,
    pub move_step: Bounds<u32>,
    pub resize_step: Bounds<u32>,
    pub chat_font_size: Bounds<f64>,
    pub scroll_step: Bounds<u32>,
    pub teleprompter_speed: Bounds<f64>,
    pub teleprompter_font_size: Bounds<f64>,
    pub buffer_seconds: Bounds<u32>,
    pub auto_silence_ms: Bounds<u32>,
    pub auto_min_utterance_ms: Bounds<u32>,
    pub auto_max_utterance_secs: Bounds<u32>,
}

impl SettingsLimits {
    pub fn current() -> Self {
        Self {
            window_width: limits::window::WIDTH,
            window_height: limits::window::HEIGHT,
            window_opacity: limits::window::OPACITY,
            move_step: limits::window::MOVE_STEP,
            resize_step: limits::window::RESIZE_STEP,
            chat_font_size: limits::chat::FONT_SIZE,
            scroll_step: limits::chat::SCROLL_STEP,
            teleprompter_speed: limits::teleprompter::SPEED,
            teleprompter_font_size: limits::teleprompter::FONT_SIZE,
            buffer_seconds: limits::capture::BUFFER_SECONDS,
            auto_silence_ms: limits::capture::AUTO_SILENCE_MS,
            auto_min_utterance_ms: limits::capture::AUTO_MIN_UTTERANCE_MS,
            auto_max_utterance_secs: limits::capture::AUTO_MAX_UTTERANCE_SECS,
        }
    }
}

pub mod defaults {
    pub const STT_LANGUAGE: &str = "ru";
    pub const THEME: &str = super::THEME_SYSTEM;
    pub const LANGUAGE: &str = super::LANGUAGE_SYSTEM;
}

pub mod limits {
    use super::Bounds;

    pub mod window {
        use super::Bounds;
        pub const WIDTH: Bounds<f64> = Bounds { default: 960.0, min: 300.0, max: 1600.0 };
        pub const HEIGHT: Bounds<f64> = Bounds { default: 680.0, min: 520.0, max: 1100.0 };
        pub const OPACITY: Bounds<f64> = Bounds { default: 0.9, min: 0.75, max: 1.0 };
        pub const MOVE_STEP: Bounds<u32> = Bounds { default: 20, min: 1, max: 200 };
        pub const RESIZE_STEP: Bounds<u32> = Bounds { default: 20, min: 1, max: 200 };
    }

    pub mod chat {
        use super::Bounds;
        pub const FONT_SIZE: Bounds<f64> = Bounds { default: 13.5, min: 10.0, max: 20.0 };
        pub const SCROLL_STEP: Bounds<u32> = Bounds { default: 120, min: 10, max: 1000 };
    }

    pub mod teleprompter {
        use super::Bounds;
        pub const SPEED: Bounds<f64> = Bounds { default: 40.0, min: 10.0, max: 150.0 };
        pub const FONT_SIZE: Bounds<f64> = Bounds { default: 28.0, min: 20.0, max: 48.0 };
    }

    pub mod capture {
        use super::Bounds;
        pub const BUFFER_SECONDS: Bounds<u32> = Bounds { default: 4, min: 4, max: 10 };
        pub const AUTO_SILENCE_MS: Bounds<u32> = Bounds { default: 700, min: 300, max: 2000 };
        pub const AUTO_MIN_UTTERANCE_MS: Bounds<u32> = Bounds { default: 400, min: 200, max: 3000 };
        pub const AUTO_MAX_UTTERANCE_SECS: Bounds<u32> = Bounds { default: 30, min: 5, max: 120 };
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct PromptPreset {
    pub id: String,
    pub name: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct QuickAction {
    pub id: String,
    pub title: String,
    pub prompt: String,
}

struct QuickActionSeed {
    id: &'static str,
    title: &'static str,
    prompt: &'static str,
}

const QUICK_ACTION_SEEDS: &[QuickActionSeed] = &[
    QuickActionSeed { id: "detail", title: "Подробнее", prompt: "Расскажи более подробно." },
    QuickActionSeed { id: "brief", title: "Короче", prompt: "Ответь короче, только суть." },
    QuickActionSeed { id: "code", title: "Пример кода", prompt: "Покажи пример кода." },
];

fn seeded_quick_actions() -> Vec<QuickAction> {
    QUICK_ACTION_SEEDS
        .iter()
        .map(|seed| QuickAction {
            id: seed.id.into(),
            title: seed.title.into(),
            prompt: seed.prompt.into(),
        })
        .collect()
}

/// Everything `get_settings` hands to the webview — and therefore **the type
/// that must never gain a secret again**. The two API keys and the access token
/// used to live here and travelled to the frontend in plaintext on every call;
/// they now live in `crate::secrets`, behind `SecretsStatus`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct Settings {
    /// The on-disk format of this file. Written by `save`, read by `load` to
    /// pick the migration chain; see `MIGRATIONS`.
    pub schema_version: u32,
    pub prompt_presets: Vec<PromptPreset>,
    pub hotkeys: Vec<crate::hotkeys::HotkeyBinding>,
    pub auto_send: bool,
    pub window_opacity: f64,
    pub move_step: u32,
    pub auto_preview_html: bool,
    pub chat_font_size: f64,
    pub skipped_version: String,
    pub stt_language: String,
    pub stt_translate: bool,
    pub screen_share_visible: bool,
    pub teleprompter_speed: f64,
    pub teleprompter_font_size: f64,
    pub teleprompter_resume: bool,
    pub audio_permission_requested: bool,
    pub screen_permission_requested: bool,
    pub window_width: f64,
    pub window_height: f64,
    pub resize_step: u32,
    pub capture_device_uid: String,
    pub theme: String,
    pub language: String,
    pub scroll_step: u32,
    pub buffer_enabled: bool,
    pub buffer_seconds: u32,
    pub auto_mode_enabled: bool,
    pub auto_reply_instant: bool,
    pub auto_mic_device_uid: String,
    pub auto_silence_ms: u32,
    pub auto_min_utterance_ms: u32,
    pub auto_max_utterance_secs: u32,
    pub mic_permission_requested: bool,
    pub quick_actions: Vec<QuickAction>,
    pub quick_action_attachments: bool,
    pub onboarding_done: bool,
    pub copy_results_to_clipboard: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            prompt_presets: Vec::new(),
            hotkeys: Vec::new(),
            auto_send: false,
            window_opacity: limits::window::OPACITY.default,
            move_step: limits::window::MOVE_STEP.default,
            auto_preview_html: true,
            chat_font_size: limits::chat::FONT_SIZE.default,
            skipped_version: String::new(),
            stt_language: defaults::STT_LANGUAGE.into(),
            stt_translate: false,
            screen_share_visible: false,
            teleprompter_speed: limits::teleprompter::SPEED.default,
            teleprompter_font_size: limits::teleprompter::FONT_SIZE.default,
            teleprompter_resume: true,
            audio_permission_requested: false,
            screen_permission_requested: false,
            window_width: limits::window::WIDTH.default,
            window_height: limits::window::HEIGHT.default,
            resize_step: limits::window::RESIZE_STEP.default,
            capture_device_uid: String::new(),
            theme: defaults::THEME.into(),
            language: defaults::LANGUAGE.into(),
            scroll_step: limits::chat::SCROLL_STEP.default,
            buffer_enabled: true,
            buffer_seconds: limits::capture::BUFFER_SECONDS.default,
            auto_mode_enabled: false,
            auto_reply_instant: false,
            auto_mic_device_uid: String::new(),
            auto_silence_ms: limits::capture::AUTO_SILENCE_MS.default,
            auto_min_utterance_ms: limits::capture::AUTO_MIN_UTTERANCE_MS.default,
            auto_max_utterance_secs: limits::capture::AUTO_MAX_UTTERANCE_SECS.default,
            mic_permission_requested: false,
            quick_actions: seeded_quick_actions(),
            quick_action_attachments: false,
            onboarding_done: false,
            copy_results_to_clipboard: true,
        }
    }
}

/// One entry per version step: `MIGRATIONS[i]` upgrades a document at version
/// `i` to version `i + 1`. Adding a format change is adding a function here and
/// bumping `CURRENT_SCHEMA_VERSION` — nothing may guess the version from the
/// presence of a field any more.
type Migration = fn(&mut serde_json::Value);

const MIGRATIONS: &[Migration] = &[migrate_v0_to_v1, migrate_v1_to_v2];

/// v0 is everything written before `schema_version` existed. The three former
/// ad-hoc migrations (legacy hotkey fields, the retired dark themes, the
/// onboarding flag) all describe exactly that shape, so they are this one step.
fn migrate_v0_to_v1(value: &mut serde_json::Value) {
    crate::hotkeys::migrate_legacy_fields(value);
    migrate_legacy_theme(value);
    migrate_onboarding_done(value);
}

/// The secrets left `Settings` for `secrets.json`. Lifting the values OUT of an
/// old document is `secrets::load_or_migrate`'s job — it reads the file before
/// this step ever runs; this step only takes the fields away, so the settings
/// file stops carrying a second plaintext copy of them from the next write on.
fn migrate_v1_to_v2(value: &mut serde_json::Value) {
    let Some(object) = value.as_object_mut() else {
        return;
    };
    for field in crate::secrets::LEGACY_SETTINGS_FIELDS {
        object.remove(field);
    }
}

fn document_version(value: &serde_json::Value) -> u32 {
    value
        .get(SCHEMA_VERSION_KEY)
        .and_then(serde_json::Value::as_u64)
        .map_or(SCHEMA_VERSION_LEGACY, |v| v as u32)
}

/// Runs every step from `from_version` up to `CURRENT_SCHEMA_VERSION` and
/// stamps the result. A file from the FUTURE (a downgrade) is left alone: its
/// unknown fields are dropped by serde, but nothing pretends to migrate it
/// backwards.
pub fn migrate(value: &mut serde_json::Value, from_version: u32) -> u32 {
    let mut version = from_version;
    while (version as usize) < MIGRATIONS.len() {
        MIGRATIONS[version as usize](value);
        version += 1;
    }
    if let Some(object) = value.as_object_mut() {
        object.insert(SCHEMA_VERSION_KEY.into(), version.max(from_version).into());
    }
    version.max(from_version)
}

/// Both retired values were dark, so an existing install keeps the appearance it
/// had; only a fresh install gets `system`.
fn migrate_legacy_theme(value: &mut serde_json::Value) {
    let Some(theme) = value.get("theme").and_then(serde_json::Value::as_str) else {
        return;
    };
    if theme == LEGACY_THEME_GRAY || theme == LEGACY_THEME_BLACK {
        value["theme"] = serde_json::Value::String(THEME_DARK.into());
    }
}

/// Onboarding exists to obtain API access; anyone who already has it has
/// effectively completed it and must not be sent back through the flow.
///
/// The three field names are spelled out rather than taken from
/// `secrets::LEGACY_SETTINGS_FIELDS`: this step describes a document shape that
/// is frozen in the past, and renaming a live constant must not change what a
/// v0 file means.
fn migrate_onboarding_done(value: &mut serde_json::Value) {
    let Some(object) = value.as_object_mut() else {
        return;
    };
    if object.contains_key("onboarding_done") {
        return;
    }
    let configured = ["anthropic_api_key", "groq_api_key", "access_token"].iter().any(|key| {
        object.get(*key).and_then(serde_json::Value::as_str).is_some_and(|v| !v.is_empty())
    });
    object.insert("onboarding_done".into(), serde_json::Value::Bool(configured));
}

impl Settings {
    pub fn clamp(&mut self) {
        self.window_opacity = limits::window::OPACITY.clamp(self.window_opacity);
        self.window_width = limits::window::WIDTH.clamp(self.window_width);
        self.window_height = limits::window::HEIGHT.clamp(self.window_height);
        self.move_step = limits::window::MOVE_STEP.clamp(self.move_step);
        self.resize_step = limits::window::RESIZE_STEP.clamp(self.resize_step);
        self.chat_font_size = limits::chat::FONT_SIZE.clamp(self.chat_font_size);
        self.scroll_step = limits::chat::SCROLL_STEP.clamp(self.scroll_step);
        self.teleprompter_speed = limits::teleprompter::SPEED.clamp(self.teleprompter_speed);
        self.teleprompter_font_size =
            limits::teleprompter::FONT_SIZE.clamp(self.teleprompter_font_size);
        self.buffer_seconds = limits::capture::BUFFER_SECONDS.clamp(self.buffer_seconds);
        self.auto_silence_ms = limits::capture::AUTO_SILENCE_MS.clamp(self.auto_silence_ms);
        self.auto_min_utterance_ms =
            limits::capture::AUTO_MIN_UTTERANCE_MS.clamp(self.auto_min_utterance_ms);
        self.auto_max_utterance_secs =
            limits::capture::AUTO_MAX_UTTERANCE_SECS.clamp(self.auto_max_utterance_secs);
        if !matches!(self.theme.as_str(), THEME_SYSTEM | THEME_LIGHT | THEME_DARK) {
            self.theme = defaults::THEME.into();
        }
        if !matches!(
            self.language.as_str(),
            LANGUAGE_SYSTEM | LANGUAGE_RU | LANGUAGE_EN
        ) {
            self.language = defaults::LANGUAGE.into();
        }
        self.quick_actions.truncate(QUICK_ACTION_LIMIT);
        crate::hotkeys::normalize(&mut self.hotkeys);
    }

    pub fn load(path: &Path) -> std::io::Result<Self> {
        let mut settings = match std::fs::read_to_string(path) {
            Ok(raw) => Self::parse(&raw)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Settings::default(),
            Err(e) => return Err(e),
        };
        settings.clamp();
        Ok(settings)
    }

    pub fn parse(raw: &str) -> Result<Self, SettingsError> {
        let mut value: serde_json::Value =
            serde_json::from_str(raw).map_err(|e| SettingsError::Corrupt(e.to_string()))?;
        let from = document_version(&value);
        migrate(&mut value, from);
        serde_json::from_value::<Settings>(value)
            .map_err(|e| SettingsError::Corrupt(e.to_string()))
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        write_atomic_owner_only(path, &json)
    }
}

/// What the startup read did to a `settings.json` or a `secrets.json` it could
/// not parse. Carried to the frontend through the `take_settings_recovery`
/// command — the user paid for the access code that was in there and has to be
/// told it is gone.
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsRecovery {
    /// Absolute path of the renamed file, so the message can name it.
    pub backup_path: String,
    /// Why the file could not be read.
    pub reason: String,
}

fn corrupt_backup_path(path: &Path, unix_secs: u64) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".{CORRUPT_FILE_SUFFIX}-{unix_secs}"));
    path.with_file_name(name)
}

fn unix_now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// Three outcomes, not two: no file → defaults; parsed → settings; unreadable →
/// the bytes are renamed out of the way, the reason is logged AND reported, and
/// defaults are used. The old `unwrap_or_else(|_| default())` silently made the
/// third case look like the first, and the first `set_settings` overwrote the
/// keys and the access token with defaults.
pub fn load_or_recover(path: &Path) -> (Settings, Option<SettingsRecovery>) {
    match Settings::load(path) {
        Ok(settings) => (settings, None),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (Settings::default(), None),
        Err(e) => (Settings::default(), Some(quarantine(path, e.to_string()))),
    }
}

/// Moves an unparseable file out of the way and describes the loss. Shared by
/// `settings.json` and `secrets.json`: both are owner-only files whose next
/// write would otherwise erase whatever the user still had in them.
pub(crate) fn quarantine(path: &Path, reason: String) -> SettingsRecovery {
    let backup = corrupt_backup_path(path, unix_now_secs());
    let renamed = std::fs::rename(path, &backup);
    eprintln!(
        "файл {} не читается ({reason}); сохранён как {} ({:?})",
        path.display(),
        backup.display(),
        renamed.as_ref().err()
    );
    SettingsRecovery {
        backup_path: backup.display().to_string(),
        reason,
    }
}

/// The single mutation point for `Settings`.
///
/// Read-modify-write used to live in three places (`set_settings`,
/// `apply_access_token`, `permissions::mark_requested`), each cloning the value,
/// releasing the lock, writing to disk and only then storing back. A redeem that
/// takes up to 45 s alongside the launcher's autosave debounce lost a paid
/// access token that way, and `audio_permission_requested` symmetrically.
/// `update` holds the lock across read → mutate → clamp → write → store, so two
/// concurrent updates of two different fields both survive. The secrets have
/// since moved to `secrets::SecretsStore`, which is the same construction over
/// its own file.
pub struct SettingsService {
    path: PathBuf,
    current: Mutex<Settings>,
    /// Set once at startup when `settings.json` could not be parsed and had to
    /// be renamed aside. Pulled by the launcher through `take_settings_recovery`
    /// — an event would fire before any window is listening.
    recovery: Mutex<Option<SettingsRecovery>>,
}

/// Both halves of an applied update: callers need `old` to decide which side
/// effects to run and `new` to answer the frontend with the clamped value.
#[derive(Debug, Clone)]
pub struct SettingsUpdate {
    pub old: Settings,
    pub new: Settings,
}

impl SettingsService {
    pub fn new(path: PathBuf, settings: Settings, recovery: Option<SettingsRecovery>) -> Self {
        Self {
            path,
            current: Mutex::new(settings),
            recovery: Mutex::new(recovery),
        }
    }

    /// Takes (and clears) the record of a settings file that could not be read.
    /// One shot: the launcher raises a notification from it exactly once.
    pub fn take_recovery(&self) -> Option<SettingsRecovery> {
        self.recovery.lock_safe().take()
    }

    pub fn get(&self) -> Settings {
        self.current.lock_safe().clone()
    }

    /// For the raw-input path only (`platform::arrow_action`): the low-level
    /// keyboard hook must never block, so a contended lock means "no decision".
    pub fn try_get(&self) -> Option<Settings> {
        self.current.try_lock().ok().map(|s| s.clone())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn update<F>(&self, mutate: F) -> Result<SettingsUpdate, SettingsError>
    where
        F: FnOnce(&mut Settings),
    {
        let mut guard = self.current.lock_safe();
        let old = guard.clone();
        let mut next = old.clone();
        mutate(&mut next);
        next.clamp();
        if next == old {
            return Ok(SettingsUpdate { old, new: next });
        }
        next.save(&self.path)
            .map_err(|e| SettingsError::Write(e.to_string()))?;
        *guard = next.clone();
        Ok(SettingsUpdate { old, new: next })
    }
}

/// Creates a file only this user may read, on both platforms — the two halves
/// of "owner only" that have nothing in common but the intent.
///
/// unix says it at `open` time with a mode. Windows has no modes, so the file
/// is created first and then given a DACL of its own (`settings/windows.rs`).
/// **A DACL that could not be applied is logged, not propagated**: the file
/// already lives in the per-user profile folder, and the same writer serves
/// settings.json, chats.json and the presets cache — turning "the ACL could not
/// be tightened" into "nothing can be saved" would trade a privacy improvement
/// for a broken app on any volume that cannot hold an ACL.
fn create_owner_only(path: &Path) -> std::io::Result<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(OWNER_ONLY_FILE_MODE);
    }
    let file = options.open(path)?;
    #[cfg(windows)]
    if let Err(e) = self::windows::restrict_to_current_user(path) {
        eprintln!("не удалось ограничить права на {}: {e}", path.display());
    }
    Ok(file)
}

pub(crate) fn write_atomic_owner_only(path: &Path, contents: &str) -> std::io::Result<()> {
    write_atomic_owner_only_bytes(path, contents.as_bytes())
}

fn unique_tmp_path(path: &Path) -> PathBuf {
    let sequence = TMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".{}-{sequence}.{TMP_FILE_EXTENSION}", std::process::id()));
    path.with_file_name(name)
}

/// The `sync_all` is not belt-and-braces: `rename` is atomic against a
/// concurrent reader, but not against power loss. Without an fsync of the
/// temporary file the directory entry can reach the disk before the bytes do,
/// and the settings/chats file comes back after a crash as a correctly named
/// file full of zeroes — which is exactly the "corrupt json" case that used to
/// wipe the API keys.
fn write_tmp_file(tmp: &Path, contents: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut file = create_owner_only(tmp)?;
    file.write_all(contents)?;
    file.sync_all()
}

pub(crate) fn write_atomic_owner_only_bytes(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = unique_tmp_path(path);
    let outcome = write_tmp_file(&tmp, contents).and_then(|()| std::fs::rename(&tmp, path));
    if outcome.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    outcome
}

#[cfg(test)]
mod tests;
