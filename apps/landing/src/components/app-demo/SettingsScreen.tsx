import { useState } from "react";
import { useCopy } from "./copy";
import type { AppTheme } from "./types";
import { AppSlider, AppSwitch, CycleSelect, Kbd, SettingGroup, SettingRow } from "./ui";

const MOVE_MODIFIERS = ["⌘", "⌘⇧", "⌥", "Ctrl"];

function MaskedKey({ value }: { value: string }) {
  return (
    <span className="w-full truncate rounded-md border border-app-border bg-app-surface px-2 py-1 text-right font-mono text-app-caption text-app-muted">
      {value}
    </span>
  );
}

export function SettingsScreen({
  theme,
  onThemeChange,
}: {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}) {
  const copy = useCopy().launcher.settings;
  const themeOptions = [copy.themes.gray, copy.themes.black];
  const [language, setLanguage] = useState<string>(copy.languages[0] ?? "");
  const [translate, setTranslate] = useState(false);
  const [device, setDevice] = useState<string>(copy.captureDevices[0] ?? "");
  const [buffer, setBuffer] = useState(true);
  const [bufferSeconds, setBufferSeconds] = useState(10);
  const [moveModifier, setMoveModifier] = useState<string>(MOVE_MODIFIERS[0] ?? "");
  const [moveStep, setMoveStep] = useState(40);
  const [autoSend, setAutoSend] = useState(true);
  const [autoPreview, setAutoPreview] = useState(true);
  const [screenShareVisible, setScreenShareVisible] = useState(false);
  const [chatFont, setChatFont] = useState(13.5);

  return (
    <>
      <SettingGroup {...copy.groups.api}>
        <SettingRow label={copy.anthropicKey}>
          <MaskedKey value="sk-ant-••••••••••••4f2a" />
        </SettingRow>
        <SettingRow label={copy.groqKey} hint={copy.groqKeyHint}>
          <MaskedKey value="gsk_••••••••••••9c1d" />
        </SettingRow>
      </SettingGroup>

      <SettingGroup {...copy.groups.stt}>
        <SettingRow label={copy.language}>
          <CycleSelect
            value={language}
            options={copy.languages}
            ariaLabel={copy.language}
            onChange={setLanguage}
          />
        </SettingRow>
        <SettingRow label={copy.translate}>
          <AppSwitch checked={translate} ariaLabel={copy.translate} onChange={setTranslate} />
        </SettingRow>
        <SettingRow label={copy.captureDevice}>
          <CycleSelect
            value={device}
            options={copy.captureDevices}
            ariaLabel={copy.captureDevice}
            onChange={setDevice}
          />
        </SettingRow>
        <SettingRow label={copy.buffer} hint={copy.bufferHint}>
          <AppSwitch checked={buffer} ariaLabel={copy.buffer} onChange={setBuffer} />
        </SettingRow>
        <SettingRow label={copy.bufferLength}>
          <AppSlider
            value={bufferSeconds}
            min={5}
            max={30}
            step={1}
            ariaLabel={copy.bufferLength}
            readout={`${bufferSeconds} ${copy.secondsUnit}`}
            onChange={setBufferSeconds}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup {...copy.groups.hotkeys}>
        {copy.hotkeys.map((hotkey) => (
          <SettingRow key={hotkey.label} label={hotkey.label} hint={hotkey.hint}>
            <Kbd>{hotkey.combo}</Kbd>
          </SettingRow>
        ))}
      </SettingGroup>

      <SettingGroup {...copy.groups.window}>
        <SettingRow label={copy.moveModifier}>
          <CycleSelect
            value={moveModifier}
            options={MOVE_MODIFIERS}
            ariaLabel={copy.moveModifier}
            onChange={setMoveModifier}
          />
        </SettingRow>
        <SettingRow label={copy.moveStep}>
          <AppSlider
            value={moveStep}
            min={10}
            max={200}
            step={5}
            ariaLabel={copy.moveStep}
            readout={`${moveStep} px`}
            onChange={setMoveStep}
          />
        </SettingRow>
        <SettingRow label={copy.screenShareVisible} hint={copy.screenShareVisibleHint}>
          <AppSwitch
            checked={screenShareVisible}
            ariaLabel={copy.screenShareVisible}
            onChange={setScreenShareVisible}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup {...copy.groups.behavior}>
        <SettingRow label={copy.autoSend}>
          <AppSwitch checked={autoSend} ariaLabel={copy.autoSend} onChange={setAutoSend} />
        </SettingRow>
        <SettingRow label={copy.autoPreview}>
          <AppSwitch checked={autoPreview} ariaLabel={copy.autoPreview} onChange={setAutoPreview} />
        </SettingRow>
      </SettingGroup>

      <SettingGroup {...copy.groups.appearance}>
        <SettingRow label={copy.theme}>
          <CycleSelect
            value={theme === "black" ? copy.themes.black : copy.themes.gray}
            options={themeOptions}
            ariaLabel={copy.theme}
            onChange={(label) => {
              onThemeChange(label === copy.themes.black ? "black" : "gray");
            }}
          />
        </SettingRow>
        <SettingRow label={copy.chatFontSize}>
          <AppSlider
            value={chatFont}
            min={10}
            max={20}
            step={0.5}
            ariaLabel={copy.chatFontSize}
            readout={`${chatFont} px`}
            onChange={setChatFont}
          />
        </SettingRow>
      </SettingGroup>
    </>
  );
}
