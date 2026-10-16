export type StoragePathParts = {
  collectionId: string;
  documentId: string;
  filename: string;
  userId: string;
};

export function getFileExtension(filename: string) {
  const lastSegment = filename.split(/[\\/]/).pop() ?? filename;
  const dotIndex = lastSegment.lastIndexOf(".");

  return dotIndex < 0 ? "" : lastSegment.slice(dotIndex).toLowerCase();
}

export function getDisplayFilename(filename: string) {
  const originalName = filename.split(/[\\/]/).pop()?.trim() || "document";
  const normalized = originalName.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);

  return normalized || "document";
}

/**
 * Storage-safe filename: ASCII word characters, dots and hyphens only, never empty, never a
 * dot-segment, and always ending in the original (already validated) extension.
 */
export function getSafeFilename(filename: string) {
  const displayName = getDisplayFilename(filename);
  const extension = getFileExtension(displayName).replace(/[^a-z0-9.]/g, "");
  const stem = extension ? displayName.slice(0, displayName.length - getFileExtension(displayName).length) : displayName;
  const safeStem = stem
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return `${safeStem || "document"}${extension}`;
}

/** {userId}/{collectionId}/{documentId}/{sanitizedName} */
export function buildStoragePath({ collectionId, documentId, filename, userId }: StoragePathParts) {
  return `${userId}/${collectionId}/${documentId}/${getSafeFilename(filename)}`;
}

export function parseStoragePath(path: string) {
  const segments = path.split("/");

  if (segments.length !== 4 || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }

  const [userId, collectionId, documentId, filename] = segments;

  return { collectionId, documentId, filename, userId };
}

/** True only for a canonical path inside the given user's own prefix. */
export function isStoragePathOwnedBy(path: string, userId: string) {
  return parseStoragePath(path)?.userId === userId;
}
