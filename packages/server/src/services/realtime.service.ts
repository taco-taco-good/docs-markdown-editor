import { randomUUID } from "node:crypto";

import type { FrontmatterValue } from "../../../shared/src/frontmatter.ts";

export type WorkspaceEvent =
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
      frontmatter: Record<string, FrontmatterValue>;
      originClientId: string | null;
    }
  | { type: "error"; message: string };

interface Subscriber {
  controller: ReadableStreamDefaultController<Uint8Array>;
  heartbeat: ReturnType<typeof setInterval>;
}

function encodeSse(payload: string): Uint8Array {
  return new TextEncoder().encode(payload);
}

export class RealtimeService {
  private readonly subscribers = new Map<string, Subscriber>();

  private unsubscribe(subscriberId: string): void {
    const subscriber = this.subscribers.get(subscriberId);
    if (!subscriber) return;
    clearInterval(subscriber.heartbeat);
    this.subscribers.delete(subscriberId);
    try {
      subscriber.controller.close();
    } catch {
      // Ignore already-closed streams.
    }
  }

  createEventStream(): Response {
    const subscriberId = randomUUID();
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encodeSse(": keep-alive\n\n"));
          } catch {
            this.unsubscribe(subscriberId);
          }
        }, 15000);

        this.subscribers.set(subscriberId, { controller, heartbeat });
        controller.enqueue(encodeSse("retry: 2000\n\n"));
      },
      cancel: () => {
        this.unsubscribe(subscriberId);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
      },
    });
  }

  publish(event: WorkspaceEvent): void {
    const chunk = encodeSse(`data: ${JSON.stringify(event)}\n\n`);
    for (const [subscriberId, subscriber] of this.subscribers.entries()) {
      try {
        subscriber.controller.enqueue(chunk);
      } catch {
        this.unsubscribe(subscriberId);
      }
    }
  }

  close(): void {
    for (const subscriberId of [...this.subscribers.keys()]) {
      this.unsubscribe(subscriberId);
    }
  }
}
