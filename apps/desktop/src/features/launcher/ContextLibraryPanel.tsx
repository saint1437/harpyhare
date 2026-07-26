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
import { readContextImportFile, readContextPdfBytes } from "@/ipc/commands";
import { onFileDrop } from "@/ipc/events";
import { arrayBufferToBase64 } from "@/lib/base64";
import {
  docNameFromFileName,
  docsInFolder,
  isPdfFileName,
  rootDocs,
  type ContextDoc,
} from "@/lib/context-library";
import { PLATFORM, type Platform } from "@/lib/platform";
import { cn } from "@/lib/utils";

const ROOT_FOLDER_ID = "";
const ROOT_SELECT_VALUE = "root";
const DROP_FOLDER_ATTR = "data-drop-folder";
const IMPORT_ACCEPT = ".md,.markdown,.txt,.pdf";
const THOUSAND = 1000;

const FILE_MANAGER_LABEL: Record<Platform, string> = {
  macos: "Finder",
  windows: "проводника",
};

interface DocDraft {
  id: string | null;
  name: string;
  text: string;
  folderId: string;
}

function formatChars(count: number): string {
  if (count < THOUSAND) return `${String(count)} симв.`;
  const thousands = (count / THOUSAND).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  return `${thousands} тыс. симв.`;
}

function dropTargetAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const host = el?.closest(`[${DROP_FOLDER_ATTR}]`);
  return host ? (host.getAttribute(DROP_FOLDER_ATTR) ?? ROOT_FOLDER_ID) : null;
}

function useNativeFileDrop(
  api: ContextLibraryApi,
  setDropTarget: (t: string | null) => void,
  setImportError: (e: string | null) => void,
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
        setImportError(null);
        for (const path of event.paths) {
          void readContextImportFile(path)
            .then((text) => {
              api.addDoc({ name: docNameFromFileName(path), text, folderId: target });
            })
            .catch((e: unknown) => {
              setImportError(String(e));
            });
        }
      }),
    [api, setDropTarget, setImportError],
  );
}

const DOC_DRAG_THRESHOLD_PX = 5;

function useDocDrag(
  api: ContextLibraryApi,
  setDropTarget: (t: string | null) => void,
): { dragDocId: string | null; startDrag: (docId: string, x: number, y: number) => void } {
  const [dragDocId, setDragDocId] = useState<string | null>(null);

  const startDrag = useCallback(
    (docId: string, startX: number, startY: number) => {
      let active = false;
      const onMove = (e: MouseEvent) => {
        if (!active && Math.hypot(e.clientX - startX, e.clientY - startY) < DOC_DRAG_THRESHOLD_PX)
          return;
        if (!active) {
          active = true;
          setDragDocId(docId);
        }
        setDropTarget(dropTargetAt(e.clientX, e.clientY));
      };
      const onUp = (e: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (active) {
          const target = dropTargetAt(e.clientX, e.clientY);
          if (target !== null) api.moveDoc(docId, target);
        }
        setDragDocId(null);
        setDropTarget(null);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [api, setDropTarget],
  );

  return { dragDocId, startDrag };
}

function importErrorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function extractPickedFile(file: File): Promise<string> {
  if (!isPdfFileName(file.name)) return file.text();
  return readContextPdfBytes(arrayBufferToBase64(await file.arrayBuffer()));
}

async function importPickedFiles(
  api: ContextLibraryApi,
  files: FileList,
  folderId: string,
  setImportError: (e: string | null) => void,
): Promise<void> {
  setImportError(null);
  for (const file of Array.from(files)) {
    try {
      const text = await extractPickedFile(file);
      api.addDoc({ name: docNameFromFileName(file.name), text, folderId });
    } catch (e: unknown) {
      setImportError(importErrorText(e));
    }
  }
}

function RowIconBadge({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface">
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
  onEdit?: () => void;
  onRemove: () => void;
  editTitle?: string;
  removeTitle: string;
}) {
  return (
    <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
      {onEdit && (
        <IconButton title={editTitle ?? ""} className="size-6 rounded-md" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </IconButton>
      )}
      <IconButton title={removeTitle} className="size-6 rounded-md" onClick={onRemove}>
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
  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest("button")) return;
    e.preventDefault();
    onDragStart(e.clientX, e.clientY);
  };
  return (
    <div
      onMouseDown={onMouseDown}
      title="Перетащи, чтобы переложить в папку"
      className={cn(
        "group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface",
        dragging && "opacity-40",
      )}
    >
      <GripVertical className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/50" />
      <RowIconBadge>
        <FileText className="size-3.5 text-muted-foreground" />
      </RowIconBadge>
      <span className="min-w-0 flex-1 truncate text-body">{doc.name}</span>
      <span className="shrink-0 text-hint text-muted-foreground">
        {formatChars(doc.text.length)}
      </span>
      <RowActions
        onEdit={onEdit}
        editTitle="Редактировать"
        onRemove={onRemove}
        removeTitle="Удалить материал"
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  return (
    <div className="group flex items-center gap-2 px-1.5 py-1">
      <RowIconBadge>
        <Folder className="size-3.5 text-muted-foreground" />
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
          <span className="shrink-0 rounded-full bg-surface px-1.5 py-px text-hint text-muted-foreground">
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
          editTitle="Переименовать папку"
          onRemove={onRemove}
          removeTitle="Удалить папку (материалы переедут в корень)"
        />
      )}
    </div>
  );
}

function DocEditor({
  draft,
  folders,
  onChange,
  onSave,
  onCancel,
}: {
  draft: DocDraft;
  folders: { id: string; name: string }[];
  onChange: (d: DocDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card/60 p-3 ring-1 ring-border ring-inset">
      <SectionLabel>{draft.id === null ? "Новый материал" : "Материал"}</SectionLabel>
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="Название материала"
          value={draft.name}
          onChange={(e) => {
            onChange({ ...draft, name: e.target.value });
          }}
        />
        <Select
          value={draft.folderId === ROOT_FOLDER_ID ? ROOT_SELECT_VALUE : draft.folderId}
          onValueChange={(v) => {
            onChange({ ...draft, folderId: v === ROOT_SELECT_VALUE ? ROOT_FOLDER_ID : v });
          }}
        >
          <SelectTrigger className="w-[160px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ROOT_SELECT_VALUE}>Без папки</SelectItem>
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
        placeholder="Текст материала (markdown или обычный текст)"
        value={draft.text}
        onChange={(e) => {
          onChange({ ...draft, text: e.target.value });
        }}
        className="max-h-56 overflow-y-auto"
      />
      <div className="flex items-center justify-between">
        <span className="text-hint text-muted-foreground">{formatChars(draft.text.length)}</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Отмена
          </Button>
          <Button size="sm" onClick={onSave}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyDropZone({ onPick }: { onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      {...{ [DROP_FOLDER_ATTR]: ROOT_FOLDER_ID }}
      className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors outline-none hover:border-foreground/30 hover:bg-surface focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="grid size-9 place-items-center rounded-full bg-surface">
        <Upload className="size-4 text-muted-foreground" />
      </span>
      <span className="text-body text-foreground/80">
        Перетащи .md, .txt или .pdf из {FILE_MANAGER_LABEL[PLATFORM]} — или нажми, чтобы выбрать
        файлы
      </span>
      <span className="text-caption text-muted-foreground">
        Материалы можно добавлять и текстом — кнопка «Материал»
      </span>
    </button>
  );
}

function librarySummary(docCount: number, folderCount: number): string {
  if (docCount === 0 && folderCount === 0) return "Библиотека пуста";
  const docs = `матер.: ${String(docCount)}`;
  return folderCount > 0 ? `${docs} · папок: ${String(folderCount)}` : docs;
}

export function ContextLibraryPanel({ api }: { api: ContextLibraryApi }) {
  const { library } = api;
  const [docDraft, setDocDraft] = useState<DocDraft | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useNativeFileDrop(api, setDropTarget, setImportError);
  const { dragDocId, startDrag } = useDocDrag(api, setDropTarget);

  const saveDocDraft = () => {
    if (!docDraft) return;
    if (docDraft.id === null) {
      api.addDoc({ name: docDraft.name, text: docDraft.text, folderId: docDraft.folderId });
    } else {
      api.updateDoc(docDraft.id, { name: docDraft.name, text: docDraft.text });
      api.moveDoc(docDraft.id, docDraft.folderId);
    }
    setDocDraft(null);
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0)
      void importPickedFiles(api, files, ROOT_FOLDER_ID, setImportError);
    e.target.value = "";
  };

  const empty = library.docs.length === 0 && library.folders.length === 0;
  const roots = rootDocs(library);
  const folderBlocks = library.folders.map((f) => ({
    folder: f,
    docs: docsInFolder(library, f.id),
  }));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-muted-foreground">
          {librarySummary(library.docs.length, library.folders.length)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="compact"
            onClick={() => {
              setDocDraft({ id: null, name: "", text: "", folderId: ROOT_FOLDER_ID });
            }}
          >
            <Plus /> Материал
          </Button>
          <Button
            variant="ghost"
            size="compact"
            onClick={() => {
              api.addFolder(`Папка ${String(library.folders.length + 1)}`);
            }}
          >
            <FolderPlus /> Папка
          </Button>
          <Button
            variant="ghost"
            size="compact"
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            <Upload /> Импорт
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

      {importError !== null && <p className="text-caption text-destructive">{importError}</p>}

      {docDraft && (
        <DocEditor
          draft={docDraft}
          folders={library.folders}
          onChange={setDocDraft}
          onSave={saveDocDraft}
          onCancel={() => {
            setDocDraft(null);
          }}
        />
      )}

      {empty && !docDraft ? (
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
              dropTarget === ROOT_FOLDER_ID && "bg-primary/5 ring-1 ring-primary/40",
            )}
          >
            {library.folders.length > 0 && (
              <SectionLabel className="px-1.5 pt-0.5 pb-1">Без папки</SectionLabel>
            )}
            {roots.length === 0 && (
              <p className="px-1.5 pb-1 text-caption text-muted-foreground">
                Перетащи файлы сюда, чтобы добавить без папки
              </p>
            )}
            {roots.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                dragging={dragDocId === doc.id}
                onDragStart={(x, y) => {
                  startDrag(doc.id, x, y);
                }}
                onEdit={() => {
                  setDocDraft({
                    id: doc.id,
                    name: doc.name,
                    text: doc.text,
                    folderId: doc.folderId,
                  });
                }}
                onRemove={() => {
                  api.removeDoc(doc.id);
                }}
              />
            ))}
          </div>

          {folderBlocks.map(({ folder, docs }) => (
            <div
              key={folder.id}
              {...{ [DROP_FOLDER_ATTR]: folder.id }}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg bg-white/[0.03] p-1.5 ring-1 ring-white/5 transition-colors",
                dropTarget === folder.id && "bg-primary/5 ring-primary/40",
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
                  <p className="px-1.5 py-1 text-caption text-muted-foreground">
                    Пусто — перетащи файлы сюда
                  </p>
                )}
                {docs.map((doc) => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    dragging={dragDocId === doc.id}
                    onDragStart={(x, y) => {
                      startDrag(doc.id, x, y);
                    }}
                    onEdit={() => {
                      setDocDraft({
                        id: doc.id,
                        name: doc.name,
                        text: doc.text,
                        folderId: doc.folderId,
                      });
                    }}
                    onRemove={() => {
                      api.removeDoc(doc.id);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
