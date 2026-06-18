import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { githubGetUserInfo, ghFetchJson } from "./github-user-info.ts";

// Stub global fetch (the only dependency). Each test installs its own.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function res(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
function setFetch(fn: (url: string) => Promise<Response>) {
  globalThis.fetch = ((input: unknown) =>
    fn(String(input))) as unknown as typeof fetch;
}

test("ghFetchJson retries a transient 500 then succeeds", async () => {
  let n = 0;
  setFetch(async () => {
    n += 1;
    return n === 1 ? res(500, {}) : res(200, { ok: true });
  });
  const data = await ghFetchJson<{ ok: boolean }>("https://x/user", "tok", 2);
  assert.deepEqual(data, { ok: true });
  assert.equal(n, 2);
});

test("ghFetchJson does NOT retry a 404 (non-transient)", async () => {
  let n = 0;
  setFetch(async () => {
    n += 1;
    return res(404, {});
  });
  const data = await ghFetchJson("https://x/user", "tok", 3);
  assert.equal(data, null);
  assert.equal(n, 1); // no retry on a real client error
});

test("githubGetUserInfo: first /user 503 then 200 recovers (THE bug)", async () => {
  let userCalls = 0;
  setFetch(async (url) => {
    if (url.endsWith("/user")) {
      userCalls += 1;
      return userCalls === 1
        ? res(503, {})
        : res(200, { id: 7, login: "x", name: null, email: "p@x.com", avatar_url: "a" });
    }
    if (url.endsWith("/user/emails")) return res(200, []);
    return res(404, {});
  });
  const info = await githubGetUserInfo({ accessToken: "tok" });
  assert.ok(info, "should recover, not null");
  assert.equal(info!.user.id, "7");
  assert.equal(info!.user.email, "p@x.com");
  assert.ok(userCalls >= 2, "should have retried /user");
});

test("githubGetUserInfo: private email resolved from /user/emails (verified)", async () => {
  setFetch(async (url) => {
    if (url.endsWith("/user"))
      return res(200, {
        id: 42,
        login: "mo",
        name: "Mo",
        email: null, // private
        avatar_url: "a",
      });
    if (url.endsWith("/user/emails"))
      return res(200, [
        { email: "old@x.com", primary: false, verified: true, visibility: "private" },
        { email: "mo@x.com", primary: true, verified: true, visibility: "private" },
      ]);
    return res(404, {});
  });
  const info = await githubGetUserInfo({ accessToken: "tok" });
  assert.equal(info!.user.email, "mo@x.com");
  assert.equal(info!.user.emailVerified, true);
  assert.equal(info!.user.name, "Mo");
});

test("githubGetUserInfo: /user fails all retries → null (terminal, no crash)", async () => {
  setFetch(async () => res(500, {}));
  const info = await githubGetUserInfo({ accessToken: "tok" });
  assert.equal(info, null);
});

test("githubGetUserInfo: missing token → null", async () => {
  const info = await githubGetUserInfo({});
  assert.equal(info, null);
});
