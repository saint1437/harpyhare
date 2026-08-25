import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { startWindowDrag } from "@/ipc/commands";

/** Ниже этого порога жест считается щелчком, а не перетаскиванием. */
const DRAG_THRESHOLD_PX = 4;

const LEFT_BUTTON = 0;

/**
 * Кружок должен быть одновременно и ручкой для перетаскивания, и кнопкой.
 *
 * Обычный для этого проекта путь — `useWindowDrag` — здесь не годится:
 * `isDraggableChromeTarget` намеренно исключает `button`, чтобы кнопки в шапке
 * оставались нажимаемыми, и именно поэтому клубок не таскался. А позвать
 * `startDragging()` сразу на mousedown нельзя: перетаскивание перехватывает ОС,
 * и щелчок после этого уже не доходит.
 *
 * Поэтому порог: пока мышь не сдвинулась, это щелчок; сдвинулась — отдаём жест
 * системе и гасим последующий click, если он всё-таки придёт.
 */
export function useOrbDrag(onClick: () => void): {
  onMouseDown: (event: ReactMouseEvent) => void;
  onClick: (event: ReactMouseEvent) => void;
} {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  const onMouseDown = useCallback((event: ReactMouseEvent) => {
    if (event.button !== LEFT_BUTTON) return;
    origin.current = { x: event.screenX, y: event.screenY };
    dragged.current = false;
  }, []);

  useEffect(() => {
    const onMove = (event: globalThis.MouseEvent) => {
      const from = origin.current;
      if (from === null || dragged.current) return;
      const moved = Math.hypot(event.screenX - from.x, event.screenY - from.y);
      if (moved < DRAG_THRESHOLD_PX) return;
      dragged.current = true;
      void startWindowDrag();
    };
    // Перетаскивание уводит мышь под контроль ОС, и mouseup может не прийти
    // вовсе — сбрасываем начало жеста, чтобы следующий mousemove не продолжил
    // прошлый.
    const onUp = () => {
      origin.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const handleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (dragged.current) {
        dragged.current = false;
        event.preventDefault();
        return;
      }
      onClick();
    },
    [onClick],
  );

  return { onMouseDown, onClick: handleClick };
}
