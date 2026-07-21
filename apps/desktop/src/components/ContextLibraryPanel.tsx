import { FileText, Folder, FolderPlus, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
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
import { readContextImportFile } from "@/ipc/commands";
import { isTauri } from "@/ipc/env";
import { onFileDrop } from "@/ipc/events";
import {
  docNameFromFileName,
  docsInFolder,
  rootDocs,
  type ContextDoc,
} from "@/lib/context-library";
import { cn } from "@/lib/utils";

const ROOT_FOLDER_ID = "";
const ROOT_SELECT_VALUE = "root";
const DROP_FOLDER_ATTR = "data-drop-folder";
const IMPORT_ACCEPT = ".md,.markdown,.txt";

interface DocDraft {
  id: string | null;
  name: string;
  text: string;
  folderId: string;
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

async function importBrowserFiles(
  api: ContextLibraryApi,
  files: FileList,
  folderId: string,
): Promise<void> {
  for (const file of Array.from(files)) {
    const text = await file.text();
    api.addDoc({ name: docNameFromFileName(file.name), text, folderId });
  }
}

function DocRow({
  doc,
  onEdit,
  onRemove,
}: {
  doc: ContextDoc;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[12px]">{doc.name}</span>
      <span className="shrink-0 text-[10.5px] text-muted-foreground/70">
        {doc.text.length.toLocaleString("ru-RU")} симв.
      </span>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="sm"
          className="size-6 p-0"
          title="Редактировать"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="size-6 p-0" title="Удалить" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function FolderHeader({
  name,
  onRename,
  onRemove,
}: {
  name: string;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  return (
    <div className="group flex items-center gap-2 px-2 py-1">
      <Folder className="size-4 shrink-0 text-muted-foreground" />
      {editing ? (
        <Input
          autoFocus
          value={draft}
          className="h-6 flex-1 text-[12px]"
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
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{name}</span>
      )}
      {!editing && (
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            title="Переименовать папку"
            onClick={() => {
              setDraft(name);
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            title="Удалить папку (материалы переедут в корень)"
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
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
    <div className="flex flex-col gap-2 rounded-md bg-white/5 p-2.5">
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
        className="field-sizing-fixed max-h-56 overflow-y-auto"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Отмена
        </Button>
        <Button size="sm" onClick={onSave}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}

export function ContextLibraryPanel({ api }: { api: ContextLibraryApi }) {
  const { library } = api;
  const [docDraft, setDocDraft] = useState<DocDraft | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useNativeFileDrop(api, setDropTarget, setImportError);

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
    if (files && files.length > 0) void importBrowserFiles(api, files, ROOT_FOLDER_ID);
    e.target.value = "";
  };

  const onBrowserDrop = (e: DragEvent<HTMLDivElement>) => {
    if (isTauri()) return;
    e.preventDefault();
    const target = dropTargetAt(e.clientX, e.clientY) ?? ROOT_FOLDER_ID;
    void importBrowserFiles(api, e.dataTransfer.files, target);
    setDropTarget(null);
  };

  const folderBlocks = library.folders.map((f) => ({
    folder: f,
    docs: docsInFolder(library, f.id),
  }));

  return (
    <div
      className="flex flex-col gap-2"
      onDragOver={(e) => {
        if (!isTauri()) e.preventDefault();
      }}
      onDrop={onBrowserDrop}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDocDraft({ id: null, name: "", text: "", folderId: ROOT_FOLDER_ID });
          }}
        >
          <Plus className="size-4" /> Материал
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            api.addFolder(`Папка ${String(library.folders.length + 1)}`);
          }}
        >
          <FolderPlus className="size-4" /> Папка
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          <Upload className="size-4" /> Импорт .md
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={IMPORT_ACCEPT}
          className="hidden"
          onChange={onPickFiles}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Перетащи .md или .txt из Finder на папку или в список — файл станет материалом.
      </p>
      {importError !== null && <p className="text-[11px] text-destructive">{importError}</p>}

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

      <div
        {...{ [DROP_FOLDER_ATTR]: ROOT_FOLDER_ID }}
        className={cn(
          "flex min-h-16 flex-col gap-0.5 rounded-md p-1 transition-colors",
          dropTarget === ROOT_FOLDER_ID && "bg-white/5 ring-1 ring-primary/50",
        )}
      >
        {library.docs.length === 0 && library.folders.length === 0 && (
          <p className="px-2 py-3 text-center text-[11.5px] text-muted-foreground">
            Пока пусто. Добавь материал текстом или перетащи .md-файлы сюда.
          </p>
        )}
        {rootDocs(library).map((doc) => (
          <DocRow
            key={doc.id}
            doc={doc}
            onEdit={() => {
              setDocDraft({ id: doc.id, name: doc.name, text: doc.text, folderId: doc.folderId });
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
            "flex flex-col gap-0.5 rounded-md border border-white/5 p-1",
            dropTarget === folder.id && "bg-white/5 ring-1 ring-primary/50",
          )}
        >
          <FolderHeader
            name={folder.name}
            onRename={(name) => {
              api.renameFolder(folder.id, name);
            }}
            onRemove={() => {
              api.removeFolder(folder.id);
            }}
          />
          {docs.length === 0 && (
            <p className="px-8 pb-1 text-[11px] text-muted-foreground/70">
              Пусто — перетащи файлы сюда
            </p>
          )}
          {docs.map((doc) => (
            <div key={doc.id} className="pl-4">
              <DocRow
                doc={doc}
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
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
