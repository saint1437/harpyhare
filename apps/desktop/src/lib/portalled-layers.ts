const FLOATING_LAYER_SELECTOR =
  "[data-radix-popper-content-wrapper], [data-slot='popover-content'], [data-slot='dialog-content']";

const KEYBOARD_LAYER_SELECTOR =
  "[data-slot='dialog-content'], [data-slot='popover-content'], [data-slot='command']";

export function insideFloatingLayer(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FLOATING_LAYER_SELECTOR) !== null;
}

export function keyboardLayerOpen(): boolean {
  return document.querySelector(KEYBOARD_LAYER_SELECTOR) !== null;
}
