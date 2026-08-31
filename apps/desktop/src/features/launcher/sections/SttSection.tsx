import { useQuery } from "@tanstack/react-query";
import { SelectItem } from "@/components/ui/select";
import { SETTINGS_LIMITS } from "@/ipc/bindings";
import { listAudioOutputDevices } from "@/ipc/commands";
import type { AudioOutputDevice } from "@/ipc/types";
import { queryKeys } from "@/lib/query-client";
import { STT_PROVIDERS, sttProviderSupportsTranslate } from "@/lib/stt-providers";
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

const CAPTURE_DEVICE_SYSTEM_DEFAULT = "system-default";
const CAPTURE_DEVICE_MISSING_LABEL = "Недоступное устройство";
const BUFFER_SECONDS_STEP = 1;

const AUDIO_DEVICES_STALE_MS = 30 * 1000;

function useAudioOutputDevices(): AudioOutputDevice[] {
  const { data } = useQuery({
    queryKey: queryKeys.audioDevices,
    queryFn: listAudioOutputDevices,
    staleTime: AUDIO_DEVICES_STALE_MS,
  });
  return data ?? [];
}

function withSavedDevice(devices: AudioOutputDevice[], savedUid: string): AudioOutputDevice[] {
  if (savedUid === "" || devices.some((d) => d.uid === savedUid)) return devices;
  return [...devices, { uid: savedUid, name: CAPTURE_DEVICE_MISSING_LABEL }];
}

function CaptureDeviceRow({ draft, set }: SectionProps) {
  const devices = withSavedDevice(useAudioOutputDevices(), draft.capture_device_uid);
  return (
    <SettingRow label="Устройство захвата" hint="Звук снимается с того выхода, который слышите вы.">
      <SettingSelect
        ariaLabel="Устройство захвата"
        value={
          draft.capture_device_uid === "" ? CAPTURE_DEVICE_SYSTEM_DEFAULT : draft.capture_device_uid
        }
        onValueChange={(v) => {
          set("capture_device_uid", v === CAPTURE_DEVICE_SYSTEM_DEFAULT ? "" : v);
        }}
      >
        <SelectItem value={CAPTURE_DEVICE_SYSTEM_DEFAULT}>Системный вывод</SelectItem>
        {devices.map((d) => (
          <SelectItem key={d.uid} value={d.uid}>
            {d.name}
          </SelectItem>
        ))}
      </SettingSelect>
    </SettingRow>
  );
}

export function SttSection({ draft, set }: SectionProps) {
  const translateAvailable = sttProviderSupportsTranslate(draft.stt_provider);
  const translatingNow = draft.stt_translate && translateAvailable;
  return (
    <SettingGroup
      title="Распознавание речи"
      description="Что именно слушает приложение и на каком языке расшифровывает."
    >
      <CaptureDeviceRow draft={draft} set={set} />
      <SettingRow
        label="Провайдер распознавания"
        hint="OpenAI точнее удерживает английские термины в русской речи."
      >
        <SettingSelect
          ariaLabel="Провайдер распознавания"
          value={draft.stt_provider}
          onValueChange={(v) => {
            set("stt_provider", v);
          }}
        >
          {STT_PROVIDERS.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
        </SettingSelect>
      </SettingRow>
      <SettingRow
        label="Язык распознавания"
        hint={
          translatingNow
            ? "При переводе язык определяется автоматически."
            : "Распознавание точнее, когда язык задан явно."
        }
      >
        <SettingSelect
          ariaLabel="Язык распознавания"
          value={draft.stt_language === "" ? STT_LANGUAGE_AUTO : draft.stt_language}
          disabled={translatingNow}
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
        hint={
          translateAvailable
            ? "Речь на любом языке приходит в чат по-английски."
            : "Выбранный провайдер не умеет переводить — выбери другого."
        }
      >
        <SettingSwitch
          ariaLabel="Перевод на английский"
          checked={draft.stt_translate && translateAvailable}
          disabled={!translateAvailable}
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
