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
  assert.match(html, /Personal macro tracker/);
  assert.match(html, /Sign in to continue|Checking sign-in/);
  assert.match(html, /Sign in with Google/);
  assert.doesNotMatch(html, /Add Item|Saved foods|Siggis Yogurt|Save \+ Add/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("keeps product sources focused on the Firebase-backed app", async () => {
  const [page, firebase, layout, packageJson, manifest] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/firebase.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type TabKey = "stats" \| "add"/);
  assert.match(page, /type PeriodKey = "day" \| "week" \| "month"/);
  assert.match(page, /const PERIODS/);
  assert.match(page, /periodDates/);
  assert.match(page, /defaultMacroState/);
  assert.match(page, /saveMacroState/);
  assert.match(page, /Sign in to continue/);
  assert.match(page, /Add Item/);
  assert.match(page, /Saved foods/);
  assert.match(page, /Save \+ Add/);
  assert.match(page, /Sign in with Google/);
  assert.match(page, /userMacroStatePath/);
  assert.match(firebase, /andrews-macro-counter/);
  assert.match(firebase, /getDatabase/);
  assert.match(firebase, /GoogleAuthProvider/);
  assert.match(firebase, /initializeFirebaseAnalytics/);
  assert.match(page, /status-toast/);
  assert.match(page, /DEFAULT_FOODS/);
  assert.doesNotMatch(page, /STORAGE_KEY|localStorage|Guest mode|Local only|Cloud-synced/);
  assert.doesNotMatch(page, /type TabKey = "today" \| "foods" \| "week" \| "targets"/);
  assert.doesNotMatch(page, /Targets|target-management|Weekly Totals/);
  assert.match(layout, /manifest: publicPath\("\/manifest\.webmanifest"\)/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"start_url": "\."/);
  assert.match(packageJson, /"build:pages"/);
  assert.match(packageJson, /"ios:open"/);
  assert.doesNotMatch(
    `${page}\n${firebase}\n${layout}\n${packageJson}`,
    /codex-preview|_sites-preview|react-loading-skeleton|Starter Project/,
  );

  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
});
