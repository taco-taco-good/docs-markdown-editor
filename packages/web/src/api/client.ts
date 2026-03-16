/** REST API client for docs-markdown-editor server */

import { getEditorClientId } from "../lib/editor-client.js";

export interface Frontmatter {
  title?: string;
  tags?: string[];
  date?: string;
  [key: string]: unknown;
}

export interface DocumentMeta {
  path: string;
  title: string;
  frontmatter: Frontmatter;
  size: number;
  createdAt: string;
  modifiedAt: string;
  revision?: string;
}

export interface Document {
  meta: DocumentMeta;
  content: string;
  raw: string;
  supportedInWysiwyg: boolean;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  meta?: DocumentMeta;
}

export interface TreeMoveResult {
  type: "file" | "directory";
  from: string;
  to: string;
}

export interface TreeDropTarget {
  placement: "inside" | "before" | "after" | "root";
  targetPath?: string;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet?: string;
  score: number;
}

export interface TemplateMeta {
  name: string;
}

export interface TemplateDocument {
  name: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface SessionInfo {
  sessionId: string;
  username: string;
  provider: "local" | "oidc";
}

export interface PersonalAccessToken {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface IssuedToken {
  token: string;
  tokenId: string;
  tokenPrefix: string;
}

export interface WorkspaceInfo {
  workspaceRoot: string;
  workspaceName: string;
}

export interface AuthStatus {
  initialized: boolean;
  authMethod: "local" | "oidc" | null;
  oidcProvider: { name: string; issuer: string } | null;
}

export interface SetupResult extends AuthStatus {
  username?: string;
}

export interface OidcAuthorizeResult {
  redirectUrl: string;
}

interface ApiResponse<T> {
  data: T;
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export class ApiRequestError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(options: { code: string; message: string; status: number; details?: unknown }) {
    super(options.message);
    this.name = "ApiRequestError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const err: ApiError = await res.json().catch(() => ({
        error: { code: "UNKNOWN", message: res.statusText },
      }));
      throw new ApiRequestError({
        code: err.error.code,
        message: err.error.message,
        status: res.status,
        details: err.error.details,
      });
    }

    if (res.status === 204) return undefined as T;
    const json: ApiResponse<T> = await res.json();
    return json.data;
  }

  // ── Documents ──

  async getDocument(docPath: string): Promise<Document> {
    return this.request<Document>(`/api/docs/${encodeURIComponent(docPath)}`);
  }

  async saveDocument(
    docPath: string,
    content: string,
    frontmatter?: Partial<Frontmatter>,
    baseRevision?: string,
  ): Promise<Document> {
    return this.request<Document>(`/api/docs/${encodeURIComponent(docPath)}`, {
      method: "PATCH",
      headers: {
        "X-Client-Id": getEditorClientId(),
        ...(baseRevision ? { "X-Base-Revision": baseRevision } : {}),
      },
      body: JSON.stringify({ content, frontmatter }),
    });
  }

  async createDocument(
    docPath: string,
    opts?: { content?: string; template?: string; frontmatter?: Partial<Frontmatter> },
  ): Promise<Document> {
    return this.request<Document>(`/api/docs/${encodeURIComponent(docPath)}`, {
      method: "PUT",
      headers: opts?.template
        ? { "Content-Type": "application/json", "X-Template": opts.template }
        : undefined,
      body: JSON.stringify({
        ...(opts?.content !== undefined ? { content: opts.content } : {}),
        ...(opts?.template ? { template: opts.template } : {}),
        ...(opts?.frontmatter ? { frontmatter: opts.frontmatter } : {}),
      }),
    });
  }

  async deleteDocument(docPath: string): Promise<void> {
    return this.request<void>(`/api/docs/${encodeURIComponent(docPath)}`, {
      method: "DELETE",
    });
  }

  // ── Tree ──

  async getTree(path?: string): Promise<TreeNode[]> {
    const url = path ? `/api/tree/${encodeURIComponent(path)}` : "/api/tree";
    return this.request<TreeNode[]>(url);
  }

  async moveNode(from: string, to: string): Promise<TreeMoveResult> {
    return this.request<TreeMoveResult>("/api/tree/move", {
      method: "POST",
      body: JSON.stringify({ from, to }),
    });
  }

  async repositionNode(from: string, target: TreeDropTarget): Promise<TreeMoveResult> {
    return this.request<TreeMoveResult>("/api/tree/move", {
      method: "POST",
      body: JSON.stringify({ from, placement: target.placement, targetPath: target.targetPath }),
    });
  }

  async createDirectory(dirPath: string): Promise<{ path: string }> {
    return this.request<{ path: string }>("/api/tree/dirs", {
      method: "POST",
      body: JSON.stringify({ path: dirPath }),
    });
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    return this.request<void>(`/api/tree/dirs/${encodeURIComponent(dirPath)}`, {
      method: "DELETE",
    });
  }

  // ── Search ──

  async search(
    query: string,
    opts?: { path?: string; tags?: string[]; limit?: number },
    requestOptions?: RequestInit,
  ): Promise<SearchResult[]> {
    return this.request<SearchResult[]>("/api/search", {
      ...requestOptions,
      method: "POST",
      body: JSON.stringify({ query, ...opts }),
    });
  }

  // ── Templates ──

  async getTemplates(): Promise<TemplateMeta[]> {
    return this.request<TemplateMeta[]>("/api/templates");
  }

  async getTemplate(name: string): Promise<TemplateDocument> {
    return this.request<TemplateDocument>(`/api/templates/${encodeURIComponent(name)}`);
  }

  async createTemplate(name: string, content: string): Promise<TemplateDocument> {
    return this.request<TemplateDocument>("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name, content }),
    });
  }

  async updateTemplate(name: string, content: string): Promise<TemplateDocument> {
    return this.request<TemplateDocument>(`/api/templates/${encodeURIComponent(name)}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
  }

  async deleteTemplate(name: string): Promise<void> {
    return this.request<void>(`/api/templates/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }

  // ── Auth ──

  async getAuthStatus(): Promise<AuthStatus> {
    return this.request<AuthStatus>("/auth/status");
  }

  async setup(body: {
    method: "local";
    username: string;
    password: string;
    displayName?: string;
  } | {
    method: "oidc";
    issuer: string;
    clientId: string;
    clientSecret: string;
    providerName: string;
  }): Promise<SetupResult> {
    return this.request<SetupResult>("/auth/setup", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getOidcAuthorizeUrl(): Promise<OidcAuthorizeResult> {
    return this.request<OidcAuthorizeResult>("/auth/oidc/authorize");
  }

  async getSession(): Promise<SessionInfo> {
    return this.request<SessionInfo>("/auth/session");
  }

  async logout(): Promise<void> {
    return this.request<void>("/auth/logout", {
      method: "POST",
    });
  }

  // ── Personal Access Tokens ──

  async getTokens(): Promise<PersonalAccessToken[]> {
    return this.request<PersonalAccessToken[]>("/auth/tokens");
  }

  async createToken(name: string): Promise<IssuedToken> {
    return this.request<IssuedToken>("/auth/tokens", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async revokeToken(tokenId: string): Promise<void> {
    return this.request<void>(`/auth/tokens/${encodeURIComponent(tokenId)}`, {
      method: "DELETE",
    });
  }

  async getWorkspaceInfo(): Promise<WorkspaceInfo> {
    return this.request<WorkspaceInfo>("/api/info");
  }

  // ── Assets ──

  async uploadAsset(docPath: string, file: File): Promise<{ path: string; url: string; markdownLink: string }> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${this.baseUrl}/api/assets/${encodeURIComponent(docPath)}`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    const json = await res.json();
    return json.data;
  }
}

export const api = new ApiClient();
