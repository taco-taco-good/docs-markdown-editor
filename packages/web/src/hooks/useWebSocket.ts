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
      frontmatter: Frontmatter;
      originClientId: string | null;
    }
  | { type: "error"; message: string };

export function useWebSocket() {
  const streamRef = useRef<EventSource | null>(null);
  const currentPathRef = useRef<string | null>(null);
  const handleWSEvent = useTreeStore((s) => s.handleWSEvent);
  const currentPath = useDocumentStore((s) => s.currentPath);
  const handleExternalUpdate = useDocumentStore((s) => s.handleExternalUpdate);
  const handleExternalMove = useDocumentStore((s) => s.handleExternalMove);

  const connect = useCallback(() => {
    const stream = new EventSource("/api/events", { withCredentials: true });
    streamRef.current = stream;

    stream.onmessage = (ev) => {
      try {
        const event: WSEvent = JSON.parse(ev.data);
        handleWSEvent(event);

        if (event.type === "doc:content" && event.path === currentPathRef.current) {
          handleExternalUpdate(event.content, event.originClientId, event.frontmatter);
        }
        if (event.type === "file:moved" || event.type === "dir:moved") {
          handleExternalMove(event.from, event.to);
        }
      } catch {
        // ignore malformed messages
      }
    };
  }, [handleWSEvent, handleExternalMove, handleExternalUpdate]);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    connect();
    return () => {
      streamRef.current?.close();
    };
  }, [connect]);
}
