import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { SETTINGS_LIMITS } from "@/ipc/bindings";
import { listAudioOutputDevices } from "@/ipc/commands";
import type { AudioOutputDevice } from "@/ipc/types";
import { queryKeys } from "@/lib/query-client";
import type { SectionProps } from "../contract";
import { Field, SelectField, SwitchRow } from "../fields";

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

function CaptureDeviceField({ draft, set }: SectionProps) {
  const available = useAudioOutputDevices();
  const devices = withSavedDevice(available, draft.capture_device_uid);
  return (
    <SelectField
      label="Устройство захвата звука"
      value={
        draft.capture_device_uid === "" ? CAPTURE_DEVICE_SYSTEM_DEFAULT : draft.capture_device_uid
      }
      onValueChange={(v) => {
        set("capture_device_uid", v === CAPTURE_DEVICE_SYSTEM_DEFAULT ? "" : v);
      }}
    >
      <SelectItem value={CAPTURE_DEVICE_SYSTEM_DEFAULT}>
        Системный вывод (следует за настройками macOS)
      </SelectItem>
      {devices.map((d) => (
        <SelectItem key={d.uid} value={d.uid}>
          {d.name}
        </SelectItem>
      ))}
    </SelectField>
  );
}

export function SttSection({ draft, set }: SectionProps) {
  return (
    <>
      <CaptureDeviceField draft={draft} set={set} />
      <SelectField
        label="Язык распознавания"
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
      </SelectField>
      <SwitchRow
        checked={draft.stt_translate}
        onCheckedChange={(v) => {
          set("stt_translate", v);
        }}
      >
        Переводить речь на английский (язык исходника — любой)
      </SwitchRow>
      <SwitchRow
        checked={draft.buffer_enabled}
        onCheckedChange={(v) => {
          set("buffer_enabled", v);
        }}
      >
        Фоновый буфер: подхватывать последние секунды до нажатия записи
      </SwitchRow>
      <Field label="Глубина буфера, секунд">
        <Input
          type="number"
          min={SETTINGS_LIMITS.bufferSeconds.min}
          max={SETTINGS_LIMITS.bufferSeconds.max}
          disabled={!draft.buffer_enabled}
          value={draft.buffer_seconds}
          onChange={(e) => {
            set("buffer_seconds", Number(e.target.value));
          }}
        />
      </Field>
    </>
  );
}
