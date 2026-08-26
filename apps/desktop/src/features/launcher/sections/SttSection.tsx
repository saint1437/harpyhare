import { SelectItem } from "@/components/ui/select";
import { SETTINGS_LIMITS } from "@/ipc/bindings";
import { listAudioOutputDevices } from "@/ipc/commands";
import { queryKeys } from "@/lib/query-client";
import { AudioDeviceRow } from "../AudioDeviceRow";
import type { SectionProps } from "../contract";
import { SettingGroup, SettingRow, SettingSelect, SettingSlider, SettingSwitch } from "../fields";

const STT_LANGUAGE_AUTO = "auto";

const STT_LANGUAGES = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: STT_LANGUAGE_AUTO, label: "Автоопределение" },
];

const BUFFER_SECONDS_STEP = 1;

export function SttSection({ draft, set }: SectionProps) {
  return (
    <SettingGroup
      title="Распознавание речи"
      description="Что именно слушает приложение и на каком языке расшифровывает."
    >
      <AudioDeviceRow
        label="Устройство захвата"
        hint="Снимается звук только этого выхода. Что играет в другие устройства — в захват не попадёт."
        defaultLabel="Системный вывод"
        queryKey={queryKeys.audioDevices}
        listDevices={listAudioOutputDevices}
        uid={draft.capture_device_uid}
        onChange={(uid) => {
          set("capture_device_uid", uid);
        }}
      />
      <SettingRow
        label="Язык распознавания"
        hint={
          draft.stt_translate
            ? "При переводе язык определяется автоматически."
            : "Whisper распознаёт точнее, когда язык задан явно."
        }
      >
        <SettingSelect
          ariaLabel="Язык распознавания"
          value={draft.stt_language === "" ? STT_LANGUAGE_AUTO : draft.stt_language}
          disabled={draft.stt_translate}
          onValueChange={(v) => {
            set("stt_language", v === STT_LANGUAGE_AUTO ? "" : v);
          }}
        >
          {STT_LANGUAGES.map((l) => (
            <SelectItem key={l.value} value={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SettingSelect>
      </SettingRow>
      <SettingRow
        label="Перевод на английский"
        hint="Речь на любом языке приходит в чат по-английски."
      >
        <SettingSwitch
          ariaLabel="Перевод на английский"
          checked={draft.stt_translate}
          onCheckedChange={(v) => {
            set("stt_translate", v);
          }}
        />
      </SettingRow>
      <SettingRow label="Фоновый буфер" hint="Подхватывает сказанное за секунды до нажатия записи.">
        <SettingSwitch
          ariaLabel="Фоновый буфер"
          checked={draft.buffer_enabled}
          onCheckedChange={(v) => {
            set("buffer_enabled", v);
          }}
        />
      </SettingRow>
      <SettingRow label="Глубина буфера" hint="Сколько секунд звука держится в памяти.">
        <SettingSlider
          ariaLabel="Глубина буфера"
          value={draft.buffer_seconds}
          min={SETTINGS_LIMITS.bufferSeconds.min}
          max={SETTINGS_LIMITS.bufferSeconds.max}
          step={BUFFER_SECONDS_STEP}
          readout={`${String(draft.buffer_seconds)} с`}
          disabled={!draft.buffer_enabled}
          onChange={(v) => {
            set("buffer_seconds", v);
          }}
        />
      </SettingRow>
    </SettingGroup>
  );
}
