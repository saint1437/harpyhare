# План реализации: itech — системный звук → Groq STT → Claude

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** macOS-приложение на Tauri 2: зажал V → записали системный звук → Groq whisper-large-v3-turbo → текст в clipboard и редактируемый composer (+скриншоты из Cmd+V) → стрим ответа Claude (`claude-opus-4-8`).

**Architecture:** Rust-ядро (захват через Core Audio process tap, HTTP-клиенты Groq/Anthropic, состояние, хоткеи) + vanilla-TS UI в WKWebView. Вся логика — чистые функции под юнит-тестами (cargo test / vitest); сеть тестируется wiremock'ом; тонкая прослойка Tauri-команд/событий без логики.

**Tech Stack:** Tauri 2, cidre (Core Audio tap; fallback — Swift-шим), rubato, hound, reqwest (multipart + SSE), wiremock, vite + vitest, marked + dompurify.

**Спека:** `docs/superpowers/specs/2026-06-10-system-audio-stt-design.md` — читать перед началом.

---

## Структура файлов

```
i.tech/
├── index.html                  # главное окно
├── overlay.html                # оверлей «● Запись»
├── package.json / vite.config.ts / vitest.config.ts / tsconfig.json
├── src/                        # frontend
│   ├── main.ts                 # wiring: invoke/events/DOM
│   ├── styles.css
│   ├── composer.ts             # ЧИСТАЯ логика вложений/даунскейла/payload
│   ├── composer.test.ts
│   ├── window-controls.ts      # ЧИСТАЯ логика moveDelta/applyOpacity
│   ├── window-controls.test.ts
│   └── markdown.ts             # marked+dompurify обёртка
└── src-tauri/
    ├── Cargo.toml / tauri.conf.json / Info.plist
    └── src/
        ├── main.rs / lib.rs    # setup, команды, события (тонкая прослойка)
        ├── settings.rs         # Settings: defaults, clamp, load/save 600
        ├── audio.rs            # downmix, rms/silence, resample, wav
        ├── state.rs            # машина состояний записи
        ├── capture.rs          # Core Audio process tap (cidre)
        ├── stt.rs              # trait SttEngine + GroqStt
        ├── llm.rs              # build_content, SSE-парсер, AnthropicClient
        └── hotkey.rs           # PTT V, Esc-на-время-записи, suspend
```

Принципы: один файл — одна ответственность; логика отделена от I/O ради тестируемости; TDD в каждой задаче; коммит после каждой задачи.

---

### Task 1: Каркас проекта

**Files:** Create: всё дерево выше (скелет), `src-tauri/Info.plist`, `.gitignore`

- [ ] **Step 1: Сгенерировать Tauri-проект** (в текущем каталоге `/Users/mark/i.tech`, он уже git-репо с docs/)

```bash
cd /Users/mark/i.tech
npm create tauri-app@latest . -- --name itech --identifier com.itech.voice --template vanilla-ts --manager npm --yes
npm install
npm i marked dompurify
npm i -D vitest jsdom
```

- [ ] **Step 2: Rust-зависимости**

```bash
cd src-tauri
cargo add tauri-plugin-global-shortcut tauri-plugin-clipboard-manager tauri-plugin-store
cargo add serde --features derive
cargo add serde_json thiserror base64 hound rubato futures-util
cargo add tokio --features full
cargo add tokio-util
cargo add reqwest --features json,multipart,stream
cargo add cidre
cargo add --dev wiremock tempfile
```

- [ ] **Step 3: tauri.conf.json** — заменить секции `app` (окна + macOSPrivateApi) и identifier:

```json
{
  "identifier": "com.itech.voice",
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "label": "main",
        "title": "itech",
        "width": 480,
        "height": 660,
        "transparent": true,
        "minWidth": 380,
        "minHeight": 480
      }
    ],
    "security": { "csp": null }
  }
}
```

(остальные поля генератора не трогать)

- [ ] **Step 4: `src-tauri/Info.plist`** (Tauri вмёрживает его в бандл):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSAudioCaptureUsageDescription</key>
  <string>itech записывает системный звук по зажатию push-to-talk клавиши, чтобы расшифровать речь в текст.</string>
</dict>
</plist>
```

- [ ] **Step 5: vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 6: Проверка, что каркас живой**

Run: `cargo check --manifest-path src-tauri/Cargo.toml && npm run build && npx vitest run`
Expected: cargo OK; vite build OK; vitest: "No test files found" — это нормально на данном шаге.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: каркас Tauri 2 (vanilla-ts), зависимости, Info.plist, transparent window"
```

---

### Task 2: `settings.rs` — настройки с клампами

**Files:** Create: `src-tauri/src/settings.rs`; Modify: `src-tauri/src/lib.rs` (объявить `mod`)

- [ ] **Step 1: Failing-тесты** — в конец `settings.rs` (тесты и код в одном файле, как принято в Rust):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_spec() {
        let s = Settings::default();
        assert_eq!(s.model, "claude-opus-4-8");
        assert_eq!(s.hotkey, "V");
        assert!(!s.auto_send);
        assert_eq!(s.window_opacity, 1.0);
        assert_eq!(s.move_step, 20);
        assert!(s.system_prompt.contains("расшифровку"));
    }

    #[test]
    fn clamp_limits_opacity_and_step() {
        let mut s = Settings::default();
        s.window_opacity = 0.05;
        s.move_step = 1000;
        s.clamp();
        assert_eq!(s.window_opacity, 0.2);
        assert_eq!(s.move_step, 200);
        s.window_opacity = 1.5;
        s.move_step = 0;
        s.clamp();
        assert_eq!(s.window_opacity, 1.0);
        assert_eq!(s.move_step, 1);
    }

    #[test]
    fn save_load_roundtrip_with_600_perms() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut s = Settings::default();
        s.groq_api_key = "gsk_test".into();
        s.save(&path).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        assert_eq!(Settings::load(&path).unwrap().groq_api_key, "gsk_test");
    }

    #[test]
    fn load_missing_file_gives_defaults() {
        let s = Settings::load(std::path::Path::new("/nonexistent/x.json")).unwrap();
        assert_eq!(s.model, "claude-opus-4-8");
    }
}
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `cargo test --manifest-path src-tauri/Cargo.toml settings`
Expected: ошибка компиляции — `Settings` не определён.

- [ ] **Step 3: Минимальная реализация** — начало `settings.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const DEFAULT_SYSTEM_PROMPT: &str = "Ты получаешь расшифровку русской речи из аудио (могут быть ошибки распознавания). Ответь на вопрос или прокомментируй сказанное кратко и по делу, на русском.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub anthropic_api_key: String,
    pub groq_api_key: String,
    pub model: String,
    pub system_prompt: String,
    pub hotkey: String,
    pub auto_send: bool,
    pub window_opacity: f64,
    pub move_step: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            anthropic_api_key: String::new(),
            groq_api_key: String::new(),
            model: "claude-opus-4-8".into(),
            system_prompt: DEFAULT_SYSTEM_PROMPT.into(),
            hotkey: "V".into(),
            auto_send: false,
            window_opacity: 1.0,
            move_step: 20,
        }
    }
}

impl Settings {
    pub fn clamp(&mut self) {
        self.window_opacity = self.window_opacity.clamp(0.2, 1.0);
        self.move_step = self.move_step.clamp(1, 200);
    }

    pub fn load(path: &Path) -> std::io::Result<Self> {
        match std::fs::read_to_string(path) {
            Ok(raw) => {
                let mut s: Settings = serde_json::from_str(&raw)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
                s.clamp();
                Ok(s)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
            Err(e) => Err(e),
        }
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        use std::os::unix::fs::PermissionsExt;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self).unwrap())?;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
    }
}
```

В `lib.rs` добавить: `pub mod settings;`

- [ ] **Step 4: Тесты зелёные**

Run: `cargo test --manifest-path src-tauri/Cargo.toml settings`
Expected: `4 passed`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: настройки с клампами и сохранением 0600 (TDD)"`

---

### Task 3: `audio.rs` — даунмикс и гейт тишины

**Files:** Create: `src-tauri/src/audio.rs`; Modify: `src-tauri/src/lib.rs` (`pub mod audio;`)

- [ ] **Step 1: Failing-тесты**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downmix_averages_channels() {
        // interleaved стерео: L=1.0 R=0.0, L=0.5 R=0.5
        let stereo = vec![1.0f32, 0.0, 0.5, 0.5];
        assert_eq!(downmix_to_mono(&stereo, 2), vec![0.5, 0.5]);
    }

    #[test]
    fn downmix_mono_passthrough() {
        assert_eq!(downmix_to_mono(&[0.3, -0.3], 1), vec![0.3, -0.3]);
    }

    #[test]
    fn rms_of_silence_is_zero_and_of_sine_is_positive() {
        assert_eq!(rms(&vec![0.0f32; 1600]), 0.0);
        let sine: Vec<f32> = (0..1600)
            .map(|i| (i as f32 * 0.1).sin() * 0.5)
            .collect();
        assert!(rms(&sine) > 0.3);
    }

    #[test]
    fn silence_gate_threshold() {
        let quiet = vec![0.0005f32; 16000];
        let loud = vec![0.05f32; 16000];
        assert!(is_silence(&quiet));
        assert!(!is_silence(&loud));
        assert!(is_silence(&[])); // пустой буфер — тоже тишина
    }
}
```

- [ ] **Step 2: Убедиться, что падает** — `cargo test --manifest-path src-tauri/Cargo.toml audio` → ошибка компиляции.

- [ ] **Step 3: Реализация**

```rust
/// Порог RMS, ниже которого запись считается тишиной (подобран в спеке, уточняется вручную).
pub const SILENCE_RMS_THRESHOLD: f32 = 1e-3;

/// Интерливленный многоканальный буфер -> моно (среднее каналов).
pub fn downmix_to_mono(interleaved: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return interleaved.to_vec();
    }
    interleaved
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

pub fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
}

pub fn is_silence(samples: &[f32]) -> bool {
    rms(samples) < SILENCE_RMS_THRESHOLD
}
```

- [ ] **Step 4: Зелёные** — `cargo test ... audio` → `4 passed`.
- [ ] **Step 5: Commit** — `git commit -am "feat: даунмикс и RMS-гейт тишины (TDD)"`

---

### Task 4: `audio.rs` — ресемплинг 48к→16к и WAV

**Files:** Modify: `src-tauri/src/audio.rs`

- [ ] **Step 1: Failing-тесты** (добавить в `mod tests`):

```rust
    #[test]
    fn resample_48k_to_16k_keeps_duration() {
        let one_sec_48k: Vec<f32> = (0..48000)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48000.0).sin())
            .collect();
        let out = resample_to_16k(&one_sec_48k, 48000).unwrap();
        // длительность сохраняется с точностью до чанка ресемплера
        assert!((out.len() as i64 - 16000).abs() < 200, "len={}", out.len());
        // сигнал не деградировал в ноль
        assert!(rms(&out) > 0.3);
    }

    #[test]
    fn resample_16k_is_passthrough() {
        let buf = vec![0.1f32; 1600];
        assert_eq!(resample_to_16k(&buf, 16000).unwrap(), buf);
    }

    #[test]
    fn wav_encoding_is_valid_16bit_mono_16k() {
        let samples = vec![0.0f32, 0.5, -0.5, 1.0, -1.0];
        let bytes = encode_wav_16k_mono(&samples).unwrap();
        let reader = hound::WavReader::new(std::io::Cursor::new(&bytes)).unwrap();
        let spec = reader.spec();
        assert_eq!(spec.sample_rate, 16000);
        assert_eq!(spec.channels, 1);
        assert_eq!(spec.bits_per_sample, 16);
        assert_eq!(reader.len(), 5);
    }
```

- [ ] **Step 2: Падает** — `cargo test ... audio` → нет функций.

- [ ] **Step 3: Реализация** (добавить в `audio.rs`):

```rust
use rubato::{Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction};

pub const TARGET_SAMPLE_RATE: u32 = 16000;

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("ресемплинг: {0}")]
    Resample(String),
    #[error("wav: {0}")]
    Wav(String),
}

pub fn resample_to_16k(mono: &[f32], src_rate: u32) -> Result<Vec<f32>, AudioError> {
    if src_rate == TARGET_SAMPLE_RATE {
        return Ok(mono.to_vec());
    }
    let params = SincInterpolationParameters {
        sinc_len: 128,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 128,
        window: WindowFunction::Blackman2,
    };
    let chunk = 1024;
    let mut rs = SincFixedIn::<f32>::new(
        TARGET_SAMPLE_RATE as f64 / src_rate as f64,
        2.0,
        params,
        chunk,
        1,
    )
    .map_err(|e| AudioError::Resample(e.to_string()))?;
    let mut out = Vec::with_capacity(mono.len() / 3 + chunk);
    for block in mono.chunks(chunk) {
        let mut input = block.to_vec();
        input.resize(chunk, 0.0); // последний неполный блок добиваем нулями
        let res = rs
            .process(&[input], None)
            .map_err(|e| AudioError::Resample(e.to_string()))?;
        out.extend_from_slice(&res[0]);
    }
    Ok(out)
}

pub fn encode_wav_16k_mono(samples: &[f32]) -> Result<Vec<u8>, AudioError> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = std::io::Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| AudioError::Wav(e.to_string()))?;
        for s in samples {
            let v = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            writer.write_sample(v).map_err(|e| AudioError::Wav(e.to_string()))?;
        }
        writer.finalize().map_err(|e| AudioError::Wav(e.to_string()))?;
    }
    Ok(cursor.into_inner())
}
```

Примечание: добивка нулями последнего блока добавляет ≤64 мс тишины в хвост — на распознавание не влияет; тест длительности это учитывает (допуск 200 сэмплов).

- [ ] **Step 4: Зелёные** — `7 passed` по модулю audio.
- [ ] **Step 5: Commit** — `git commit -am "feat: ресемплинг rubato 48к→16к и WAV-энкодер (TDD)"`

---

### Task 5: `state.rs` — машина состояний записи

**Files:** Create: `src-tauri/src/state.rs`; Modify: `src-tauri/src/lib.rs` (`pub mod state;`)

- [ ] **Step 1: Failing-тесты**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn happy_path() {
        let mut m = RecorderState::Idle;
        assert_eq!(m.on(Event::PttPressed), Action::StartCapture);
        assert_eq!(m, RecorderState::Recording);
        assert_eq!(m.on(Event::PttReleased { duration_secs: 2.0 }), Action::Transcribe);
        assert_eq!(m, RecorderState::Transcribing);
        assert_eq!(m.on(Event::TranscriptionFinished), Action::None);
        assert_eq!(m, RecorderState::Idle);
    }

    #[test]
    fn too_short_recording_is_discarded() {
        let mut m = RecorderState::Recording;
        assert_eq!(m.on(Event::PttReleased { duration_secs: 0.2 }), Action::Discard);
        assert_eq!(m, RecorderState::Idle);
    }

    #[test]
    fn press_ignored_while_transcribing() {
        let mut m = RecorderState::Transcribing;
        assert_eq!(m.on(Event::PttPressed), Action::None);
        assert_eq!(m, RecorderState::Transcribing);
    }

    #[test]
    fn esc_cancels_only_recording() {
        let mut m = RecorderState::Recording;
        assert_eq!(m.on(Event::Cancel), Action::Discard);
        assert_eq!(m, RecorderState::Idle);
        let mut idle = RecorderState::Idle;
        assert_eq!(idle.on(Event::Cancel), Action::None);
    }

    #[test]
    fn max_duration_forces_transcription() {
        let mut m = RecorderState::Recording;
        assert_eq!(m.on(Event::MaxDurationReached), Action::Transcribe);
        assert_eq!(m, RecorderState::Transcribing);
    }
}
```

- [ ] **Step 2: Падает** — `cargo test ... state` → нет типов.

- [ ] **Step 3: Реализация**

```rust
pub const MIN_RECORDING_SECS: f32 = 0.3;
pub const MAX_RECORDING_SECS: f32 = 600.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecorderState {
    Idle,
    Recording,
    Transcribing,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Event {
    PttPressed,
    PttReleased { duration_secs: f32 },
    Cancel,
    MaxDurationReached,
    TranscriptionFinished, // успех ИЛИ ошибка — машина возвращается в Idle
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    None,
    StartCapture,
    Transcribe,
    Discard,
}

impl RecorderState {
    pub fn on(&mut self, e: Event) -> Action {
        use {Action as A, Event as E, RecorderState as S};
        let (next, action) = match (*self, e) {
            (S::Idle, E::PttPressed) => (S::Recording, A::StartCapture),
            (S::Recording, E::PttReleased { duration_secs }) if duration_secs < MIN_RECORDING_SECS => {
                (S::Idle, A::Discard)
            }
            (S::Recording, E::PttReleased { .. }) => (S::Transcribing, A::Transcribe),
            (S::Recording, E::MaxDurationReached) => (S::Transcribing, A::Transcribe),
            (S::Recording, E::Cancel) => (S::Idle, A::Discard),
            (S::Transcribing, E::TranscriptionFinished) => (S::Idle, A::None),
            (s, _) => (s, A::None),
        };
        *self = next;
        action
    }
}
```

- [ ] **Step 4: Зелёные** — `5 passed`.
- [ ] **Step 5: Commit** — `git commit -am "feat: машина состояний записи (TDD)"`

---

### Task 6: `llm.rs` — сборка content-блоков

**Files:** Create: `src-tauri/src/llm.rs`; Modify: `src-tauri/src/lib.rs` (`pub mod llm;`)

- [ ] **Step 1: Failing-тесты**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn text_only_content_is_plain_string() {
        assert_eq!(build_content("привет", &[]), json!("привет"));
    }

    #[test]
    fn images_go_before_text_as_blocks() {
        let imgs = vec![ImageAttachment {
            media_type: "image/png".into(),
            data: "AAAA".into(),
        }];
        assert_eq!(
            build_content("что на скриншоте?", &imgs),
            json!([
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}},
                {"type": "text", "text": "что на скриншоте?"}
            ])
        );
    }

    #[test]
    fn request_body_shape_for_opus_includes_adaptive_thinking() {
        let body = build_request_body("claude-opus-4-8", "sys", "вопрос", &[]);
        assert_eq!(body["model"], "claude-opus-4-8");
        assert_eq!(body["max_tokens"], 64000);
        assert_eq!(body["stream"], true);
        assert_eq!(body["thinking"]["type"], "adaptive");
        assert_eq!(body["system"], "sys");
        assert_eq!(body["messages"][0]["role"], "user");
    }

    #[test]
    fn haiku_body_has_no_thinking_field() {
        let body = build_request_body("claude-haiku-4-5", "sys", "вопрос", &[]);
        assert!(body.get("thinking").is_none());
    }
}
```

- [ ] **Step 2: Падает** — `cargo test ... llm` → нет типов.

- [ ] **Step 3: Реализация**

```rust
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Clone, Deserialize)]
pub struct ImageAttachment {
    pub media_type: String,
    pub data: String, // base64
}

pub fn build_content(text: &str, images: &[ImageAttachment]) -> Value {
    if images.is_empty() {
        return json!(text);
    }
    let mut blocks: Vec<Value> = images
        .iter()
        .map(|img| {
            json!({
                "type": "image",
                "source": {"type": "base64", "media_type": img.media_type, "data": img.data}
            })
        })
        .collect();
    blocks.push(json!({"type": "text", "text": text}));
    Value::Array(blocks)
}

pub fn build_request_body(model: &str, system: &str, text: &str, images: &[ImageAttachment]) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": 64000,
        "stream": true,
        "system": system,
        "messages": [{"role": "user", "content": build_content(text, images)}]
    });
    // claude-haiku-4-5 не поддерживает adaptive thinking — поле не отправляем (см. спеку)
    if !model.starts_with("claude-haiku") {
        body["thinking"] = json!({"type": "adaptive"});
    }
    body
}
```

- [ ] **Step 4: Зелёные** — `4 passed`.
- [ ] **Step 5: Commit** — `git commit -am "feat: сборка тела запроса Anthropic с image-блоками (TDD)"`

---

### Task 7: `llm.rs` — SSE-парсер

**Files:** Modify: `src-tauri/src/llm.rs`

- [ ] **Step 1: Failing-тесты** (добавить в `mod tests`):

```rust
    const SSE_FIXTURE: &str = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\"}}\n\nevent: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"При\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"вет!\"}}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";

    #[test]
    fn sse_parser_extracts_text_deltas_and_done() {
        let mut p = SseParser::new();
        let out = p.feed(SSE_FIXTURE);
        let texts: Vec<_> = out
            .iter()
            .filter_map(|e| match e {
                SseOut::TextDelta(t) => Some(t.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(texts, vec!["При", "вет!"]);
        assert!(matches!(out.last(), Some(SseOut::Done)));
    }

    #[test]
    fn sse_parser_handles_chunk_split_mid_event() {
        let mut p = SseParser::new();
        let (a, b) = SSE_FIXTURE.split_at(95); // разрез посреди data-строки
        let mut out = p.feed(a);
        out.extend(p.feed(b));
        let text: String = out
            .iter()
            .filter_map(|e| match e {
                SseOut::TextDelta(t) => Some(t.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(text, "Привет!");
    }

    #[test]
    fn sse_parser_surfaces_api_error_event() {
        let mut p = SseParser::new();
        let out = p.feed("event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n");
        assert!(matches!(&out[0], SseOut::ApiError(m) if m.contains("Overloaded")));
    }
```

- [ ] **Step 2: Падает** — нет `SseParser`.

- [ ] **Step 3: Реализация** (добавить в `llm.rs`):

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum SseOut {
    TextDelta(String),
    Done,
    ApiError(String),
}

/// Инкрементальный парсер SSE-потока Anthropic: копит байты, режет по "\n\n",
/// отдаёт только то, что нужно UI (text_delta / конец / ошибка). thinking-дельты игнорируются.
#[derive(Default)]
pub struct SseParser {
    buf: String,
}

impl SseParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn feed(&mut self, chunk: &str) -> Vec<SseOut> {
        self.buf.push_str(chunk);
        let mut out = Vec::new();
        while let Some(pos) = self.buf.find("\n\n") {
            let event_block = self.buf[..pos].to_string();
            self.buf.drain(..pos + 2);
            if let Some(parsed) = Self::parse_block(&event_block) {
                out.push(parsed);
            }
        }
        out
    }

    fn parse_block(block: &str) -> Option<SseOut> {
        let data_line = block.lines().find(|l| l.starts_with("data: "))?;
        let v: serde_json::Value = serde_json::from_str(&data_line[6..]).ok()?;
        match v["type"].as_str()? {
            "content_block_delta" if v["delta"]["type"] == "text_delta" => {
                Some(SseOut::TextDelta(v["delta"]["text"].as_str()?.to_string()))
            }
            "message_stop" => Some(SseOut::Done),
            "error" => Some(SseOut::ApiError(
                v["error"]["message"].as_str().unwrap_or("неизвестная ошибка API").to_string(),
            )),
            _ => None, // message_start, thinking_delta, content_block_stop, message_delta и пр.
        }
    }
}
```

- [ ] **Step 4: Зелёные** — `7 passed` по модулю llm.
- [ ] **Step 5: Commit** — `git commit -am "feat: инкрементальный SSE-парсер Anthropic (TDD)"`

---

### Task 8: `stt.rs` — GroqStt против wiremock

**Files:** Create: `src-tauri/src/stt.rs`; Modify: `src-tauri/src/lib.rs` (`pub mod stt;`)

- [ ] **Step 1: Failing-тесты**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn samples() -> Vec<f32> {
        vec![0.1f32; 16000] // 1 сек не-тишины
    }

    #[tokio::test]
    async fn transcribe_returns_text_on_success() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/openai/v1/audio/transcriptions"))
            .and(header("authorization", "Bearer gsk_test"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"text": "привет мир"})))
            .mount(&server)
            .await;
        let stt = GroqStt::new("gsk_test".into()).with_base_url(server.uri());
        assert_eq!(stt.transcribe(&samples()).await.unwrap(), "привет мир");
    }

    #[tokio::test]
    async fn transcribe_maps_401_to_bad_key() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;
        let stt = GroqStt::new("bad".into()).with_base_url(server.uri());
        assert!(matches!(stt.transcribe(&samples()).await, Err(SttError::BadApiKey)));
    }

    #[tokio::test]
    async fn transcribe_maps_429_and_5xx_to_retryable() {
        for code in [429u16, 500, 503] {
            let server = MockServer::start().await;
            Mock::given(method("POST"))
                .respond_with(ResponseTemplate::new(code))
                .mount(&server)
                .await;
            let stt = GroqStt::new("k".into()).with_base_url(server.uri());
            assert!(matches!(stt.transcribe(&samples()).await, Err(SttError::Retryable(_))));
        }
    }

    #[tokio::test]
    async fn transcribe_maps_timeout_to_network() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_delay(std::time::Duration::from_secs(3)))
            .mount(&server)
            .await;
        let stt = GroqStt::new("k".into())
            .with_base_url(server.uri())
            .with_timeout(std::time::Duration::from_millis(200));
        assert!(matches!(stt.transcribe(&samples()).await, Err(SttError::Network(_))));
    }
}
```

- [ ] **Step 2: Падает** — нет `GroqStt`/`SttError`.

- [ ] **Step 3: Реализация**

```rust
use crate::audio;

#[derive(Debug, thiserror::Error)]
pub enum SttError {
    #[error("Неверный ключ Groq — проверь в настройках")]
    BadApiKey,
    #[error("Сервис распознавания перегружен, попробуй позже ({0})")]
    Retryable(u16),
    #[error("Нет соединения — проверь интернет/VPN: {0}")]
    Network(String),
    #[error("{0}")]
    Other(String),
}

#[async_trait::async_trait]
pub trait SttEngine: Send + Sync {
    async fn transcribe(&self, samples_16k_mono: &[f32]) -> Result<String, SttError>;
}

pub struct GroqStt {
    api_key: String,
    base_url: String,
    timeout: std::time::Duration,
    client: reqwest::Client,
}

impl GroqStt {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.groq.com".into(),
            timeout: std::time::Duration::from_secs(60),
            client: reqwest::Client::new(),
        }
    }
    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
    pub fn with_timeout(mut self, t: std::time::Duration) -> Self {
        self.timeout = t;
        self
    }
}

#[async_trait::async_trait]
impl SttEngine for GroqStt {
    async fn transcribe(&self, samples: &[f32]) -> Result<String, SttError> {
        let wav = audio::encode_wav_16k_mono(samples).map_err(|e| SttError::Other(e.to_string()))?;
        let part = reqwest::multipart::Part::bytes(wav)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| SttError::Other(e.to_string()))?;
        let form = reqwest::multipart::Form::new()
            .part("file", part)
            .text("model", "whisper-large-v3-turbo")
            .text("language", "ru")
            .text("temperature", "0")
            .text("response_format", "json");
        let resp = self
            .client
            .post(format!("{}/openai/v1/audio/transcriptions", self.base_url))
            .bearer_auth(&self.api_key)
            .multipart(form)
            .timeout(self.timeout)
            .send()
            .await
            .map_err(|e| SttError::Network(e.to_string()))?;
        match resp.status().as_u16() {
            200 => {
                let v: serde_json::Value =
                    resp.json().await.map_err(|e| SttError::Other(e.to_string()))?;
                Ok(v["text"].as_str().unwrap_or_default().trim().to_string())
            }
            401 | 403 => Err(SttError::BadApiKey),
            code @ (429 | 500..=599) => Err(SttError::Retryable(code)),
            code => Err(SttError::Other(format!("Groq HTTP {code}"))),
        }
    }
}
```

Добавить зависимость: `cargo add async-trait` (в `src-tauri/`).

- [ ] **Step 4: Зелёные** — `cargo test ... stt` → `4 passed`.
- [ ] **Step 5: Commit** — `git commit -am "feat: GroqStt (whisper-large-v3-turbo, ru) с маппингом ошибок (TDD, wiremock)"`

---

### Task 9: `llm.rs` — стриминг Anthropic против wiremock

**Files:** Modify: `src-tauri/src/llm.rs`

- [ ] **Step 1: Failing-тесты** (в `mod tests`):

```rust
    #[tokio::test]
    async fn stream_collects_deltas_via_callback() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .and(header("x-api-key", "sk-test"))
            .and(header("anthropic-version", "2023-06-01"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "text/event-stream")
                    .set_body_raw(SSE_FIXTURE.as_bytes().to_vec(), "text/event-stream"),
            )
            .mount(&server)
            .await;

        let client = AnthropicClient::new("sk-test".into()).with_base_url(server.uri());
        let collected = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let c2 = collected.clone();
        let cancel = tokio_util::sync::CancellationToken::new();
        client
            .stream_message(
                build_request_body("claude-opus-4-8", "s", "q", &[]),
                cancel,
                move |delta| c2.lock().unwrap().push_str(delta),
            )
            .await
            .unwrap();
        assert_eq!(*collected.lock().unwrap(), "Привет!");
    }

    #[tokio::test]
    async fn stream_maps_401() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;
        let client = AnthropicClient::new("bad".into()).with_base_url(server.uri());
        let err = client
            .stream_message(
                build_request_body("claude-opus-4-8", "s", "q", &[]),
                tokio_util::sync::CancellationToken::new(),
                |_| {},
            )
            .await
            .unwrap_err();
        assert!(matches!(err, LlmError::BadApiKey));
    }

    #[tokio::test]
    async fn stream_cancellation_stops_early() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "text/event-stream")
                    .set_body_raw(SSE_FIXTURE.as_bytes().to_vec(), "text/event-stream")
                    .set_delay(std::time::Duration::from_secs(5)),
            )
            .mount(&server)
            .await;
        let client = AnthropicClient::new("k".into()).with_base_url(server.uri());
        let cancel = tokio_util::sync::CancellationToken::new();
        cancel.cancel(); // отменяем сразу
        let err = client
            .stream_message(
                build_request_body("claude-opus-4-8", "s", "q", &[]),
                cancel,
                |_| {},
            )
            .await
            .unwrap_err();
        assert!(matches!(err, LlmError::Cancelled));
    }
```

- [ ] **Step 2: Падает** — нет `AnthropicClient`/`LlmError`.

- [ ] **Step 3: Реализация** (добавить в `llm.rs`):

```rust
use futures_util::StreamExt;
use tokio_util::sync::CancellationToken;

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("Неверный ключ Anthropic — проверь в настройках")]
    BadApiKey,
    #[error("Anthropic перегружен, попробуй позже ({0})")]
    Retryable(u16),
    #[error("Нет соединения — проверь интернет/VPN: {0}")]
    Network(String),
    #[error("Ошибка API: {0}")]
    Api(String),
    #[error("Остановлено")]
    Cancelled,
}

pub struct AnthropicClient {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

impl AnthropicClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.anthropic.com".into(),
            client: reqwest::Client::new(),
        }
    }
    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }

    /// Стримит ответ; каждая текстовая дельта уходит в on_delta. Отмена — через token.
    pub async fn stream_message(
        &self,
        body: serde_json::Value,
        cancel: CancellationToken,
        mut on_delta: impl FnMut(&str),
    ) -> Result<(), LlmError> {
        let send = self
            .client
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send();
        let resp = tokio::select! {
            r = send => r.map_err(|e| LlmError::Network(e.to_string()))?,
            _ = cancel.cancelled() => return Err(LlmError::Cancelled),
        };
        match resp.status().as_u16() {
            200 => {}
            401 | 403 => return Err(LlmError::BadApiKey),
            code @ (429 | 500..=599) => return Err(LlmError::Retryable(code)),
            code => return Err(LlmError::Api(format!("HTTP {code}"))),
        }
        let mut parser = SseParser::new();
        let mut stream = resp.bytes_stream();
        loop {
            let chunk = tokio::select! {
                c = stream.next() => c,
                _ = cancel.cancelled() => return Err(LlmError::Cancelled),
            };
            let Some(chunk) = chunk else { break };
            let bytes = chunk.map_err(|e| LlmError::Network(e.to_string()))?;
            for out in parser.feed(&String::from_utf8_lossy(&bytes)) {
                match out {
                    SseOut::TextDelta(t) => on_delta(&t),
                    SseOut::Done => return Ok(()),
                    SseOut::ApiError(m) => return Err(LlmError::Api(m)),
                }
            }
        }
        Ok(())
    }
}
```

- [ ] **Step 4: Зелёные** — `cargo test ... llm` → все тесты модуля проходят.
- [ ] **Step 5: Commit** — `git commit -am "feat: стриминг Anthropic с отменой (TDD, wiremock)"`

---

### Task 10: `capture.rs` — Core Audio process tap (спайк + обёртка)

Самая рискованная задача — здесь разрешается отступить от строгого TDD: системный звук в юнит-тесте не проверить. Логика конвейера уже покрыта (Task 3–4); цель задачи — рабочий источник сэмплов.

**Files:** Create: `src-tauri/src/capture.rs`, `src-tauri/examples/record5s.rs`; Modify: `src-tauri/src/lib.rs` (`pub mod capture;`)

- [ ] **Step 1: Определить публичный интерфейс** (он не зависит от способа реализации):

```rust
/// Источник системного звука. Создаётся один раз при старте приложения.
pub struct SystemAudioCapture { /* tap + aggregate device + ioproc */ }

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("Нет разрешения на запись системного звука")]
    PermissionDenied,
    #[error("Core Audio: {0}")]
    CoreAudio(String),
}

impl SystemAudioCapture {
    /// Создаёт process tap на весь системный вывод + приватный aggregate device.
    /// Первый вызов триггерит системный диалог разрешения.
    pub fn new() -> Result<Self, CaptureError>;
    /// Начать копить сэмплы (48к стерео f32, конвертация в моно 16к — на стороне вызывающего после stop).
    pub fn start(&mut self) -> Result<(), CaptureError>;
    /// Остановить и забрать накопленный интерливленный буфер + (sample_rate, channels).
    pub fn stop(&mut self) -> (Vec<f32>, u32, usize);
    /// Длительность текущей записи в секундах (для лимита 10 мин).
    pub fn recording_secs(&self) -> f32;
}
```

- [ ] **Step 2: Спайк на cidre (таймбокс ~1 час).** Изучить примеры в репо cidre: `https://github.com/yury/cidre` → `cidre/examples/`, искать `core-audio` / `tap` (там есть пример записи звука процесса/системы через `ca::TapDescription` и aggregate device). Реализовать `SystemAudioCapture` по образцу примера: `TapDescription` глобального микса (исключений нет) → `AudioHardwareCreateProcessTap` → aggregate device со списком tap'ов (`is_private: true`) → IOProc, в колбэке копировать f32-фреймы в `Vec<f32>` под `parking_lot::Mutex` (или `std::sync::Mutex`).

- [ ] **Step 3: Проверочный пример** `src-tauri/examples/record5s.rs`:

```rust
// Запускается вручную: включи музыку и выполни
//   cargo run --example record5s --manifest-path src-tauri/Cargo.toml
// Ожидание: out.wav содержит 5 сек системного звука.
fn main() {
    let mut cap = itech_lib::capture::SystemAudioCapture::new().expect("создание tap");
    cap.start().expect("старт");
    std::thread::sleep(std::time::Duration::from_secs(5));
    let (buf, rate, ch) = cap.stop();
    let mono = itech_lib::audio::downmix_to_mono(&buf, ch);
    let s16k = itech_lib::audio::resample_to_16k(&mono, rate).unwrap();
    std::fs::write("out.wav", itech_lib::audio::encode_wav_16k_mono(&s16k).unwrap()).unwrap();
    println!("rms={}", itech_lib::audio::rms(&s16k));
}
```

(имя крейта-библиотеки смотри в `src-tauri/Cargo.toml` → `[lib] name`; подставить фактическое.)

- [ ] **Step 4: Ручная приёмка.** Запустить пример при играющей музыке → `out.wav` слышен, `rms > 0.01`. Запустить в тишине → `rms < 0.001`. Если системный диалог разрешения не появился — проверить, что бинарь подписан ad-hoc (`codesign -s - target/debug/examples/record5s`) и Info.plist попал в окружение (для dev-запуска вне бандла разрешение спрашивается у терминала — это нормально для спайка).

- [ ] **Step 5: ЕСЛИ cidre упёрся** (не компилируется API tap'ов / нет нужных биндингов) — переключиться на запасной путь из спеки: Swift-шим `src-tauri/shim/audiotap.swift` (CATapDescription → AudioHardwareCreateProcessTap → aggregate device → IOProc, пишет little-endian f32 PCM в stdout; за образец взять открытый проект insidegui/AudioCap). Компиляция в `build.rs` через `swiftc -O -o $OUT_DIR/audiotap`, `SystemAudioCapture` тогда — обёртка над дочерним процессом (spawn на `start`, kill + дочитать stdout на `stop`). Интерфейс из Step 1 не меняется. Зафиксировать выбор в коммит-сообщении.

- [ ] **Step 6: Commit** — `git commit -am "feat: захват системного звука через Core Audio process tap (+пример record5s)"`

---

### Task 11: Tauri-прослойка — команды, события, хоткеи, clipboard, оверлей

Тонкий glue-код: вся логика уже под тестами, здесь только связывание. Юнит-тесты на этот слой не пишутся (он не содержит ветвлений сверх покрытого) — проверка через `cargo tauri dev` по чеклисту шага 6.

**Files:** Create: `src-tauri/src/hotkey.rs`, `overlay.html`; Modify: `src-tauri/src/lib.rs`, `tauri.conf.json` (окно overlay)

- [ ] **Step 1: Состояние приложения и setup** (`lib.rs`):

```rust
pub mod audio;
pub mod capture;
pub mod hotkey;
pub mod llm;
pub mod settings;
pub mod state;
pub mod stt;

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

pub struct App {
    pub settings: Mutex<settings::Settings>,
    pub recorder: Mutex<state::RecorderState>,
    pub capture: Mutex<Option<capture::SystemAudioCapture>>,
    pub last_recording: Mutex<Option<Vec<f32>>>, // 16к моно — для «Повторить»
    pub llm_cancel: Mutex<Option<CancellationToken>>,
}

fn settings_path(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap().join("settings.json")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let s = settings::Settings::load(&settings_path(app.handle()))?;
            app.manage(App {
                settings: Mutex::new(s.clone()),
                recorder: Mutex::new(state::RecorderState::Idle),
                capture: Mutex::new(capture::SystemAudioCapture::new().ok()), // None => баннер о правах
                last_recording: Mutex::new(None),
                llm_cancel: Mutex::new(None),
            });
            hotkey::register_ptt(app.handle(), &s.hotkey)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_to_claude, cancel_stream, retry_transcription,
            get_settings, set_settings, move_window_by,
            set_ptt_suspended, open_audio_permission_settings, capture_available
        ])
        .run(tauri::generate_context!())
        .expect("tauri run");
}
```

- [ ] **Step 2: `hotkey.rs`** — PTT + Esc + suspend:

```rust
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Регистрирует push-to-talk. Pressed/Released гоняют машину состояний.
pub fn register_ptt(app: &AppHandle, hotkey: &str) -> tauri::Result<()> {
    let shortcut: Shortcut = hotkey.parse().map_err(|_| tauri::Error::FailedToReceiveMessage)?;
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _sc, event| {
            match event.state() {
                ShortcutState::Pressed => crate::on_ptt_pressed(app),
                ShortcutState::Released => crate::on_ptt_released(app),
            }
        })
        .map_err(Into::into)
}

pub fn unregister_ptt(app: &AppHandle, hotkey: &str) {
    if let Ok(sc) = hotkey.parse::<Shortcut>() {
        let _ = app.global_shortcut().unregister(sc);
    }
}

/// Esc живёт только пока идёт запись.
pub fn register_esc(app: &AppHandle) {
    let _ = app.global_shortcut().on_shortcut("Escape", |app, _sc, event| {
        if event.state() == ShortcutState::Pressed {
            crate::on_cancel(app);
        }
    });
}

pub fn unregister_esc(app: &AppHandle) {
    let _ = app.global_shortcut().unregister("Escape");
}
```

- [ ] **Step 3: Обработчики записи и команды** (в `lib.rs`; ключевые — целиком):

```rust
fn emit_state(app: &AppHandle, s: state::RecorderState) {
    let _ = app.emit("state-changed", s);
    let overlay = app.get_webview_window("overlay");
    if let Some(w) = overlay {
        let _ = if s == state::RecorderState::Recording { w.show() } else { w.hide() };
    }
}

pub fn on_ptt_pressed(app: &AppHandle) {
    let st = app.state::<App>();
    if st.capture.lock().unwrap().is_none() {
        let _ = app.emit("stt-error", "Нет разрешения на запись системного звука");
        return;
    }
    let action = st.recorder.lock().unwrap().on(state::Event::PttPressed);
    if action == state::Action::StartCapture {
        if let Some(c) = st.capture.lock().unwrap().as_mut() {
            let _ = c.start();
        }
        hotkey::register_esc(app);
        emit_state(app, state::RecorderState::Recording);
        spawn_max_duration_watchdog(app.clone());
    }
}

pub fn on_ptt_released(app: &AppHandle) {
    let st = app.state::<App>();
    let secs = st.capture.lock().unwrap().as_ref().map(|c| c.recording_secs()).unwrap_or(0.0);
    let action = st.recorder.lock().unwrap().on(state::Event::PttReleased { duration_secs: secs });
    hotkey::unregister_esc(app);
    finish_recording(app, action);
}

pub fn on_cancel(app: &AppHandle) {
    let st = app.state::<App>();
    let action = st.recorder.lock().unwrap().on(state::Event::Cancel);
    hotkey::unregister_esc(app);
    if action == state::Action::Discard {
        if let Some(c) = st.state_capture_stop() { drop(c); } // см. ниже — выделить helper
        emit_state(app, state::RecorderState::Idle);
    }
}

/// Общий хвост: Discard — выбросить буфер; Transcribe — конвейер и отправка в Groq.
fn finish_recording(app: &AppHandle, action: state::Action) {
    let st = app.state::<App>();
    let raw = st.capture.lock().unwrap().as_mut().map(|c| c.stop());
    match action {
        state::Action::Discard => emit_state(app, state::RecorderState::Idle),
        state::Action::Transcribe => {
            emit_state(app, state::RecorderState::Transcribing);
            let Some((buf, rate, ch)) = raw else { return finish_transcription(app, Err("нет буфера".into())) };
            let mono = audio::downmix_to_mono(&buf, ch);
            let s16k = match audio::resample_to_16k(&mono, rate) {
                Ok(v) => v,
                Err(e) => return finish_transcription(app, Err(e.to_string())),
            };
            if audio::is_silence(&s16k) {
                return finish_transcription(app, Err("Тишина — нечего распознавать".into()));
            }
            *st.last_recording.lock().unwrap() = Some(s16k.clone());
            let app2 = app.clone();
            tauri::async_runtime::spawn(async move { transcribe_and_emit(app2, s16k).await });
        }
        _ => {}
    }
}

async fn transcribe_and_emit(app: AppHandle, samples: Vec<f32>) {
    use stt::SttEngine;
    let key = app.state::<App>().settings.lock().unwrap().groq_api_key.clone();
    let result = stt::GroqStt::new(key).transcribe(&samples).await;
    match result {
        Ok(text) => {
            use tauri_plugin_clipboard_manager::ClipboardExt;
            let _ = app.clipboard().write_text(text.clone());
            let _ = app.emit("transcript-ready", text);
            finish_transcription(&app, Ok(()));
        }
        Err(e) => finish_transcription(&app, Err(e.to_string())),
    }
}

fn finish_transcription(app: &AppHandle, result: Result<(), String>) {
    let st = app.state::<App>();
    st.recorder.lock().unwrap().on(state::Event::TranscriptionFinished);
    if let Err(msg) = result {
        let _ = app.emit("stt-error", msg);
    }
    emit_state(app, state::RecorderState::Idle);
}

fn spawn_max_duration_watchdog(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let st = app.state::<App>();
            if *st.recorder.lock().unwrap() != state::RecorderState::Recording {
                break;
            }
            let secs = st.capture.lock().unwrap().as_ref().map(|c| c.recording_secs()).unwrap_or(0.0);
            if secs >= state::MAX_RECORDING_SECS {
                let action = st.recorder.lock().unwrap().on(state::Event::MaxDurationReached);
                hotkey::unregister_esc(&app);
                finish_recording(&app, action);
                break;
            }
        }
    });
}

#[tauri::command]
async fn send_to_claude(app: AppHandle, text: String, images: Vec<llm::ImageAttachment>) {
    let (key, model, system) = {
        let s = app.state::<App>().settings.lock().unwrap();
        (s.anthropic_api_key.clone(), s.model.clone(), s.system_prompt.clone())
    };
    let cancel = CancellationToken::new();
    *app.state::<App>().llm_cancel.lock().unwrap() = Some(cancel.clone());
    let body = llm::build_request_body(&model, &system, &text, &images);
    let client = llm::AnthropicClient::new(key);
    let app2 = app.clone();
    let res = client
        .stream_message(body, cancel, move |delta| {
            let _ = app2.emit("llm-delta", delta);
        })
        .await;
    match res {
        Ok(()) => { let _ = app.emit("llm-done", ()); }
        Err(llm::LlmError::Cancelled) => { let _ = app.emit("llm-done", ()); }
        Err(e) => { let _ = app.emit("llm-error", e.to_string()); }
    }
}

#[tauri::command]
fn cancel_stream(app: AppHandle) {
    if let Some(c) = app.state::<App>().llm_cancel.lock().unwrap().take() {
        c.cancel();
    }
}

#[tauri::command]
async fn retry_transcription(app: AppHandle) {
    let samples = app.state::<App>().last_recording.lock().unwrap().clone();
    if let Some(s) = samples {
        emit_state(&app, state::RecorderState::Transcribing);
        app.state::<App>().recorder.lock().unwrap().on(state::Event::PttPressed); // Idle->Recording
        app.state::<App>().recorder.lock().unwrap().on(state::Event::PttReleased { duration_secs: 1.0 }); // ->Transcribing
        transcribe_and_emit(app, s).await;
    }
}

#[tauri::command]
fn get_settings(app: AppHandle) -> settings::Settings {
    app.state::<App>().settings.lock().unwrap().clone()
}

#[tauri::command]
fn set_settings(app: AppHandle, mut new_settings: settings::Settings) -> Result<(), String> {
    new_settings.clamp();
    let old_hotkey = app.state::<App>().settings.lock().unwrap().hotkey.clone();
    if old_hotkey != new_settings.hotkey {
        hotkey::unregister_ptt(&app, &old_hotkey);
        hotkey::register_ptt(&app, &new_settings.hotkey).map_err(|e| e.to_string())?;
    }
    new_settings.save(&settings_path(&app)).map_err(|e| e.to_string())?;
    *app.state::<App>().settings.lock().unwrap() = new_settings;
    Ok(())
}

#[tauri::command]
fn move_window_by(app: AppHandle, dx: i32, dy: i32) {
    if let Some(w) = app.get_webview_window("main") {
        if let Ok(pos) = w.outer_position() {
            let _ = w.set_position(tauri::PhysicalPosition::new(pos.x + dx, pos.y + dy));
        }
    }
}

#[tauri::command]
fn set_ptt_suspended(app: AppHandle, suspended: bool) {
    let hk = app.state::<App>().settings.lock().unwrap().hotkey.clone();
    if suspended {
        hotkey::unregister_ptt(&app, &hk);
    } else {
        let _ = hotkey::register_ptt(&app, &hk);
    }
}

#[tauri::command]
fn open_audio_permission_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture")
        .spawn();
}

#[tauri::command]
fn capture_available(app: AppHandle) -> bool {
    app.state::<App>().capture.lock().unwrap().is_some()
}
```

Примечание для исполнителя: фрагмент `on_cancel` со `state_capture_stop()` — упрощение в плане; на месте просто вызвать `st.capture.lock().unwrap().as_mut().map(|c| c.stop());` и выбросить результат. Везде, где план не компилируется дословно, — чинить по месту, сохраняя поведение и подписи команд/событий (они зафиксированы спекой).

- [ ] **Step 4: Окно overlay** — в `tauri.conf.json` добавить второе окно:

```json
{
  "label": "overlay",
  "url": "overlay.html",
  "width": 140, "height": 36,
  "x": 1280, "y": 8,
  "alwaysOnTop": true, "decorations": false, "transparent": true,
  "resizable": false, "skipTaskbar": true, "visible": false,
  "acceptFirstMouse": false, "focus": false, "visibleOnAllWorkspaces": true
}
```

`overlay.html`:

```html
<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin:0; display:flex; align-items:center; justify-content:center; height:36px;
         background:rgba(20,20,22,.85); border-radius:10px; color:#ff5f57;
         font:600 13px -apple-system, sans-serif; }
  .dot { width:8px;height:8px;border-radius:50%;background:#ff5f57;margin-right:7px;
         animation:p 1s infinite alternate } @keyframes p { to { opacity:.25 } }
</style></head>
<body><div class="dot"></div>Запись</body></html>
```

- [ ] **Step 5: Сборка** — `cargo check --manifest-path src-tauri/Cargo.toml` зелёный; `cargo test` — все прежние тесты проходят.

- [ ] **Step 6: Ручной смоук** — `npm run tauri dev`: V из другого приложения стартует/останавливает запись (оверлей мигает), текст приходит в событии (видно в консоли вебвью), Esc отменяет, повторное V во время Transcribing игнорируется.

- [ ] **Step 7: Commit** — `git commit -am "feat: tauri-прослойка — команды, события, PTT V, Esc, оверлей, clipboard"`

---

### Task 12: `composer.ts` — логика вложений (vitest)

**Files:** Create: `src/composer.ts`, `src/composer.test.ts`

- [ ] **Step 1: Failing-тесты** (`src/composer.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_LIMIT,
  MAX_IMAGE_BYTES,
  acceptedNewAttachments,
  downscaleFactor,
  extractImageItems,
  toImagePayload,
} from "./composer";

const item = (type: string) =>
  ({ kind: "file", type, getAsFile: () => new File([new Uint8Array(4)], "x", { type }) }) as unknown as DataTransferItem;

describe("extractImageItems", () => {
  it("берёт только image/*", () => {
    const files = extractImageItems([item("image/png"), item("text/plain"), item("image/jpeg")]);
    expect(files.map((f) => f.type)).toEqual(["image/png", "image/jpeg"]);
  });
});

describe("acceptedNewAttachments", () => {
  it("режет по лимиту 5", () => {
    expect(acceptedNewAttachments(0, 3)).toBe(3);
    expect(acceptedNewAttachments(4, 3)).toBe(1);
    expect(acceptedNewAttachments(5, 1)).toBe(0);
    expect(ATTACHMENT_LIMIT).toBe(5);
  });
});

describe("downscaleFactor", () => {
  it("маленькое изображение не трогаем", () => {
    expect(downscaleFactor(1024)).toBe(1);
  });
  it("большое — масштаб по площади с запасом 0.95", () => {
    const f = downscaleFactor(MAX_IMAGE_BYTES * 4);
    expect(f).toBeLessThan(0.5); // sqrt(1/4)*0.95 = 0.475
    expect(f).toBeGreaterThan(0.4);
  });
});

describe("toImagePayload", () => {
  it("формирует {media_type, data} c чистым base64 без dataURL-префикса", () => {
    const p = toImagePayload("data:image/png;base64,QUJD", "image/png");
    expect(p).toEqual({ media_type: "image/png", data: "QUJD" });
  });
});
```

- [ ] **Step 2: Падает** — `npx vitest run` → модуля нет.

- [ ] **Step 3: Реализация** (`src/composer.ts`):

```ts
export const ATTACHMENT_LIMIT = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // лимит Anthropic API на изображение

export interface ImagePayload {
  media_type: string;
  data: string; // base64 без префикса dataURL
}

export function extractImageItems(items: ArrayLike<DataTransferItem>): File[] {
  const files: File[] = [];
  for (const it of Array.from(items)) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

export function acceptedNewAttachments(current: number, adding: number): number {
  return Math.max(0, Math.min(adding, ATTACHMENT_LIMIT - current));
}

/** Линейный масштаб стороны, чтобы файл влез в MAX_IMAGE_BYTES (площадь ~ байтам). */
export function downscaleFactor(bytes: number): number {
  if (bytes <= MAX_IMAGE_BYTES) return 1;
  return Math.sqrt(MAX_IMAGE_BYTES / bytes) * 0.95;
}

export function toImagePayload(dataUrl: string, mediaType: string): ImagePayload {
  const comma = dataUrl.indexOf(",");
  return { media_type: mediaType, data: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl };
}
```

- [ ] **Step 4: Зелёные** — `npx vitest run` → все проходят.
- [ ] **Step 5: Commit** — `git commit -am "feat: логика вложений composer (TDD, vitest)"`

---

### Task 13: `window-controls.ts` — перемещение и прозрачность (vitest)

**Files:** Create: `src/window-controls.ts`, `src/window-controls.test.ts`

- [ ] **Step 1: Failing-тесты**:

```ts
import { describe, expect, it } from "vitest";
import { applyOpacity, moveDelta } from "./window-controls";

describe("moveDelta", () => {
  it("стрелки → сдвиг на шаг по нужной оси", () => {
    expect(moveDelta("ArrowLeft", 20)).toEqual({ dx: -20, dy: 0 });
    expect(moveDelta("ArrowRight", 20)).toEqual({ dx: 20, dy: 0 });
    expect(moveDelta("ArrowUp", 35)).toEqual({ dx: 0, dy: -35 });
    expect(moveDelta("ArrowDown", 35)).toEqual({ dx: 0, dy: 35 });
  });
  it("не-стрелка → null", () => {
    expect(moveDelta("KeyV", 20)).toBeNull();
  });
});

describe("applyOpacity", () => {
  it("ставит CSS-переменную с клампом 0.2..1", () => {
    const el = document.createElement("div");
    applyOpacity(el, 0.5);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("0.5");
    applyOpacity(el, 0.01);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("0.2");
    applyOpacity(el, 7);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("1");
  });
});
```

- [ ] **Step 2: Падает** — модуля нет.

- [ ] **Step 3: Реализация** (`src/window-controls.ts`):

```ts
export function moveDelta(code: string, step: number): { dx: number; dy: number } | null {
  switch (code) {
    case "ArrowLeft": return { dx: -step, dy: 0 };
    case "ArrowRight": return { dx: step, dy: 0 };
    case "ArrowUp": return { dx: 0, dy: -step };
    case "ArrowDown": return { dx: 0, dy: step };
    default: return null;
  }
}

export function applyOpacity(root: HTMLElement, value: number): void {
  const clamped = Math.min(1, Math.max(0.2, value));
  root.style.setProperty("--app-opacity", String(clamped));
}
```

- [ ] **Step 4: Зелёные**; **Step 5: Commit** — `git commit -am "feat: moveDelta и applyOpacity (TDD, vitest)"`

---

### Task 14: UI главного окна

**REQUIRED SUB-SKILL:** `frontend-design:frontend-design` — современный минималистичный тёмный интерфейс без «AI-эстетики». Логика уже готова — задача про разметку, стили и wiring.

**Files:** Modify: `index.html`, `src/main.ts`, `src/styles.css`; Create: `src/markdown.ts`

- [ ] **Step 1: `src/markdown.ts`** — безопасный рендер ответа:

```ts
import DOMPurify from "dompurify";
import { marked } from "marked";

export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false }) as string);
}
```

- [ ] **Step 2: Разметка `index.html`** (семантика; стили — отдельно):

```html
<body>
  <main id="app">
    <div id="permission-banner" hidden>
      Нет разрешения на запись системного звука.
      <button id="open-permissions">Открыть настройки</button>
    </div>
    <header>
      <span id="status" data-state="idle">Зажми V — записать системный звук</span>
      <button id="open-settings" title="Настройки">⚙</button>
    </header>
    <section id="composer">
      <textarea id="transcript" placeholder="Расшифровка появится здесь — можно править. Cmd+V вставляет скриншот."></textarea>
      <div id="attachments"></div>
      <div id="composer-actions">
        <button id="clear">Очистить</button>
        <button id="send" class="primary">Отправить ⌘⏎</button>
        <button id="stop" hidden>Стоп</button>
        <button id="retry" hidden>Повторить</button>
      </div>
    </section>
    <section id="answer-wrap">
      <div id="answer"></div>
      <button id="copy-answer" hidden>Копировать ответ</button>
    </section>
    <dialog id="settings"><!-- Task 15 --></dialog>
  </main>
</body>
```

- [ ] **Step 3: Wiring `src/main.ts`** — связать всё с Rust:

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  acceptedNewAttachments, downscaleFactor, extractImageItems, toImagePayload,
  MAX_IMAGE_BYTES, type ImagePayload,
} from "./composer";
import { applyOpacity, moveDelta } from "./window-controls";
import { renderMarkdown } from "./markdown";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const transcript = el<HTMLTextAreaElement>("transcript");
const answer = el<HTMLDivElement>("answer");
let attachments: ImagePayload[] = [];
let answerMd = "";
let settings = await invoke<Record<string, unknown>>("get_settings");

applyOpacity(document.documentElement, settings.window_opacity as number);
if (!(await invoke<boolean>("capture_available"))) el("permission-banner").hidden = false;
el("open-permissions").onclick = () => invoke("open_audio_permission_settings");

// --- события из Rust ---
await listen<string>("state-changed", (e) => { el("status").dataset.state = e.payload; });
await listen<string>("transcript-ready", (e) => {
  transcript.value = e.payload; // вложения сохраняем (спека)
  if (settings.auto_send) send();
});
await listen<string>("stt-error", (e) => showError(e.payload, /пере|соедин/i.test(e.payload)));
await listen<string>("llm-delta", (e) => {
  answerMd += e.payload;
  answer.innerHTML = renderMarkdown(answerMd);
});
await listen("llm-done", () => streamUi(false));
await listen<string>("llm-error", (e) => { streamUi(false); showError(e.payload, true); });

// --- composer ---
document.addEventListener("paste", async (e) => {
  const files = extractImageItems(e.clipboardData?.items ?? []);
  if (!files.length) return; // обычная текстовая вставка идёт своим чередом
  e.preventDefault();
  const take = acceptedNewAttachments(attachments.length, files.length);
  for (const f of files.slice(0, take)) attachments.push(await fileToPayload(f));
  renderAttachments();
});

async function fileToPayload(f: File): Promise<ImagePayload> {
  const factor = downscaleFactor(f.size);
  if (factor === 1) return toImagePayload(await readDataUrl(f), f.type);
  const bmp = await createImageBitmap(f);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * factor);
  canvas.height = Math.round(bmp.height * factor);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return toImagePayload(canvas.toDataURL("image/jpeg", 0.85), "image/jpeg");
}
const readDataUrl = (f: File) =>
  new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); });

function renderAttachments() {
  el("attachments").innerHTML = attachments
    .map((a, i) => `<span class="chip"><img src="data:${a.media_type};base64,${a.data}"><button data-i="${i}">×</button></span>`)
    .join("");
  el("attachments").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { attachments.splice(Number(b.dataset.i), 1); renderAttachments(); }));
}

// --- отправка ---
async function send() {
  if (!transcript.value.trim() && attachments.length === 0) return;
  answerMd = ""; answer.innerHTML = ""; streamUi(true);
  await invoke("send_to_claude", { text: transcript.value, images: attachments });
}
function streamUi(streaming: boolean) {
  el("stop").hidden = !streaming;
  el("send").toggleAttribute("disabled", streaming);
  el("copy-answer").hidden = streaming || !answerMd;
}
el("send").onclick = send;
el("stop").onclick = () => invoke("cancel_stream");
el("clear").onclick = () => { transcript.value = ""; attachments = []; renderAttachments(); };
el("retry").onclick = () => { el("retry").hidden = true; invoke("retry_transcription"); };
el("copy-answer").onclick = () => navigator.clipboard.writeText(answerMd);
function showError(msg: string, retryable: boolean) {
  el("status").dataset.state = "error";
  el("status").textContent = msg;
  el("retry").hidden = !retryable;
}

// --- клавиатура ---
document.addEventListener("keydown", (e) => {
  if (e.metaKey && e.key === "Enter") { e.preventDefault(); send(); }
  if (e.metaKey) {
    const d = moveDelta(e.code, settings.move_step as number);
    if (d) { e.preventDefault(); invoke("move_window_by", d); }
  }
});

// PTT снимается, пока печатаем в полях приложения (спека: смягчение перехвата V)
document.addEventListener("focusin", (e) => {
  if ((e.target as HTMLElement).matches("textarea, input")) invoke("set_ptt_suspended", { suspended: true });
});
document.addEventListener("focusout", () => invoke("set_ptt_suspended", { suspended: false }));
```

- [ ] **Step 4: Стили `src/styles.css`** — применить skill `frontend-design`: тёмная палитра (фон `rgba(18,18,20,var(--app-opacity))` на `#app` — так работает прозрачность), системный шрифт, отчётливые состояния `#status[data-state=recording|transcribing|error]` (цветовая точка), chips 56×56 со скруглением, кнопка-primary акцентного цвета (не фиолетовый градиент), aria-метки на кнопках. Ничего сверх элементов из Step 2.

- [ ] **Step 5: Проверка** — `npx vitest run` зелёный, `npm run tauri dev`: полный путь V→текст→правка→⌘⏎→стрим→Стоп/Копировать; Cmd+V со скриншотом → чип; Cmd+стрелки двигают окно.

- [ ] **Step 6: Commit** — `git commit -am "feat: UI главного окна — composer, стрим ответа, вложения, клавиатура"`

---

### Task 15: Настройки (модалка) и финальная приёмка

**Files:** Modify: `index.html` (содержимое `<dialog id="settings">`), `src/main.ts`; Create: `README.md`

- [ ] **Step 1: Разметка модалки**:

```html
<dialog id="settings">
  <form method="dialog" id="settings-form">
    <h2>Настройки</h2>
    <label>Ключ Anthropic <input type="password" name="anthropic_api_key"></label>
    <label>Ключ Groq <input type="password" name="groq_api_key"></label>
    <label>Модель
      <select name="model">
        <option value="claude-opus-4-8">claude-opus-4-8</option>
        <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
        <option value="claude-haiku-4-5">claude-haiku-4-5</option>
      </select>
    </label>
    <label>Системный промпт <textarea name="system_prompt" rows="3"></textarea></label>
    <label>Push-to-talk клавиша <input name="hotkey" placeholder="V"></label>
    <label><input type="checkbox" name="auto_send"> Отправлять сразу после распознавания</label>
    <label>Прозрачность окна <input type="range" name="window_opacity" min="0.2" max="1" step="0.05"></label>
    <label>Шаг перемещения, px <input type="number" name="move_step" min="1" max="200"></label>
    <menu><button value="cancel">Отмена</button><button value="save" class="primary">Сохранить</button></menu>
  </form>
</dialog>
```

- [ ] **Step 2: Wiring** (в `main.ts`):

```ts
const dlg = el<HTMLDialogElement>("settings");
el("open-settings").onclick = () => { fillSettingsForm(); dlg.showModal(); };
const form = el<HTMLFormElement>("settings-form");

function fillSettingsForm() {
  for (const [k, v] of Object.entries(settings)) {
    const input = form.elements.namedItem(k) as HTMLInputElement | null;
    if (!input) continue;
    if (input.type === "checkbox") input.checked = Boolean(v);
    else input.value = String(v);
  }
}
form.elements.namedItem("window_opacity")!.addEventListener("input", (e) =>
  applyOpacity(document.documentElement, Number((e.target as HTMLInputElement).value)));

dlg.addEventListener("close", async () => {
  if (dlg.returnValue !== "save") { applyOpacity(document.documentElement, settings.window_opacity as number); return; }
  const fd = new FormData(form);
  const next = {
    ...settings,
    anthropic_api_key: fd.get("anthropic_api_key"), groq_api_key: fd.get("groq_api_key"),
    model: fd.get("model"), system_prompt: fd.get("system_prompt"),
    hotkey: String(fd.get("hotkey") || "V").toUpperCase(),
    auto_send: fd.get("auto_send") === "on",
    window_opacity: Number(fd.get("window_opacity")), move_step: Number(fd.get("move_step")),
  };
  try {
    await invoke("set_settings", { newSettings: next });
    settings = await invoke("get_settings");
    applyOpacity(document.documentElement, settings.window_opacity as number);
  } catch (err) { showError(String(err), false); }
});
```

- [ ] **Step 3: Все тесты** — `cargo test --manifest-path src-tauri/Cargo.toml && npx vitest run && npm run build` — всё зелёное.

- [ ] **Step 4: Ручной чеклист из спеки** (раздел «Тестирование»), целиком: право → V при YouTube → ≤1.5 c; печать «v»/«м» внутри приложения; Cmd+V скриншот → отправка с картинкой; Стоп; Esc; слайдер прозрачности; Cmd+стрелки; без VPN; смена хоткея. Каждый пункт отметить в PR/коммит-сообщении.

- [ ] **Step 5: README.md** — краткий: что это, требования (macOS 14.2+, ключи Anthropic/Groq, VPN), `npm install && npm run tauri dev`, сборка `npm run tauri build`, где лежат настройки, известный эффект хоткея V.

- [ ] **Step 6: Финальный commit** — `git add -A && git commit -m "feat: настройки, README, финальная приёмка по чеклисту"`

---

## Self-review плана

- **Покрытие спеки:** захват (T10), даунмикс/ресемплинг/WAV/гейт (T3–4), машина состояний с 0.3с/10мин/Esc (T5, T11), Groq+ошибки (T8), content-блоки+картинки (T6), SSE+стрим+отмена (T7, T9), clipboard/оверлей/события (T11), PTT V+suspend+Esc-на-запись (T11, T14), вложения Cmd+V с лимитом и даунскейлом (T12, T14), прозрачность и Cmd+стрелки (T13–15), настройки с клампами и 0600 (T2, T15), баннер прав (T11, T14), README/чеклист (T15). Авто-отправка — T14 (`auto_send` в `transcript-ready`). Пробелов не нашёл.
- **Типы сквозные:** `ImageAttachment {media_type, data}` (Rust) ↔ `ImagePayload` (TS); события `state-changed/transcript-ready/stt-error/llm-delta/llm-done/llm-error`; команды совпадают со спекой (включая `capture_available` — добавлена к списку спеки как необходимая для баннера).
- **Честные оговорки:** Task 10 (cidre) — спайк с ручной приёмкой и прописанным fallback; Task 11 — glue-код, дословная компилируемость не гарантируется, поведение и контракты зафиксированы; исполнителю разрешено чинить по месту.




