import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_CODES, type AppError } from "@/lib/errors";
import { TONE_BY_CODE } from "@/lib/notifications";
import { LOCALES, dictionary } from ".";
import { errorBody, errorTitle } from "./errors";
import { ERROR_SUBJECTS } from "./errors-types";

/**
 * Vitest runs from the project root, and the Rust half is a sibling of `src` —
 * the same reach across the language boundary `update/tests.rs` makes in the
 * other direction with `include_str!`.
 */
function rust(file: string): string {
  return readFileSync(path.resolve("src-tauri/src", file), "utf8");
}

describe.each(LOCALES)("ошибки в локали %s", (locale) => {
  const dict = dictionary(locale);

  it("у каждого кода есть заголовок, текст и тон", () => {
    for (const code of ERROR_CODES) {
      expect(errorTitle(code, dict).trim()).not.toBe("");
      expect(dict.errors.bodies[code].trim()).not.toBe("");
      // `cancelled` намеренно молчит: пользователь сам это и нажал.
      expect(TONE_BY_CODE).toHaveProperty(code);
    }
  });

  it("у каждого subject есть фраза", () => {
    for (const subject of ERROR_SUBJECTS) {
      expect(dict.errors.subjects[subject].trim()).not.toBe("");
    }
  });
});

/**
 * CROSS-LANGUAGE CONTRACT. `error::subject` in Rust and `ERROR_SUBJECTS` here
 * are the two halves of one vocabulary: Rust attaches the key, this side owns
 * the phrase. A subject added on one side only is a code path with nothing to
 * print, and neither compiler can see the other.
 */
it("список subject совпадает с error::subject::ALL в Rust", () => {
  const source = rust("error.rs");
  const block = /pub const ALL: &\[&str\] = &\[([\s\S]*?)\];/u.exec(source)?.[1] ?? "";
  const constants = block
    .split(",")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const values = constants.map((name) => {
    const declared = new RegExp(`pub const ${name}: &str = "([^"]+)"`, "u").exec(source);
    expect(declared, `нет объявления ${name}`).not.toBeNull();
    return declared?.[1] ?? "";
  });
  expect([...values].sort()).toEqual([...ERROR_SUBJECTS].sort());
});

/**
 * The proxy worker's 22 codes reach the frontend as `ErrorCode`, and the
 * mapping lives in `relay_error.rs`. This asserts the target of every row is a
 * code this dictionary can actually print — the Rust test owns the table
 * itself, this one owns the fact that nothing falls off the end of it.
 */
it("каждый код воркера отображается в код, у которого есть фраза", () => {
  const source = rust("relay_error.rs");
  const rows = [...source.matchAll(/\("([a-z_]+)", ErrorCode::(\w+)\)/gu)];
  expect(rows.length, "22 кода воркера").toBe(22);
  const known = new Set<string>(ERROR_CODES);
  for (const [, worker, variant] of rows) {
    const code = `${(variant ?? "").charAt(0).toLowerCase()}${(variant ?? "").slice(1)}`;
    expect(known.has(code), `${worker ?? ""} → ${code}`).toBe(true);
  }
});

describe("errorBody", () => {
  const dict = dictionary("ru");

  it("подставляет машинные параметры в шаблон кода", () => {
    const error: AppError = {
      code: "requestTooLarge",
      message: "Запрос слишком большой",
      params: { limitMb: "12" },
    };
    expect(errorBody(error, dict)).toContain("12");
  });

  it("subject перебивает общий текст кода", () => {
    const audio: AppError = {
      code: "permission",
      message: "Нет разрешения на запись системного звука",
      params: { subject: "systemAudioPermission" },
    };
    const screen: AppError = {
      code: "permission",
      message: "Нет разрешения «Запись экрана»",
      params: { subject: "screenRecording" },
    };
    expect(errorBody(audio, dict)).not.toBe(errorBody(screen, dict));
    expect(errorBody(audio, dict)).toBe(dict.errors.subjects.systemAudioPermission);
  });

  it("незнакомый subject не ломает рендер — работает шаблон кода", () => {
    const error: AppError = {
      code: "api",
      message: "чужая фраза",
      params: { subject: "somethingNewer", details: "деталь" },
    };
    expect(errorBody(error, dict)).toBe("деталь");
  });

  // Совместимость в обратную сторону: воркер старой сборки прислал только
  // `message`, и это единственное, что можно показать.
  it("код без параметров и без своего текста откатывается на message", () => {
    expect(errorBody({ code: "api", message: "русская фраза" }, dict)).toBe("русская фраза");
  });

  it("тот же код на английском даёт английскую фразу", () => {
    const error: AppError = { code: "cancelled", message: "Остановлено" };
    expect(errorBody(error, dictionary("en"))).toBe("The request was cancelled.");
  });
});
