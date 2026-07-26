"use client";

import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { VoicePrompt } from "@/i18n/demo-types";
import type { Dictionary } from "@/i18n/types";
import { DemoCopyProvider } from "./copy";
import { HudWindow } from "./HudWindow";
import { LauncherWindow } from "./LauncherWindow";
import type { AppTheme } from "./types";
import { useDemoRun } from "./useDemoRun";

const LAUNCH_MS = 800;

export function AppDemo({ dict }: { dict: Dictionary }) {
  const copy = dict.app;
  const run = useDemoRun(copy);
  const [inHud, setInHud] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [theme, setTheme] = useState<AppTheme>("black");
  const timerRef = useRef(0);

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
    },
    [],
  );

  const launch = () => {
    setLaunching(true);
    timerRef.current = window.setTimeout(() => {
      setLaunching(false);
      setInHud(true);
    }, LAUNCH_MS);
  };

  const backToLauncher = () => {
    clearTimeout(timerRef.current);
    setHidden(false);
    setInHud(false);
  };

  const ask = (prompt: VoicePrompt) => {
    clearTimeout(timerRef.current);
    setLaunching(false);
    setHidden(false);
    setInHud(true);
    run.askByVoice(prompt);
  };

  return (
    <DemoCopyProvider copy={copy}>
      <div className="fade-rise fade-rise-late relative mx-auto mt-16 w-full max-w-5xl sm:mt-20">
        <div
          className="relative overflow-hidden rounded-[18px] border border-border-strong bg-app-bg shadow-[0_36px_70px_-22px_var(--hud-shadow)]"
          role="group"
          aria-label={copy.frameLabel}
          data-app-theme={theme}
        >
          <div className="h-[440px] sm:h-[560px] lg:h-[640px]">
            {inHud ? (
              <HudWindow
                run={run}
                onClose={backToLauncher}
                onHide={() => {
                  setHidden(true);
                }}
              />
            ) : (
              <LauncherWindow
                launching={launching}
                theme={theme}
                onLaunch={launch}
                onThemeChange={setTheme}
              />
            )}
          </div>

          {hidden && (
            <button
              type="button"
              onClick={() => {
                setHidden(false);
              }}
              className="absolute inset-0 z-30 grid place-items-center bg-app-bg/80 backdrop-blur-sm"
            >
              <span className="rounded-full border border-app-border bg-app-card px-4 py-2 text-app-body text-app-fg">
                {copy.hiddenWindow}
              </span>
            </button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
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
              className="rounded-full border border-border-strong bg-surface/60 px-3.5 py-1.5 text-[13px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            >
              {prompt.chip}
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-balance text-fg-subtle">
          {copy.caption}
          {copy.disclosure !== null && <> {copy.disclosure}</>}
        </p>
      </div>
    </DemoCopyProvider>
  );
}
