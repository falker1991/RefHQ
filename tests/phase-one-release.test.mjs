import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Version 0.7.1 uses the dashboard loading label and favicon metadata", async () => {
  const [page, layout, manifest, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("public/manifest.webmanifest"),
    read("package.json"),
  ]);
  assert.match(page, /Loading Dashboard/);
  assert.doesNotMatch(page, /Loading tournament data/);
  assert.match(page, /Version 0\.7\.1/);
  assert.match(layout, /favicon\.png/);
  assert.match(manifest, /law18ref-icon-192\.png/);
  assert.equal(JSON.parse(packageJson).version, "0.7.1");
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

test("site owner appearance supports secure drag-and-drop logo uploads", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607290025_appearance_logo_storage.sql"),
  ]);
  assert.match(page, /className=\{`appearance-logo-upload/);
  assert.match(page, /onDrop=\{\(event\) =>/);
  assert.match(page, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(page, /uploadAppearanceLogo\(session, file\)/);
  assert.match(client, /storage\/v1\/object\/appearance-logos/);
  assert.match(migration, /file_size_limit/);
  assert.match(migration, /public\.is_site_owner\(\)/);
});

test("coach schedule lists crews and opens the selected game's rating modal", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /schedule-crew-list/);
  assert.match(page, />Rate Crew</);
  assert.match(page, /onRateCrew=\{setRatingModalGameId\}/);
  assert.match(page, /initialGameId=\{ratingModalGameId \|\| undefined\} modal/);
  assert.match(page, /if \(modal\) onClose\?\.\(\)/);
  assert.match(page, /else chooseGame\(""\)/);
  assert.match(page, /hideWorkspace=\{canAssess\}/);
  assert.match(page, />Rate a Crew<\/button>/);
  assert.match(page, /onOpenRating=\{\(\) => setRatingModalGameId\(""\)\}/);
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
  assert.match(page, /adminView \? "Today's Check-ins" : "Officials checked in"/);
  assert.match(page, /\{relevantEvents\.length\} Active Events/);
  assert.match(page, /Account and Organization/);
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

test("check-in schedule modal uses one-column game cards with positions and crews", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /className="checkin-game-card"/);
  assert.match(page, /className="selected-position"/);
  assert.match(page, /GAME CREW/);
  assert.match(page, /data\.assignments\.filter\(\(item\) => item\.game_id === game\.id\)/);
  assert.match(page, /positionLabel\(crewAssignment\.position, crewAssignment\.position_title\)/);
  assert.match(css, /\.checkin-day-schedule\{display:flex;flex-direction:column;align-items:stretch/);
  assert.match(css, /\.checkin-day-schedule>\.checkin-game-card\{display:block;flex:0 0 auto;box-sizing:border-box;width:100%/);
  assert.match(css, /\.checkin-crew-member\.selected-official/);
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

test("check-in roster sorts by first assignment field instead of site", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /firstField: firstGame\?\.field_name \|\| "Unspecified field"/);
  assert.match(page, /rosterSort === "field"/);
  assert.match(page, /<option value="field">Field<\/option>/);
  assert.doesNotMatch(page, /<option value="site">Site<\/option><\/select><\/label><label>Site/);
});

test("authorized administrators can create an event without importing a schedule", async () => {
  const [page, client] = await Promise.all([read("app/page.tsx"), read("app/supabase-client.ts")]);
  assert.match(page, /Create New Event/);
  assert.match(page, /Create an event without a schedule/);
  assert.match(page, /canCreateEvent=\{Boolean\(profile\.is_site_owner \|\| organizationRoles\.includes\("organization_admin"\) \|\| organizationRoles\.includes\("event_admin"\)\)\}/);
  assert.match(client, /export async function createEvent\(/);
  assert.match(client, /The end date cannot be before the start date/);
  assert.match(client, /check_in_slug: `\$\{slugBase\}-\$\{Date\.now\(\)\.toString\(36\)\}`/);
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
  for (const label of ["Referees", "Age Groups", "Genders", "Positions"]) {
    assert.match(page, new RegExp(`\"${label}\"`));
  }
  assert.match(page, /className="rating-referee-search"/);
  assert.match(page, /placeholder="Search referees…"/);
  assert.match(page, /className="rating-date-range"/);
  assert.match(page, /historyDateRange\.from/);
  assert.match(page, /historyDateRange\.through/);
  assert.doesNotMatch(page, /\["dates", "Dates"/);
  assert.match(page, /const filteredAverage = filteredScores\.length/);
  assert.match(page, /Average Score <strong>\{filteredAverage\?\.toFixed\(2\) \|\| "—"\}/);
});

test("ratings history survives event archiving and supports grouped export and lifecycle controls", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300025_rating_history_lifecycle.sql"),
  ]);
  assert.match(page, /Individual Ratings/);
  assert.match(page, /Full Game Ratings/);
  assert.match(page, /Export Spreadsheet/);
  assert.match(page, /Select All/);
  assert.match(page, /Show Archived Ratings/);
  assert.match(client, /rpc\/authorized_rating_history/);
  assert.match(client, /rpc\/set_rating_archived/);
  assert.match(client, /rpc\/delete_rating/);
  assert.match(migration, /create or replace function public\.authorized_rating_history/);
  assert.match(migration, /rating\.archived/);
  assert.match(migration, /rating\.deleted/);
});

test("administrators can bulk manage officials, ratings, and events", async () => {
  const [page, client, migration, readme] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300026_bulk_record_lifecycle.sql"),
    read("README.md"),
  ]);
  assert.match(page, /Select All Visible/);
  assert.match(page, /Delete Eligible/);
  assert.match(page, /Archive Selected/);
  assert.match(page, /Delete Archived/);
  assert.match(client, /rpc\/bulk_manage_records/);
  assert.match(migration, /record_type not in \('officials', 'ratings', 'events'\)/);
  assert.match(migration, /Events must be archived before permanent deletion/);
  assert.match(migration, /officials with history must be archived, not deleted/);
  assert.match(readme, /Games and assignments are designed to join the same workflow/);
});

test("officials directory shows authorized submitted-rating averages", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /setDirectoryAssessments\(result\.assessments\)/);
  assert.match(page, /assessment\.status !== "draft"/);
  assert.match(page, /<span className="directory-average">Average Rating<\/span>/);
  assert.match(page, /officialAverage\(official\.id\)\?\.toFixed\(2\) \|\| "—"/);
  assert.match(page, /<option value="rating">Average rating<\/option>/);
});

test("rating authors can reopen and edit an entire game crew", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /assessment\.coach_id === session\.user\.id/);
  assert.match(page, /className="secondary edit-rating-button"/);
  assert.match(page, /onEditRating\(assessment\.game_id, ratedGame\.event_id\)/);
  assert.match(page, /if \(targetEventId !== event\.id\) await switchEvent\(targetEventId\)/);
  assert.match(page, /setRatingModalGameId\(gameId\)/);
  assert.match(page, /data\.assignments\.filter\(\(assignment\) => assignment\.game_id === nextGameId\)/);
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
  assert.match(page, /const timeOrder = a\.game\.starts_at\.localeCompare\(b\.game\.starts_at\)/);
  assert.match(page, /const fieldOrder = a\.game\.field_name\.localeCompare\(b\.game\.field_name, undefined, \{ numeric: true, sensitivity: "base" \}\)/);
  assert.match(page, /return aLastName\.localeCompare\(bLastName/);
});

test("roadmap records organization capability and check-in method controls", async () => {
  const readme = await read("README.md");
  assert.match(readme, /Organization capability controls/);
  assert.match(readme, /site-owner organization entitlements followed by organization-admin member permissions/);
  assert.match(readme, /organization’s capability ceiling/);
  assert.match(readme, /remove any site-owner-enabled capability from the organization generally, from a role, or from an individual member/);
  assert.match(readme, /Never let an organization administrator enable a capability that the site owner has disabled/);
  assert.match(readme, /Control access to check-ins, assigning, and ratings\/coaching independently/);
  assert.match(readme, /enable or disable every supported evaluation form type independently/);
  assert.match(readme, /enable or disable public evaluations/);
  assert.match(readme, /daily QR code, reusable NFC tag, and administrator manual check-in/);
  assert.match(readme, /reject related database\/API mutations/);
});

test("organization admins can review audited actions and manage Join Group links", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300023_audit_join_links_and_member_removal.sql"),
  ]);
  assert.match(page, /Activity & Join Links/);
  assert.match(page, /Create Join Group Link/);
  assert.match(page, /organizationRoles\.includes\("organization_admin"\).*"activity"/);
  assert.match(client, /export async function loadOrganizationActivity/);
  assert.match(client, /export async function createOrganizationJoinLink/);
  assert.match(migration, /create table if not exists public\.organization_join_links/);
  assert.match(migration, /create or replace function public\.audit_organization_mutation/);
  for (const table of ["events", "games", "assignments", "officials", "assessments", "check_ins", "coach_assignments", "import_jobs", "organization_memberships", "event_memberships"]) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
});

test("officials directory shows last login and supports recoverable member removal", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300023_audit_join_links_and_member_removal.sql"),
  ]);
  assert.match(page, />Last Login</);
  assert.match(page, /Remove From Organization/);
  assert.match(page, /Their Law18Ref account, assignments, ratings, check-ins, and audit history are preserved/);
  assert.match(client, /last_login_at\?: string \| null/);
  assert.match(client, /export async function removeOrganizationMember/);
  assert.match(migration, /create or replace function public\.record_current_login/);
  assert.match(migration, /The last organization administrator cannot be removed/);
  assert.match(migration, /set status = 'archived'/);
});

test("Join Group tokens survive account creation and are claimed after authentication", async () => {
  const [authPanel, authClient, page, migration] = await Promise.all([
    read("app/auth-panel.tsx"),
    read("app/auth-client.ts"),
    read("app/page.tsx"),
    read("supabase/migrations/202607300023_audit_join_links_and_member_removal.sql"),
  ]);
  assert.match(authPanel, /law18ref-join-token/);
  assert.match(authPanel, /JOIN GROUP INVITATION/);
  assert.match(authClient, /email_redirect_to: redirectTo/);
  assert.match(page, /claimOrganizationJoinLink\(session, joinToken\)/);
  assert.match(migration, /create or replace function public\.claim_organization_join_link/);
  assert.match(migration, /membership\.joined_via_link/);
});

test("authorized event staff can manually or automatically archive events", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300024_event_lifecycle_archiving.sql"),
  ]);
  assert.match(page, /EVENT LIFECYCLE/);
  assert.match(page, /Save Archive Schedule/);
  assert.match(page, /Archive Now/);
  assert.match(page, /After the final event day/);
  assert.match(client, /export async function configureEventAutoArchive/);
  assert.match(client, /export async function archiveEvent/);
  assert.match(migration, /create or replace function public\.configure_event_auto_archive/);
  assert.match(migration, /array\['event_admin'\]::public\.membership_role\[\]/);
  assert.match(migration, /event\.manually_archived/);
});

test("past-due events leave active views and organization admins can restore them", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300024_event_lifecycle_archiving.sql"),
  ]);
  assert.match(page, /ARCHIVED EVENTS/);
  assert.match(page, /Restore Event/);
  assert.match(page, /Automatic archiving was cleared/);
  assert.match(client, /rpc\/materialize_due_event_archives/);
  assert.match(client, /export async function loadArchivedEvents/);
  assert.match(client, /export async function restoreEvent/);
  assert.match(migration, /auto_archive_at <= now\(\)/);
  assert.match(migration, /e\.auto_archive_at is null or e\.auto_archive_at > now\(\)/);
  assert.match(migration, /event\.automatically_archived/);
  assert.match(migration, /event\.restored/);
});
