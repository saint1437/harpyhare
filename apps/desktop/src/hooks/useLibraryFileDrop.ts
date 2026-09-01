import { useEffect, useState } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { onFileDrop } from "@/ipc/events";
import { dropTargetAt } from "@/lib/library-drop";

export function useLibraryFileDrop(
  onDrop: (paths: string[], folderId: string) => void,
): string | null {
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null);
  const onDropRef = useLatestRef(onDrop);

  useEffect(
    () =>
      onFileDrop((event) => {
        if (event.type === "leave") {
          setHoveredFolderId(null);
          return;
        }
        if (event.type === "over") {
          setHoveredFolderId(dropTargetAt(event.x, event.y));
          return;
        }
        const target = dropTargetAt(event.x, event.y);
        setHoveredFolderId(null);
        if (target !== null) onDropRef.current(event.paths, target);
      }),
    [onDropRef],
  );

  return hoveredFolderId;
}
