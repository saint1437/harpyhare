# Фоновый аудио-буфер — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Ревизия B:** ручной забор (F8/кнопка/grab_buffer/buffer_hotkey) удалён после реализации — буфер автоматически добавляется в начало PTT-записи. См. раздел «Ревизия B» в спеке. Задачи ниже описывают ревизию A и сохранены как история.

**Goal:** Непрерывный кольцевой буфер последних N секунд системного звука (настройка 4–10 с, дефолт 4, тумблер, дефолт вкл.) с транскрипцией по хоткею (дефолт F8, изменяемый) или кнопке в статус-баре; текст — в буфер обмена и черновик чата, как у PTT.

**Architecture:** Вариант A из спеки `apps/desktop/docs/superpowers/specs/2026-07-21-background-audio-buffer-design.md`: `io_proc` пропускает семплы при `recording || buffering`; поток `audio-consumer` при включённом буфере непрерывно ресемплирует в 16 кГц долгоживущим ресемплером и складывает чанки в `RollingBuffer` (VecDeque с капом) под мьютексом; PTT-сессия при этом обслуживается тем же потоком чанков. Забор = снимок буфера → гейты (занятость/длина/тишина) → классическая транскрипция Groq → существующий путь `deliver_transcript`.

**Tech Stack:** Rust (Tauri 2, cidre, ringbuf, rubato), React 19 + TS (Vite, vitest), Groq Whisper.

## Global Constraints

- Рабочая директория всех команд — `apps/desktop/` (пути в задачах — от корня репо `/Users/mark/i.tech`).
- `git commit` запускать с Homebrew Node в PATH, иначе pre-commit хук (knip) падает на Node 16: `PATH="/opt/homebrew/bin:$PATH" git commit …`. Для cargo может понадобиться `export PATH="$HOME/.cargo/bin:$PATH"`.
- Комментарии в коде запрещены полностью. Магические значения → именованные константы.
- Settings меняются синхронно по обе стороны IPC: Rust struct + Default + clamp + тесты И TS interface + DEFAULT_SETTINGS; имена snake_case в обоих.
- Порядок полей `SystemAudioCapture` — порядок Drop; не переставлять. `unsafe impl Send` — новые поля только за атомиками/Mutex.
- Обработчики хоткеев — только через `defer()` (инвариант реестра плагина).
- Не держать `MutexGuard` через `.await`.
- Дефолты фичи: `buffer_enabled=true`, `buffer_seconds=4` (кламп 4–10), `buffer_hotkey="F8"`.
- Коммиты — русские, стиль `feat(desktop): …`, с трейлером `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Settings — поля фонового буфера (Rust)

**Files:**
- Modify: `apps/desktop/src-tauri/src/settings.rs`

**Interfaces:**
- Produces: поля `Settings.buffer_enabled: bool`, `Settings.buffer_seconds: u64`, `Settings.buffer_hotkey: String`; кламп 4–10 для `buffer_seconds`. Их читают Task 4 (lib.rs) и Task 5 (TS-зеркало).

- [ ] **Step 1: Написать падающие тесты**

В `mod tests` файла `settings.rs` добавить тесты, а в существующий `defaults_match_spec` — три assert'а:

```rust
    #[test]
    fn load_missing_buffer_fields_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert!(s.buffer_enabled);
        assert_eq!(s.buffer_seconds, 4);
        assert_eq!(s.buffer_hotkey, "F8");
    }

    #[test]
    fn clamp_limits_buffer_seconds() {
        let mut s = Settings::default();
        s.buffer_seconds = 1;
        s.clamp();
        assert_eq!(s.buffer_seconds, 4);
        s.buffer_seconds = 120;
        s.clamp();
        assert_eq!(s.buffer_seconds, 10);
    }
```

В `defaults_match_spec` (после `assert_eq!(s.capture_device_uid, "");`):

```rust
        assert!(s.buffer_enabled);
        assert_eq!(s.buffer_seconds, 4);
        assert_eq!(s.buffer_hotkey, "F8");
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib settings`
Expected: FAIL — `no field buffer_enabled` (ошибка компиляции тестов).

- [ ] **Step 3: Реализация**

В блок констант (после `const DEFAULT_WINDOW_HEIGHT…`):

```rust
const DEFAULT_BUFFER_HOTKEY: &str = "F8";
const DEFAULT_BUFFER_SECONDS: u64 = 4;
```

В блок клампов (после `const WINDOW_HEIGHT_MAX…`):

```rust
const BUFFER_SECONDS_MIN: u64 = 4;
const BUFFER_SECONDS_MAX: u64 = 10;
```

В struct `Settings` (после `pub scroll_step: u32,`):

```rust
    pub buffer_enabled: bool,
    pub buffer_seconds: u64,
    pub buffer_hotkey: String,
```

В `impl Default` (после `scroll_step: DEFAULT_SCROLL_STEP,`):

```rust
            buffer_enabled: true,
            buffer_seconds: DEFAULT_BUFFER_SECONDS,
            buffer_hotkey: DEFAULT_BUFFER_HOTKEY.into(),
```

В `clamp()` (после строки про `scroll_step`):

```rust
        self.buffer_seconds = self.buffer_seconds.clamp(BUFFER_SECONDS_MIN, BUFFER_SECONDS_MAX);
```

- [ ] **Step 4: Тесты зелёные**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib settings`
Expected: PASS (все тесты модуля).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/settings.rs
PATH="/opt/homebrew/bin:$PATH" git commit -m "feat(desktop): настройки фонового аудио-буфера — buffer_enabled/buffer_seconds/buffer_hotkey

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: RollingBuffer — скользящее окно 16 кГц (audio.rs)

**Files:**
- Modify: `apps/desktop/src-tauri/src/audio.rs`

**Interfaces:**
- Produces: `pub struct RollingBuffer` с методами `new(secs: u64)`, `push_chunk(&mut self, chunk: &[f32])`, `snapshot(&self) -> Vec<f32>`, `set_capacity_secs(&mut self, secs: u64)`, `clear(&mut self)`. Кап = `secs × TARGET_SAMPLE_RATE` семплов; переполнение вытесняет старейшие. Использует Task 3 (capture.rs) и Task 4 (lib.rs — только косвенно, через capture).

- [ ] **Step 1: Написать падающие тесты**

В `mod tests` файла `audio.rs`:

```rust
    #[test]
    fn rolling_buffer_keeps_order_under_capacity() {
        let mut rb = RollingBuffer::new(1);
        rb.push_chunk(&[1.0, 2.0]);
        rb.push_chunk(&[3.0]);
        assert_eq!(rb.snapshot(), vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn rolling_buffer_evicts_oldest_on_overflow() {
        let mut rb = RollingBuffer::new(1);
        let first: Vec<f32> = (0..TARGET_SAMPLE_RATE).map(|i| i as f32).collect();
        rb.push_chunk(&first);
        rb.push_chunk(&[-1.0, -2.0]);
        let snap = rb.snapshot();
        assert_eq!(snap.len(), TARGET_SAMPLE_RATE as usize);
        assert_eq!(snap[0], 2.0);
        assert_eq!(snap[snap.len() - 2..], [-1.0, -2.0]);
    }

    #[test]
    fn rolling_buffer_chunk_larger_than_capacity_keeps_tail() {
        let mut rb = RollingBuffer::new(1);
        let big: Vec<f32> = (0..TARGET_SAMPLE_RATE * 2).map(|i| i as f32).collect();
        rb.push_chunk(&big);
        let snap = rb.snapshot();
        assert_eq!(snap.len(), TARGET_SAMPLE_RATE as usize);
        assert_eq!(snap[0], TARGET_SAMPLE_RATE as f32);
    }

    #[test]
    fn rolling_buffer_shrink_capacity_trims_oldest() {
        let mut rb = RollingBuffer::new(2);
        let two_secs: Vec<f32> = (0..TARGET_SAMPLE_RATE * 2).map(|i| i as f32).collect();
        rb.push_chunk(&two_secs);
        rb.set_capacity_secs(1);
        let snap = rb.snapshot();
        assert_eq!(snap.len(), TARGET_SAMPLE_RATE as usize);
        assert_eq!(snap[0], TARGET_SAMPLE_RATE as f32);
    }

    #[test]
    fn rolling_buffer_clear_empties() {
        let mut rb = RollingBuffer::new(1);
        rb.push_chunk(&[1.0, 2.0]);
        rb.clear();
        assert!(rb.snapshot().is_empty());
    }
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib audio`
Expected: FAIL — `cannot find struct RollingBuffer`.

- [ ] **Step 3: Реализация**

В `audio.rs` (после `pub fn is_silence…`, перед `#[derive(Debug, thiserror::Error)] pub enum AudioError`):

```rust
pub struct RollingBuffer {
    buf: std::collections::VecDeque<f32>,
    capacity: usize,
}

fn rolling_capacity_for_secs(secs: u64) -> usize {
    secs as usize * TARGET_SAMPLE_RATE as usize
}

impl RollingBuffer {
    pub fn new(secs: u64) -> Self {
        Self {
            buf: std::collections::VecDeque::new(),
            capacity: rolling_capacity_for_secs(secs),
        }
    }

    pub fn push_chunk(&mut self, chunk: &[f32]) {
        if self.capacity == 0 {
            return;
        }
        let skip = chunk.len().saturating_sub(self.capacity);
        self.buf.extend(&chunk[skip..]);
        self.trim_to_capacity();
    }

    pub fn snapshot(&self) -> Vec<f32> {
        self.buf.iter().copied().collect()
    }

    pub fn set_capacity_secs(&mut self, secs: u64) {
        self.capacity = rolling_capacity_for_secs(secs);
        self.trim_to_capacity();
    }

    pub fn clear(&mut self) {
        self.buf.clear();
    }

    fn trim_to_capacity(&mut self) {
        let overflow = self.buf.len().saturating_sub(self.capacity);
        if overflow > 0 {
            self.buf.drain(..overflow);
        }
    }
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/audio.rs
PATH="/opt/homebrew/bin:$PATH" git commit -m "feat(desktop): RollingBuffer — скользящее окно 16кГц-семплов с капом по секундам

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: capture.rs — режим непрерывной буферизации

**Files:**
- Modify: `apps/desktop/src-tauri/src/capture.rs`
- Modify: `apps/desktop/src-tauri/examples/record5s.rs`

**Interfaces:**
- Consumes: `audio::RollingBuffer` (Task 2).
- Produces: `SystemAudioCapture::new(output_device_uid: Option<&str>, buffer_secs: u64)`; методы `set_buffering(&self, enabled: bool)` (выключение очищает буфер), `set_buffer_capacity_secs(&self, secs: u64)`, `buffer_snapshot(&self) -> Vec<f32>` (16 кГц моно f32, старые→новые). Поведение при выключенном буфере — байт-в-байт текущее. Использует Task 4.

Прямых юнит-тестов нет (нужно железо) — гейт задачи: компиляция, clippy, все существующие тесты зелёные, ручная приёмка в Task 9.

- [ ] **Step 1: `Shared` + `io_proc` + конструктор**

В struct `Shared` — два новых поля (после `dropped: AtomicU64,` и после `session: Mutex<Session>,` соответственно):

```rust
struct Shared {
    recording: AtomicBool,
    buffering: AtomicBool,
    stop_requested: AtomicBool,
    produced: AtomicU64,
    dropped: AtomicU64,
    sample_rate: u32,
    channels: usize,
    session: Mutex<Session>,
    rolling: Mutex<audio::RollingBuffer>,
    cv: Condvar,
}
```

Сигнатура конструктора:

```rust
    pub fn new(output_device_uid: Option<&str>, buffer_secs: u64) -> Result<Self, CaptureError> {
```

Инициализация `Shared` в `new` (два новых поля):

```rust
        let shared = Arc::new(Shared {
            recording: AtomicBool::new(false),
            buffering: AtomicBool::new(false),
            stop_requested: AtomicBool::new(false),
            produced: AtomicU64::new(0),
            dropped: AtomicU64::new(0),
            sample_rate,
            channels,
            session: Mutex::new(Session::Idle),
            rolling: Mutex::new(audio::RollingBuffer::new(buffer_secs)),
            cv: Condvar::new(),
        });
```

Гейт в `io_proc` (замена `if !shared.recording.load(Ordering::Acquire) {`):

```rust
    if !shared.recording.load(Ordering::Acquire) && !shared.buffering.load(Ordering::Acquire) {
        return os::Status::NO_ERR;
    }
```

- [ ] **Step 2: Публичные методы буфера**

В `impl SystemAudioCapture` (после `recording_secs`):

```rust
    pub fn set_buffering(&self, enabled: bool) {
        self.shared.buffering.store(enabled, Ordering::Release);
        if enabled {
            let _wake = self.shared.session.lock().unwrap();
            self.shared.cv.notify_all();
        } else {
            self.shared.rolling.lock().unwrap().clear();
        }
    }

    pub fn set_buffer_capacity_secs(&self, secs: u64) {
        self.shared.rolling.lock().unwrap().set_capacity_secs(secs);
    }

    pub fn buffer_snapshot(&self) -> Vec<f32> {
        self.shared.rolling.lock().unwrap().snapshot()
    }
```

- [ ] **Step 3: Рефакторинг consumer_main — два режима**

Заменить весь `fn consumer_main` на следующий код (существующее тело сессии переезжает в `run_ptt_session` с одним добавлением — пуш чанков в rolling при включённом буфере):

```rust
struct Scratch {
    raw: Vec<f32>,
    mono: Vec<f32>,
    read_buf: Vec<f32>,
}

impl Scratch {
    fn new() -> Self {
        Self {
            raw: Vec::with_capacity(RAW_SCRATCH_CAPACITY),
            mono: Vec::with_capacity(MONO_SCRATCH_CAPACITY),
            read_buf: vec![0f32; READ_BUF_SAMPLES],
        }
    }
}

enum ConsumerWork {
    Session(Option<ChunkSink>),
    Buffering,
}

fn wait_for_work(shared: &Shared) -> ConsumerWork {
    let mut s = shared.session.lock().unwrap();
    loop {
        if let Session::Start(sink) = &mut *s {
            let sink = sink.take();
            *s = Session::Running;
            return ConsumerWork::Session(sink);
        }
        if shared.buffering.load(Ordering::Acquire) {
            return ConsumerWork::Buffering;
        }
        s = shared.cv.wait(s).unwrap();
    }
}

fn consumer_main(shared: &Shared, mut ring: HeapCons<f32>) {
    let mut scratch = Scratch::new();
    loop {
        match wait_for_work(shared) {
            ConsumerWork::Session(sink) => run_ptt_session(shared, &mut ring, &mut scratch, sink),
            ConsumerWork::Buffering => run_buffering(shared, &mut ring, &mut scratch),
        }
    }
}

fn drain_ring_chunk(
    shared: &Shared,
    ring: &mut HeapCons<f32>,
    scratch: &mut Scratch,
) -> usize {
    let n = ring.pop_slice(&mut scratch.read_buf);
    if n == 0 {
        return 0;
    }
    scratch.raw.extend_from_slice(&scratch.read_buf[..n]);
    let whole = scratch.raw.len() - scratch.raw.len() % shared.channels.max(1);
    scratch.mono.clear();
    audio::downmix_into(&scratch.raw[..whole], shared.channels, &mut scratch.mono);
    scratch.raw.drain(..whole);
    n
}

fn run_ptt_session(
    shared: &Shared,
    ring: &mut HeapCons<f32>,
    scratch: &mut Scratch,
    mut sink: Option<ChunkSink>,
) {
    while ring.pop_slice(&mut scratch.read_buf) > 0 {}
    scratch.raw.clear();
    shared.produced.store(0, Ordering::Relaxed);
    shared.dropped.store(0, Ordering::Relaxed);

    let mut resampler = audio::StreamResampler::new(shared.sample_rate);
    let mut out: Vec<f32> =
        Vec::with_capacity(audio::TARGET_SAMPLE_RATE as usize * OUT_PREALLOC_SECONDS);
    let mut failure: Option<String> = None;

    shared.recording.store(true, Ordering::Release);

    loop {
        let stopping = shared.stop_requested.load(Ordering::Acquire);
        if stopping {
            shared.recording.store(false, Ordering::Release);
        }
        let n = drain_ring_chunk(shared, ring, scratch);
        if n > 0 {
            if failure.is_none() {
                let before = out.len();
                match &mut resampler {
                    Ok(rs) => {
                        if let Err(e) = rs.feed(&scratch.mono, &mut out) {
                            failure = Some(e.to_string());
                        }
                    }
                    Err(e) => failure = Some(e.to_string()),
                }
                forward_session_chunk(shared, &out[before..], &mut sink);
            }
            continue;
        }
        if stopping {
            break;
        }
        std::thread::sleep(CONSUMER_IDLE_SLEEP);
    }

    if failure.is_none() {
        let before = out.len();
        if let Ok(rs) = &mut resampler {
            if let Err(e) = rs.finish(&mut out) {
                failure = Some(e.to_string());
            }
        }
        forward_session_chunk(shared, &out[before..], &mut sink);
    }
    drop(sink);

    let dropped = shared.dropped.load(Ordering::Relaxed);
    if dropped > 0 {
        eprintln!("[perf] капчер: кольцо переполнялось, потеряно {dropped} сэмплов");
    }

    let mut s = shared.session.lock().unwrap();
    *s = Session::Done(match failure {
        None => Ok(out),
        Some(e) => Err(e),
    });
    shared.cv.notify_all();
}

fn forward_session_chunk(shared: &Shared, chunk: &[f32], sink: &mut Option<ChunkSink>) {
    if chunk.is_empty() {
        return;
    }
    if let Some(sink) = sink.as_mut() {
        sink(chunk);
    }
    if shared.buffering.load(Ordering::Acquire) {
        shared.rolling.lock().unwrap().push_chunk(chunk);
    }
}

struct BufferedSession {
    out: Vec<f32>,
    sink: Option<ChunkSink>,
}

fn take_pending_session(shared: &Shared) -> Option<BufferedSession> {
    let mut s = shared.session.lock().unwrap();
    let Session::Start(sink) = &mut *s else {
        return None;
    };
    let sink = sink.take();
    *s = Session::Running;
    shared.produced.store(0, Ordering::Relaxed);
    shared.dropped.store(0, Ordering::Relaxed);
    Some(BufferedSession {
        out: Vec::with_capacity(audio::TARGET_SAMPLE_RATE as usize * OUT_PREALLOC_SECONDS),
        sink,
    })
}

fn finish_buffered_session(
    shared: &Shared,
    session: &mut Option<BufferedSession>,
    result: Result<(), String>,
) {
    let Some(sess) = session.take() else { return };
    drop(sess.sink);
    let dropped = shared.dropped.load(Ordering::Relaxed);
    if dropped > 0 {
        eprintln!("[perf] капчер: кольцо переполнялось, потеряно {dropped} сэмплов");
    }
    let mut s = shared.session.lock().unwrap();
    *s = Session::Done(result.map(|()| sess.out));
    shared.cv.notify_all();
}

fn run_buffering(shared: &Shared, ring: &mut HeapCons<f32>, scratch: &mut Scratch) {
    let mut resampler = match audio::StreamResampler::new(shared.sample_rate) {
        Ok(rs) => rs,
        Err(e) => {
            eprintln!("фоновый буфер: ресемплер недоступен: {e}");
            shared.buffering.store(false, Ordering::Release);
            return;
        }
    };
    let mut chunk: Vec<f32> = Vec::with_capacity(MONO_SCRATCH_CAPACITY);
    let mut session: Option<BufferedSession> = None;

    loop {
        if session.is_none() {
            if !shared.buffering.load(Ordering::Acquire) {
                return;
            }
            session = take_pending_session(shared);
        }
        let stopping = session.is_some() && shared.stop_requested.load(Ordering::Acquire);
        let n = drain_ring_chunk(shared, ring, scratch);
        if n > 0 {
            chunk.clear();
            if let Err(e) = resampler.feed(&scratch.mono, &mut chunk) {
                eprintln!("фоновый буфер: ресемплинг упал: {e}");
                finish_buffered_session(shared, &mut session, Err(e.to_string()));
                return;
            }
            if !chunk.is_empty() {
                shared.rolling.lock().unwrap().push_chunk(&chunk);
                if let Some(sess) = session.as_mut() {
                    sess.out.extend_from_slice(&chunk);
                    if let Some(sink) = sess.sink.as_mut() {
                        sink(&chunk);
                    }
                }
            }
            continue;
        }
        if stopping {
            finish_buffered_session(shared, &mut session, Ok(()));
            continue;
        }
        std::thread::sleep(CONSUMER_IDLE_SLEEP);
    }
}
```

Примечания к инвариантам (для ревьюера):
- При выключенном буфере путь идентичен старому: `wait_for_work` паркуется на condvar, `run_ptt_session` повторяет прежнее тело (сброс stale-данных, пер-сессионный ресемплер с `finish()`, протокол `recording=false` → дренаж хвоста).
- В режиме буферизации `recording` остаётся `false` — `io_proc` пропускает по `buffering`; PTT-сессия внутри `run_buffering` живёт на долгоживущем ресемплере, `finish()` не зовётся (потеря хвоста ~20 мс речи при отпускании — осознанно).
- `stop_requested` сбрасывает только `start()` — протокол не изменился.
- `Session::Done` в буферизующей сессии выставляется после полного дренажа транспортного кольца (`n == 0`), как раньше.

- [ ] **Step 4: Пример record5s**

В `apps/desktop/src-tauri/examples/record5s.rs` строка 16, заменить:

```rust
    let mut cap = harpyhare_lib::capture::SystemAudioCapture::new(None).expect("создание tap");
```

на:

```rust
    const EXAMPLE_BUFFER_SECS: u64 = 10;
    let mut cap = harpyhare_lib::capture::SystemAudioCapture::new(None, EXAMPLE_BUFFER_SECS)
        .expect("создание tap");
```

- [ ] **Step 5: Компиляция и существующие тесты**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib && cargo clippy --manifest-path src-tauri/Cargo.toml --lib`
Expected: тесты PASS; clippy без warnings. Сборка примеров: `cargo build --manifest-path src-tauri/Cargo.toml --examples` — OK. (lib.rs ещё зовёт `SystemAudioCapture::new` со старой сигнатурой — если компиляция lib падает только из-за этого, до Task 4 временно проверить `cargo test --lib` не выйдет; в таком случае выполнить Task 4 Step 1 (build_capture) до запуска тестов и коммитить задачи 3+4 последовательно, тесты гонять после Task 4. Коммит Task 3 допустимо отложить до зелёной сборки.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/capture.rs src-tauri/examples/record5s.rs
PATH="/opt/homebrew/bin:$PATH" git commit -m "feat(desktop): режим непрерывной буферизации в capture — rolling-буфер 16кГц, io_proc-гейт recording||buffering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Если сборка без Task 4 невозможна — объединить коммит с Task 4.)

---

### Task 4: lib.rs + hotkey.rs — забор буфера, команда, хоткей, side-effects настроек

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/hotkey.rs`

**Interfaces:**
- Consumes: `SystemAudioCapture::{new(uid, secs), set_buffering, set_buffer_capacity_secs, buffer_snapshot}` (Task 3), поля Settings (Task 1).
- Produces: Tauri-команда `grab_buffer` (без аргументов/результата; текст придёт событием `transcript-ready`, ошибки — `stt-error`, состояние — `state-changed`), `pub fn on_grab_buffer(app: &AppHandle)` для hotkey.rs. Их использует Task 5 (`grabBuffer()` в commands.ts).

- [ ] **Step 1: hotkey.rs — регистрация хоткея забора**

После `unregister_teleprompter`:

```rust
pub fn register_buffer_grab(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut = parse_hotkey(hotkey).ok_or_else(|| unparseable_hotkey_error(hotkey))?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                defer(app, crate::on_grab_buffer);
            }
        })
        .map_err(|e| e.to_string())
}

pub fn unregister_buffer_grab(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}
```

- [ ] **Step 2: lib.rs — константы ошибок**

После `const ERR_SILENCE…`:

```rust
const ERR_BUFFER_DISABLED: &str = "Фоновый буфер выключен в настройках";
const ERR_BUSY_RECORDING: &str = "Дождитесь окончания текущей записи";
```

- [ ] **Step 3: lib.rs — build_capture/rebuild с настройками буфера**

Заменить `build_capture` и `rebuild_capture_now`:

```rust
fn build_capture(settings: &settings::Settings) -> Option<capture::SystemAudioCapture> {
    let uid = if settings.capture_device_uid.is_empty() {
        None
    } else {
        Some(settings.capture_device_uid.as_str())
    };
    match capture::SystemAudioCapture::new(uid, settings.buffer_seconds) {
        Ok(c) => {
            c.set_buffering(settings.buffer_enabled);
            Some(c)
        }
        Err(e) => {
            eprintln!("захват системного звука недоступен: {e}");
            None
        }
    }
}
```

```rust
fn rebuild_capture_now(app: &AppHandle) {
    let st = app.state::<App>();
    let settings = st.settings.lock().unwrap().clone();
    let new_capture = build_capture(&settings);
    *st.capture.lock().unwrap() = new_capture;
}
```

В `setup_app` вызов уже совместим после замены аргумента: `let capture = build_capture(&settings);` (было `&settings.capture_device_uid`).

- [ ] **Step 4: lib.rs — регистрация стартовых хоткеев по Settings**

В `setup_app` заменить четыре строки подготовки/вызова хоткеев:

```rust
    let ptt_hotkey = settings.hotkey.clone();
    let toggle_hotkey = settings.toggle_hotkey.clone();
    let teleprompter_hotkey = settings.teleprompter_hotkey.clone();
    ...
    register_startup_hotkeys(handle, &ptt_hotkey, &toggle_hotkey, &teleprompter_hotkey);
```

на:

```rust
    let startup_hotkeys = settings.clone();
    ...
    register_startup_hotkeys(handle, &startup_hotkeys);
```

(строка `spawn_startup_warm_up_and_model_fetch…` и `handle.manage(…)` между ними не меняются). Новый `register_startup_hotkeys`:

```rust
fn register_startup_hotkeys(app: &AppHandle, s: &settings::Settings) {
    if let Err(e) = hotkey::register_ptt(app, &s.hotkey) {
        eprintln!("не удалось зарегистрировать PTT-хоткей {:?}: {e}", s.hotkey);
    }
    if let Err(e) = hotkey::register_toggle(app, &s.toggle_hotkey) {
        eprintln!("не удалось зарегистрировать toggle-хоткей {:?}: {e}", s.toggle_hotkey);
    }
    if let Err(e) = hotkey::register_teleprompter(app, &s.teleprompter_hotkey) {
        eprintln!("не удалось зарегистрировать суфлёр-хоткей {:?}: {e}", s.teleprompter_hotkey);
    }
    if s.buffer_enabled {
        if let Err(e) = hotkey::register_buffer_grab(app, &s.buffer_hotkey) {
            eprintln!("не удалось зарегистрировать хоткей буфера {:?}: {e}", s.buffer_hotkey);
        }
    }
}
```

- [ ] **Step 5: lib.rs — забор буфера**

После `pub fn on_toggle_teleprompter…`:

```rust
pub fn on_grab_buffer(app: &AppHandle) {
    grab_buffer_now(app);
}

fn grab_buffer_now(app: &AppHandle) {
    let st = app.state::<App>();
    if *st.recorder.lock().unwrap() != state::RecorderState::Idle {
        let _ = app.emit(EVENT_STT_ERROR, ERR_BUSY_RECORDING);
        return;
    }
    if !st.settings.lock().unwrap().buffer_enabled {
        let _ = app.emit(EVENT_STT_ERROR, ERR_BUFFER_DISABLED);
        return;
    }
    if st.capture_rebuild_pending.swap(false, Ordering::SeqCst) {
        rebuild_capture_now(app);
    }
    let snapshot = {
        let capture = st.capture.lock().unwrap();
        match capture.as_ref() {
            Some(c) => c.buffer_snapshot(),
            None => {
                let _ = app.emit(EVENT_STT_ERROR, ERR_NO_CAPTURE_PERMISSION);
                return;
            }
        }
    };
    let min_samples = (state::MIN_RECORDING_SECS * audio::TARGET_SAMPLE_RATE as f32) as usize;
    if snapshot.len() < min_samples {
        return;
    }
    if audio::is_silence(&snapshot) {
        let _ = app.emit(EVENT_STT_ERROR, ERR_SILENCE);
        return;
    }
    {
        let mut rec = st.recorder.lock().unwrap();
        if *rec != state::RecorderState::Idle {
            let _ = app.emit(EVENT_STT_ERROR, ERR_BUSY_RECORDING);
            return;
        }
        *rec = state::RecorderState::Transcribing;
    }
    emit_state(app, state::RecorderState::Transcribing);
    *st.last_recording.lock().unwrap() = Some(snapshot.clone());
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move { transcribe_and_emit(app2, snapshot).await });
}

#[tauri::command]
fn grab_buffer(app: AppHandle) {
    grab_buffer_now(&app);
}
```

Зарегистрировать `grab_buffer` в `generate_handler!` (после `retry_transcription,`).

- [ ] **Step 6: lib.rs — side-effects set_settings**

В `reregister_changed_hotkeys` перед `Ok(())`:

```rust
    if old.buffer_enabled != new.buffer_enabled || old.buffer_hotkey != new.buffer_hotkey {
        if new.buffer_enabled {
            hotkey::register_buffer_grab(app, &new.buffer_hotkey)?;
        }
        if old.buffer_enabled && (!new.buffer_enabled || old.buffer_hotkey != new.buffer_hotkey) {
            hotkey::unregister_buffer_grab(app, &old.buffer_hotkey);
        }
    }
```

Новая функция рядом с `apply_screen_share_visibility_change`:

```rust
fn apply_buffer_settings_change(
    app: &AppHandle,
    old: &settings::Settings,
    new: &settings::Settings,
) {
    if old.buffer_enabled == new.buffer_enabled && old.buffer_seconds == new.buffer_seconds {
        return;
    }
    if let Some(c) = app.state::<App>().capture.lock().unwrap().as_ref() {
        c.set_buffer_capacity_secs(new.buffer_seconds);
        c.set_buffering(new.buffer_enabled);
    }
}
```

Вызов в `set_settings` после `apply_screen_share_visibility_change(&app, &old, &new_settings);`:

```rust
    apply_buffer_settings_change(&app, &old, &new_settings);
```

- [ ] **Step 7: Тесты и clippy**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib && cargo clippy --manifest-path src-tauri/Cargo.toml --lib && cargo build --manifest-path src-tauri/Cargo.toml --examples`
Expected: PASS / без warnings.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/hotkey.rs
PATH="/opt/homebrew/bin:$PATH" git commit -m "feat(desktop): забор фонового буфера — команда grab_buffer, хоткей, применение настроек буфера

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: TS — зеркало Settings и команда grabBuffer

**Files:**
- Modify: `apps/desktop/src/ipc/types.ts`
- Modify: `apps/desktop/src/ipc/commands.ts`

**Interfaces:**
- Consumes: контракт Task 4 (`grab_buffer`), поля Task 1.
- Produces: `Settings.buffer_enabled/buffer_seconds/buffer_hotkey` в TS, `grabBuffer(): Promise<void>`. Используют Task 6–8.

- [ ] **Step 1: types.ts**

В `interface Settings` (после `scroll_step: number;`):

```ts
  buffer_enabled: boolean;
  buffer_seconds: number;
  buffer_hotkey: string;
```

В `DEFAULT_SETTINGS` (после `scroll_step: 120,`):

```ts
  buffer_enabled: true,
  buffer_seconds: 4,
  buffer_hotkey: "F8",
```

- [ ] **Step 2: commands.ts**

После `export async function retryTranscription…`:

```ts
export async function grabBuffer(): Promise<void> {
  await invokeOrNoopInBrowser("grab_buffer");
}
```

- [ ] **Step 3: Проверка**

Run: `npm run typecheck`
Expected: PASS (grabBuffer пока не используется — knip ругнётся только на pre-commit; коммит этой задачи объединён со следующей, см. Step 4).

- [ ] **Step 4: Commit — отложен**

Не коммитить отдельно: неиспользуемый экспорт `grabBuffer` завалит knip в pre-commit. Коммит — в конце Task 6 вместе с UI.

---

### Task 6: SettingsDialog — тумблер, глубина, хоткей

**Files:**
- Modify: `apps/desktop/src/components/SettingsDialog.tsx`

**Interfaces:**
- Consumes: поля Settings из Task 5, существующие `SwitchRow`/`Field`/`HotkeyCapture`/`SetSetting`.

- [ ] **Step 1: Константы**

После `const FALLBACK_TELEPROMPTER_HOTKEY = "F10";`:

```ts
const FALLBACK_BUFFER_HOTKEY = "F8";
```

После `const SCROLL_STEP_MAX_PX = 1000;`:

```ts
const BUFFER_SECONDS_MIN = 4;
const BUFFER_SECONDS_MAX = 10;
```

- [ ] **Step 2: STT-секция (вкладка «Основное»)**

В `SttSection`, после закрывающего `</SwitchRow>` переключателя `stt_translate`:

```tsx
      <SwitchRow
        checked={draft.buffer_enabled}
        onCheckedChange={(v) => {
          set("buffer_enabled", v);
        }}
      >
        Фоновый буфер: постоянно держать последние секунды звука
      </SwitchRow>
      <Field label="Глубина буфера, секунд">
        <Input
          type="number"
          min={BUFFER_SECONDS_MIN}
          max={BUFFER_SECONDS_MAX}
          disabled={!draft.buffer_enabled}
          value={draft.buffer_seconds}
          onChange={(e) => {
            set("buffer_seconds", Number(e.target.value));
          }}
        />
      </Field>
```

- [ ] **Step 3: Вкладка «Горячие клавиши»**

В `HotkeysSection`, после Field «Суфлёр»:

```tsx
      <Field label="Расшифровать фоновый буфер">
        <HotkeyCapture
          value={draft.buffer_hotkey}
          onChange={(hk) => {
            set("buffer_hotkey", hk);
          }}
        />
      </Field>
```

- [ ] **Step 4: Фоллбек хоткея при сохранении**

В `save()` после строки `teleprompter_hotkey: …`:

```ts
      buffer_hotkey: draft.buffer_hotkey.trim() || FALLBACK_BUFFER_HOTKEY,
```

- [ ] **Step 5: Проверка**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. (knip всё ещё видит неиспользуемый `grabBuffer` — он подключится в Task 8; коммит Task 5+6 делаем сейчас, когда его потребителя ещё нет, поэтому)

Run: `npx knip`
Expected: ругается ТОЛЬКО на `grabBuffer`. Если так — отложить коммит и выполнить Task 7–8, затем коммитить фронт одним коммитом (Step 6 в Task 8). Если knip молчит — коммитить здесь по шаблону Task 8 Step 6.

---

### Task 7: Реестр хоткеев + шпаргалка

**Files:**
- Modify: `apps/desktop/src/lib/hotkeys.ts`
- Create: `apps/desktop/src/lib/hotkeys.test.ts`
- Modify: `apps/desktop/src/components/HotkeysPopover.tsx`

**Interfaces:**
- Produces: `HotkeyConfig.bufferGrab: string | null` (null = буфер выключен, подсказка скрыта); `HotkeysPopoverProps.bufferGrabHotkey: string | null`. Использует Task 8.

- [ ] **Step 1: Падающий тест**

Создать `src/lib/hotkeys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hotkeyGroups } from "./hotkeys";

const BASE = { ptt: "F9", toggleWindow: "Cmd+Shift+H", teleprompter: "F10" };
const BUFFER_HINT = "расшифровать фоновый буфер";

function labels(bufferGrab: string | null): string[] {
  return hotkeyGroups({ ...BASE, bufferGrab }).flatMap((g) => g.hints.map((h) => h.label));
}

describe("hotkeyGroups", () => {
  it("показывает подсказку забора буфера, когда хоткей задан", () => {
    expect(labels("F8")).toContain(BUFFER_HINT);
  });

  it("прячет подсказку забора буфера, когда буфер выключен", () => {
    expect(labels(null)).not.toContain(BUFFER_HINT);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/lib/hotkeys.test.ts`
Expected: FAIL (нет поля `bufferGrab` в `HotkeyConfig` — ошибка типов/рантайма).

- [ ] **Step 3: hotkeys.ts**

В `HotkeyConfig`:

```ts
export interface HotkeyConfig {
  ptt: string;
  toggleWindow: string;
  teleprompter: string;
  bufferGrab: string | null;
}
```

Группа «Запись» в `hotkeyGroups`:

```ts
    {
      title: "Запись",
      hints: [
        { combo: formatCombo(cfg.ptt), label: "записать системный звук (зажать)" },
        ...(cfg.bufferGrab !== null
          ? [{ combo: formatCombo(cfg.bufferGrab), label: "расшифровать фоновый буфер" }]
          : []),
        { combo: "Esc", label: "отменить запись" },
      ],
    },
```

- [ ] **Step 4: Тест зелёный**

Run: `npx vitest run src/lib/hotkeys.test.ts`
Expected: PASS.

- [ ] **Step 5: HotkeysPopover.tsx**

```ts
export interface HotkeysPopoverProps {
  hotkey: string;
  toggleHotkey: string;
  teleprompterHotkey: string;
  bufferGrabHotkey: string | null;
}
```

и в теле:

```ts
  const groups = hotkeyGroups({
    ptt: props.hotkey,
    toggleWindow: props.toggleHotkey,
    teleprompter: props.teleprompterHotkey,
    bufferGrab: props.bufferGrabHotkey,
  });
```

- [ ] **Step 6: Проверка**

Run: `npm run typecheck`
Expected: FAIL только в App.tsx (не передан `bufferGrabHotkey`) — чинится в Task 8. Если других ошибок нет — переходить дальше без коммита.

---

### Task 8: StatusBar-кнопка + сборка в App.tsx + единый фронт-коммит

**Files:**
- Modify: `apps/desktop/src/components/StatusBar.tsx`
- Modify: `apps/desktop/src/App.tsx`

**Interfaces:**
- Consumes: `grabBuffer()` (Task 5), `bufferGrabHotkey` (Task 7), `StatusBarProps` (существующий).
- Produces: `StatusBarProps.bufferGrab: { hotkey: string; onGrab: () => void } | null`; `AppHeaderProps.bufferGrab` той же формы.

- [ ] **Step 1: StatusBar.tsx**

Импорт иконки: в строке импорта lucide добавить `History`:

```ts
import { ArrowDownCircle, History, Minus, Settings as SettingsIcon, X } from "lucide-react";
```

В `StatusBarProps` (после `error: string | null;`):

```ts
  bufferGrab: { hotkey: string; onGrab: () => void } | null;
```

Компонент (рядом с `HeaderActionButton`):

```tsx
function BufferGrabButton({
  hotkey,
  disabled,
  onGrab,
}: {
  hotkey: string;
  disabled: boolean;
  onGrab: () => void;
}) {
  const title = `Расшифровать фоновый буфер (${hotkey})`;
  return (
    <button
      type="button"
      onClick={onGrab}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40"
    >
      <History className="size-4" />
    </button>
  );
}
```

В `StatusBar`: принять `bufferGrab` в деструктуризации пропсов и отрендерить после `<EqBars …/>`:

```tsx
      <EqBars {...indicatorProps(state, showError)} />
      {bufferGrab && (
        <BufferGrabButton
          hotkey={bufferGrab.hotkey}
          disabled={state !== "idle"}
          onGrab={bufferGrab.onGrab}
        />
      )}
```

- [ ] **Step 2: App.tsx — прокладка пропсов**

Импорт: добавить `grabBuffer` в существующий импорт из `@/ipc/commands` (там уже импортируются `closeApp`, `hideMainWindow` и др.).

В `AppHeaderProps` (после `error: string | null;`):

```ts
  bufferGrab: { hotkey: string; onGrab: () => void } | null;
```

В `AppHeader`: добавить `bufferGrab` в деструктуризацию; передать в StatusBar и поповер:

```tsx
    <StatusBar
      state={state}
      error={error}
      bufferGrab={bufferGrab}
      …
```

```tsx
          <HotkeysPopover
            hotkey={hotkey}
            toggleHotkey={toggleHotkey}
            teleprompterHotkey={teleprompterHotkey}
            bufferGrabHotkey={bufferGrab?.hotkey ?? null}
          />
```

В `App` при рендере `<AppHeader …>` (рядом с `hotkey={settings.hotkey}`):

```tsx
          bufferGrab={
            settings.buffer_enabled
              ? { hotkey: settings.buffer_hotkey, onGrab: () => void grabBuffer() }
              : null
          }
```

- [ ] **Step 3: Полная фронт-проверка**

Run: `npm run typecheck && npx vitest run && npm run lint && npx knip`
Expected: всё PASS, knip молчит (grabBuffer теперь используется).

- [ ] **Step 4: Commit (весь фронт: Task 5+6+7+8)**

```bash
git add src/ipc/types.ts src/ipc/commands.ts src/components/SettingsDialog.tsx src/lib/hotkeys.ts src/lib/hotkeys.test.ts src/components/HotkeysPopover.tsx src/components/StatusBar.tsx src/App.tsx
PATH="/opt/homebrew/bin:$PATH" git commit -m "feat(desktop): UI фонового буфера — тумблер и глубина в настройках, хоткей, кнопка в статус-баре, шпаргалка

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: CLAUDE.md + финальная верификация

**Files:**
- Modify: `apps/desktop/CLAUDE.md`

- [ ] **Step 1: CLAUDE.md**

1. Заменить `Settings` (25 fields)` на актуальное число (26 было до фичи + 3 новых = 29; пересчитать по struct перед правкой).
2. В абзац про Settings добавить: `` `Settings.buffer_enabled`/`buffer_seconds`/`buffer_hotkey` — фоновый кольцевой буфер последних N секунд системного звука (кламп 4–10 с, дефолт 4, вкл. по умолчанию, хоткей F8): звук непрерывно ресемплируется в 16 кГц и живёт только в RAM (VecDeque в capture.Shared), при выключении очищается; забор — команда `grab_buffer`/хоткей/кнопка в StatusBar → снимок → гейты (занятость/0.3с/RMS-тишина) → классический Groq-путь → `transcript-ready` (клипборд + черновик), Retry работает через `last_recording`. Хоткей забора регистрируется только при включённом буфере. ``
3. В описание `capture.rs` добавить: `` Режим непрерывной буферизации: `set_buffering(true)` переводит консьюмер в цикл с долгоживущим ресемплером (io_proc пропускает по `recording || buffering`), каждый 16кГц-чанк уходит в `audio::RollingBuffer` под мьютексом; PTT-сессия при включённом буфере обслуживается тем же циклом БЕЗ `finish()` ресемплера (потеря хвоста ~20 мс осознанна). При выключенном буфере путь консьюмера прежний. `SystemAudioCapture::new(uid, buffer_secs)`. ``

- [ ] **Step 2: Полная верификация**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --lib
npm run typecheck && npx vitest run && npm run lint && npx knip && npm run format:check
```
Expected: всё зелёное. Прогнать и `npm run build` (tsc -b + vite) — PASS.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
PATH="/opt/homebrew/bin:$PATH" git commit -m "docs(desktop): CLAUDE.md — поля и инварианты фонового аудио-буфера

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Ручная приёмка (пользователь)**

Пользователь запускает `npm run tauri dev` (UI в браузере не тестировать — инвариант проекта; в dev под cmux проверить грант «Запись экрана и системного звука»):
1. Включить звук (видео/музыка), подождать ≥5 с, нажать F8 → EqBars мигают primary → текст последних 4 с в черновике и клипборде.
2. Кнопка History в статус-баре делает то же; во время PTT-записи кнопка задизейблена, F8 даёт «Дождитесь окончания текущей записи».
3. Тишина → «Тишина — нечего распознавать…»; сразу после включения тумблера (<0.3 с в буфере) — молчаливый игнор.
4. Выключить тумблер в настройках → кнопка исчезает, F8 не срабатывает; включить обратно → работает.
5. Сменить глубину на 10 с → забирается ~10 с звука.
6. PTT (F9) работает как раньше при обоих положениях тумблера.
