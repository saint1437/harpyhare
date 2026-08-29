import { useEffect, type RefObject } from "react";
import type { DemoRun } from "./useDemoRun";

/**
 * The keyboard, and the one honest compromise in this mock.
 *
 * In the app seven of these are GLOBAL shortcuts registered with the OS: they
 * fire while another window has focus, which is the entire point of a tool you
 * use during someone else's video call. A web page cannot have that and should
 * not pretend to, so the demo scopes them to itself: they are live only while
 * focus is inside the frame, and clicking anywhere outside hands every key back
 * to the browser. The frame says so in its own caption.
 *
 * Inside that scope the combos are the app's, `preventDefault` included —
 * ⌘R does not reload and ⌘1 does not switch tabs while you are in the mock.
 * That is deliberate: a demo of "the keys are what make it usable" that quietly
 * dropped the keys would be demonstrating the opposite.
 *
 * While collapsed, the app deliberately kills the hotkeys that act on a chat
 * you cannot see — send, quick actions, duplicate — and keeps the ones about
 * capture and the window itself. That asymmetry is copied here.
 */
export function useDemoHotkeys({
  frameRef,
  enabled,
  run,
  quickActionPrompts,
  onFocusPrompt,
}: {
  frameRef: RefObject<HTMLElement | null>;
  /** False while the launcher is up: the app registers nothing until the HUD exists. */
  enabled: boolean;
  run: DemoRun;
  quickActionPrompts: string[];
  onFocusPrompt: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    const inScope = () => {
      const frame = frameRef.current;
      return frame?.contains(document.activeElement) === true;
    };

    const primary = (event: KeyboardEvent) => event.metaKey || event.ctrlKey;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!inScope()) return;

      // Escape is the only key here that is not behind a modifier, and it is
      // also the only one a browser does not want: cancel the recording first,
      // the answer second, nothing at all when neither is live.
      if (event.key === "Escape") {
        event.preventDefault();
        run.cancel();
        return;
      }

      if (!primary(event)) return;
      const code = event.code;

      if (event.shiftKey) {
        if (code === "KeyH") {
          event.preventDefault();
          run.toggleCollapsed();
          return;
        }
        if (code === "KeyL") {
          event.preventDefault();
          run.toggleAutoMode();
          return;
        }
        if (code === "KeyT") {
          event.preventDefault();
          run.toggleTeleprompter();
          return;
        }
        if (code === "KeyA") {
          event.preventDefault();
          run.addAttachment();
          return;
        }
        if (code === "KeyD") {
          event.preventDefault();
          run.setCollapsed(false);
          onFocusPrompt();
          return;
        }
        if (code === "KeyN") {
          if (run.collapsed) return;
          event.preventDefault();
          run.duplicateChat();
          return;
        }
        if (code === "Enter") {
          event.preventDefault();
          run.answerPendingTurns();
          return;
        }
        return;
      }

      if (code === "KeyR") {
        event.preventDefault();
        // `on_ptt_pressed` returns silently unless the recorder is idle, which
        // is what swallows the OS key auto-repeat rather than a guard here.
        if (!event.repeat) run.startRecording();
        return;
      }

      if (code === "Enter") {
        if (run.collapsed) return;
        event.preventDefault();
        run.send();
        return;
      }

      if (code.startsWith("Digit")) {
        if (run.collapsed) return;
        const index = Number(code.slice(5)) - 1;
        const action = quickActionPrompts[index];
        if (action === undefined) return;
        event.preventDefault();
        run.runQuickAction(action);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!inScope()) return;
      // The key that ends a hold is `R`, with or without its modifier still
      // held: releasing ⌘ first is common and must not strand the recorder.
      if (event.code === "KeyR" || event.key === "Meta" || event.key === "Control") {
        run.stopRecording();
      }
    };

    // A window that loses focus mid-hold must not stay in `recording` for ever.
    const onBlur = () => {
      run.stopRecording();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled, frameRef, run, quickActionPrompts, onFocusPrompt]);
}
