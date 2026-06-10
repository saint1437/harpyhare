import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  acceptedNewAttachments,
  downscaleFactor,
  extractImageItems,
  toImagePayload,
  type ImagePayload,
} from "./composer";
import { applyOpacity, moveDelta } from "./window-controls";
import { renderMarkdown } from "./markdown";

// Settings — локальная копия контракта Rust (settings.rs::Settings) для типобезопасности.
interface Settings {
  anthropic_api_key: string;
  groq_api_key: string;
  model: string;
  system_prompt: string;
  hotkey: string;
  auto_send: boolean;
  window_opacity: number;
  move_step: number;
}

const DEFAULT_SETTINGS: Settings = {
  anthropic_api_key: "",
  groq_api_key: "",
  model: "claude-opus-4-8",
  system_prompt: "",
  hotkey: "V",
  auto_send: false,
  window_opacity: 1,
  move_step: 20,
};

const STATUS_DEFAULT = "Зажми V — записать системный звук";

/** Вне Tauri (обычный браузер для визуальной проверки) invoke/listen недоступны. */
const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Одно вложение: payload для отправки + dataURL для превью-чипа. */
interface Attachment {
  payload: ImagePayload;
  preview: string;
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`нет элемента #${id}`);
  return el as T;
}

async function main(): Promise<void> {
  const banner = $<HTMLDivElement>("permission-banner");
  const openPermissions = $<HTMLButtonElement>("open-permissions");
  const statusEl = $<HTMLDivElement>("status");
  const statusText = statusEl.querySelector<HTMLSpanElement>(".status__text")!;
  const openSettings = $<HTMLButtonElement>("open-settings");
  const settingsDialog = $<HTMLDialogElement>("settings");
  const transcript = $<HTMLTextAreaElement>("transcript");
  const attachmentsEl = $<HTMLDivElement>("attachments");
  const clearBtn = $<HTMLButtonElement>("clear");
  const sendBtn = $<HTMLButtonElement>("send");
  const stopBtn = $<HTMLButtonElement>("stop");
  const retryBtn = $<HTMLButtonElement>("retry");
  const answerEl = $<HTMLDivElement>("answer");
  const copyAnswerBtn = $<HTMLButtonElement>("copy-answer");

  let settings: Settings = DEFAULT_SETTINGS;
  let attachments: Attachment[] = [];
  let answerMd = "";

  // --- Статус ----------------------------------------------------------------
  function setStatus(state: string, text: string): void {
    statusEl.dataset.state = state;
    statusText.textContent = text;
  }

  // --- Вложения --------------------------------------------------------------
  function renderAttachments(): void {
    attachmentsEl.replaceChildren();
    attachments.forEach((att, i) => {
      const chip = document.createElement("div");
      chip.className = "chip";

      const img = document.createElement("img");
      img.className = "chip__img";
      img.src = att.preview;
      img.alt = "Вложение";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip__remove";
      remove.setAttribute("aria-label", "Удалить вложение");
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        attachments.splice(i, 1);
        renderAttachments();
      });

      chip.append(img, remove);
      attachmentsEl.append(chip);
    });
  }

  /** File → {payload, preview}: до лимита размера читаем как есть, иначе даунскейлим в JPEG. */
  async function fileToAttachment(file: File): Promise<Attachment> {
    const factor = downscaleFactor(file.size);
    if (factor === 1) {
      const dataUrl = await readAsDataUrl(file);
      return { payload: toImagePayload(dataUrl, file.type), preview: dataUrl };
    }
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * factor));
    canvas.height = Math.max(1, Math.round(bitmap.height * factor));
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { payload: toImagePayload(dataUrl, "image/jpeg"), preview: dataUrl };
  }

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }

  // --- Стрим-режим UI --------------------------------------------------------
  function streamUi(streaming: boolean): void {
    sendBtn.disabled = streaming;
    stopBtn.hidden = !streaming;
    if (!streaming) copyAnswerBtn.hidden = answerMd.trim().length === 0;
  }

  // --- Отправка --------------------------------------------------------------
  async function send(): Promise<void> {
    const text = transcript.value.trim();
    if (text === "" && attachments.length === 0) return;
    answerMd = "";
    answerEl.innerHTML = "";
    copyAnswerBtn.hidden = true;
    setStatus("idle", STATUS_DEFAULT);
    streamUi(true);
    const images = attachments.map((a) => a.payload);
    try {
      // tauri v2: snake_case-параметры команды приходят camelCase'ом, но text/images
      // уже однословные — имена совпадают (send_to_claude(text, images)).
      await invoke("send_to_claude", { text: transcript.value, images });
    } catch (e) {
      streamUi(false);
      setStatus("error", String(e));
    }
  }

  // --- Кнопки ----------------------------------------------------------------
  sendBtn.addEventListener("click", () => void send());
  stopBtn.addEventListener("click", () => {
    if (isTauri()) void invoke("cancel_stream");
  });
  clearBtn.addEventListener("click", () => {
    transcript.value = "";
    attachments = [];
    renderAttachments();
  });
  retryBtn.addEventListener("click", () => {
    retryBtn.hidden = true;
    if (isTauri()) void invoke("retry_transcription");
  });
  copyAnswerBtn.addEventListener("click", () => {
    void navigator.clipboard.writeText(answerMd);
  });
  openSettings.addEventListener("click", () => {
    // Пустой диалог наполнит Task 15; пока просто открываем модалку.
    if (typeof settingsDialog.showModal === "function") settingsDialog.showModal();
  });
  settingsDialog.addEventListener("click", (e) => {
    if (e.target === settingsDialog) settingsDialog.close();
  });
  openPermissions.addEventListener("click", () => {
    if (isTauri()) void invoke("open_audio_permission_settings");
  });

  // --- Вставка скриншотов из буфера -----------------------------------------
  transcript.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = extractImageItems(items);
    if (files.length === 0) return; // текстовая вставка — нативно
    e.preventDefault();
    const slots = acceptedNewAttachments(attachments.length, files.length);
    void (async () => {
      for (const file of files.slice(0, slots)) {
        try {
          attachments.push(await fileToAttachment(file));
          renderAttachments();
        } catch {
          /* битый кадр пропускаем */
        }
      }
    })();
  });

  // --- Клавиатура ------------------------------------------------------------
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.code === "Enter") {
      e.preventDefault();
      void send();
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      const delta = moveDelta(e.code, settings.move_step);
      if (delta) {
        e.preventDefault();
        if (isTauri()) void invoke("move_window_by", { dx: delta.dx, dy: delta.dy });
      }
    }
  });

  // --- PTT-suspension при фокусе в полях ввода --------------------------------
  // Хоткей V конфликтует с печатью буквы V в textarea — на время фокуса глушим его.
  function suspendPtt(suspended: boolean): void {
    if (isTauri()) void invoke("set_ptt_suspended", { suspended });
  }
  for (const field of [transcript]) {
    field.addEventListener("focusin", () => suspendPtt(true));
    field.addEventListener("focusout", () => suspendPtt(false));
  }

  // --- Загрузка настроек + применение прозрачности ---------------------------
  if (isTauri()) {
    try {
      settings = await invoke<Settings>("get_settings");
    } catch {
      settings = DEFAULT_SETTINGS;
    }
  }
  applyOpacity(document.documentElement, settings.window_opacity);

  // --- Баннер разрешения ------------------------------------------------------
  if (isTauri()) {
    try {
      const ok = await invoke<boolean>("capture_available");
      banner.hidden = ok;
    } catch {
      banner.hidden = true;
    }
  }

  // --- События Rust -----------------------------------------------------------
  if (isTauri()) {
    void listen<string>("state-changed", ({ payload }) => {
      switch (payload) {
        case "recording":
          setStatus("recording", "● Запись…");
          break;
        case "transcribing":
          setStatus("transcribing", "Распознаю…");
          break;
        default:
          setStatus("idle", STATUS_DEFAULT);
      }
    });

    void listen<string>("transcript-ready", ({ payload }) => {
      transcript.value = payload; // вложения не трогаем
      if (settings.auto_send) void send();
    });

    void listen<string>("stt-error", ({ payload }) => {
      setStatus("error", payload);
      // retryable-эвристика по тексту ошибки
      retryBtn.hidden = !/перегружен|соединение|VPN|интернет|оборван/i.test(payload);
    });

    void listen<string>("llm-delta", ({ payload }) => {
      answerMd += payload;
      answerEl.innerHTML = renderMarkdown(answerMd);
      answerEl.scrollTop = answerEl.scrollHeight;
    });

    void listen("llm-done", () => streamUi(false));

    void listen<string>("llm-error", ({ payload }) => {
      streamUi(false);
      setStatus("error", payload);
      // Повторная отправка = снова «Отправить» (кнопка уже активна). retry — только для STT.
    });
  } else {
    // Браузерный превью: показываем UI с мок-данными, без invoke/listen.
    mockPreview();
  }

  // --- Мок для визуальной самопроверки в обычном браузере --------------------
  function mockPreview(): void {
    transcript.value =
      "Объясни, чем хвостовая рекурсия отличается от обычной и почему компилятор может её оптимизировать.";
    answerMd = [
      "**Хвостовая рекурсия** — это случай, когда рекурсивный вызов стоит *последней*",
      "операцией функции, и его результат возвращается без дополнительных вычислений.",
      "",
      "- Обычная рекурсия копит кадры стека до базового случая.",
      "- Хвостовая позволяет переиспользовать текущий кадр (TCO).",
      "",
      "```ts",
      "function fact(n: number, acc = 1): number {",
      "  return n <= 1 ? acc : fact(n - 1, acc * n);",
      "}",
      "```",
      "",
      "Так стек не растёт линейно по `n`.",
    ].join("\n");
    answerEl.innerHTML = renderMarkdown(answerMd);
    copyAnswerBtn.hidden = false;
    retryBtn.hidden = false;
  }
}

void main();
