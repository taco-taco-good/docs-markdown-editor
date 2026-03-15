import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface AuditEvent {
  path: string;
  actorId: string;
  provider: "local" | "oidc" | "pat" | "filesystem";
  action: "create" | "update" | "delete" | "move";
  at: string;
}

export class AuditService {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  recordDocumentEdit(event: Omit<AuditEvent, "at">): void {
    const auditPath = path.join(this.workspaceRoot, ".docs", "audit", "events.ndjson");
    mkdirSync(path.dirname(auditPath), { recursive: true });
    appendFileSync(auditPath, `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`, "utf8");
  }
}
