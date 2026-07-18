import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders Andy's Macro Counter shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Andy&#x27;s Macro Counter<\/title>/i);
  assert.match(html, /Andy(?:'|&#x27;|&apos;)s Macro Counter/);
  assert.match(html, /Siggis Yogurt/);
  assert.match(html, /Today/);
  assert.match(html, /Foods/);
  assert.match(html, /Week/);
  assert.match(html, /Targets/);
  assert.match(html, /Saved Foods/);
  assert.match(html, /Today&#x27;s Foods/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("keeps product sources free of starter preview code", async () => {
  const [page, layout, packageJson, manifest] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);

  assert.match(page, /STORAGE_KEY = "andys-macro-counter:v1"/);
  assert.match(page, /type TabKey = "today" \| "foods" \| "week" \| "targets"/);
  assert.match(page, /className="tab-bar"/);
  assert.match(page, /status-toast/);
  assert.match(page, /DEFAULT_FOODS/);
  assert.match(page, /Weekly Totals/);
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.doesNotMatch(
    `${page}\n${layout}\n${packageJson}`,
    /codex-preview|_sites-preview|react-loading-skeleton|Starter Project/,
  );

  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
});
