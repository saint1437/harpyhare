import { useQuery } from "@tanstack/react-query";
import { SelectItem } from "@/components/ui/select";
import type { AudioDeviceInfo } from "@/ipc/types";
import { SettingRow, SettingSelect } from "./fields";

const SYSTEM_DEFAULT = "system-default";
const MISSING_DEVICE_LABEL = "Недоступное устройство";
const AUDIO_DEVICES_STALE_MS = 30 * 1000;

// A saved uid that vanished from the device list still renders as a row:
// silently showing the default in the UI would misreport what the backend
// will actually try to use.
function withSavedDevice(devices: AudioDeviceInfo[], savedUid: string): AudioDeviceInfo[] {
  if (savedUid === "" || devices.some((d) => d.uid === savedUid)) return devices;
  return [...devices, { uid: savedUid, name: MISSING_DEVICE_LABEL }];
}

/**
 * One device select for both capture sides — the system output in SttSection
 * and the microphone in AutoModeSection. The two used to be wholesale copies:
 * the "system-default" sentinel, the missing-device fallback and the stale
 * time each lived twice while encoding a single policy ("" = system default,
 * a vanished device stays visible).
 */
export function AudioDeviceRow({
  label,
  hint,
  defaultLabel,
  queryKey,
  listDevices,
  uid,
  onChange,
}: {
  label: string;
  hint: string;
  defaultLabel: string;
  queryKey: readonly unknown[];
  listDevices: () => Promise<AudioDeviceInfo[]>;
  uid: string;
  onChange: (uid: string) => void;
}) {
  const { data } = useQuery({
    queryKey,
    queryFn: listDevices,
    staleTime: AUDIO_DEVICES_STALE_MS,
  });
  const devices = withSavedDevice(data ?? [], uid);
  return (
    <SettingRow label={label} hint={hint}>
      <SettingSelect
        ariaLabel={label}
        value={uid === "" ? SYSTEM_DEFAULT : uid}
        onValueChange={(v) => {
          onChange(v === SYSTEM_DEFAULT ? "" : v);
        }}
      >
        <SelectItem value={SYSTEM_DEFAULT}>{defaultLabel}</SelectItem>
        {devices.map((d) => (
          <SelectItem key={d.uid} value={d.uid}>
            {d.name}
          </SelectItem>
        ))}
      </SettingSelect>
    </SettingRow>
  );
}
