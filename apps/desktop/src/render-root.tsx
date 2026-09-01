import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "./lib/query-client";

const ROOT_ELEMENT_ID = "root";

export function renderWindowRoot(app: ReactNode): void {
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (!rootElement) throw new Error(`Корневой элемент #${ROOT_ELEMENT_ID} не найден`);
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <TooltipProvider>
          {app}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
