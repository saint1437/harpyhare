import { useCallback, type KeyboardEvent } from "react";

/**
 * `role="tablist"` was announced on both rails and never honoured: no roving
 * tabIndex, no arrow keys, no `aria-controls`, and no `role="tabpanel"` anywhere.
 * The cost was 14 tab stops to reach a settings control — six sidebar icons plus
 * seven tab icons, all of them unlabelled below 900px.
 *
 * A tablist is ONE tab stop. Arrows move between tabs; Tab leaves for the panel.
 */
export function useRovingTabs<T extends string>(
  ids: readonly T[],
  active: T,
  onSelect: (id: T) => void,
  orientation: "vertical" | "horizontal" = "vertical",
) {
  const [prev, next] =
    orientation === "vertical"
      ? (["ArrowUp", "ArrowDown"] as const)
      : (["ArrowLeft", "ArrowRight"] as const);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const at = ids.indexOf(active);
      if (at === -1) return;
      const target =
        event.key === next
          ? ids[(at + 1) % ids.length]
          : event.key === prev
            ? ids[(at - 1 + ids.length) % ids.length]
            : event.key === "Home"
              ? ids[0]
              : event.key === "End"
                ? ids[ids.length - 1]
                : undefined;
      if (target === undefined) return;
      event.preventDefault();
      onSelect(target);
    },
    [ids, active, onSelect, prev, next],
  );

  const tabProps = useCallback(
    (id: T) => ({
      role: "tab" as const,
      "aria-selected": id === active,
      "aria-controls": panelId(id),
      id: tabId(id),
      // Only the active tab is in the tab order; arrows reach the rest.
      tabIndex: id === active ? 0 : -1,
    }),
    [active],
  );

  return { onKeyDown, tabProps };
}

export function tabId(id: string): string {
  return `tab-${id}`;
}

export function panelId(id: string): string {
  return `panel-${id}`;
}

/** The panel a tablist points at, focusable so activation can move into it. */
export function panelProps(id: string) {
  return {
    role: "tabpanel" as const,
    id: panelId(id),
    "aria-labelledby": tabId(id),
    tabIndex: -1,
  };
}
