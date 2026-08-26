import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useDict } from "@/hooks/useDict";
import { getDict } from "@/i18n";
import { closeApp } from "@/ipc/commands";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown instead of the default panel — used for boundaries around a single panel. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Identifies the boundary in the console when several are nested. */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * The HUD is a frameless, transparent, always-on-top window: no titlebar, no
 * menu, no tray icon. An exception thrown during render unmounts the tree and
 * leaves an empty transparent window with nothing to click — `close_app` lives
 * in StatusBar, which is gone by then — so the only way out is Force Quit.
 *
 * Hence a boundary per window AND a boundary per panel: a broken answer must
 * not take the composer with it.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Rust does not see webview exceptions, so the console is the only record.
    console.error(`[${this.props.label ?? "app"}] render failed`, error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    // A class component cannot hold a hook, and this one runs precisely when
    // the tree below it has already failed — the module store is read directly
    // rather than through a subscription nobody would live long enough to use.
    const copy = getDict().common.errorBoundary;

    return (
      <div className="flex h-full w-full items-center justify-center p-3">
        <div className="flex max-w-md flex-col gap-3 rounded-lg border border-line-strong bg-surface p-4 shadow-btn">
          <div className="flex flex-col gap-1">
            <p className="text-title font-medium text-fg">{copy.title}</p>
            <p className="text-body text-fg-subtle">{copy.text}</p>
          </div>
          <p className="max-h-24 overflow-auto rounded-sm bg-inset px-2 py-1.5 text-caption text-fg-subtle">
            {error.message}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                window.location.reload();
              }}
            >
              {copy.reload}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void closeApp();
              }}
            >
              {copy.quit}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Boundary for one panel inside a living window: it keeps the rest of the HUD
 * usable and offers a retry that does not throw the window away.
 */
export function PanelErrorBoundary({
  children,
  label,
  title,
}: {
  children: ReactNode;
  label: string;
  title: string;
}): ReactNode {
  const retryLabel = useDict().common.actions.retry;
  return (
    <ErrorBoundary
      label={label}
      fallback={(error, reset) => (
        <div className="flex min-h-0 flex-col gap-2 rounded-lg border border-line-strong bg-surface p-3">
          <p className="text-body font-medium text-fg">{title}</p>
          <p className="max-h-20 overflow-auto text-caption text-fg-subtle">{error.message}</p>
          <div>
            <Button size="xs" variant="outline" onClick={reset}>
              {retryLabel}
            </Button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
