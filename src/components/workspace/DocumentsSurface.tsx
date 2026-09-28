"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, EllipsisVertical, Plus, X } from "lucide-react";
import { DocumentDeleteButton } from "@/components/workspace/DocumentDeleteButton";
import { DocumentProcessButton } from "@/components/workspace/DocumentProcessButton";
import { DocumentUploadDropzone } from "@/components/workspace/DocumentUploadDropzone";
import { getFileKindLabel, inferSupportedFileKind } from "@/lib/document-processing/fileKinds";
import type { DocumentListItem, PrivacyMode } from "@/types";
import styles from "./DocumentsSurface.module.css";

type DocumentsSurfaceProps = {
  collectionId: string;
  collectionName: string;
  defaultProcessingMode: PrivacyMode;
  documents: DocumentListItem[];
  documentsError?: string | null;
  onBack: () => void;
};

type FilterKey = "all" | "ready" | "processing" | "failed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "processing", label: "Processing" },
  { key: "failed", label: "Needs attention" },
];

function getSafeFilename(filename: string | null | undefined) {
  return typeof filename === "string" && filename.trim().length > 0 ? filename.trim() : "Untitled document";
}

function humanSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatUploaded(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const datePart = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
  const timePart = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${datePart}, ${timePart}`;
}

function stageLabel(stage: DocumentListItem["processingStage"]) {
  switch (stage) {
    case "validating":
      return "Validating";
    case "uploading":
      return "Uploading";
    case "extracting":
    case "ocr_fallback":
      return "Extracting text";
    case "chunking":
    case "embedding":
      return "Preparing passages";
    case "indexing":
      return "Indexing";
    default:
      return "Processing";
  }
}

export function DocumentsSurface({
  collectionId,
  collectionName,
  defaultProcessingMode,
  documents,
  documentsError,
  onBack,
}: DocumentsSurfaceProps) {
  void collectionName;
  void defaultProcessingMode;
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSheetMode, setIsSheetMode] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogCardRef = useRef<HTMLDivElement>(null);
  const dialogCloseRef = useRef<HTMLButtonElement>(null);
  const asideCloseRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const menuWrapRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1099px)");
    function handleChange(event: MediaQueryListEvent) {
      setIsSheetMode(event.matches);
    }
    setIsSheetMode(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  const scrollLocked = dialogOpen || (isSheetMode && selectedId !== null);
  useEffect(() => {
    if (!scrollLocked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [scrollLocked]);

  useEffect(() => {
    if (!dialogOpen) return;
    dialogCloseRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const container = dialogCardRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLAnchorElement | HTMLButtonElement | HTMLInputElement>("a[href], button:not([disabled]), input, textarea, select, summary"),
      ).filter((element) => element.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen]);

  useEffect(() => {
    if (!isSheetMode || selectedId === null) return;
    asideCloseRef.current?.focus();
  }, [isSheetMode, selectedId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openMenuId) {
        setOpenMenuId(null);
        return;
      }
      if (dialogOpen) {
        closeDialog();
        return;
      }
      if (selectedId !== null) {
        deselect(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!openMenuId) return;
    const menuId = openMenuId;
    function onDown(event: MouseEvent) {
      const wrap = menuWrapRefs.current[menuId];
      if (wrap && !wrap.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenuId]);

  const readyCount = documents.filter((document) => document.status === "ready").length;
  const processingCount = documents.filter((document) => document.status === "processing").length;
  const failedCount = documents.filter((document) => document.status === "failed").length;
  const filtered = documents.filter((document) => {
    if (filter === "ready") return document.status === "ready";
    if (filter === "processing") return document.status === "processing";
    if (filter === "failed") return document.status === "failed";
    return true;
  });
  const selectedDocument = documents.find((document) => document.id === selectedId) ?? null;
  const batchInFlight = processingCount > 0;

  function openDialog(trigger: HTMLButtonElement) {
    dialogTriggerRef.current = trigger;
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    const trigger = dialogTriggerRef.current;
    if (trigger && document.contains(trigger)) {
      trigger.focus();
    }
    dialogTriggerRef.current = null;
  }

  function chooseFiles() {
    dialogCardRef.current?.querySelector<HTMLInputElement>("input[type='file']")?.click();
  }

  function retryLoad() {
    startTransition(() => {
      router.refresh();
    });
  }

  function selectDocument(id: string, trigger: HTMLElement | null) {
    lastTriggerRef.current = trigger;
    setSelectedId(id);
  }

  function deselect(restore: boolean) {
    setSelectedId(null);
    if (restore && isSheetMode) {
      const trigger = lastTriggerRef.current;
      if (trigger && document.contains(trigger)) {
        trigger.focus();
      }
      lastTriggerRef.current = null;
    }
  }

  return (
    <>
      <section className={styles.canvas} aria-label="Documents">
        <div className={styles.headRow}>
          <div className={styles.headText}>
            <button type="button" className={styles.backBtn} onClick={onBack}>
              <ArrowLeft className={styles.icon} aria-hidden="true" />
              Ask a question
            </button>
            <p className={styles.eyebrow}>Workspace</p>
            <h1 className={styles.title}>Documents</h1>
            <p className={styles.lede}>
              Files become answerable only after extraction and indexing complete. OCR runs only when a file has no usable embedded text.
            </p>
          </div>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={(event) => openDialog(event.currentTarget)}
          >
            <Plus className={styles.icon} aria-hidden="true" />
            Add documents
          </button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.chips}>
            <span className={styles.chip}>
              <span className={`${styles.statusDot} ${styles.dotOk}`} aria-hidden="true" />
              {readyCount} ready
            </span>
            <span className={styles.chip}>
              <span className={`${styles.statusDot} ${styles.dotRust}`} aria-hidden="true" />
              {processingCount} processing
            </span>
            <span className={styles.chip}>
              <span className={`${styles.statusDot} ${styles.dotRed}`} aria-hidden="true" />
              {failedCount} need attention
            </span>
          </div>
          <div className={styles.filters} role="group" aria-label="Filter documents by status">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={`${styles.filterBtn} ${filter === entry.key ? styles.filterBtnActive : ""}`}
                aria-pressed={filter === entry.key}
                onClick={() => setFilter(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        {batchInFlight ? (
          <p className={styles.batchNote}>Ingestion in flight · {processingCount} processing</p>
        ) : null}

        <div className={styles.tableCard}>
          {documentsError ? (
            <div className={styles.errorBlock} role="alert">
              <p>We couldn&apos;t load this workspace&apos;s documents. Previously loaded data is kept in memory.</p>
              <button type="button" className={styles.ghostBtn} onClick={retryLoad}>
                Try again
              </button>
            </div>
          ) : null}

          {!documentsError && isPending ? (
            <div className={styles.skeleton} aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <div className={styles.skelRow} key={row}>
                  <span className={styles.skelCell}>
                    <span className={styles.skelBar} />
                    <span className={styles.skelSub} />
                  </span>
                  <span className={styles.skelBar} />
                  <span className={styles.skelBar} />
                  <span className={styles.skelBar} />
                  <span className={styles.skelBar} />
                </div>
              ))}
            </div>
          ) : null}

          {!documentsError && !isPending && documents.length === 0 ? (
            <div className={styles.emptyBlock}>
              <h2 className={styles.emptyTitle}>No documents yet</h2>
              <p className={styles.emptyCopy}>
                Add PDFs, spreadsheets, or text files. Each file is extracted, prepared into passages, and indexed before it can support an answer.
              </p>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={(event) => openDialog(event.currentTarget)}
              >
                <Plus className={styles.icon} aria-hidden="true" />
                Add documents
              </button>
            </div>
          ) : null}

          {!documentsError && !isPending && documents.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table} aria-label="Documents in this workspace">
                <colgroup>
                  <col className={styles.colDoc} />
                  <col className={styles.colStatus} />
                  <col className={styles.colMode} />
                  <col className={styles.colUp} />
                  <col className={styles.colAct} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={styles.th}>Document</th>
                    <th scope="col" className={styles.th}>Status</th>
                    <th scope="col" className={styles.th}>Mode</th>
                    <th scope="col" className={styles.th}>Uploaded</th>
                    <th scope="col" className={styles.th}>
                      <span className={styles.srOnly}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((document) => {
                    const filename = getSafeFilename(document.filename);
                    const isSelected = selectedId === document.id;
                    return (
                      <tr
                        key={document.id}
                        className={`${styles.row} ${isSelected ? styles.rowSelected : ""}`}
                        aria-current={isSelected ? "true" : undefined}
                        onClick={() => selectDocument(document.id, null)}
                      >
                        <td className={styles.td}>
                          <span className={styles.docName} title={filename}>{filename}</span>
                          <span className={styles.docSub}>
                            {getFileKindLabel(inferSupportedFileKind(filename))} · {humanSize(document.fileSize)}
                          </span>
                        </td>
                        <td className={styles.td}>
                          <span
                            className={`${styles.statusChip} ${
                              document.status === "ready"
                                ? styles.statusOk
                                : document.status === "processing"
                                  ? styles.statusRust
                                  : styles.statusRed
                            }`}
                          >
                            <span
                              className={`${styles.statusDot} ${
                                document.status === "ready"
                                  ? styles.dotOk
                                  : document.status === "processing"
                                    ? styles.dotRust
                                    : styles.dotRed
                              }`}
                              aria-hidden="true"
                            />
                            {document.status === "ready" ? "Ready" : document.status === "processing" ? "Processing" : "Needs attention"}
                          </span>
                          {document.status === "processing" ? (
                            <>
                              <span className={styles.stageText}>{stageLabel(document.processingStage)}</span>
                              <span className={styles.shimmer} aria-hidden="true" />
                            </>
                          ) : null}
                          {document.status === "ready" && document.pageCount > 0 ? (
                            <span className={styles.stageText}>{document.pageCount} pages extracted</span>
                          ) : null}
                          {document.status === "failed" ? (
                            <p className={styles.failNote}>
                              Processing did not complete, so this document has not been added to search. Retry from the actions menu or document details.
                            </p>
                          ) : null}
                        </td>
                        <td className={styles.td}>
                          {document.processingMode === "privacy_minimised" ? "Privacy-minimised" : "Standard"}
                        </td>
                        <td className={styles.td}>{formatUploaded(document.createdAt)}</td>
                        <td className={`${styles.td} ${styles.actionsCell}`} onClick={(event) => event.stopPropagation()}>
                          <div
                            className={styles.menuWrap}
                            ref={(element) => {
                              menuWrapRefs.current[document.id] = element;
                            }}
                          >
                            <button
                              type="button"
                              className={styles.menuBtn}
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === document.id}
                              aria-label={`Actions for ${filename}`}
                              onClick={() => setOpenMenuId((current) => (current === document.id ? null : document.id))}
                            >
                              <EllipsisVertical className={styles.icon} aria-hidden="true" />
                            </button>
                            {openMenuId === document.id ? (
                              <div role="menu" aria-label={`Actions for ${filename}`} className={styles.rowMenu}>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={styles.menuItem}
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    selectDocument(document.id, null);
                                  }}
                                >
                                  View details
                                </button>
                                {document.status === "failed" ? (
                                  <span role="none" className={styles.menuRetryWrap}>
                                    <DocumentProcessButton documentId={document.id} label="Retry" />
                                  </span>
                                ) : null}
                                <DocumentDeleteButton
                                  className={styles.menuItem}
                                  documentId={document.id}
                                  filename={filename}
                                  onDeleted={() => setOpenMenuId(null)}
                                />
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {!documentsError && !isPending && documents.length > 0 ? (
            <ul className={styles.cards} aria-label="Documents in this workspace">
              {filtered.map((document) => {
                const filename = getSafeFilename(document.filename);
                const isSelected = selectedId === document.id;
                return (
                  <li key={document.id} className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}>
                    <button
                      type="button"
                      className={styles.cardSelect}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={(event) => selectDocument(document.id, event.currentTarget)}
                    >
                      <span className={styles.cardName} title={filename}>{filename}</span>
                      <span className={styles.cardSub}>
                        {getFileKindLabel(inferSupportedFileKind(filename))} · {humanSize(document.fileSize)}
                      </span>
                      <span
                        className={`${styles.statusChip} ${
                          document.status === "ready"
                            ? styles.statusOk
                            : document.status === "processing"
                              ? styles.statusRust
                              : styles.statusRed
                        }`}
                      >
                        <span
                          className={`${styles.statusDot} ${
                            document.status === "ready"
                              ? styles.dotOk
                              : document.status === "processing"
                                ? styles.dotRust
                                : styles.dotRed
                          }`}
                          aria-hidden="true"
                        />
                        {document.status === "ready" ? "Ready" : document.status === "processing" ? "Processing" : "Needs attention"}
                      </span>
                      {document.status === "processing" ? (
                        <span className={styles.stageText}>{stageLabel(document.processingStage)}</span>
                      ) : null}
                      <span className={styles.cardFoot}>
                        {document.processingMode === "privacy_minimised" ? "Privacy-minimised" : "Standard"} · {formatUploaded(document.createdAt)}
                      </span>
                    </button>
                    <div
                      className={styles.menuWrap}
                      ref={(element) => {
                        menuWrapRefs.current[`${document.id}-card`] = element;
                      }}
                    >
                      <button
                        type="button"
                        className={styles.menuBtn}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === `${document.id}-card`}
                        aria-label={`Actions for ${filename}`}
                        onClick={() => setOpenMenuId((current) => (current === `${document.id}-card` ? null : `${document.id}-card`))}
                      >
                        <EllipsisVertical className={styles.icon} aria-hidden="true" />
                      </button>
                      {openMenuId === `${document.id}-card` ? (
                        <div role="menu" aria-label={`Actions for ${filename}`} className={styles.rowMenu}>
                          <button
                            type="button"
                            role="menuitem"
                            className={styles.menuItem}
                            onClick={() => {
                              setOpenMenuId(null);
                              selectDocument(document.id, null);
                            }}
                          >
                            View details
                          </button>
                          {document.status === "failed" ? (
                            <span role="none" className={styles.menuRetryWrap}>
                              <DocumentProcessButton documentId={document.id} label="Retry" />
                            </span>
                          ) : null}
                          <DocumentDeleteButton
                            className={styles.menuItem}
                            documentId={document.id}
                            filename={filename}
                            onDeleted={() => setOpenMenuId(null)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {dialogOpen ? (
          <div
            className={styles.dialogOverlay}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeDialog();
            }}
          >
            <div
              ref={dialogCardRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="documents-upload-dialog-title"
              className={styles.dialogCard}
            >
              <div className={styles.dialogHead}>
                <h2 id="documents-upload-dialog-title" className={styles.dialogTitle}>Add documents</h2>
                <button
                  ref={dialogCloseRef}
                  type="button"
                  className={styles.closeBtn}
                  aria-label="Close Add documents dialog"
                  onClick={closeDialog}
                >
                  <X className={styles.icon} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.dialogBody}>
                <div className={styles.dropHead}>
                  <div>
                    <p className={styles.dropHeadTitle}>Drag files here, or choose them</p>
                    <p className={styles.dropHeadCopy}>
                      Drag-and-drop is optional. Each file is validated before upload and processed independently.
                    </p>
                  </div>
                  <button type="button" className={styles.ghostBtn} onClick={chooseFiles}>
                    Choose files
                  </button>
                </div>
                <DocumentUploadDropzone className={styles.dropEngine} collectionId={collectionId} />
                <p className={styles.formatLine}>
                  SUPPORTED · PDF · DOCX · XLSX · CSV · MD · HTML · TXT · 15MB PER FILE · UP TO 5 FILES PER UPLOAD
                </p>
              </div>
              <div className={styles.dialogFoot}>
                <button type="button" className={styles.ghostBtn} onClick={closeDialog}>
                  Cancel
                </button>
                <button type="button" className={styles.primaryBtn} onClick={chooseFiles}>
                  Upload
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <aside
        aria-label="Document details"
        className={`${styles.aside} ${selectedDocument ? styles.asideOpen : ""}`}
      >
        {isSheetMode && selectedDocument ? (
          <div className={styles.scrim} aria-hidden="true" onClick={() => deselect(true)} />
        ) : null}
        <div className={styles.asideHead}>
          <h2 className={styles.asideTitle}>Document details</h2>
          <button
            ref={asideCloseRef}
            type="button"
            className={styles.closeBtn}
            aria-label="Close document details"
            onClick={() => deselect(true)}
          >
            <X className={styles.icon} aria-hidden="true" />
          </button>
        </div>
        {selectedDocument ? (
          <div className={styles.detailCard}>
            <p className={styles.detailName} title={getSafeFilename(selectedDocument.filename)}>
              {getSafeFilename(selectedDocument.filename)}
            </p>
            <dl className={styles.dl}>
              <div className={styles.dlRow}>
                <dt>Type</dt>
                <dd>{getFileKindLabel(inferSupportedFileKind(selectedDocument.filename))}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Size</dt>
                <dd>{humanSize(selectedDocument.fileSize)}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Mode</dt>
                <dd>{selectedDocument.processingMode === "privacy_minimised" ? "Privacy-minimised" : "Standard"}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Uploaded</dt>
                <dd>{formatUploaded(selectedDocument.createdAt)}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Extract</dt>
                <dd>
                  {selectedDocument.pageCount > 0 ? (
                    `${selectedDocument.pageCount} pages`
                  ) : (
                    <span className={styles.monoNote}>Pages pending</span>
                  )}
                </dd>
              </div>
            </dl>
            {selectedDocument.status === "failed" && selectedDocument.errorMessage ? (
              <p className={styles.failNote}>{selectedDocument.errorMessage}</p>
            ) : null}
            {selectedDocument.status === "failed" && selectedDocument.errorMessage ? (
              <details className={styles.tech}>
                <summary>Technical details</summary>
                <p className={styles.techBody}>{selectedDocument.errorMessage}</p>
              </details>
            ) : null}
            {selectedDocument.status === "failed" ? (
              <div className={styles.detailActions}>
                <DocumentProcessButton documentId={selectedDocument.id} label="Retry" />
              </div>
            ) : null}
          </div>
        ) : (
          <p className={styles.asideRest}>Select a document to see its processing details.</p>
        )}
      </aside>
    </>
  );
}
