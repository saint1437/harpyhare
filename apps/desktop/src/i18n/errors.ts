import type { AppError, ErrorCode } from "@/lib/errors";
import { ERROR_SUBJECTS, type ErrorSubject } from "./errors-types";
import { format } from "./format";
import type { Dictionary } from "./types";

const SUBJECTS: ReadonlySet<string> = new Set(ERROR_SUBJECTS);

function isSubject(value: string | undefined): value is ErrorSubject {
  return value !== undefined && SUBJECTS.has(value);
}

export function errorTitle(code: ErrorCode, dict: Dictionary): string {
  return dict.errors.titles[code];
}

/**
 * The body, assembled from the code and the machine parameters beside it.
 *
 * Three steps, in this order and for a reason each:
 *
 * 1. a `subject` — the sub-key some codes carry — replaces the body outright,
 *    because "no access" means three different sentences depending on which
 *    permission it was;
 * 2. otherwise the code's template is filled from `params`;
 * 3. and if that comes out empty — a code with nothing to say and no parameters
 *    — the Russian `message` from Rust is printed. That last step is the
 *    compatibility branch the proxy worker's contract asks every client to have,
 *    and it is the only path on which a Russian phrase can reach an English UI.
 */
export function errorBody(error: AppError, dict: Dictionary): string {
  const params = error.params ?? {};
  const subject = params["subject"];
  if (isSubject(subject)) {
    const text = format(dict.errors.subjects[subject], params);
    if (text !== "") return text;
  }
  const body = format(dict.errors.bodies[error.code], params);
  return body === "" ? error.message : body;
}
