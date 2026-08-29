import {
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { IconButton } from "@/components/IconButton";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ContextLibraryApi } from "@/hooks/useContextLibrary";
import { useDict } from "@/hooks/useDict";
import { format, getDict } from "@/i18n";
import type { Dictionary } from "@/i18n/types";
import { readContextImportFile, readContextPdfBytes } from "@/ipc/commands";
import { onFileDrop } from "@/ipc/events";
import { arrayBufferToBase64 } from "@/lib/base64";
import {
  docNameFromFileName,
  isPdfFileName,
  type ContextDoc,
  docLimitNotice,
  libraryIsFull,
} from "@/lib/context-library";
import { notifyError } from "@/lib/notifications";
import { PLATFORM } from "@/lib/platform";
import { cn, SURFACE_CARD_CLASS } from "@/lib/utils";

const ROOT_FOLDER_ID = "";
const ROOT_SELECT_VALUE = "root";
const DROP_FOLDER_ATTR = "data-drop-folder";
const IMPORT_ACCEPT = ".md,.markdown,.txt,.pdf";
const THOUSAND = 1000;
const THOUSANDS_FRACTION_DIGITS = 1;
const NO_DOCS: ContextDoc[] = [];

interface DocDraft {
  id: string | null;
  name: string;
  text: string;
  folderId: string;
}

function formatChars(count: number, dict: Dictionary): string {
  const copy = dict.launcher.contexts;
  if (count < THOUSAND) return format(copy.chars, { count: String(count) });
  const thousands = (count / THOUSAND).toLocaleString(dict.locale, {
    maximumFractionDigits: THOUSANDS_FRACTION_DIGITS,
  });
  return format(copy.charsThousands, { count: thousands });
}

function dropTargetAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const host = el?.closest(`[${DROP_FOLDER_ATTR}]`);
  return host ? (host.getAttribute(DROP_FOLDER_ATTR) ?? ROOT_FOLDER_ID) : null;
}

/**
 * `addDoc` alone, never the whole api: the api carries `library`, so every doc
 * added re-registered `onDragDropEvent` through an async IPC round trip — and
 * during a multi-file drop that killed the listener handling that very drop.
 */
function useNativeFileDrop(
  addDoc: ContextLibraryApi["addDoc"],
  setDropTarget: (t: string | null) => void,
): void {
  useEffect(
    () =>
      onFileDrop((event) => {
        if (event.type === "leave") {
          setDropTarget(null);
          return;
        }
        if (event.type === "over") {
          setDropTarget(dropTargetAt(event.x, event.y));
          return;
        }
        const target = dropTargetAt(event.x, event.y);
        setDropTarget(null);
        if (target === null) return;
        for (const path of event.paths) {
          void readContextImportFile(path)
            .then((text) => {
              addDoc({ name: docNameFromFileName(path), text, folderId: target });
            })
            .catch((e: unknown) => {
              notifyImportFailure(docNameFromFileName(path), e);
            });
        }
      }),
    [addDoc, setDropTarget],
  );
}

const DOC_DRAG_THRESHOLD_PX = 5;

const NO_FRAME = 0;

function useDocDrag(
  moveDoc: ContextLibraryApi["moveDoc"],
  setDropTarget: (t: string | null) => void,
): { dragDocId: string | null; startDrag: (docId: string, x: number, y: number) => void } {
  const [dragDocId, setDragDocId] = useState<string | null>(null);

  const startDrag = useCallback(
    (docId: string, startX: number, startY: number) => {
      let active = false;
      // `dropTargetAt` is `elementFromPoint` + `closest`, i.e. a forced style and
      // layout flush, and mousemove fires far more often than the screen is
      // painted — so the hit test is coalesced to one per frame. The pointer is
      // only ever over one folder per frame anyway.
      let frame = NO_FRAME;
      let last: { x: number; y: number } | null = null;
      const hitTest = () => {
        frame = NO_FRAME;
        if (last === null) return;
        setDropTarget(dropTargetAt(last.x, last.y));
        last = null;
      };
      const onMove = (e: MouseEvent) => {
        if (!active && Math.hypot(e.clientX - startX, e.clientY - startY) < DOC_DRAG_THRESHOLD_PX)
          return;
        if (!active) {
          active = true;
          setDragDocId(docId);
        }
        last = { x: e.clientX, y: e.clientY };
        if (frame === NO_FRAME) frame = requestAnimationFrame(hitTest);
      };
      const onUp = (e: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (frame !== NO_FRAME) cancelAnimationFrame(frame);
        frame = NO_FRAME;
        last = null;
        if (active) {
          const target = dropTargetAt(e.clientX, e.clientY);
          if (target !== null) moveDoc(docId, target);
        }
        setDragDocId(null);
        setDropTarget(null);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [moveDoc, setDropTarget],
  );

  return { dragDocId, startDrag };
}

// Импорт валится по-разному и многословно: PDF на 20 МБ, битый PDF из
// `catch_unwind`, файл, который не прочитать. Имя файла — в заголовок, весь
// текст отказа — в тело уведомления.
function notifyImportFailure(name: string, e: unknown): void {
  const title = format(getDict().launcher.contexts.importFailedTitle, { name });
  notifyError(title, e instanceof Error ? e.message : String(e));
}

async function extractPickedFile(file: File): Promise<string> {
  if (!isPdfFileName(file.name)) return file.text();
  return readContextPdfBytes(arrayBufferToBase64(await file.arrayBuffer()));
}

// In parallel, like the OS-drop path above: ten picked PDFs used to be ten
// sequential `read_context_pdf_bytes` round trips. The per-file catch already
// isolates a failure, so one bad file still costs only itself.
async function importPickedFiles(
  api: ContextLibraryApi,
  files: FileList,
  folderId: string,
): Promise<void> {
  await Promise.all(
    Array.from(files).map(async (file) => {
      try {
        const text = await extractPickedFile(file);
        api.addDoc({ name: docNameFromFileName(file.name), text, folderId });
      } catch (e: unknown) {
        notifyImportFailure(docNameFromFileName(file.name), e);
      }
    }),
  );
}

function RowIconBadge({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-surface">
      {children}
    </span>
  );
}

function RowActions({
  onEdit,
  onRemove,
  editTitle,
  removeTitle,
}: {
  onEdit: () => void;
  onRemove: () => void;
  editTitle: string;
  removeTitle: string;
}) {
  return (
    <div className="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
      <IconButton title={editTitle} className="size-6" onClick={onEdit}>
        <Pencil className="size-3.5" />
      </IconButton>
      <IconButton title={removeTitle} className="size-6 hover:text-danger" onClick={onRemove}>
        <Trash2 className="size-3.5" />
      </IconButton>
    </div>
  );
}

function DocRow({
  doc,
  dragging,
  onDragStart,
  onEdit,
  onRemove,
}: {
  doc: ContextDoc;
  dragging: boolean;
  onDragStart: (x: number, y: number) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const dict = useDict();
  const copy = dict.launcher.contexts;
  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest("button")) return;
    e.preventDefault();
    onDragStart(e.clientX, e.clientY);
  };
  return (
    <div
      onMouseDown={onMouseDown}
      title={copy.dragDocTitle}
      className={cn(
        "group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface active:bg-surface-active",
        dragging && "opacity-40",
      )}
    >
      <GripVertical className="size-3.5 shrink-0 text-fg-subtle/35 transition-colors group-hover:text-fg-subtle" />
      <RowIconBadge>
        <FileText className="size-3.5 text-fg-subtle" />
      </RowIconBadge>
      <span className="min-w-0 flex-1 truncate text-body">{doc.name}</span>
      <span className="shrink-0 text-hint text-fg-subtle">
        {formatChars(doc.text.length, dict)}
      </span>
      <RowActions
        onEdit={onEdit}
        editTitle={copy.editDoc}
        onRemove={onRemove}
        removeTitle={copy.removeDoc}
      />
    </div>
  );
}

function FolderHeader({
  name,
  docCount,
  onRename,
  onRemove,
}: {
  name: string;
  docCount: number;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const copy = useDict().launcher.contexts;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  return (
    <div className="group flex items-center gap-2 px-1.5 py-1">
      <RowIconBadge>
        <Folder className="size-3.5 text-fg-subtle" />
      </RowIconBadge>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          className="h-6 flex-1 text-body"
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onBlur={() => {
            onRename(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <>
          <span className="min-w-0 truncate text-body font-medium">{name}</span>
          <span className="shrink-0 rounded-full bg-surface px-1.5 py-px text-hint text-fg-subtle">
            {docCount}
          </span>
          <span className="flex-1" />
        </>
      )}
      {!editing && (
        <RowActions
          onEdit={() => {
            setDraft(name);
            setEditing(true);
          }}
          editTitle={copy.renameFolder}
          onRemove={onRemove}
          removeTitle={copy.removeFolder}
        />
      )}
    </div>
  );
}

/**
 * The draft lives here, not in the panel: `text` runs to DOC_TEXT_LIMIT_CHARS,
 * and while it sat one level up every keystroke re-rendered the list beside the
 * editor — the root docs, every folder block and up to a hundred rows. Only the
 * finished value leaves, on Save.
 */
function DocEditor({
  initial,
  folders,
  onSave,
  onCancel,
}: {
  initial: DocDraft;
  folders: { id: string; name: string }[];
  onSave: (draft: DocDraft) => void;
  onCancel: () => void;
}) {
  const dict = useDict();
  const copy = dict.launcher.contexts;
  const [draft, setDraft] = useState(initial);
  return (
    <div className={cn("flex flex-col gap-2 p-3", SURFACE_CARD_CLASS)}>
      <SectionLabel>{draft.id === null ? copy.editorNewTitle : copy.editorTitle}</SectionLabel>
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder={copy.docNamePlaceholder}
          value={draft.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value });
          }}
        />
        <Select
          value={draft.folderId === ROOT_FOLDER_ID ? ROOT_SELECT_VALUE : draft.folderId}
          onValueChange={(v) => {
            setDraft({ ...draft, folderId: v === ROOT_SELECT_VALUE ? ROOT_FOLDER_ID : v });
          }}
        >
          <SelectTrigger className="w-[160px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ROOT_SELECT_VALUE}>{copy.noFolder}</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Textarea
        rows={8}
        placeholder={copy.docTextPlaceholder}
        value={draft.text}
        onChange={(e) => {
          setDraft({ ...draft, text: e.target.value });
        }}
        className="max-h-56 overflow-y-auto"
      />
      <div className="flex items-center justify-between">
        <span className="text-hint text-fg-subtle">{formatChars(draft.text.length, dict)}</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {dict.common.actions.cancel}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(draft);
            }}
          >
            {dict.common.actions.save}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyDropZone({ onPick }: { onPick: () => void }) {
  const copy = useDict().launcher.contexts;
  return (
    <button
      type="button"
      onClick={onPick}
      {...{ [DROP_FOLDER_ATTR]: ROOT_FOLDER_ID }}
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-7 text-center transition-colors outline-none hover:border-fg/30 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-surface ring-1 ring-inset ring-line">
        <Upload className="size-4 text-fg-subtle" />
      </span>
      <span className="text-body text-fg">
        {format(copy.dropZone, { fileManager: copy.fileManager[PLATFORM] })}
      </span>
      <span className="text-caption text-fg-subtle">{copy.dropZoneHint}</span>
    </button>
  );
}

function librarySummary(docCount: number, folderCount: number, dict: Dictionary): string {
  const copy = dict.launcher.contexts;
  if (docCount === 0 && folderCount === 0) return copy.empty;
  const docs = String(docCount);
  return folderCount > 0
    ? format(copy.summaryDocsAndFolders, { docs, folders: String(folderCount) })
    : format(copy.summaryDocs, { docs });
}

export function ContextLibraryPanel({ api }: { api: ContextLibraryApi }) {
  const dict = useDict();
  const copy = dict.launcher.contexts;
  const { library } = api;
  // The seed the editor opens with, and its identity — reopening on another doc
  // while the editor is up has to remount it, which is what the key is for.
  const [editing, setEditing] = useState<{ key: number; seed: DocDraft } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorKey = useRef(0);

  useNativeFileDrop(api.addDoc, setDropTarget);
  const { dragDocId, startDrag } = useDocDrag(api.moveDoc, setDropTarget);

  const openEditor = (seed: DocDraft) => {
    editorKey.current += 1;
    setEditing({ key: editorKey.current, seed });
  };

  const closeEditor = () => {
    setEditing(null);
  };

  const saveDoc = (draft: DocDraft) => {
    if (draft.id === null) {
      api.addDoc({ name: draft.name, text: draft.text, folderId: draft.folderId });
    } else {
      api.updateDoc(draft.id, { name: draft.name, text: draft.text });
      api.moveDoc(draft.id, draft.folderId);
    }
    setEditing(null);
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) void importPickedFiles(api, files, ROOT_FOLDER_ID);
    e.target.value = "";
  };

  const docRow = (doc: ContextDoc) => (
    <DocRow
      key={doc.id}
      doc={doc}
      dragging={dragDocId === doc.id}
      onDragStart={(x, y) => {
        startDrag(doc.id, x, y);
      }}
      onEdit={() => {
        openEditor({ id: doc.id, name: doc.name, text: doc.text, folderId: doc.folderId });
      }}
      onRemove={() => {
        api.removeDoc(doc.id);
      }}
    />
  );

  const empty = library.docs.length === 0 && library.folders.length === 0;
  const full = libraryIsFull(library);
  // One pass over the documents instead of one pass PER FOLDER: the blocks used
  // to cost O(folders × docs) on every render of the panel.
  const docsByFolder = useMemo(() => {
    const grouped = new Map<string, ContextDoc[]>();
    for (const doc of library.docs) {
      const bucket = grouped.get(doc.folderId);
      if (bucket === undefined) grouped.set(doc.folderId, [doc]);
      else bucket.push(doc);
    }
    return grouped;
  }, [library.docs]);
  const roots = docsByFolder.get(ROOT_FOLDER_ID) ?? NO_DOCS;
  const folderBlocks = library.folders.map((f) => ({
    folder: f,
    docs: docsByFolder.get(f.id) ?? NO_DOCS,
  }));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-fg-subtle">
          {full
            ? docLimitNotice(dict)
            : librarySummary(library.docs.length, library.folders.length, dict)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="compact"
            disabled={full}
            onClick={() => {
              openEditor({ id: null, name: "", text: "", folderId: ROOT_FOLDER_ID });
            }}
          >
            <Plus /> {copy.addDoc}
          </Button>
          <Button
            variant="ghost"
            size="compact"
            onClick={() => {
              api.addFolder(
                format(copy.newFolderName, { number: String(library.folders.length + 1) }),
              );
            }}
          >
            <FolderPlus /> {copy.addFolder}
          </Button>
          <Button
            variant="ghost"
            size="compact"
            disabled={full}
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            <Upload /> {copy.import}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={IMPORT_ACCEPT}
          className="hidden"
          onChange={onPickFiles}
        />
      </div>

      {editing && (
        <DocEditor
          key={editing.key}
          initial={editing.seed}
          folders={library.folders}
          onSave={saveDoc}
          onCancel={closeEditor}
        />
      )}

      {empty && !editing ? (
        <EmptyDropZone
          onPick={() => {
            fileInputRef.current?.click();
          }}
        />
      ) : (
        <>
          <div
            {...{ [DROP_FOLDER_ATTR]: ROOT_FOLDER_ID }}
            className={cn(
              "flex flex-col gap-0.5 rounded-lg p-1 transition-colors",
              dropTarget === ROOT_FOLDER_ID && "bg-accent/10 ring-1 ring-accent/40",
            )}
          >
            {library.folders.length > 0 && (
              <SectionLabel className="px-1.5 pt-0.5 pb-1">{copy.noFolder}</SectionLabel>
            )}
            {roots.length === 0 && (
              <p className="px-1.5 pb-1 text-caption text-fg-subtle">{copy.dropRootHint}</p>
            )}
            {roots.map(docRow)}
          </div>

          {folderBlocks.map(({ folder, docs }) => (
            <div
              key={folder.id}
              {...{ [DROP_FOLDER_ATTR]: folder.id }}
              className={cn(
                "flex flex-col gap-0.5 p-1.5 transition-colors",
                SURFACE_CARD_CLASS,
                dropTarget === folder.id && "bg-accent/10 ring-accent/40",
              )}
            >
              <FolderHeader
                name={folder.name}
                docCount={docs.length}
                onRename={(name) => {
                  api.renameFolder(folder.id, name);
                }}
                onRemove={() => {
                  api.removeFolder(folder.id);
                }}
              />
              <div className="ml-4 flex flex-col gap-0.5 border-l pl-2">
                {docs.length === 0 && (
                  <p className="px-1.5 py-1 text-caption text-fg-subtle">{copy.dropFolderHint}</p>
                )}
                {docs.map(docRow)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
