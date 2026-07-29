import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Version 0.5.25 uses the dashboard loading label and favicon metadata", async () => {
  const [page, layout, manifest, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("public/manifest.webmanifest"),
    read("package.json"),
  ]);
  assert.match(page, /Loading Dashboard/);
  assert.doesNotMatch(page, /Loading tournament data/);
  assert.match(page, /Version 0\.5\.25/);
  assert.match(layout, /favicon\.png/);
  assert.match(manifest, /law18ref-icon-192\.png/);
  assert.equal(JSON.parse(packageJson).version, "0.5.25");
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

test("top bar has an accessible page refresh button beside the account menu", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /className="topbar-account-actions"/);
  assert.match(page, /className="page-refresh-button" aria-label="Refresh page"/);
  assert.match(page, /window\.location\.reload\(\)/);
});

test("coach schedule lists crews and opens the selected game's rating modal", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /schedule-crew-list/);
  assert.match(page, />Rate Crew</);
  assert.match(page, /onRateCrew=\{setRatingModalGameId\}/);
  assert.match(page, /initialGameId=\{ratingModalGameId \|\| undefined\} modal/);
  assert.match(page, /if \(modal\) onClose\?\.\(\)/);
  assert.match(page, /else chooseGame\(""\)/);
  assert.match(page, /id === "assessments" && canAssess/);
  assert.match(page, /hideWorkspace=\{canAssess\}/);
});

test("coach crew visibility is scoped by a dedicated RLS migration", async () => {
  const migration = await read("supabase/migrations/202607290022_coach_crew_visibility.sql");
  assert.match(migration, /coach_can_view_game/);
  assert.match(migration, /coaches view assigned game crews/);
  assert.match(migration, /coaches view assigned crew officials/);
  assert.match(migration, /full_schedule_access/);
});

test("ratings game options are concise and mobile controls stay within the workspace", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /\{formatDate\(game\.starts_at\)\} · \{game\.field_name\} · \{formatTime\(game\.starts_at\)\}/);
  assert.match(css, /\.assessment-selects select\{[^}]*width:100%[^}]*min-width:0[^}]*max-width:100%/);
  assert.match(css, /\.crew-rating-workspace\{[^}]*overflow:hidden/);
});

test("coach-only schedules exclude operational and HQ locations", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /coachView\s*\?\s*data\.games\.filter\(isRateableGame\)/);
  assert.match(page, /toLowerCase\(\)\.includes\("hq"\)/);
  assert.match(page, /coachView=\{isCoach && !isAdministrativeStaff\}/);
});

test("coaching administration is hidden from referee coaches", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /isCoach\s*\?\s*\[\["dashboard", "Dashboard"\], \.\.\.\(coachHasCurrentOrFutureAssignment/);
  assert.match(page, /view === "coaching" && isAdministrativeStaff/);
});

test("assigned referee coaches participate in daily check-in", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /coachHasCurrentOrFutureAssignment/);
  assert.match(page, /coachingOfficialIds/);
  assert.match(page, /assignedToday\.add\(coachOfficial\.id\)/);
  assert.match(page, /Referee Coach/);
  assert.match(page, /assignment\.full_schedule\) data\.games\.forEach\(\(game\) => assignmentDates\.add/);
});

test("administrative dashboard shows today's check-in progress and role only", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /adminView=\{isAdministrativeStaff\}/);
  assert.match(page, /adminView \? `\$\{checkedIn\}\/\$\{expectedToday\.size\}` : checkedIn/);
  assert.match(page, /adminView \? "Today's Check Ins" : "Officials checked in"/);
  assert.match(page, /\{!adminView && <article><span className="metric-icon green">◇/);
  assert.match(page, /\{!adminView && <article><span className="metric-icon blue">☷/);
  assert.match(page, /Your account role/);
});

test("check-in roster names open a complete daily schedule modal", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /className="checkin-official-button"/);
  assert.match(page, /setScheduleOfficialId\(official\.id\)/);
  assert.match(page, /className="confirmation-dialog checkin-schedule-dialog"/);
  assert.match(page, /className="checkin-day-schedule"/);
  assert.match(css, /\.checkin-schedule-dialog/);
});

test("rating configuration requires an explicit save and Basic Eval stores notes", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /Save Configuration/);
  assert.match(page, /saveConfiguration/);
  assert.match(page, /configuration\.ratingType === event\.rating_type/);
  assert.match(page, /className="basic-eval-notes"/);
  assert.match(page, /coach_notes: rating\.coach_notes \|\| null/);
  assert.match(page, /className="inline-basic-rating"/);
  assert.match(page, /<option value="">N\/A<\/option>/);
  assert.match(page, /overall_rating: e\.target\.value \? Number\(e\.target\.value\) : null/);
  assert.match(page, /<textarea rows=\{2\}/);
});

test("administrative roster supports immediate manual check-in and undo", async () => {
  const [page, client] = await Promise.all([read("app/page.tsx"), read("app/supabase-client.ts")]);
  assert.match(page, /canManageCheckIns=\{isAdministrativeStaff\}/);
  assert.match(page, /toggleManualCheckIn/);
  assert.match(page, /Undo Check-In/);
  assert.match(page, /"Check In"/);
  assert.doesNotMatch(page, /confirm\([^)]*check.?in/i);
  assert.match(client, /export async function undoCheckIn/);
  assert.match(client, /method: "DELETE"/);
});

test("Rate Crew buttons and rating choices exclude HQ and operational games", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /function isRateableGame/);
  assert.match(page, /!game\.operational/);
  assert.match(page, /canRateCrew && isRateableGame\(game\)/);
  assert.match(page, /eligibleGames = data\.games\.filter\(isRateableGame\)/);
});

test("all users have active-group role-aware help", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /className="help-button"/);
  assert.match(page, /HELP & HOW-TO/);
  assert.match(page, /How to Navigate Law18Ref/);
  assert.match(page, /Open My Assignments to view your imported game schedule/);
  assert.match(page, /Select Rate Crew on a game to open its evaluation form/);
  assert.match(page, /activeGroupRoles/);
  assert.match(page, /Follow the directions below for your role/);
  for (const role of ["site_owner", "organization_admin", "event_admin", "assignor", "site_coordinator", "referee_coach", "referee"]) {
    assert.match(page, new RegExp(`${role}: \\{ title:`));
  }
});

test("assessment upsert uses a non-partial matching unique index", async () => {
  const [client, migration] = await Promise.all([
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607290023_assessment_upsert_constraint.sql"),
  ]);
  assert.match(client, /on_conflict=game_id,official_id,coach_id/);
  assert.match(migration, /create unique index assessments_game_official_coach_unique/);
  assert.doesNotMatch(migration, /where official_id is not null/i);
});

test("rating drafts are readable only by their creator", async () => {
  const migration = await read("supabase/migrations/202607290024_private_rating_drafts.sql");
  assert.match(migration, /as restrictive/);
  assert.match(migration, /status <> 'draft'/);
  assert.match(migration, /coach_id = auth\.uid\(\)/);
});

test("ratings history supports multi-select filters independent of sorting", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /historyFilters/);
  assert.match(page, /toggleHistoryFilter/);
  assert.match(page, /Filter Ratings/);
  assert.match(page, /Clear All Filters/);
  assert.match(page, /className="rating-filter-dropdown"/);
  assert.match(page, /historyFilters\[key\]\.length \? `\$\{historyFilters\[key\]\.length\} selected` : "All"/);
  for (const label of ["Referees", "Age Groups", "Genders", "Positions", "Dates"]) {
    assert.match(page, new RegExp(`\"${label}\"`));
  }
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
