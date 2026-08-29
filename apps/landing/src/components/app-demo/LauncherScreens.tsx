import {
  ArrowRight,
  AudioLines,
  Check,
  FileText,
  Folder,
  FolderPlus,
  KeyRound,
  Mic,
  Monitor,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { StartStepCopy, StateTone } from "@/i18n/demo-types";
import { cn } from "@/lib/cn";
import { format } from "@/lib/format";
import { useCopy } from "./copy";
import { AppButton, SettingGroup, StateBadge, SURFACE_CARD } from "./ui";

const STEP_ICONS: Record<StartStepCopy["id"], LucideIcon> = {
  access: KeyRound,
  audio: AudioLines,
  microphone: Mic,
};

const PERMISSION_ICONS = {
  audio: AudioLines,
  microphone: Mic,
  screen: Monitor,
} as const;

/**
 * The Start screen, which the demo did not have at all — it opened on Settings.
 *
 * This is the app's actual first screen and its whole argument: everything that
 * can be set up in advance already is, and what is left is a short list you can
 * finish. A demo that opens on a wall of sliders makes the opposite case.
 */
export function StartScreen({ recordCombo }: { recordCombo: string }) {
  const copy = useCopy().launcher.start;
  const states = useCopy().launcher.states;
  const [checked, setChecked] = useState<Record<string, "idle" | "running" | "done">>({});

  return (
    <>
      <SettingGroup title={copy.stepsTitle} description={copy.summaryReady}>
        {copy.steps.map((step) => {
          const Icon = STEP_ICONS[step.id];
          return (
            <div
              key={step.id}
              role="group"
              aria-label={step.title}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 px-3 py-2.5"
            >
              <Check className="mt-0.5 size-4.5 text-app-success" aria-hidden />
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-x-2">
                  <Icon className="size-3.5 text-app-subtle" aria-hidden />
                  <span className="text-app-body text-app-fg">{step.title}</span>
                  <StateBadge tone="success" label={states.done} />
                </div>
                <p className="text-app-caption text-app-subtle">{step.hint}</p>
              </div>
            </div>
          );
        })}
      </SettingGroup>

      <SettingGroup title={copy.audioCheck.title} description={copy.audioCheck.description}>
        {copy.audioCheck.sources.map((source) => {
          const state = checked[source.id] ?? "idle";
          const hint =
            state === "done"
              ? format(copy.audioCheck.heard, { text: copy.audioCheck.heardText })
              : source.hint;
          return (
            <div
              key={source.id}
              className="grid min-h-9 grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-4 px-3 py-2.5"
            >
              <div className="min-w-0">
                <span className="text-app-body text-app-fg">{source.label}</span>
                <p className="mt-0.5 text-app-caption text-app-subtle">{hint}</p>
              </div>
              <div className="flex items-center justify-end gap-2">
                {state === "running" && (
                  <span
                    className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-app-code"
                    aria-hidden
                  >
                    <span className="block h-full w-2/3 rounded-full bg-app-recording" />
                  </span>
                )}
                <AppButton
                  variant="outline"
                  size="sm"
                  className="min-w-22"
                  disabled={state === "running"}
                  onClick={() => {
                    setChecked((prev) => ({ ...prev, [source.id]: "running" }));
                    window.setTimeout(() => {
                      setChecked((prev) => ({ ...prev, [source.id]: "done" }));
                    }, 1400);
                  }}
                >
                  {state === "running" ? copy.audioCheck.running : copy.audioCheck.run}
                </AppButton>
              </div>
            </div>
          );
        })}
      </SettingGroup>

      <SettingGroup title={copy.usageTitle}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
          <span className="rounded-md bg-app-code px-2 py-1 font-mono text-app-body font-semibold text-app-fg">
            {recordCombo}
          </span>
          <span className="min-w-40 flex-1 text-app-body text-app-muted">
            {useCopy().hud.answer.emptyHint}
          </span>
        </div>
        <p className="px-3 py-2.5 text-app-caption text-app-subtle">{copy.usageNote}</p>
      </SettingGroup>

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-3 py-2.5",
          SURFACE_CARD,
        )}
      >
        <p className="min-w-40 flex-1 text-app-caption text-app-subtle">{copy.defaultsNote}</p>
      </div>
    </>
  );
}

export function ContextsScreen() {
  const copy = useCopy().launcher.contexts;
  const [selected, setSelected] = useState<string[]>(["jd", "cv"]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-app-caption text-app-subtle">
          {format(copy.summary, { docs: copy.docs.length, folders: copy.folders.length })}
        </span>
        <div className="flex items-center gap-1.5">
          <AppButton variant="ghost" size="compact">
            <Plus />
            {copy.addDoc}
          </AppButton>
          <AppButton variant="ghost" size="compact">
            <FolderPlus />
            {copy.addFolder}
          </AppButton>
          <AppButton variant="ghost" size="compact">
            <Upload />
            {copy.import}
          </AppButton>
        </div>
      </div>

      {copy.folders.map((folder) => (
        <section key={folder} className={cn("flex flex-col gap-1 p-2", SURFACE_CARD)}>
          <header className="flex items-center gap-2 px-1.5 py-1">
            <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-app-surface">
              <Folder className="size-3.5 text-app-subtle" aria-hidden />
            </span>
            <span className="min-w-0 truncate text-app-body text-app-fg">{folder}</span>
          </header>
          {copy.docs
            .filter((doc) => doc.folder === folder)
            .map((doc) => {
              const isOn = selected.includes(doc.id);
              return (
                <div
                  key={doc.id}
                  className="group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-app-card"
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isOn}
                    aria-label={doc.name}
                    onClick={() => {
                      setSelected((prev) =>
                        isOn ? prev.filter((id) => id !== doc.id) : [...prev, doc.id],
                      );
                    }}
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-sm ring-1 ring-app-border-strong transition-colors outline-none ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid",
                      isOn && "bg-app-primary ring-app-primary",
                    )}
                  >
                    <Check
                      className={cn("size-3 text-app-primary-fg", !isOn && "opacity-0")}
                      aria-hidden
                    />
                  </button>
                  <FileText className="size-3.5 shrink-0 text-app-subtle" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-app-body text-app-fg">
                    {doc.name}
                  </span>
                  <span className="shrink-0 font-mono text-app-hint text-app-subtle tabular-nums">
                    {doc.size}
                  </span>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <AppButton
                      variant="ghost"
                      size="icon-xs"
                      title={copy.edit}
                      aria-label={copy.edit}
                    >
                      <Pencil />
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="icon-xs"
                      title={copy.remove}
                      aria-label={copy.remove}
                      className="hover:text-app-destructive"
                    >
                      <Trash2 />
                    </AppButton>
                  </div>
                </div>
              );
            })}
        </section>
      ))}
    </>
  );
}

export function PresetsScreen() {
  const copy = useCopy().launcher.presets;
  const [active, setActive] = useState(0);

  return (
    <>
      <SettingGroup title={copy.ownTitle} description={copy.ownDescription}>
        {copy.items.map((preset, index) => (
          <div
            key={preset.name}
            className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 transition-colors hover:bg-app-card/50"
          >
            <button
              type="button"
              onClick={() => {
                setActive(index);
              }}
              className={cn(
                "min-w-0 rounded-md px-1 py-0.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid",
                index === active && "ring-1 ring-app-primary-mark ring-inset",
              )}
            >
              <span className="block truncate text-app-body text-app-fg">{preset.name}</span>
              <span className="block truncate text-app-caption text-app-subtle">
                {format(copy.length, { count: preset.text.length })}
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              <AppButton variant="ghost" size="icon-xs" title={copy.edit} aria-label={copy.edit}>
                <Pencil />
              </AppButton>
              <AppButton
                variant="ghost"
                size="icon-xs"
                title={copy.remove}
                aria-label={copy.remove}
                className="hover:text-app-destructive"
              >
                <Trash2 />
              </AppButton>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3 px-3 py-2">
          <AppButton variant="ghost" size="sm">
            <Plus />
            {copy.add}
          </AppButton>
        </div>
      </SettingGroup>

      <SettingGroup title={copy.builtInTitle} description={copy.builtInDescription}>
        <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
          {copy.builtIn.map((name) => (
            <span
              key={name}
              className="rounded-md bg-app-code px-2 py-1 text-app-caption text-app-muted ring-1 ring-app-border ring-inset"
            >
              {name}
            </span>
          ))}
        </div>
      </SettingGroup>
    </>
  );
}

const PERMISSION_TONE: Record<"granted" | "denied" | "unknown", StateTone> = {
  granted: "success",
  denied: "danger",
  unknown: "warning",
};

export function PermissionsScreen() {
  const copy = useCopy().launcher.permissions;
  const [granted, setGranted] = useState<string[]>(
    copy.items.filter((item) => item.granted).map((item) => item.id),
  );

  return (
    <SettingGroup title={copy.title} description={copy.description}>
      {copy.items.map((item) => {
        const Icon = PERMISSION_ICONS[item.id];
        const isOn = granted.includes(item.id);
        const state = isOn ? "granted" : "unknown";
        return (
          <div
            key={item.id}
            role="group"
            aria-label={item.label}
            className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-3 px-3 py-2.5 min-[640px]:grid-cols-[1.25rem_minmax(0,1fr)_11rem]"
          >
            <Icon
              className={cn("size-4.5", isOn ? "text-app-fg" : "text-app-subtle")}
              aria-hidden
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="text-app-body text-app-fg">{item.label}</span>
                <StateBadge tone={PERMISSION_TONE[state]} label={copy.states[state]} />
                <span className="text-app-hint text-app-subtle/80">{item.need}</span>
              </div>
              <p className="text-app-caption text-app-subtle">{item.purpose}</p>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              {!isOn && (
                <>
                  <AppButton variant="ghost" size="sm">
                    {copy.openSettings}
                  </AppButton>
                  <AppButton
                    size="sm"
                    className="min-w-18"
                    onClick={() => {
                      setGranted((prev) => [...prev, item.id]);
                    }}
                  >
                    {copy.grant}
                  </AppButton>
                </>
              )}
            </div>
          </div>
        );
      })}
    </SettingGroup>
  );
}

export function UpdatesScreen() {
  const dict = useCopy();
  const copy = dict.launcher.updates;
  const [state, setState] = useState<"idle" | "checking" | "latest">("idle");

  return (
    <>
      <SettingGroup title={copy.versionTitle} description={copy.versionDescription}>
        <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-4 px-3 py-2">
          <div className="min-w-0">
            <span className="font-mono text-app-body text-app-fg">
              {dict.launcher.wordmark} {dict.version}
            </span>
            <p className="mt-0.5 text-app-caption text-app-subtle">
              {state === "latest" ? copy.upToDate : copy.autoCheckNote}
            </p>
          </div>
          <div className="flex items-center justify-end">
            <AppButton
              variant="outline"
              size="sm"
              disabled={state === "checking"}
              onClick={() => {
                setState("checking");
                window.setTimeout(() => {
                  setState("latest");
                }, 900);
              }}
            >
              {copy.check}
            </AppButton>
          </div>
        </div>
      </SettingGroup>

      <SettingGroup title={copy.notesLabel}>
        <ul className="flex flex-col gap-2 px-3 py-2.5">
          {copy.notes.map((note) => (
            <li key={note} className="flex gap-2.5 text-app-caption text-app-muted">
              <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-app-subtle" aria-hidden />
              <span className="min-w-0">{note}</span>
            </li>
          ))}
        </ul>
      </SettingGroup>
    </>
  );
}
