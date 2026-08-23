# harpyhare

A push-to-talk app for macOS and Windows: hold the record hotkey → capture system audio → speech recognition through Whisper (Groq) → edit the text → send it to Claude together with screenshots. The reply streams straight into a floating HUD window. In the system the process presents itself neutrally as "Audio System"; the harpyhare brand appears only inside the interface.

## Requirements

- macOS 14.2+ (system audio capture through a Core Audio process tap) **or** Windows 10 version 2004+ / Windows 11, x64 (capture through WASAPI loopback; version 2004 is required to hide the window during screen sharing)
- An [Anthropic](https://console.anthropic.com/) API key (Claude)
- A [Groq](https://console.groq.com/) API key (Whisper STT)
- A VPN for both services when working from Russia

## Running and building

```bash
npm install
cp .env.example .env   # and fill in the API keys (see below)
npm run tauri dev      # dev mode with hot reload
npm run tauri build    # production build (.app + .dmg on macOS, an NSIS installer on Windows)
```

## API keys

There are two ways to provide the keys (they can be combined):

1. **`.env` in the project root** — `ANTHROPIC_API_KEY` and `GROQ_API_KEY`. The file is in `.gitignore` and is picked up when the app starts.
2. **In-app settings** (⚙) — stored in settings.json and **taking priority** over `.env`: the value from `.env` is used only while the matching settings field is empty.

## First launch

On macOS the system will ask "Allow Audio System to record system audio?" on first start — click **Allow**. If the dialog never appeared, or access was denied, you can grant it on the "Permissions" screen in the launcher.

Auto mode additionally needs microphone access — it is optional, and the app launches without it; the same "Permissions" screen grants it.

On Windows no separate permissions are required: WASAPI hands over the output device's loopback without asking, and so does the screenshot. The "Permissions" screen is not shown there.

## Hotkeys

The primary modifier is platform-specific: ⌘ on macOS, Ctrl on Windows (the Win key is not offered as a modifier — the system's window snapping owns it).

| Key | Action |
|---------|----------|
| ⌘/Ctrl+R (hold) | Record system audio |
| ⌘/Ctrl+Shift+L | Auto mode on/off (listens to the other party and to you) |
| Esc | Cancel recording |
| ⌘/Ctrl+Enter | Send the text to Claude |
| ⌘/Ctrl+Shift+A | Screenshot a screen region |
| ⌘/Ctrl+Shift+D | Focus the prompt field |
| ⌘/Ctrl+Shift+H | Hide or show the window |
| ⌘/Ctrl+Shift+T | Teleprompter |
| ⌘/Ctrl+Shift+N | Duplicate the chat |
| ⌘/Ctrl+←/→/↑/↓ | Move the window around the screen |

> **IMPORTANT:** the record hotkey intercepts the keypress in **every** application while the app is running. Typing inside the app's own fields still works — PTT is released when a field takes focus. Every combination is configurable in the launcher.

## Settings

Opened with the ⚙ button in the top-right corner. Stored in:

```
macOS:   ~/Library/Application Support/com.audioservice.helper/settings.json
Windows: %APPDATA%\com.audioservice.helper\settings.json
```

On macOS the file is created with mode 600 (readable only by the current user); on Windows the profile folder itself provides the privacy — there are no POSIX modes there.

## Updates

The app checks for new versions on its own (at start and every 6 hours) through `latest.json` in the public [harpyhare-releases](https://github.com/screenfriskofficial/harpyhare-releases) repository. When it finds one, a badge with the version number appears in the header: click → release notes → "Update and restart" (the artifact is verified against its minisign signature). A manual check lives in the settings.

## Releasing

One-time setup: the updater artifact signing key pair has already been generated in `~/.tauri/itech.key` (+ `.pub`). **The private key must be backed up**: without it, existing installations stop accepting updates. The public key is baked into `tauri.conf.json` (`plugins.updater.pubkey`).

```bash
npm run release -- 0.2.0 --notes "What's new"
```

The script bumps the version in three files, builds a signed bundle **for the platform it is running on**, publishes the artifacts and `latest.json` to harpyhare-releases and makes a local commit tagged `vX.Y.Z` (pushing is manual). The key is looked up in `~/.tauri/itech.key` (override with `ITECH_SIGNING_KEY`).

The release is two-platform, and a Windows bundle cannot be built on macOS. The order is:

1. on macOS — `npm run release -- X.Y.Z --notes "…"`: creates the release with `AudioSystem_X.Y.Z_aarch64.app.tar.gz`, `.dmg` and a `latest.json` carrying the `darwin-aarch64` platform;
2. the second platform is **added** on the same tag: the version is not bumped, no tag is created, `AudioSystem_X.Y.Z_x86_64-setup.exe` is added to the release, and the `windows-x86_64` platform is merged into the existing `latest.json`. There are two ways:
   - on Windows (a machine or a CI runner) — `npm run release -- X.Y.Z`;
   - from macOS — `npm run release -- X.Y.Z --windows-setup path/to/AudioSystem_X.Y.Z_x64-setup.exe`: it takes the installer from the `windows-installer` artifact of the CI job (`.github/workflows/ci.yml`), signs it with the local `~/.tauri/itech.key` and uploads it. It builds nothing; the file name must contain `_X.Y.Z_`. **Not every run has that artifact:** the job builds the installer only on a `v*` tag push — that is, after `git push --tags` from step 1 — or on a manual `workflow_dispatch`; ordinary pushes to main and PRs do not have it.

   On Windows the installer serves both as the human-facing link and as the updater artifact (in Tauri 2 the updater reuses the `-setup.exe` itself). A Windows machine is not required for the release: the updater signature is minisign over the file's bytes, and the build host is irrelevant to it.

**A release must never be left without its second platform.** On that platform the updater does not "quietly find no update" — it fails with an error on every check: inside the plugin, `get_urls` is called before versions are compared and, with no key for the platform, returns `TargetsNotFound`. Installed versions of the other platform are unaffected. GitHub Actions checks the Windows code without a Windows machine — but on every push only by compiling it (clippy); the bundle is built on a tag alone, and signing there turns on only if `TAURI_SIGNING_PRIVATE_KEY` is in the secrets.

## Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui + react-markdown. Layers: `src/ipc` (a typed boundary over Tauri — the only place that knows about invoke/listen), `src/lib` (pure logic), `src/hooks` (one hook per slice of the contract), `src/components` (built on shadcn primitives).
- **Backend:** Rust (Tauri 2) — system audio capture (a Core Audio process tap on macOS, WASAPI loopback on Windows), Groq STT, Anthropic streaming. Platform code is isolated in `<module>/macos.rs` and `<module>/windows.rs` behind a shared `<module>.rs` facade.

## Tests

```bash
# Frontend (TypeScript): pure logic + hooks
npx vitest run

# Rust (unit tests)
cargo test --manifest-path src-tauri/Cargo.toml --lib

# Clippy (lint)
cargo clippy --manifest-path src-tauri/Cargo.toml --lib
```
