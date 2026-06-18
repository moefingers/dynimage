import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { hashIp, isAdmin } from "./util.ts";

const savedSalt = process.env.REPORT_IP_SALT;
const savedAdmins = process.env.ADMIN_USER_IDS;
afterEach(() => {
  process.env.REPORT_IP_SALT = savedSalt;
  process.env.ADMIN_USER_IDS = savedAdmins;
});

test("hashIp is deterministic, 32 hex chars, and never the raw IP", async () => {
  process.env.REPORT_IP_SALT = "s";
  const a = await hashIp("1.2.3.4");
  const b = await hashIp("1.2.3.4");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.ok(!a.includes("1.2.3.4"));
});

test("hashIp differs by IP and by salt", async () => {
  process.env.REPORT_IP_SALT = "s1";
  const a = await hashIp("1.1.1.1");
  const b = await hashIp("2.2.2.2");
  assert.notEqual(a, b);
  process.env.REPORT_IP_SALT = "s2";
  const c = await hashIp("1.1.1.1");
  assert.notEqual(a, c); // same IP, different salt → different hash
});

test("isAdmin: allowlist membership, trimmed, fail-closed when unset", () => {
  delete process.env.ADMIN_USER_IDS;
  assert.equal(isAdmin("u1"), false); // unset → no admins

  process.env.ADMIN_USER_IDS = " u1 , u2 ";
  assert.equal(isAdmin("u1"), true);
  assert.equal(isAdmin("u2"), true);
  assert.equal(isAdmin("u3"), false);

  process.env.ADMIN_USER_IDS = "";
  assert.equal(isAdmin("u1"), false);
});
