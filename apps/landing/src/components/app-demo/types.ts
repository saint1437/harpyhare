import type { DemoMessageSeed } from "@/i18n/demo-types";

export type AppTheme = "gray" | "black";

export type DemoMessage = DemoMessageSeed;

export interface DemoChat {
  id: string;
  title: string;
  messages: DemoMessage[];
  draft: string;
}
