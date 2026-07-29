import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Version 0.5.0 uses the dashboard loading label and favicon metadata", async () => {
  const [page, layout, manifest, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("public/manifest.webmanifest"),
    read("package.json"),
  ]);
  assert.match(page, /Loading Dashboard/);
  assert.doesNotMatch(page, /Loading tournament data/);
  assert.match(page, /Version 0\.5\.0/);
  assert.match(layout, /favicon\.png/);
  assert.match(manifest, /law18ref-icon-192\.png/);
  assert.equal(JSON.parse(packageJson).version, "0.5.0");
});

test("account merge migration transfers operational records and audits the merge", async () => {
  const migration = await read("supabase/migrations/202607290021_phase_one_identity_merge.sql");
  for (const table of ["assignments", "check_ins", "assessments", "coach_assignments"]) {
    assert.match(migration, new RegExp(`update public\\.${table}`));
  }
  assert.match(migration, /organization_memberships/);
  assert.match(migration, /event_memberships/);
  assert.match(migration, /accounts_merged/);
  assert.match(migration, /merged_into_official_id/);
});

test("assignment board exposes all three Phase 1 views", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /Time and Field Grid/);
  assert.match(page, />By Field</);
  assert.match(page, />First Assignment</);
});
