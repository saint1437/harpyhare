"use client";

import { Mic, TriangleAlert, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoCopy, VoicePrompt } from "@/i18n/demo-types";
import { cn } from "@/lib/cn";
import { format } from "@/lib/format";
import { DemoCopyProvider } from "./copy";
import { HudWindow } from "./HudWindow";
import { LauncherWindow } from "./LauncherWindow";
import { Orb } from "./Orb";
import type { AppDepth } from "./types";
import { useDemoHotkeys } from "./useDemoHotkeys";
import { useDemoRun } from "./useDemoRun";

/** Demo-only: the beat between pressing Launch and the HUD existing. */
const LAUNCH_MS = 800;
/** `RESIZE_TWEEN_STEPS × RESIZE_TWEEN_FRAME_INTERVAL` = 14 × 13ms in the app. */
const COLLAPSE_TWEEN_MS = 182;

export function AppDemo({ copy }: { copy: DemoCopy }) {
  const run = useDemoRun(copy);
  const [inHud, setInHud] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [depth, setDepth] = useState<AppDepth>("black");
  const [focusToken, setFocusToken] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef(0);

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
    },
    [],
  );

  const focusPrompt = useCallback(() => {
    setFocusToken((value) => value + 1);
  }, []);

  useDemoHotkeys({
    frameRef,
    enabled: inHud,
    run,
    quickActionPrompts: copy.launcher.settings.quickActions.items.map((item) => item.prompt),
    onFocusPrompt: focusPrompt,
  });

  const launch = () => {
    setLaunching(true);
    timerRef.current = window.setTimeout(() => {
      setLaunching(false);
      setInHud(true);
      frameRef.current?.focus();
    }, LAUNCH_MS);
  };

  /** The `Square` button: `stop_main_window` destroys the HUD and brings the launcher back. */
  const backToLauncher = () => {
    clearTimeout(timerRef.current);
    run.setCollapsed(false);
    run.setPreviewOpen(false);
    setInHud(false);
  };

  const ask = (prompt: VoicePrompt) => {
    clearTimeout(timerRef.current);
    setLaunching(false);
    setInHud(true);
    run.setCollapsed(false);
    run.askByVoice(prompt);
    frameRef.current?.focus();
  };

  const recordCombo = copy.hotkeys.find((hotkey) => hotkey.id === "record")?.combo ?? "";
  const keyCombos = ["record", "toggle_window", "send", "cancel_recording"]
    .map((id) => copy.hotkeys.find((hotkey) => hotkey.id === id)?.combo ?? "")
    .filter((combo) => combo !== "")
    .join(" · ");

  return (
    <DemoCopyProvider copy={copy}>
      <div className="fade-rise relative mx-auto mt-10 w-full sm:mt-12">
        <div
          ref={frameRef}
          tabIndex={0}
          role="group"
          aria-label={copy.frameLabel}
          onPointerDown={() => {
            // Clicking a plain surface focuses nothing, so a visitor who clicked
            // "into" the window would find the keys dead. Take focus onto the
            // frame only when it is not already inside it: the browser's own
            // focus of a button or the textarea lands afterwards and wins.
            const frame = frameRef.current;
            if (frame !== null && !frame.contains(document.activeElement)) frame.focus();
          }}
          data-app-theme={depth}
          className="app-window app-desktop shadow-poster sm:shadow-poster-lg relative overflow-hidden border-2 border-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid"
        >
          <div className="relative h-[440px] sm:h-[560px] lg:h-[640px]">
            {inHud ? (
              <div
                /* Only `transform` is tweened: `transition-all` used to animate
                   `inset`/`top`/`left`/`width`/`height` as well, which is layout
                   on every frame of the tween — and it never animated cleanly
                   anyway, since `width`/`right` go to `auto` in the collapsed
                   state and `auto` is not interpolable, so those four flipped
                   discretely half-way through regardless. */
                className={cn(
                  "absolute transition-[transform,opacity] ease-out",
                  run.collapsed
                    ? "top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2"
                    : "inset-1.5 sm:inset-2",
                )}
                style={{ transitionDuration: `${String(COLLAPSE_TWEEN_MS)}ms` }}
              >
                {run.collapsed ? (
                  <Orb
                    state={run.orb}
                    onExpand={() => {
                      run.setCollapsed(false);
                    }}
                  />
                ) : (
                  <div
                    className="app-hud-shell h-full overflow-hidden rounded-[18px] text-app-fg shadow-xl ring-1 ring-app-border ring-inset"
                    style={
                      {
                        "--app-opacity": String(
                          (typeof run.settings["window_opacity"] === "number"
                            ? run.settings["window_opacity"]
                            : 90) / 100,
                        ),
                      } as React.CSSProperties
                    }
                  >
                    <HudWindow
                      run={run}
                      focusToken={focusToken}
                      onStop={backToLauncher}
                      onQuit={backToLauncher}
                    />
                  </div>
                )}
              </div>
            ) : (
              <LauncherWindow
                launching={launching}
                recordCombo={recordCombo}
                settings={run.settings}
                onLaunch={launch}
                onSetting={run.setSetting}
              />
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-display text-[9.5px] font-medium tracking-[0.1em] text-fg-subtle uppercase">
            <Mic className="size-3.5" aria-hidden />
            {copy.ask}
          </span>
          {copy.prompts.map((prompt) => (
            <button
              key={prompt.chip}
              type="button"
              onClick={() => {
                ask(prompt);
              }}
              className="border border-border-strong px-3.5 py-2 text-[12.5px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            >
              {prompt.chip}
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
          <span className="font-display text-[9.5px] font-medium tracking-[0.1em] text-fg-subtle uppercase">
            {copy.controls.label}
          </span>
          <button
            type="button"
            aria-pressed={run.offline}
            onClick={() => {
              setInHud(true);
              run.setOffline(!run.offline);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 border border-border-strong px-3.5 py-2 text-[12.5px] transition-colors hover:bg-surface hover:text-fg",
              run.offline ? "bg-surface text-fg" : "text-fg-muted",
            )}
          >
            <WifiOff className="size-3.5" aria-hidden />
            {copy.controls.offline}
          </button>
          <button
            type="button"
            onClick={() => {
              setInHud(true);
              run.raiseNotification("contextTooLong");
            }}
            className="inline-flex items-center gap-1.5 border border-border-strong px-3.5 py-2 text-[12.5px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <TriangleAlert className="size-3.5" aria-hidden />
            {copy.controls.error}
          </button>
          {copy.depth.options.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={depth === option.id}
              onClick={() => {
                setDepth(option.id);
              }}
              className={cn(
                "border border-border-strong px-3.5 py-2 text-[12.5px] transition-colors hover:bg-surface hover:text-fg",
                depth === option.id ? "bg-surface text-fg" : "text-fg-muted",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-[12px] text-balance text-fg-subtle">
          {copy.caption} {format(copy.controls.keysHint, { combos: keyCombos })}
          {copy.disclosure !== null && <> {copy.disclosure}</>}
        </p>
      </div>
    </DemoCopyProvider>
  );
}
