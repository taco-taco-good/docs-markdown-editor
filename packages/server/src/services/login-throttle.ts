const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_BACKOFF_MS = 5 * 60 * 1000;

interface LoginThrottleState {
  failures: number;
  lockedUntil: number;
  lastFailureAt: number;
}

export class LoginThrottle {
  private readonly state = new Map<string, LoginThrottleState>();

  key(username: string, clientKey: string): string {
    return `${clientKey}:${username.trim().toLowerCase()}`;
  }

  assertAllowed(key: string, now: number): void {
    this.prune(now);
    const entry = this.state.get(key);
    if (entry && entry.lockedUntil > now) {
      throw new Error("TOO_MANY_ATTEMPTS");
    }
  }

  recordFailure(key: string, now: number): number {
    const current = this.state.get(key);
    const failures = (current?.failures ?? 0) + 1;
    const backoffMs =
      failures <= 3 ? 0 : Math.min(15_000 * 2 ** (failures - 3), LOGIN_MAX_BACKOFF_MS);

    this.state.set(key, {
      failures,
      lockedUntil: now + backoffMs,
      lastFailureAt: now,
    });

    return backoffMs;
  }

  clearFailure(key: string): void {
    this.state.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.state.entries()) {
      if (entry.lockedUntil <= now && now - entry.lastFailureAt > LOGIN_FAILURE_WINDOW_MS) {
        this.state.delete(key);
      }
    }
  }
}
