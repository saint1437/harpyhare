import { cloneElement, isValidElement, type ReactNode } from "react";

const NEWLINE = "\n";

type Line = ReactNode[];

function mergeTail(left: Line[], right: Line[]): Line[] {
  const lastOfLeft = left[left.length - 1] ?? [];
  const firstOfRight = right[0] ?? [];
  return [...left.slice(0, -1), [...lastOfLeft, ...firstOfRight], ...right.slice(1)];
}

/**
 * Режет отрендеренное содержимое блока на строки, сохраняя обёртки подсветки.
 *
 * Наивное «разбить текст по \n» тут не работает: rehype-highlight отдаёт дерево
 * span'ов, и перенос строки почти всегда лежит ВНУТРИ токена (комментарий,
 * многострочная строка, шаблон). Поэтому дерево обходится рекурсивно, а span,
 * попавший на границу строк, переоткрывается на следующей — ровно так же, как
 * это делают подсветчики с нумерацией.
 */
export function splitRenderedLines(node: ReactNode): Line[] {
  if (node === null || node === undefined || typeof node === "boolean") return [[]];
  if (typeof node === "number") return [[String(node)]];
  if (typeof node === "string") {
    return node.split(NEWLINE).map((part) => (part === "" ? [] : [part]));
  }
  if (Array.isArray(node)) {
    const children = node as ReactNode[];
    return children.reduce<Line[]>((acc, child) => mergeTail(acc, splitRenderedLines(child)), [[]]);
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    const inner = splitRenderedLines(node.props.children);
    if (inner.length === 1) return [[node]];
    return inner.map((line, index) => [cloneElement(node, { key: index }, ...line)]);
  }
  return [[node]];
}

/** Завершающий перенос не должен рисовать лишнюю пустую строку с номером. */
export function trimTrailingEmptyLine(lines: Line[]): Line[] {
  const last = lines[lines.length - 1];
  return lines.length > 1 && last?.length === 0 ? lines.slice(0, -1) : lines;
}
