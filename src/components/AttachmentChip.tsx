import { X } from "lucide-react";
import type { Attachment } from "@/lib/composer";

export interface AttachmentChipProps {
  attachment: Attachment;
  onRemove: () => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  return (
    <div className="group relative h-[52px] w-[52px] overflow-hidden rounded-md ring-1 ring-border ring-inset">
      <img src={attachment.preview} alt="Вложение" className="size-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Удалить вложение"
        className="absolute top-1 right-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-black/75 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
