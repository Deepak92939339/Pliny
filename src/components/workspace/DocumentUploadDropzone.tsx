"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type FileRejection } from "react-dropzone";
import { cn } from "@/lib/utils";

const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024;
const ACTIVE_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".txt", ".md", ".markdown", ".html", ".htm", ".csv"];

type DocumentUploadDropzoneProps = {
  className?: string;
  collectionId: string;
};

type UploadStep = "idle" | "uploading" | "processing";

type InsertedDocument = {
  id: string;
};

type UploadDocumentResponse = {
  document?: InsertedDocument;
  error?: string;
};

type ProcessDocumentResponse = {
  error?: string;
  message?: string;
  ok?: boolean;
  status?: "processing" | "ready" | "failed";
};

function isSupportedFile(file: File) {
  const name = file.name.toLowerCase();

  return ACTIVE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function getRejectionMessage(rejections: FileRejection[]) {
  const rejection = rejections[0];

  if (!rejection) {
    return "Select a supported file under 15 MB.";
  }

  if (rejection.errors.some((error) => error.code === "file-too-large")) {
    return "File must be 15 MB or less.";
  }

  if (rejection.errors.some((error) => error.code === "file-invalid-type")) {
    return "Only PDF, DOCX, XLSX, CSV, MD, and TXT files can be uploaded. Legacy .xls files are not supported.";
  }

  return "This file could not be uploaded. Please choose a supported file.";
}

async function readUploadResponse(response: Response): Promise<UploadDocumentResponse> {
  try {
    return (await response.json()) as UploadDocumentResponse;
  } catch {
    return {};
  }
}

async function readProcessResponse(response: Response): Promise<ProcessDocumentResponse> {
  try {
    return (await response.json()) as ProcessDocumentResponse;
  } catch {
    return {};
  }
}

export function DocumentUploadDropzone({ className, collectionId }: DocumentUploadDropzoneProps) {
  const router = useRouter();
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isBusy = uploadStep !== "idle";

  const uploadFile = useCallback(
    async (file: File) => {
      setErrorMessage(null);
      setSuccessMessage(null);

      if (!isSupportedFile(file)) {
        setErrorMessage("Only PDF, DOCX, XLSX, CSV, MD, and TXT files can be uploaded. Legacy .xls files are not supported.");
        return;
      }

      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        setErrorMessage("File must be 15 MB or less.");
        return;
      }

      setUploadStep("uploading");

      try {
        const uploadFormData = new FormData();
        uploadFormData.append("collection_id", collectionId);
        uploadFormData.append("file", file);

        const uploadResponse = await fetch("/api/documents/upload", {
          body: uploadFormData,
          method: "POST",
        });
        const uploadResult = await readUploadResponse(uploadResponse);

        if (!uploadResponse.ok || !uploadResult.document) {
          setErrorMessage(uploadResult.error ?? "Unable to upload this file. Please try again.");
          return;
        }

        setUploadStep("processing");
        setSuccessMessage("File uploaded. Extracting text now.");

        const processResponse = await fetch("/api/process-document", {
          body: JSON.stringify({ document_id: uploadResult.document.id }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        const processResult = await readProcessResponse(processResponse);

        router.refresh();

        if (!processResponse.ok || processResult.ok === false) {
          setErrorMessage(processResult.error ?? "File uploaded, but processing failed. You can retry from the document card.");
          setSuccessMessage(null);
          return;
        }

        setSuccessMessage(processResult.status === "processing" ? processResult.message ?? "File is already processing." : "File processed and ready.");
      } catch {
        setErrorMessage("Unable to upload this file. Please try again.");
      } finally {
        setUploadStep("idle");
      }
    },
    [collectionId, router]
  );

  const onDropAccepted = useCallback(
    (files: File[]) => {
      const file = files[0];

      if (file) {
        void uploadFile(file);
      }
    },
    [uploadFile]
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    setSuccessMessage(null);
    setErrorMessage(getRejectionMessage(rejections));
  }, []);

  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "text/csv": [".csv"],
      "text/markdown": [".md", ".markdown"],
      "text/html": [".html", ".htm"],
      "text/plain": [".txt", ".md", ".markdown", ".csv"],
    },
    disabled: isBusy,
    maxFiles: 1,
    maxSize: MAX_UPLOAD_SIZE_BYTES,
    multiple: false,
    onDropAccepted,
    onDropRejected,
  });

  return (
    <div className={cn(className)}>
      <div
        {...getRootProps({
          className: cn(
            "group flex min-h-20 cursor-pointer flex-col justify-center rounded-xl border border-dashed border-black/15 bg-transparent px-4 py-3 text-center transition-colors duration-150 dark:border-[color:var(--editorial-border)] dark:bg-[var(--surface-1)]",
            "hover:border-[#BA5C3D]/45 hover:bg-black/[0.025] dark:hover:bg-[var(--surface-2)]",
            isDragActive && "border-[#BA5C3D]/60 bg-[#BA5C3D]/10",
            isBusy && "cursor-wait opacity-75"
          ),
        })}
      >
        <input {...getInputProps({ "aria-label": "Upload document" })} />
        <p className="text-[13px] font-medium text-[color:var(--editorial-muted)]">
          {uploadStep === "processing" ? "Processing file" : uploadStep === "uploading" ? "Uploading file" : "Drop files or click to upload"}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-[color:var(--editorial-muted)]">
          {isDragActive ? "Drop the file here" : "PDF · DOCX · XLSX · CSV · MD · TXT"}
        </p>
      </div>
      {errorMessage ? <p className="mt-2 text-xs leading-5 text-[color:var(--editorial-destructive)]">{errorMessage}</p> : null}
      {successMessage ? <p className="mt-2 text-xs leading-5 text-[color:var(--editorial-muted)]">{successMessage}</p> : null}
    </div>
  );
}
