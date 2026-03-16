const CUSTOM_MIME_TYPE = "application/docs-md-path";

let dragSourcePath: string | null = null;

export function setDragSource(path: string): void {
  dragSourcePath = path;
}

export function clearDragSource(): void {
  dragSourcePath = null;
}

export function getDragSource(dataTransfer?: DataTransfer | null): string {
  const customPath = dataTransfer?.getData(CUSTOM_MIME_TYPE)?.trim();
  if (customPath) return customPath;

  const plainTextPath = dataTransfer?.getData("text/plain")?.trim();
  if (plainTextPath) return plainTextPath;

  return dragSourcePath ?? "";
}

export { CUSTOM_MIME_TYPE };
