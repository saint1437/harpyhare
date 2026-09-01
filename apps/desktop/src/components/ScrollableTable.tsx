import type { ReactNode } from "react";

const TABLE_SCROLL_CLASS = "table-scroll";

export function ScrollableTable({ children }: { children?: ReactNode }) {
  return (
    <div className={TABLE_SCROLL_CLASS}>
      <table>{children}</table>
    </div>
  );
}
