/**
 * Ninety lines of schema, and deliberately not zod/valibot.
 *
 * What these files need is not validation but SALVAGE: `chats.json` and
 * `context-library.json` are the user's own work, and a single field of the
 * wrong type must cost that field and nothing else. zod's contract is the
 * opposite — `parse` throws and `safeParse` hands back a failure for the whole
 * document, so recovering field by field means writing `.catch(fallback)` on
 * every leaf anyway and carrying a dependency for the privilege. Everything
 * here already went through `restoreChat`'s thirteen hand-written `typeof`
 * checks; the point of the module is that the SHAPE is now declared once and
 * the type comes out of it, so a field added to `Chat` cannot be forgotten in
 * its reader (`chats.test.ts` asserts the key sets match).
 *
 * The one rule: `parse` never throws and never returns `undefined`. Anything
 * unrecognisable becomes the declared fallback.
 */

export interface Schema<T> {
  parse: (raw: unknown) => T;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

export function str(fallback = ""): Schema<string> {
  return { parse: (raw) => (typeof raw === "string" ? raw : fallback) };
}

/** For ids and enum-ish strings where "" is as absent as `undefined`. */
export function nonEmptyStr(fallback: string): Schema<string> {
  return {
    parse: (raw) => (typeof raw === "string" && raw !== "" ? raw : fallback),
  };
}

export function bool(fallback = false): Schema<boolean> {
  return { parse: (raw) => (typeof raw === "boolean" ? raw : fallback) };
}

export function num(fallback = 0, bounds: { min?: number; max?: number } = {}): Schema<number> {
  return {
    parse: (raw) => {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
      const atLeast = bounds.min === undefined ? raw : Math.max(bounds.min, raw);
      return bounds.max === undefined ? atLeast : Math.min(bounds.max, atLeast);
    },
  };
}

export function oneOf<const T extends readonly string[]>(
  values: T,
  fallback: T[number],
): Schema<T[number]> {
  return {
    parse: (raw) =>
      typeof raw === "string" && (values as readonly string[]).includes(raw) ? raw : fallback,
  };
}

/**
 * `keep` is what makes salvage different from validation: an entry that parsed
 * into something meaningless (an image with no id, a folder with no name) is
 * dropped rather than kept as a hollow default.
 */
export function list<T>(item: Schema<T>, keep?: (parsed: T) => boolean): Schema<T[]> {
  return {
    parse: (raw) => {
      if (!Array.isArray(raw)) return [];
      const parsed = raw.map((value) => item.parse(value));
      return keep === undefined ? parsed : parsed.filter(keep);
    },
  };
}

type ObjectShape = Record<string, Schema<unknown>>;

type ObjectOf<S extends ObjectShape> = {
  [K in keyof S]: Infer<S[K]>;
};

export function obj<S extends ObjectShape>(shape: S): Schema<ObjectOf<S>> {
  const fields = Object.entries(shape);
  return {
    parse: (raw) => {
      // Not an object → every field takes its fallback, which is exactly what a
      // missing field does. Two spellings of "nothing here" must not differ.
      const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
        string,
        unknown
      >;
      const out: Record<string, unknown> = {};
      for (const [key, field] of fields) {
        out[key] = field.parse(source[key]);
      }
      return out as ObjectOf<S>;
    },
  };
}
