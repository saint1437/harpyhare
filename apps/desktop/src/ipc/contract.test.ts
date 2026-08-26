import { describe, expect, it } from "vitest";
import type { RequestOptions } from "@/lib/chats";
import type { AppError, ErrorCode } from "@/lib/errors";
import type { ModelInfo } from "@/lib/models";
import type { Platform } from "@/lib/platform";
import type { PromptPreset } from "@/lib/presets";
import type * as Rust from "./bindings";
import type { ApiKeyId } from "@/lib/api-keys";
import type {
  HotkeyBinding,
  AudioDeviceInfo,
  AutoTurn,
  ChatMessageDto,
  EventMap,
  QuickAction,
  RecorderState,
  SecretsStatus,
  Settings,
  UpdateInfo,
} from "./types";

type Loosened<T> = { [K in keyof T]-?: Exclude<T[K], null> };

type SameKeys<Ours, Generated> = [keyof Ours] extends [keyof Generated]
  ? [keyof Generated] extends [keyof Ours]
    ? true
    : never
  : never;

type SameShape<Ours, Generated> = [Ours] extends [Generated]
  ? [Loosened<Generated>] extends [Ours]
    ? SameKeys<Ours, Generated>
    : never
  : never;

/**
 * For the pairs where our side is deliberately NARROWER than what specta can
 * express — a Rust `String` we know is one of two words, a `u8` we know is a
 * direction. `SameShape` cannot hold there, and the pairs used to be left with
 * no assertion at all: `ChatMessageDto` crossed the boundary unchecked, and
 * `resize-key` was checked only on `dim`. This still catches everything that
 * actually breaks — a field added, removed or retyped on the Rust side.
 */
type Narrows<Ours, Generated> = [Ours] extends [Generated] ? SameKeys<Ours, Generated> : never;

const contract = {
  Settings: true satisfies SameShape<Settings, Rust.Settings>,
  SecretsStatus: true satisfies SameShape<SecretsStatus, Rust.SecretsStatus>,
  // `ApiKeyId` names the two keys for the whole frontend (the registry in
  // `lib/api-keys`, the search index, the settings rows) while `ApiKeyKind` is
  // what `set_api_key`/`clear_api_key` take. Let them drift and one half of the
  // app would offer a key the command cannot write.
  ApiKeyKind: true satisfies SameShape<ApiKeyId, Rust.ApiKeyKind>,
  AudioDeviceInfo: true satisfies SameShape<AudioDeviceInfo, Rust.AudioDeviceInfo>,
  UpdateInfo: true satisfies SameShape<UpdateInfo, Rust.UpdateInfo>,
  RecorderState: true satisfies SameShape<RecorderState, Rust.RecorderState>,
  PromptPreset: true satisfies SameShape<PromptPreset, Rust.PromptPreset>,
  AppError: true satisfies SameShape<AppError, Rust.AppError>,
  // The two lists of codes are one vocabulary. `lib/errors` writes it out as a
  // tuple so the dictionary's records can be exhaustive over it; that tuple is
  // exactly what would drift from Rust without this line.
  ErrorCode: true satisfies SameShape<ErrorCode, Rust.ErrorCode>,
  ModelInfo: true satisfies SameShape<ModelInfo, Rust.ModelInfo>,
  RequestOptions: true satisfies SameShape<RequestOptions, Rust.RequestOptions>,
  LlmDelta: true satisfies SameShape<EventMap["llm-delta"], Rust.LlmDelta>,
  LlmDone: true satisfies SameShape<EventMap["llm-done"], Rust.LlmDone>,
  LlmUsage: true satisfies SameShape<EventMap["llm-usage"], Rust.LlmUsage>,
  LlmErrorEvent: true satisfies SameShape<EventMap["llm-error"], Rust.LlmErrorEvent>,
  ResizeDim: true satisfies SameShape<EventMap["resize-key"]["dim"], Rust.ResizeDim>,
  ResizeKeyPayload: true satisfies Narrows<EventMap["resize-key"], Rust.ResizeKeyPayload>,
  ChatMessageDto: true satisfies Narrows<ChatMessageDto, Rust.ChatMessage>,
  UpdateProgress: true satisfies SameShape<EventMap["update-progress"], Rust.UpdateProgress>,
  UpdateDone: true satisfies SameShape<EventMap["update-done"], Rust.UpdateDone>,
  ScreenshotReady: true satisfies SameShape<EventMap["screenshot-ready"], Rust.ScreenshotReady>,
  AutoTurn: true satisfies SameShape<AutoTurn, Rust.AutoTurnPayload>,
  Speaker: true satisfies SameShape<AutoTurn["speaker"], Rust.Speaker>,
  AutoModeChanged: true satisfies SameShape<EventMap["auto-mode-changed"], Rust.AutoModeChanged>,
  CollapsedChanged: true satisfies SameShape<EventMap["collapsed-changed"], Rust.CollapsedChanged>,
  AudioLevel: true satisfies SameShape<EventMap["audio-level"], Rust.AudioLevel>,
  HotkeyBinding: true satisfies SameShape<HotkeyBinding, Rust.HotkeyBinding>,
  QuickAction: true satisfies SameShape<QuickAction, Rust.QuickAction>,
  PlatformCombo: true satisfies SameShape<Record<Platform, string>, Rust.PlatformCombo>,
};

describe("рукописные типы IPC против сгенерированных из Rust", () => {
  it("совпадают по форме — иначе tsc не соберёт этот файл", () => {
    expect(Object.values(contract).every(Boolean)).toBe(true);
  });
});
