const fallbackClientId = `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const editorClientId =
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : fallbackClientId;

export function getEditorClientId() {
  return editorClientId;
}
