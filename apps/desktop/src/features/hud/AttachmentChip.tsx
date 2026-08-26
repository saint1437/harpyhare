import { X } from "lucide-react";
import { useDict } from "@/hooks/useDict";
import type { Attachment } from "@/lib/composer";

export interface AttachmentChipProps {
  attachment: Attachment;
  onRemove: () => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const copy = useDict().hud.attachments;
  return (
    <div className="group relative size-12 overflow-hidden rounded-md ring-1 ring-inset ring-line">
      <img src={attachment.preview} alt={copy.alt} className="size-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={copy.remove}
        className="pointer-events-none absolute top-1 right-1 grid size-4.5 place-items-center rounded-full bg-scrim-chip text-on-scrim opacity-0 outline-none group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
