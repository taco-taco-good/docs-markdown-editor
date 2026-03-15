import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { once } from "node:events";

import { createApiApp } from "./api.ts";
import { WatcherService } from "../services/watcher.service.ts";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface ApiServer {
  close(): Promise<void>;
  port: number;
  url: string;
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const origin = `http://${req.headers.host ?? "127.0.0.1"}`;
  const url = new URL(req.url ?? "/", origin);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req);

  return new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body,
    duplex: body ? "half" : undefined,
  });
}

async function writeResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value);
  }

  if (!response.body) {
    res.end();
    return;
  }

  const body = Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>);
  body.pipe(res);
  await once(res, "finish");
}

function tryServeStatic(pathname: string, webRoot: string | undefined, res: ServerResponse): boolean {
  if (!webRoot) return false;

  // Don't serve static files for API/auth routes
  if (pathname.startsWith("/api/") || pathname.startsWith("/auth/") || pathname.startsWith("/ws")) {
    return false;
  }

  // Try exact file match
  let filePath = path.join(webRoot, pathname);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable");
    res.end(readFileSync(filePath));
    return true;
  }

  // SPA fallback: serve index.html for non-file routes
  filePath = path.join(webRoot, "index.html");
  if (existsSync(filePath)) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-cache");
    res.end(readFileSync(filePath));
    return true;
  }

  return false;
}

export async function startApiServer(options: {
  port?: number;
  workspaceRoot: string;
  host?: string;
  webRoot?: string;
}) : Promise<ApiServer> {
  const host = options.host ?? "127.0.0.1";
  const app = createApiApp({ workspaceRoot: options.workspaceRoot });
  const watcher = new WatcherService({
    workspaceRoot: options.workspaceRoot,
    documentService: app.documentService,
    realtimeService: app.realtimeService,
    searchService: app.searchService,
  });
  watcher.start();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

      // Try static file serving first (for non-API routes)
      if (req.method === "GET" && tryServeStatic(url.pathname, options.webRoot, res)) {
        return;
      }

      const request = await toRequest(req);
      const response = await app.fetch(request);
      await writeResponse(response, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 3000, host, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine server address");
  }

  return {
    port: address.port,
    url: `http://${host}:${address.port}`,
    close() {
      return new Promise<void>((resolve, reject) => {
        watcher.stop();
        app.realtimeService.close();
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const host = process.env.HOST ?? "127.0.0.1";
  const webRoot = process.env.WEB_ROOT ?? undefined;
  const server = await startApiServer({ workspaceRoot, host, port, webRoot });
  process.stdout.write(`docs-markdown-editor listening on ${server.url}\n`);
  if (webRoot) {
    process.stdout.write(`  serving web UI from ${webRoot}\n`);
  }
}
