import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export class VersioningService {
  private readonly workspaceRoot: string;
  private enabled = true;
  private pendingFiles = new Set<string>();
  private pendingMessage: string | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.ensureRepository();
  }

  queueSnapshot(message: string, filePath?: string): void {
    if (!this.enabled) return;
    this.pendingMessage = message;
    if (filePath) {
      this.pendingFiles.add(filePath);
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushPending();
    }, 4000);
  }

  async flushPending(): Promise<void> {
    if (!this.enabled || !this.pendingMessage) return;

    const message = this.pendingMessage;
    const files = [...this.pendingFiles];
    this.pendingMessage = null;
    this.pendingFiles.clear();

    try {
      // Stage only the specific changed files (or all if tracking was lost)
      const addArgs = files.length > 0 ? ["add", "--", ...files] : ["add", "-A", "."];
      await this.runGitAsync(addArgs);

      const hasStagedChanges = await this.runGitAsync(["diff", "--cached", "--quiet", "--exit-code"])
        .then(() => false)
        .catch(() => true);
      if (!hasStagedChanges) return;

      await this.runGitAsync([
        "-c", "user.name=Foldmark",
        "-c", "user.email=foldmark@local",
        "commit", "--quiet", "--no-gpg-sign", "-m", message,
      ]);
    } catch {
      this.enabled = false;
    }
  }

  private ensureRepository(): void {
    try {
      if (!existsSync(path.join(this.workspaceRoot, ".git"))) {
        execFileSync("git", ["init", "--quiet"], {
          cwd: this.workspaceRoot,
          stdio: ["ignore", "pipe", "pipe"],
        });
      }
    } catch {
      this.enabled = false;
    }
  }

  private runGitAsync(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("git", args, { cwd: this.workspaceRoot, encoding: "utf8" }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  }
}
