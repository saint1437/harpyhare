import { useState } from "react";
import { THEME_LABELS, type AppTheme } from "./demo-data";
import { AppSlider, AppSwitch, CycleSelect, Kbd, SettingGroup, SettingRow } from "./ui";

const STT_LANGUAGES = ["Автоопределение", "Русский", "English"] as const;
const CAPTURE_DEVICES = ["Системное по умолчанию", "MacBook Pro Speakers", "AirPods Pro"] as const;
const MOVE_MODIFIERS = ["⌘", "⌘⇧", "⌥", "Ctrl"] as const;
const THEME_OPTIONS = Object.values(THEME_LABELS);

function themeFromLabel(label: string): AppTheme {
  return label === THEME_LABELS.black ? "black" : "gray";
}

const HOTKEYS = [
  { label: "Записать вопрос", hint: "Удерживайте, пока говорит собеседник", combo: "F9" },
  { label: "Показать / скрыть окно", hint: undefined, combo: "⌘⇧ H" },
  { label: "Суфлёр", hint: undefined, combo: "F10" },
  { label: "Снимок области экрана", hint: undefined, combo: "⌘⇧ S" },
];

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
  const [language, setLanguage] = useState<string>(STT_LANGUAGES[0]);
  const [translate, setTranslate] = useState(false);
  const [device, setDevice] = useState<string>(CAPTURE_DEVICES[0]);
  const [buffer, setBuffer] = useState(true);
  const [bufferSeconds, setBufferSeconds] = useState(10);
  const [moveModifier, setMoveModifier] = useState<string>(MOVE_MODIFIERS[0]);
  const [moveStep, setMoveStep] = useState(40);
  const [autoSend, setAutoSend] = useState(true);
  const [autoPreview, setAutoPreview] = useState(true);
  const [screenShareVisible, setScreenShareVisible] = useState(false);
  const [chatFont, setChatFont] = useState(13.5);

  return (
    <>
      <SettingGroup title="Доступ к API" description="Свои ключи или код доступа.">
        <SettingRow label="Ключ Anthropic">
          <MaskedKey value="sk-ant-••••••••••••4f2a" />
        </SettingRow>
        <SettingRow label="Ключ Groq" hint="Распознавание речи">
          <MaskedKey value="gsk_••••••••••••9c1d" />
        </SettingRow>
      </SettingGroup>

      <SettingGroup
        title="Распознавание речи"
        description="Что и откуда слушать, пока зажата клавиша записи."
      >
        <SettingRow label="Язык">
          <CycleSelect
            value={language}
            options={STT_LANGUAGES}
            ariaLabel="Язык распознавания"
            onChange={setLanguage}
          />
        </SettingRow>
        <SettingRow label="Переводить на английский">
          <AppSwitch
            checked={translate}
            ariaLabel="Переводить на английский"
            onChange={setTranslate}
          />
        </SettingRow>
        <SettingRow label="Устройство захвата">
          <CycleSelect
            value={device}
            options={CAPTURE_DEVICES}
            ariaLabel="Устройство захвата"
            onChange={setDevice}
          />
        </SettingRow>
        <SettingRow label="Фоновый буфер" hint="Подхватывает сказанное до нажатия клавиши записи">
          <AppSwitch checked={buffer} ariaLabel="Фоновый буфер" onChange={setBuffer} />
        </SettingRow>
        <SettingRow label="Длина буфера">
          <AppSlider
            value={bufferSeconds}
            min={5}
            max={30}
            step={1}
            ariaLabel="Длина буфера"
            readout={`${bufferSeconds} с`}
            onChange={setBufferSeconds}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Горячие клавиши" description="Любое сочетание, конфликты разрешаются.">
        {HOTKEYS.map((hotkey) => (
          <SettingRow key={hotkey.label} label={hotkey.label} hint={hotkey.hint}>
            <Kbd>{hotkey.combo}</Kbd>
          </SettingRow>
        ))}
      </SettingGroup>

      <SettingGroup title="Окно" description="Как двигать и растягивать окно с клавиатуры.">
        <SettingRow label="Модификатор перемещения">
          <CycleSelect
            value={moveModifier}
            options={MOVE_MODIFIERS}
            ariaLabel="Модификатор перемещения"
            onChange={setMoveModifier}
          />
        </SettingRow>
        <SettingRow label="Шаг перемещения">
          <AppSlider
            value={moveStep}
            min={10}
            max={200}
            step={5}
            ariaLabel="Шаг перемещения"
            readout={`${moveStep} px`}
            onChange={setMoveStep}
          />
        </SettingRow>
        <SettingRow
          label="Видно при демонстрации экрана"
          hint="По умолчанию окно не попадает в захват"
        >
          <AppSwitch
            checked={screenShareVisible}
            ariaLabel="Видно при демонстрации экрана"
            onChange={setScreenShareVisible}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Поведение">
        <SettingRow label="Отправлять сразу после расшифровки">
          <AppSwitch
            checked={autoSend}
            ariaLabel="Отправлять сразу после расшифровки"
            onChange={setAutoSend}
          />
        </SettingRow>
        <SettingRow label="Открывать HTML-превью ответа">
          <AppSwitch
            checked={autoPreview}
            ariaLabel="Открывать HTML-превью ответа"
            onChange={setAutoPreview}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Вид">
        <SettingRow label="Тема">
          <CycleSelect
            value={THEME_LABELS[theme]}
            options={THEME_OPTIONS}
            ariaLabel="Тема"
            onChange={(label) => {
              onThemeChange(themeFromLabel(label));
            }}
          />
        </SettingRow>
        <SettingRow label="Размер текста чата">
          <AppSlider
            value={chatFont}
            min={10}
            max={20}
            step={0.5}
            ariaLabel="Размер текста чата"
            readout={`${chatFont} px`}
            onChange={setChatFont}
          />
        </SettingRow>
      </SettingGroup>
    </>
  );
}
