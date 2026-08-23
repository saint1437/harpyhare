import { useQuery } from "@tanstack/react-query";
import { SelectItem } from "@/components/ui/select";
import { SETTINGS_LIMITS } from "@/ipc/bindings";
import { listAudioInputDevices } from "@/ipc/commands";
import type { AudioDeviceInfo } from "@/ipc/types";
import { queryKeys } from "@/lib/query-client";
import type { SectionProps } from "../contract";
import { SettingGroup, SettingRow, SettingSelect, SettingSlider, SettingSwitch } from "../fields";

const MIC_SYSTEM_DEFAULT = "system-default";
const MIC_MISSING_LABEL = "Недоступное устройство";
const AUDIO_DEVICES_STALE_MS = 30 * 1000;

const SILENCE_STEP_MS = 50;
const MIN_UTTERANCE_STEP_MS = 50;
const MAX_UTTERANCE_STEP_SECS = 5;

function useAudioInputDevices(): AudioDeviceInfo[] {
  const { data } = useQuery({
    queryKey: queryKeys.audioInputDevices,
    queryFn: listAudioInputDevices,
    staleTime: AUDIO_DEVICES_STALE_MS,
  });
  return data ?? [];
}

function withSavedDevice(devices: AudioDeviceInfo[], savedUid: string): AudioDeviceInfo[] {
  if (savedUid === "" || devices.some((d) => d.uid === savedUid)) return devices;
  return [...devices, { uid: savedUid, name: MIC_MISSING_LABEL }];
}

function MicrophoneRow({ draft, set }: SectionProps) {
  const devices = withSavedDevice(useAudioInputDevices(), draft.auto_mic_device_uid);
  return (
    <SettingRow label="Микрофон" hint="С него берётся ваша речь — вторая сторона разговора.">
      <SettingSelect
        ariaLabel="Микрофон"
        value={draft.auto_mic_device_uid === "" ? MIC_SYSTEM_DEFAULT : draft.auto_mic_device_uid}
        onValueChange={(v) => {
          set("auto_mic_device_uid", v === MIC_SYSTEM_DEFAULT ? "" : v);
        }}
      >
        <SelectItem value={MIC_SYSTEM_DEFAULT}>Системный микрофон</SelectItem>
        {devices.map((d) => (
          <SelectItem key={d.uid} value={d.uid}>
            {d.name}
          </SelectItem>
        ))}
      </SettingSelect>
    </SettingRow>
  );
}

export function AutoModeSection({ draft, set }: SectionProps) {
  return (
    <SettingGroup
      title="Автослушание"
      description="Слушает обе стороны разговора и отвечает на реплики собеседника без нажатий."
    >
      <SettingRow
        label="Включать при запуске"
        hint="Иначе включается кнопкой в шапке окна или сочетанием клавиш."
      >
        <SettingSwitch
          ariaLabel="Включать при запуске"
          checked={draft.auto_mode_enabled}
          onCheckedChange={(v) => {
            set("auto_mode_enabled", v);
          }}
        />
      </SettingRow>
      <MicrophoneRow draft={draft} set={set} />
      <SettingRow label="Пауза до конца реплики" hint="Столько тишины считается концом фразы.">
        <SettingSlider
          ariaLabel="Пауза до конца реплики"
          value={draft.auto_silence_ms}
          min={SETTINGS_LIMITS.autoSilenceMs.min}
          max={SETTINGS_LIMITS.autoSilenceMs.max}
          step={SILENCE_STEP_MS}
          readout={`${String(draft.auto_silence_ms)} мс`}
          onChange={(v) => {
            set("auto_silence_ms", v);
          }}
        />
      </SettingRow>
      <SettingRow label="Минимальная реплика" hint="Всё короче считается шумом и не распознаётся.">
        <SettingSlider
          ariaLabel="Минимальная реплика"
          value={draft.auto_min_utterance_ms}
          min={SETTINGS_LIMITS.autoMinUtteranceMs.min}
          max={SETTINGS_LIMITS.autoMinUtteranceMs.max}
          step={MIN_UTTERANCE_STEP_MS}
          readout={`${String(draft.auto_min_utterance_ms)} мс`}
          onChange={(v) => {
            set("auto_min_utterance_ms", v);
          }}
        />
      </SettingRow>
      <SettingRow label="Максимальная реплика" hint="Монолог длиннее режется на части.">
        <SettingSlider
          ariaLabel="Максимальная реплика"
          value={draft.auto_max_utterance_secs}
          min={SETTINGS_LIMITS.autoMaxUtteranceSecs.min}
          max={SETTINGS_LIMITS.autoMaxUtteranceSecs.max}
          step={MAX_UTTERANCE_STEP_SECS}
          readout={`${String(draft.auto_max_utterance_secs)} с`}
          onChange={(v) => {
            set("auto_max_utterance_secs", v);
          }}
        />
      </SettingRow>
    </SettingGroup>
  );
}
