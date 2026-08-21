import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the HFJV and chest X-ray tool", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Jet at a glance/i);
  assert.match(html, /Confirm the chest X-ray/i);
  assert.match(html, /Confirm and integrate/i);
  assert.match(html, /CONFIRMED CXR OVERRIDE CHECK/i);
  assert.match(html, /HFJV \+ CXR Call Tool/i);
  assert.match(html, /Clinical Use Agreement/i);
  assert.match(html, /I have read, understood, and agree/i);
  assert.match(html, /I Agree: Enter Tool/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
});

test("keeps image review local and findings confirmation-gated", async () => {
  const [page, guidance, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/xray-guidance.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /URL\.createObjectURL\(file\)/);
  assert.match(page, /URL\.revokeObjectURL\(imageUrl\)/);
  assert.match(page, /disabled=\{!attested\}/);
  assert.match(page, /confirmedIsCurrent/);
  assert.match(page, /assessmentFingerprint\(confirmedXray\)/);
  assert.doesNotMatch(page, /sessionStorage|localStorage/);
  assert.match(page, /disabled=\{!agreementChecked\}/);
  assert.match(page, /inert=\{agreementStatus !== "accepted"\}/);
  assert.match(page, /A new acknowledgement is required whenever this page is loaded/);
  assert.match(guidance, /Do not begin a recruitment maneuver/);
  assert.match(guidance, /Resolve airway position before routine setting changes/);
  assert.match(layout, /\/og\.png/);
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|FormData/);
});
