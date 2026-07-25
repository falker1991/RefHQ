import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Law18Referee Management application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Law18Referee Management — Tournament referee operations<\/title>/i);
  assert.match(html, /Loading Law18Referee Management/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("repeat imports target an existing event without replacing other days", async () => {
  const [client, page] = await Promise.all([
    readFile(new URL("../app/supabase-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(client, /eventId\?: string/);
  assert.match(client, /games\?on_conflict=event_id,external_id/);
  assert.match(client, /assignments\?game_id=eq\.\$\{enc\(gameId\)\}&position=eq\.\$\{enc\(position\)\}/);
  assert.match(client, /import_jobs/);
  assert.match(page, /Create a new event/);
  assert.match(page, /Add schedule to event/);
  assert.match(page, /Existing check-ins and other event days stay in place/);
});
