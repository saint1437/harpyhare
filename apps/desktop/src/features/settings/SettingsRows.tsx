import { useQuery } from "@tanstack/react-query";
import { SelectItem } from "@/components/ui/select";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";
import type { ReadoutKey } from "@/i18n/settings-types";
import type { Dictionary } from "@/i18n/types";
import { listAudioInputDevices, listAudioOutputDevices } from "@/ipc/commands";
import type { AudioDeviceInfo, Settings } from "@/ipc/types";
import { queryKeys } from "@/lib/query-client";
import type { SetSetting } from "./contract";
import { SettingGroup, SettingRow, SettingSelect, SettingSlider, SettingSwitch } from "./fields";
import {
  settingsEntriesInGroup,
  settingsGroupsForTab,
  type SelectOption,
  type SettingsEntry,
  type SettingsGroupMeta,
} from "./settings-registry";
import type { SettingsTabId } from "./settings-tabs";

const SYSTEM_DEFAULT = "system-default";
const AUDIO_DEVICES_STALE_MS = 30 * 1000;
const PERCENT_SCALE = 100;

/**
 * The readout is a unit, and the unit is the half that differs between locales
 * — «40 с» against "40 s". The registry names which unit; the number is shaped
 * here, where the one non-linear case (opacity is a fraction on disk and a
 * percentage on screen) already lives.
 */
function readout(kind: ReadoutKey, value: number, dict: Dictionary): string {
  const shown = kind === "percent" ? String(Math.round(value * PERCENT_SCALE)) : String(value);
  return format(dict.settings.readouts[kind], { value: shown });
}

function optionLabel(option: SelectOption, dict: Dictionary): string {
  return option.label ?? dict.settings.optionLabels[option.labelKey];
}

const DEVICE_SOURCES = {
  output: { queryKey: queryKeys.audioDevices, list: listAudioOutputDevices },
  input: { queryKey: queryKeys.audioInputDevices, list: listAudioInputDevices },
};

// A saved uid that vanished from the device list still renders as a row:
// silently showing the default in the UI would misreport what the backend
// will actually try to use.
function withSavedDevice(
  devices: AudioDeviceInfo[],
  savedUid: string,
  missingLabel: string,
): AudioDeviceInfo[] {
  if (savedUid === "" || devices.some((d) => d.uid === savedUid)) return devices;
  return [...devices, { uid: savedUid, name: missingLabel }];
}

function DeviceSelect({
  label,
  defaultLabel,
  source,
  uid,
  onChange,
}: {
  label: string;
  defaultLabel: string;
  source: "output" | "input";
  uid: string;
  onChange: (uid: string) => void;
}) {
  const dict = useDict();
  const { queryKey, list } = DEVICE_SOURCES[source];
  const { data } = useQuery({ queryKey, queryFn: list, staleTime: AUDIO_DEVICES_STALE_MS });
  const devices = withSavedDevice(data ?? [], uid, dict.settings.devices.missing);
  return (
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
  );
}

/**
 * One registry entry, rendered. Every control names itself with the entry's
 * label, so the row on screen and the row in the search index cannot say
 * different things.
 */
export function SettingEntryRow({
  entry,
  draft,
  set,
}: {
  entry: SettingsEntry;
  draft: Settings;
  set: SetSetting;
}) {
  const dict = useDict();
  const { label, hint: entryHint } = dict.settings.entries[entry.id];
  const field = entry.field;

  if (field.kind === "switch") {
    return (
      <SettingRow label={label} hint={entryHint}>
        <SettingSwitch
          ariaLabel={label}
          checked={draft[field.key]}
          onCheckedChange={(v) => {
            set(field.key, v);
          }}
        />
      </SettingRow>
    );
  }

  if (field.kind === "slider") {
    const enabled = field.enabledBy === undefined || draft[field.enabledBy];
    return (
      <SettingRow label={label} hint={entryHint}>
        <SettingSlider
          ariaLabel={label}
          value={draft[field.key]}
          min={field.limits.min}
          max={field.limits.max}
          step={field.step}
          readout={readout(field.readout, draft[field.key], dict)}
          disabled={!enabled}
          onChange={(v) => {
            set(field.key, v);
          }}
        />
      </SettingRow>
    );
  }

  if (field.kind === "device") {
    return (
      <SettingRow label={label} hint={entryHint}>
        <DeviceSelect
          label={label}
          defaultLabel={dict.settings.devices[field.defaultLabel]}
          source={field.source}
          uid={draft[field.key]}
          onChange={(uid) => {
            set(field.key, uid);
          }}
        />
      </SettingRow>
    );
  }

  const stored = draft[field.key];
  const disabled = field.disabledBy !== undefined && draft[field.disabledBy];
  const hint =
    disabled && field.disabledHint !== undefined
      ? dict.settings.disabledHints[field.disabledHint]
      : entryHint;
  return (
    <SettingRow label={label} hint={hint}>
      <SettingSelect
        ariaLabel={label}
        value={stored === "" && field.emptyValue !== undefined ? field.emptyValue : stored}
        disabled={disabled}
        onValueChange={(v) => {
          set(field.key, v === field.emptyValue ? "" : v);
          field.apply?.(v);
        }}
      >
        {field.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {optionLabel(option, dict)}
          </SelectItem>
        ))}
      </SettingSelect>
    </SettingRow>
  );
}

function SettingsGroupCard({
  group,
  draft,
  set,
}: {
  group: SettingsGroupMeta;
  draft: Settings;
  set: SetSetting;
}) {
  const copy = useDict().settings.groups[group.id];
  return (
    <SettingGroup title={copy.title} description={copy.description}>
      {settingsEntriesInGroup(group.id).map((entry) => (
        <SettingEntryRow key={entry.id} entry={entry} draft={draft} set={set} />
      ))}
    </SettingGroup>
  );
}

/**
 * A settings tab IS its registry groups — the four hand-written sections
 * (speech, auto mode, behaviour, appearance) were exactly this loop plus a
 * second copy of every label.
 */
export function SettingsGroupsForTab({
  tab,
  draft,
  set,
}: {
  tab: SettingsTabId;
  draft: Settings;
  set: SetSetting;
}) {
  return (
    <>
      {settingsGroupsForTab(tab).map((group) => (
        <SettingsGroupCard key={group.id} group={group} draft={draft} set={set} />
      ))}
    </>
  );
}
