import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Подсказки берут провайдер из корня окна (`render-root.renderWindowRoot`),
 * поэтому тест, рендерящий компонент с `ShortcutTooltip` голым, падает на
 * отсутствующем контексте. Обёртка повторяет ровно тот же провайдер, чтобы
 * тестовое дерево не расходилось с настоящим.
 */
export function UiProviders({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}
