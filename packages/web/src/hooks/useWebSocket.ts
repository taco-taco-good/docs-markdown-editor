import { useEffect, useRef, useCallback } from "react";
import type { Frontmatter } from "../api/client";
import { useTreeStore } from "../stores/tree.store";
import { useDocumentStore } from "../stores/document.store";

type WSEvent =
  | { type: "tree:changed" }
  | { type: "file:created"; path: string }
  | { type: "file:updated"; path: string }
  | { type: "file:deleted"; path: string }
  | { type: "file:moved"; from: string; to: string }
  | { type: "dir:moved"; from: string; to: string }
  | { type: "dir:created"; path: string }
  | { type: "dir:deleted"; path: string }
  | {
      type: "doc:content";
      path: string;
      content: string;
      raw: string;
      revision?: string;
      frontmatter: Frontmatter;
      originClientId: string | null;
    }
  | { type: "error"; message: string };

export function useWebSocket() {
  const streamRef = useRef<EventSource | null>(null);
  const handleWSEvent = useTreeStore((s) => s.handleWSEvent);
  const handleExternalUpdate = useDocumentStore((s) => s.handleExternalUpdate);
  const handleExternalMove = useDocumentStore((s) => s.handleExternalMove);
  const hasSession = useDocumentStore((s) => s.hasSession);

  const connect = useCallback(() => {
    const stream = new EventSource("/api/events", { withCredentials: true });
    streamRef.current = stream;

    stream.onmessage = (ev) => {
      try {
        const event: WSEvent = JSON.parse(ev.data);
        handleWSEvent(event);

        if (event.type === "doc:content" && hasSession(event.path)) {
          const raw = event.raw ?? event.content;
          if (typeof raw === "string") {
            handleExternalUpdate(event.path, raw, event.originClientId, event.frontmatter, event.revision);
          }
        }
        if (event.type === "file:moved" || event.type === "dir:moved") {
          handleExternalMove(event.from, event.to);
        }
      } catch {
        // ignore malformed messages
      }
    };
  }, [handleWSEvent, handleExternalMove, handleExternalUpdate, hasSession]);

  useEffect(() => {
    connect();
    return () => {
      streamRef.current?.close();
    };
  }, [connect]);
}
