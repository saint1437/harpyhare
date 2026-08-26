import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { applyLanguage } from "./i18n";
import { createQueryClient } from "./lib/query-client";

const ROOT_ELEMENT_ID = "root";

const MISSING_ROOT_ERROR = `Root element #${ROOT_ELEMENT_ID} not found`;

export function renderWindowRoot(app: ReactNode): void {
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (!rootElement) throw new Error(MISSING_ROOT_ERROR);
  // The language of the previous run, before the first frame — falling back to
  // the OS language on the very first one. `settings.json` still has the last
  // word and arrives a round trip later (`useSettingsBootstrap`); this only
  // decides what the window shows until then, and guessing the OS language was
  // wrong for anyone whose app language differs from their machine's.
  applyLanguage();
  createRoot(rootElement).render(
    <StrictMode>
      {/* Outermost boundary: without it a render exception leaves a frameless
          transparent window with no way to close it. */}
      <ErrorBoundary label="window">
        <QueryClientProvider client={createQueryClient()}>{app}</QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
