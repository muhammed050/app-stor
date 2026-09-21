import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const packageLock = readFileSync(
  new URL("../package-lock.json", import.meta.url),
  "utf8",
);
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(
  new URL("../src/main.jsx", import.meta.url),
  "utf8",
);

test("legacy Whop embedded checkout package is removed", () => {
  assert.equal(packageJson.dependencies?.["@whop/checkout"], undefined);
  assert.doesNotMatch(packageLock, /node_modules\/\@whop\/checkout/);
  assert.doesNotMatch(client, /@whop\/checkout|WhopCheckoutEmbed/);
});

test("Whop Elements checkout is mounted from the official hosted SDK", () => {
  assert.match(
    html,
    /https:\/\/cdn\.whop\.com\/elements\/amber\/elements\.js/,
  );
  assert.match(client, /window\.WhopElements/);
  assert.match(client, /checkoutConfiguration/);
  assert.match(client, /checkoutHandle\.create\("checkout"/);
});

test("existing server-side Whop key names stay unchanged", () => {
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  for (const name of [
    "WHOP_API_KEY",
    "WHOP_COMPANY_ID",
    "WHOP_PRODUCT_ID",
    "WHOP_WEBHOOK_SECRET",
  ]) {
    assert.match(env, new RegExp("^" + name + "=", "m"));
  }
  assert.doesNotMatch(env, /WHOP_(?:PUBLIC|CLIENT|ELEMENTS|PUBLISHABLE)_KEY/);
});
