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
      <div className="fade-rise relative mx-auto mt-10 w-full sm:mt-12">
        <div
          className="shadow-poster sm:shadow-poster-lg relative overflow-hidden border-2 border-fg bg-app-bg"
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
              <span className="border border-app-border bg-app-card px-4 py-2 text-app-body text-app-fg">
                {copy.hiddenWindow}
              </span>
            </button>
          )}
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

        <p className="mt-4 text-center text-[12px] text-balance text-fg-subtle">
          {copy.caption}
          {copy.disclosure !== null && <> {copy.disclosure}</>}
        </p>
      </div>
    </DemoCopyProvider>
  );
}
