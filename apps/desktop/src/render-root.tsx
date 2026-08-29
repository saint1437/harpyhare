import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { adoptLanguage } from "./i18n";
import { createQueryClient } from "./lib/query-client";

const ROOT_ELEMENT_ID = "root";

const MISSING_ROOT_ERROR = `Root element #${ROOT_ELEMENT_ID} not found`;

/**
 * Asynchronous for one reason, and it is the whole of the reason: the window's
 * dictionary is fetched here, before the first render. Every locale but the
 * source one is a chunk of its own (`i18n/index.ts`), and this is the single
 * place in the app that waits for one — which is what keeps the tree free of a
 * loading state and `getDict()` free of an `undefined`.
 */
export async function renderWindowRoot(app: ReactNode): Promise<void> {
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (!rootElement) throw new Error(MISSING_ROOT_ERROR);
  // The language of the previous run, in hand before the first frame — falling
  // back to the OS language on the very first one. `settings.json` still has the
  // last word and arrives a round trip later (`useSettingsBootstrap`); this only
  // decides what the window shows until then, and guessing the OS language was
  // wrong for anyone whose app language differs from their machine's.
  await adoptLanguage();
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
