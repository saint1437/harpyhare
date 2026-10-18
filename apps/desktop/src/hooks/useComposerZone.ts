import { useEffect, useState, type RefObject } from "react";
import { composerCardHeight, composerZone, type ComposerMeasure } from "@/lib/composer-layout";

export interface ComposerZoneRefs {
  card: RefObject<HTMLDivElement | null>;
  row: RefObject<HTMLDivElement | null>;
  content: RefObject<HTMLDivElement | null>;
  bar: RefObject<HTMLDivElement | null>;
  toolbar: RefObject<HTMLDivElement | null>;
}

export interface ComposerZoneState {
  /** Height of the in-flow slot; `null` until anything is measured — then the whole composer stays in flow. */
  slot: number | null;
  /** Target for the animated card height; `null` until anything is measured — then the height is natural. */
  cardHeight: number | null;
}

function sameMeasure(a: ComposerMeasure | null, b: ComposerMeasure): boolean {
  return (
    a !== null &&
    a.card === b.card &&
    a.row === b.row &&
    a.content === b.content &&
    a.bar === b.bar &&
    a.toolbar === b.toolbar
  );
}

/**
 * Measures the card, the field row, the whole content and the quick-actions
 * bar, and reports the overhang above the ledger upwards. The observer never
 * touches the DOM itself: measurements go through state and React commits
 * outside the ResizeObserver cycle, so animating the card height cannot raise
 * "loop completed with undelivered notifications".
 */
export function useComposerZone(
  refs: ComposerZoneRefs,
  expanded: boolean,
  barGap: number,
  onOverflow: (px: number) => void,
): ComposerZoneState {
  const [measure, setMeasure] = useState<ComposerMeasure | null>(null);
  const { card, row, content, bar, toolbar } = refs;

  useEffect(() => {
    const cardEl = card.current;
    const rowEl = row.current;
    const contentEl = content.current;
    const barEl = bar.current;
    const toolbarEl = toolbar.current;
    if (!cardEl || !rowEl || !contentEl || !barEl || !toolbarEl) return;
    const read = () => {
      const next = {
        card: cardEl.offsetHeight,
        row: rowEl.offsetHeight,
        content: contentEl.offsetHeight,
        bar: barEl.offsetHeight,
        toolbar: toolbarEl.offsetHeight,
      };
      setMeasure((prev) => (sameMeasure(prev, next) ? prev : next));
    };
    const observer = new ResizeObserver(read);
    for (const el of [cardEl, rowEl, contentEl, barEl, toolbarEl]) observer.observe(el);
    read();
    return () => {
      observer.disconnect();
    };
  }, [card, row, content, bar, toolbar]);

  const zone = measure === null ? null : composerZone(measure, barGap);
  const overflow = zone === null ? 0 : zone.overflow;
  useEffect(() => {
    onOverflow(overflow);
  }, [overflow, onOverflow]);

  if (measure === null || zone === null) return { slot: null, cardHeight: null };
  return { slot: zone.slot, cardHeight: composerCardHeight(measure, expanded) };
}
