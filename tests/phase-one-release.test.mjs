import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Version 0.5.5 uses the dashboard loading label and favicon metadata", async () => {
  const [page, layout, manifest, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("public/manifest.webmanifest"),
    read("package.json"),
  ]);
  assert.match(page, /Loading Dashboard/);
  assert.doesNotMatch(page, /Loading tournament data/);
  assert.match(page, /Version 0\.5\.5/);
  assert.match(layout, /favicon\.png/);
  assert.match(manifest, /law18ref-icon-192\.png/);
  assert.equal(JSON.parse(packageJson).version, "0.5.5");
});

test("Assignr import supports drag and drop with CSV validation", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /onDragEnter=\{enterDropZone\}/);
  assert.match(page, /onDrop=\{dropFile\}/);
  assert.match(page, /Drop CSV to upload/);
  assert.match(page, /Drop one Assignr CSV file at a time/);
});

test("officials directory displays all organization roles", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /Organization Roles/);
  assert.match(page, /roles\.map\(\(role\) => <span className="role-badge"/);
});

test("official editor uses structured fields and role cards", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /official-fields-grid/);
  assert.match(page, /official-role-grid/);
  assert.match(page, /official-edit-actions/);
});

test("event access is discoverable and site-owner access is locked", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, />Event Access</);
  assert.match(page, /Open Event Access/);
  assert.match(page, /Site Owner — Full Access/);
  assert.match(page, /owner-locked/);
});

test("daily check-in uses the camera scanner and hides it after check-in", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /Scan QR Code/);
  assert.match(page, /\{!isCheckedIn && <QrScanner/);
  assert.match(page, /Check-in complete/);
});

test("coaches can be assigned in bulk or from the filtered full schedule", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /Multiple selected games/);
  assert.match(page, /Assign Coaches by Game/);
  assert.match(page, /coach-schedule-filters/);
  assert.match(page, /Promise\.all\(newTargets/);
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
