"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getContentPiecesAction } from "@/app/marketing/content/actions";
import {
  createDriveFolderAction,
  linkDriveFileToContentAction,
  listDriveFilesAction,
  type DriveFileListItem,
} from "@/app/marketing/content/drive-actions";
import { GOOGLE_OAUTH_START_URL } from "@/lib/google/oauth-paths";
import { paths } from "@/routes";
import type { ContentPiece } from "@/types/content";
import { Button, Input, cn } from "@ai-coo/ui";
import { useToast } from "@/providers/toast-provider";
import { LayoutGrid, List, RefreshCw, Folder } from "lucide-react";
import {
  ContentTypeIcon,
  DriveMimeIcon,
} from "@/components/marketing/marketing-icons";
import { ESCONDIDO } from "@/lib/release/escondido";

type DriveFile = DriveFileListItem;
type ViewMode = "grid" | "list";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function isFolder(mimeType: string): boolean {
  return mimeType === FOLDER_MIME;
}

function driveFileUrl(file: DriveFile): string {
  return file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
}

export function DriveAdminView() {
  const { push } = useToast();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();
  const [breadcrumb, setBreadcrumb] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [contentPieces, setContentPieces] = useState<ContentPiece[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingFile, setLinkingFile] = useState(false);

  const loadFiles = useCallback(async (folderId?: string) => {
    setLoading(true);
    setError(null);
    setNeedsConnect(false);
    setNeedsReconnect(false);

    try {
      const result = await listDriveFilesAction({ folderId });
      setFiles(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error";
      if (message === "GOOGLE_NOT_CONNECTED") {
        setNeedsConnect(true);
        setError("No hay conexión con Google Drive. Conectá tu cuenta de Google primero.");
      } else if (message === "GOOGLE_INSUFFICIENT_PERMISSIONS") {
        setNeedsReconnect(true);
        setError(
          "Permisos insuficientes. Reconectá tu cuenta de Google con acceso completo a Drive."
        );
      } else {
        setError(message);
      }
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const navigateToFolder = async (file: DriveFile) => {
    setCurrentFolderId(file.id);
    setBreadcrumb((prev) => [...prev, { id: file.id, name: file.name }]);
    await loadFiles(file.id);
  };

  const navigateBreadcrumb = async (index: number) => {
    if (index < 0) {
      setBreadcrumb([]);
      setCurrentFolderId(undefined);
      await loadFiles(undefined);
      return;
    }

    const newBreadcrumb = breadcrumb.slice(0, index + 1);
    const target = newBreadcrumb[index];
    setBreadcrumb(newBreadcrumb);
    setCurrentFolderId(target?.id);
    await loadFiles(target?.id);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    setCreatingFolder(true);
    try {
      await createDriveFolderAction({
        name: newFolderName.trim(),
        parentFolderId: currentFolderId,
      });
      setNewFolderName("");
      setShowNewFolderModal(false);
      push({ title: "Carpeta creada", variant: "success" });
      await loadFiles(currentFolderId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al crear carpeta";
      push({ title: "No se pudo crear la carpeta", description: message });
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleOpenLinkModal = async (file: DriveFile) => {
    setSelectedFile(file);
    setShowLinkModal(true);

    try {
      const pieces = await getContentPiecesAction({ limit: 50 });
      setContentPieces(pieces);
    } catch {
      setContentPieces([]);
    }
  };

  const handleLinkToContent = async (contentPieceId: string) => {
    if (!selectedFile) return;

    setLinkingFile(true);
    try {
      await linkDriveFileToContentAction(contentPieceId, {
        id: selectedFile.id,
        name: selectedFile.name,
        url: driveFileUrl(selectedFile),
      });
      setShowLinkModal(false);
      setSelectedFile(null);
      push({
        title: "Archivo vinculado",
        description: `"${selectedFile.name}" quedó asociado a la pieza de contenido.`,
        variant: "success",
      });
    } catch (err: unknown) {
      push({
        title: "Error al vincular",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setLinkingFile(false);
    }
  };

  const filteredFiles = searchQuery
    ? files.filter((file) =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : files;

  const folders = filteredFiles.filter((file) => isFolder(file.mimeType));
  const nonFolders = filteredFiles.filter((file) => !isFolder(file.mimeType));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => void navigateBreadcrumb(-1)}
            className="flex-shrink-0 font-medium text-primary hover:underline"
          >
            Mi Drive
          </button>
          {breadcrumb.map((crumb, index) => (
            <span key={crumb.id} className="flex min-w-0 items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <button
                type="button"
                onClick={() => void navigateBreadcrumb(index)}
                className={cn(
                  "truncate hover:underline",
                  index === breadcrumb.length - 1
                    ? "font-medium text-foreground"
                    : "text-primary"
                )}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        <Input
          type="search"
          placeholder="Filtrar..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 w-40"
        />

        {/* Crear carpeta siempre da error: escondido para el release (SCRUM-490). */}
        {!ESCONDIDO.marketingNuevaCarpeta && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowNewFolderModal(true)}
          >
            <Folder className="h-4 w-4 text-yellow-500" aria-hidden />
            Nueva carpeta
          </Button>
        )}

        <div className="flex overflow-hidden rounded-md border">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "px-2 py-1.5",
              viewMode === "grid"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
            aria-label="Vista en grilla"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={cn(
              "px-2 py-1.5",
              viewMode === "list"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
            aria-label="Vista en lista"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadFiles(currentFolderId)}
          aria-label="Actualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Cargando Drive...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="text-destructive">{error}</p>
            {needsConnect ? (
              <Button asChild size="sm">
                <Link href={paths.platform.integrations}>Ir a Integraciones</Link>
              </Button>
            ) : null}
            {needsReconnect ? (
              <Button asChild size="sm">
                <a href={GOOGLE_OAUTH_START_URL.google_forms}>Reconectar Google con Drive</a>
              </Button>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && filteredFiles.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            Esta carpeta está vacía
          </div>
        ) : null}

        {!loading && !error && filteredFiles.length > 0 ? (
          viewMode === "grid" ? (
            <div className="space-y-4">
              {folders.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Carpetas
                  </p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                    {folders.map((file) => (
                      <DriveFileCard
                        key={file.id}
                        file={file}
                        onOpen={() => void navigateToFolder(file)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {nonFolders.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Archivos
                  </p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                    {nonFolders.map((file) => (
                      <DriveFileCard
                        key={file.id}
                        file={file}
                        onOpen={() => window.open(driveFileUrl(file), "_blank")}
                        onLink={() => void handleOpenLinkModal(file)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <DriveListView
              files={filteredFiles}
              onNavigate={(file) => void navigateToFolder(file)}
              onLink={(file) => void handleOpenLinkModal(file)}
            />
          )
        ) : null}
      </div>

      {showNewFolderModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
            <h2 className="mb-4 font-semibold">Nueva carpeta</h2>
            <Input
              type="text"
              placeholder="Nombre de la carpeta"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateFolder();
              }}
              autoFocus
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewFolderName("");
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={creatingFolder || !newFolderName.trim()}
                onClick={() => void handleCreateFolder()}
              >
                {creatingFolder ? "Creando..." : "Crear"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showLinkModal && selectedFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
            <h2 className="mb-1 font-semibold">Vincular a pieza de contenido</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {selectedFile.name} → seleccioná la pieza de contenido
            </p>
            <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {contentPieces.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No hay piezas de contenido
                </p>
              ) : (
                contentPieces.map((piece) => (
                  <button
                    key={piece.id}
                    type="button"
                    onClick={() => void handleLinkToContent(piece.id)}
                    disabled={linkingFile}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                  >
                    <ContentTypeIcon type={piece.type} size={20} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {piece.title ?? piece.caption?.slice(0, 50) ?? "Sin título"}
                      </p>
                      <p className="flex flex-wrap items-center gap-1 text-xs capitalize text-muted-foreground">
                        <span>
                          {piece.type} ·{" "}
                          {piece.source === "zernio" ? "Instagram" : piece.source}
                        </span>
                        {piece.drive_file_id ? (
                          <span className="inline-flex items-center gap-1">
                            ·
                            <Folder className="h-3 w-3 text-yellow-500" aria-hidden />
                            Drive vinculado
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowLinkModal(false);
                  setSelectedFile(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DriveFileCard({
  file,
  onOpen,
  onLink,
}: {
  file: DriveFile;
  onOpen: () => void;
  onLink?: () => void;
}) {
  const folder = isFolder(file.mimeType);

  return (
    <div className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-sm">
      <div
        role="button"
        tabIndex={0}
        className="flex aspect-square cursor-pointer items-center justify-center bg-muted"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        {file.thumbnailLink && !folder ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.thumbnailLink}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <DriveMimeIcon mimeType={file.mimeType} size={40} />
        )}
      </div>

      <div className="p-2">
        <p className="line-clamp-2 text-xs font-medium leading-tight">{file.name}</p>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {new Date(file.modifiedTime).toLocaleDateString("es-AR", {
              day: "numeric",
              month: "short",
            })}
          </p>
          {!folder && onLink ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLink();
              }}
              className="text-xs text-primary opacity-0 transition-opacity hover:underline group-hover:opacity-100"
            >
              Vincular
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DriveListView({
  files,
  onNavigate,
  onLink,
}: {
  files: DriveFile[];
  onNavigate: (file: DriveFile) => void;
  onLink: (file: DriveFile) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Nombre
            </th>
            <th className="hidden px-4 py-2 text-left font-medium text-muted-foreground md:table-cell">
              Modificado
            </th>
            <th className="hidden px-4 py-2 text-left font-medium text-muted-foreground md:table-cell">
              Tamaño
            </th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {files.map((file) => (
            <tr key={file.id} className="hover:bg-muted/30">
              <td className="px-4 py-2">
                <button
                  type="button"
                  onClick={() =>
                    isFolder(file.mimeType)
                      ? onNavigate(file)
                      : window.open(driveFileUrl(file), "_blank")
                  }
                  className="flex w-full items-center gap-2 text-left"
                >
                  <DriveMimeIcon mimeType={file.mimeType} size={16} />
                  <span className="truncate">{file.name}</span>
                </button>
              </td>
              <td className="hidden px-4 py-2 text-muted-foreground md:table-cell">
                {new Date(file.modifiedTime).toLocaleDateString("es-AR")}
              </td>
              <td className="hidden px-4 py-2 text-muted-foreground md:table-cell">
                {file.size
                  ? `${(Number.parseInt(file.size, 10) / 1024 / 1024).toFixed(1)} MB`
                  : "—"}
              </td>
              <td className="px-4 py-2 text-right">
                {!isFolder(file.mimeType) ? (
                  <button
                    type="button"
                    onClick={() => onLink(file)}
                    className="text-xs text-primary hover:underline"
                  >
                    Vincular a contenido
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
