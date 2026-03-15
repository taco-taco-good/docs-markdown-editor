#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";

import { AuthService } from "../../packages/server/src/services/auth.service.ts";

const [, , username, password, displayNameArg] = process.argv;

if (!username || !password) {
  process.stderr.write(
    "Usage: node deploy/scripts/create-local-user.mjs <username> <password> [display-name]\n",
  );
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = process.env.WORKSPACE_ROOT
  ? path.resolve(process.env.WORKSPACE_ROOT)
  : path.resolve(scriptDir, "../..");
const displayName = displayNameArg ?? username;

try {
  const authService = new AuthService(workspaceRoot);
  const user = authService.createLocalUser(username, password, displayName);
  process.stdout.write(
    `Created local user ${user.username} in ${workspaceRoot}/.docs/auth/users.db\n`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to create user: ${message}\n`);
  process.exit(1);
}

