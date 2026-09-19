import test from "node:test";
import assert from "node:assert/strict";
import { requestJson } from "../src/http.mjs";

test("API failures show actionable errors without exposing proxy HTML", async (t) => {
  const mock = t.mock.method(globalThis, "fetch");
  for (const status of [200, 404, 502, 503]) {
    mock.mock.mockImplementation(async () => new Response("The page could not be found", { status }));
    await assert.rejects(requestJson("/api/me"), (error) => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(error.message, /Unexpected token|The page/);
      return true;
    });
  }
  mock.mock.mockImplementation(async () => new Response("broken", { headers: { "content-type": "application/json" } }));
  await assert.rejects(requestJson("/api/me"), /HTTP 200/);
  mock.mock.mockImplementation(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(requestJson("/api/me"), /تعذر الوصول/);
  mock.mock.mockImplementation(async () => Response.json({ error: "رصيد غير كافٍ" }, { status: 400 }));
  await assert.rejects(requestJson("/api/apps", { method: "POST" }), /رصيد غير كافٍ/);
  mock.mock.mockImplementation(async () => Response.json({ user: null }));
  assert.deepEqual(await requestJson("/api/me"), { user: null });
});
