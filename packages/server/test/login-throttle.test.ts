import assert from "node:assert/strict";
import test from "node:test";

import { LoginThrottle } from "../src/services/login-throttle.ts";

test("LoginThrottle allows first three failures without backoff", () => {
  const throttle = new LoginThrottle();
  const k = throttle.key("alice", "10.0.0.1");

  throttle.recordFailure(k, 1000);
  throttle.assertAllowed(k, 1001);

  throttle.recordFailure(k, 1001);
  throttle.assertAllowed(k, 1002);

  // 2 failures — no backoff yet
  throttle.recordFailure(k, 1002);
  // After the 3rd failure there is still zero backoff (backoff starts at failure >=3)
  throttle.assertAllowed(k, 1003);
});

test("LoginThrottle blocks after three failures with exponential backoff", () => {
  const throttle = new LoginThrottle();
  const k = throttle.key("bob", "10.0.0.2");

  const now = 100_000;
  for (let i = 0; i < 4; i++) {
    throttle.recordFailure(k, now);
  }

  // 4 failures → backoff = min(15_000 * 2^(4-3), 300_000) = 30_000ms
  assert.throws(
    () => throttle.assertAllowed(k, now + 10_000),
    { message: "TOO_MANY_ATTEMPTS" },
  );

  // After backoff expires, access is allowed again
  throttle.assertAllowed(k, now + 30_001);
});

test("LoginThrottle.clearFailure resets the throttle", () => {
  const throttle = new LoginThrottle();
  const k = throttle.key("carol", "10.0.0.3");

  for (let i = 0; i < 5; i++) {
    throttle.recordFailure(k, 1000 + i);
  }

  assert.throws(() => throttle.assertAllowed(k, 1010), { message: "TOO_MANY_ATTEMPTS" });
  throttle.clearFailure(k);
  throttle.assertAllowed(k, 1010);
});

test("LoginThrottle prunes entries after failure window expires", () => {
  const throttle = new LoginThrottle();
  const k = throttle.key("dave", "10.0.0.4");

  const baseTime = 100_000;
  throttle.recordFailure(k, baseTime);
  throttle.recordFailure(k, baseTime + 1);
  throttle.recordFailure(k, baseTime + 2);
  throttle.recordFailure(k, baseTime + 3);

  // Wait past the 15-minute window (15 * 60 * 1000 = 900_000ms)
  const afterWindow = baseTime + 900_001;
  throttle.assertAllowed(k, afterWindow);
});

test("LoginThrottle caps backoff at 5 minutes", () => {
  const throttle = new LoginThrottle();
  const k = throttle.key("eve", "10.0.0.5");

  const now = 100_000;
  // Record many failures to push backoff to maximum
  for (let i = 0; i < 20; i++) {
    throttle.recordFailure(k, now);
  }

  // Should still be blocked at now + 100_000 (less than 5 min = 300_000ms)
  assert.throws(() => throttle.assertAllowed(k, now + 100_000), { message: "TOO_MANY_ATTEMPTS" });

  // Should be allowed after max backoff (5 min)
  throttle.assertAllowed(k, now + 300_001);
});

test("LoginThrottle isolates different keys", () => {
  const throttle = new LoginThrottle();
  const k1 = throttle.key("alice", "10.0.0.1");
  const k2 = throttle.key("bob", "10.0.0.1");

  for (let i = 0; i < 5; i++) {
    throttle.recordFailure(k1, 1000 + i);
  }

  // k1 is throttled, k2 is not
  assert.throws(() => throttle.assertAllowed(k1, 1010), { message: "TOO_MANY_ATTEMPTS" });
  throttle.assertAllowed(k2, 1010);
});
