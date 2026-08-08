import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Version 0.19.2 uses the dashboard loading label, favicon metadata, and preserved Worker secrets", async () => {
  const [page, layout, manifest, packageJson, viteConfig] = await Promise.all([
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("public/manifest.webmanifest"),
    read("package.json"),
    read("vite.config.ts"),
  ]);
  assert.match(page, /Loading Dashboard/);
  assert.doesNotMatch(page, /Loading tournament data/);
  assert.match(page, /Version 0\.19\.2/);
  assert.match(layout, /favicon\.png/);
  assert.match(manifest, /law18ref-icon-192\.png/);
  assert.equal(JSON.parse(packageJson).version, "0.19.2");
  assert.match(viteConfig, /keep_vars: true/);
});

test("event settings respect organization feature ceilings and enforce disabled modules", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608050041_event_feature_settings.sql"),
  ]);
  assert.match(page, /function EventSettingsPanel/);
  assert.match(page, /event_settings", "Event Settings"/);
  assert.match(page, /eventFeatureEnabled\(event, "check_in"\)/);
  assert.match(page, /Not enabled for this organization/);
  assert.match(client, /updateEventSettings/);
  assert.match(migration, /feature_entitlements jsonb not null/);
  assert.match(migration, /feature_settings jsonb not null/);
  assert.match(migration, /enforce_event_feature_enabled/);
  assert.match(migration, /enforce_check_in_feature/);
  assert.match(migration, /enforce_rating_feature/);
});

test("user-facing groups replace organization terminology and Site Owner controls group features", async () => {
  const [page, client, css, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/admin-features.css"),
    read("supabase/migrations/202608060045_group_feature_entitlements.sql"),
  ]);
  assert.match(page, /organization_director: "Group Director"/);
  assert.match(page, /organization_admin: "Group Admin"/);
  assert.match(page, /Enabled Group Features/);
  assert.match(page, /Law18Ref Groups/);
  assert.match(page, /workspace-context-bar/);
  assert.match(page, /<span>Group<\/span>/);
  assert.match(client, /feature_entitlements\?: EventFeatureSettings/);
  assert.match(css, /\.site-owner-feature-settings/);
  assert.match(migration, /Only the Site Owner can change group feature entitlements/);
  assert.match(migration, /apply_group_feature_entitlements/);
  assert.match(migration, /update public\.events/);
});

test("external check-in supports configurable identity, messages, links, and two-stage failures", async () => {
  const [page, client, css, migration, configurationMigration, arrivalMigration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/202608060044_guest_check_in.sql"),
    read("supabase/migrations/202608070047_external_check_in_configuration.sql"),
    read("supabase/migrations/202608080048_external_check_in_arrival_options.sql"),
  ]);
  assert.match(page, /function ExternalCheckInPage/);
  assert.match(page, /exactly as they appear in your Assignr account/);
  assert.match(page, /Confirm Schedule & Check In/);
  assert.match(page, /external=1/);
  assert.match(page, /Enable External Check-In/);
  assert.match(page, /second_failure_message/);
  assert.match(page, /Show Account Sign-In Option/);
  assert.match(page, /config\?\.arrival_message/);
  assert.match(page, /config\?\.allow_account_sign_in/);
  assert.match(client, /findExternalCheckIn/);
  assert.match(client, /confirmExternalCheckIn/);
  assert.match(client, /Authorization: `Bearer \$\{config\.anonKey\}`/);
  assert.match(css, /\.guest-checkin-page/);
  assert.match(css, /\.guest-schedule-list/);
  assert.match(migration, /guest_check_in_enabled boolean not null default false/);
  assert.match(migration, /security definer/);
  assert.match(migration, /find_guest_check_in/);
  assert.match(migration, /confirm_guest_check_in/);
  assert.match(migration, /grant execute .* to anon, authenticated/);
  assert.match(configurationMigration, /external_check_in_fields text\[\]/);
  assert.match(configurationMigration, /get_external_check_in_config/);
  assert.match(configurationMigration, /find_external_check_in/);
  assert.match(configurationMigration, /external_check_in_second_failure_message/);
  assert.match(configurationMigration, /valid_check_in_links/);
  assert.match(arrivalMigration, /external_check_in_arrival_message/);
  assert.match(arrivalMigration, /external_check_in_allow_account_sign_in/);
});

test("event types and private Rules of Competition documents are available throughout assigned-event views", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608050040_event_types_and_documents.sql"),
  ]);
  assert.match(migration, /event_type text not null default 'tournament'/);
  assert.match(migration, /parent_league_id uuid references public\.events/);
  assert.match(migration, /check_in_enabled boolean not null default true/);
  assert.match(migration, /create table if not exists public\.event_documents/);
  assert.match(migration, /values \('event-documents', 'event-documents', false/);
  assert.match(client, /uploadEventDocument/);
  assert.match(client, /loadMyRulesDocuments/);
  assert.match(page, /ROC — Rules of Competition/);
  assert.match(page, /function EventSettingsPanel/);
  assert.match(page, /Parent league/);
  assert.match(page, /eventFeatureEnabled\(event, "check_in"\)/);
});

test("referees use an account-wide workspace without active organization or event selectors", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /function PersonalDashboard/);
  assert.match(page, /function PersonalCheckInHub/);
  assert.match(page, /<div className="personal-header-spacer" aria-hidden="true"/);
  assert.match(page, /isPersonalWorkspace \? <PersonalDashboard/);
  assert.match(page, /isPersonalWorkspace \? <PersonalCheckInHub/);
  assert.match(page, /You have assignments in more than one event today/);
  assert.match(css, /\.personal-header-spacer/);
});

test("application header remains visible while scrolling", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.topbar\{position:fixed/);
  assert.match(css, /\.eventbar\{margin-top:var\(--fixed-topbar-height\)/);
  assert.match(css, /--fixed-topbar-height:120px/);
});

test("mobile header and administrative context no longer overlap a persistent event bar", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.doesNotMatch(page, /className="eventbar"/);
  assert.match(page, /showAdministrativeContext/);
  assert.match(page, /workspace-context-bar/);
  assert.match(page, /contextViews\.includes\(view\)/);
  assert.match(css, /grid-template-rows:58px 50px/);
  assert.match(css, /--fixed-topbar-height:132px/);
});

test("personal calendar feeds are encrypted and appear in a unified private schedule", async () => {
  const [page, client, worker, css, migration, serviceGrants] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("worker/index.ts"),
    read("app/globals.css"),
    read("supabase/migrations/202607310031_personal_calendar_feeds.sql"),
    read("supabase/migrations/202607310032_calendar_feed_service_role_grants.sql"),
  ]);
  assert.match(page, /function ConnectedSchedules/);
  assert.match(page, /function UnifiedAssignmentsView/);
  assert.match(page, /Connect Feed/);
  assert.match(page, /Schedule conflict/);
  assert.match(client, /loadUnifiedAssignments/);
  assert.match(client, /loadCalendarFeedConnections/);
  assert.match(worker, /AES-GCM/);
  assert.match(worker, /assertSafeFeedUrl/);
  assert.match(worker, /async scheduled/);
  assert.match(worker, /BEGIN:VCALENDAR/);
  assert.match(css, /\.connected-schedules-card/);
  assert.match(css, /\.unified-assignment-row/);
  assert.match(page, /className="panel unified-assignment-list"/);
  assert.match(page, /Calendar Imports/);
  assert.match(page, /Law18Ref Events/);
  assert.match(page, /Law18Ref Groups/);
  assert.match(client, /my_law18_assignment_context/);
  assert.match(migration, /create table if not exists public\.personal_calendar_feeds/);
  assert.match(migration, /revoke all on public\.personal_calendar_feeds from authenticated/);
  assert.match(migration, /create or replace function public\.my_law18_assignments/);
  assert.match(migration, /create or replace function public\.my_external_assignments/);
  assert.match(serviceGrants, /personal_calendar_feeds to service_role/);
  assert.match(serviceGrants, /external_calendar_assignments to service_role/);
});

test("Version 0.11.0 adds color-coded date-filtered assignments and reusable session filters", async () => {
  const [page, client, css, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/202608030034_personal_schedule_display_preferences.sql"),
  ]);
  assert.match(page, /my-assignments:dates/);
  assert.match(page, /from: today/);
  assert.match(page, /personal_schedule_colors/);
  assert.match(page, /SavedFilterControls/);
  assert.match(page, /activeFilterMemory/);
  assert.match(page, /coaching-dates:/);
  assert.match(page, /checkin-status:/);
  assert.match(page, /historyEventIds/);
  assert.match(client, /updateDisplayPreferences/);
  assert.match(css, /--assignment-color/);
  assert.match(migration, /rating_average_preferences/);
});

test("calendar colors support combined presentation modes and custom dropdowns close outside", async () => {
  const [page, client, css, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/202608030035_personal_schedule_color_modes.sql"),
  ]);
  assert.match(page, /Color mark/);
  assert.match(page, /Highlight entire assignment/);
  assert.match(page, /Color calendar label/);
  assert.match(page, /calendar-color-card/);
  assert.match(page, /document\.querySelectorAll<HTMLDetailsElement>\("details\[open\]"\)/);
  assert.match(page, /closest\?\.\("\.account-menu"\)/);
  assert.match(client, /personal_schedule_color_modes/);
  assert.match(css, /calendar-color-label/);
  assert.match(migration, /personal_schedule_color_modes/);
});

test("v0.12.0 prevents profile self-escalation and enforces the organization role hierarchy", async () => {
  const [page, client, roleMigration, securityMigration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608040036_organization_director_role.sql"),
    read("supabase/migrations/202608040037_role_hierarchy_security.sql"),
  ]);
  assert.match(roleMigration, /organization_director/);
  assert.match(securityMigration, /protect_profile_security_fields/);
  assert.match(securityMigration, /new\.is_site_owner is distinct from old\.is_site_owner/);
  assert.match(securityMigration, /protect_official_pending_roles/);
  assert.match(securityMigration, /cleared leaders insert organization memberships/);
  assert.match(securityMigration, /cleared staff insert event memberships/);
  assert.match(securityMigration, /role in \('site_coordinator','referee_coach'\)/);
  assert.match(securityMigration, /organization_join_links_referee_only/);
  assert.match(securityMigration, /secure_merge_organization_accounts/);
  assert.match(securityMigration, /revoke execute on function public\.merge_organization_accounts/);
  assert.match(page, /Group Director/);
  assert.match(page, /canChangeOrganizationRole/);
  assert.match(page, /canChangeEventRole/);
  assert.match(client, /rpc\/secure_merge_organization_accounts/);
});

test("users can lock personal contact fields without locking organization or event permissions", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608040038_personal_contact_lock.sql"),
  ]);
  assert.match(page, /Lock personal contact information/);
  assert.match(page, /editing\.personal_contact_locked/);
  assert.match(page, /They can still manage your organization and event permissions/);
  assert.match(client, /personal_contact_locked\?: boolean/);
  assert.match(migration, /protect_locked_official_contact/);
  assert.match(migration, /Only the account owner can change the personal contact lock/);
  assert.match(migration, /This user has locked their personal contact information/);
});

test("event access can be staged for provisional officials and activates when accounts link", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608040039_provisional_event_access.sql"),
  ]);
  assert.match(page, /Event permissions for \{event\.name\}/);
  assert.match(page, /These permissions will activate automatically when this provisional official creates their account/);
  assert.match(page, /saveProvisionalEventAccess\(session, event\.id, created\.id/);
  assert.match(client, /export async function loadProvisionalEventAccess/);
  assert.match(client, /export async function saveProvisionalEventAccess/);
  assert.match(migration, /create table if not exists public\.provisional_event_access/);
  assert.match(migration, /create or replace function public\.save_provisional_event_access/);
  assert.match(migration, /insert into public\.event_memberships/);
  assert.match(migration, /delete from public\.provisional_event_access/);
});

test("administrative operations show rating averages and richer attendance context", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /administrativeRatingAverage/);
  assert.match(page, /administrativeRatingLabel/);
  assert.match(page, /Position and overall averages/);
  assert.match(page, /Ovr/);
  assert.match(page, /rating_average_preferences/);
  assert.match(page, /firstAssignment/);
  assert.match(page, /firstGame\.age_group/);
  assert.match(page, /firstGame\.gender/);
  assert.match(page, /schedule-crew-checked/);
  assert.match(page, /official-directory-actions/);
  assert.match(page, /manual-entry-modal/);
  assert.match(css, /\.official-directory-actions/);
});

test("sessions refresh automatically and non-auth failures preserve login", async () => {
  const [authClient, dataClient, page] = await Promise.all([
    read("app/auth-client.ts"),
    read("app/supabase-client.ts"),
    read("app/page.tsx"),
  ]);
  assert.match(authClient, /grant_type=refresh_token/);
  assert.match(authClient, /refreshLeadSeconds = 120/);
  assert.match(authClient, /navigator\.locks\.request\("law18ref-session-refresh"/);
  assert.match(authClient, /document\.addEventListener\("visibilitychange"/);
  assert.match(authClient, /window\.addEventListener\("online"/);
  assert.match(dataClient, /if \(response\.status === 401\)/);
  assert.match(dataClient, /ensureValidSession\(activeSession, true\)/);
  assert.match(page, /if \(isSessionExpiredError\(reason\)\) onSessionExpired\(\)/);
  assert.match(page, /Your login is still saved\./);
});

test("public ratings support approval, unread referee badges, and retained deletion", async () => {
  const [page, client, css, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/202607300030_public_rating_approval_notifications.sql"),
  ]);
  assert.match(page, /Public Eval Approval/);
  assert.match(page, /Approve & Share/);
  assert.match(page, /nav-notification-badge/);
  assert.match(page, /markEventRatingsSeen/);
  assert.match(client, /approvePublicRating/);
  assert.match(client, /keep_for_referee: retainForReferee/);
  assert.match(css, /\.nav-notification-badge/);
  assert.match(migration, /effective_public_rating_approval_role/);
  assert.match(migration, /referee_seen_at/);
  assert.match(migration, /retained_for_referee/);
  assert.match(migration, /rating\.approved/);
});

test("ratings can be filtered and sorted by score with match crews in position order", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /scores: \[\] as string\[\]/);
  assert.match(page, /<option value="score">Rating Score<\/option>/);
  assert.match(page, /\["scores", "Rating Scores", filterOptions\.scores\]/);
  assert.match(page, /if \(ratingSort === "score"\)/);
  assert.match(page, /const crewPositionPriority/);
  assert.match(page, /position === "assistant_referee"/);
  assert.match(page, /position === "fourth_official"/);
  assert.match(page, /orderGameRatings\(ratings\)\.map/);
});

test("rating history identifies each rating submitter", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300029_rating_submitter_names.sql"),
  ]);
  assert.match(page, /Submitted by \{ratingSubmitterMap\.get\(assessment\.coach_id\) \|\| "Unknown user"\}/);
  assert.match(client, /submitters: \{ id: string; full_name: string \}\[\]/);
  assert.match(migration, /visible_submitters as/);
  assert.match(migration, /join visible_assessments a on a\.coach_id = p\.id/);
  assert.match(migration, /'submitters'/);
});

test("full-game ratings use one collapsible horizontal official row", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /collapsedRatingGameIds/);
  assert.match(page, /className="game-rating-collapse"/);
  assert.match(page, /aria-expanded=\{!collapsed\}/);
  assert.match(css, /\.game-rating-officials\{display:flex;align-items:stretch;overflow-x:auto/);
  assert.match(css, /\.game-rating-officials>div\{display:grid;[\s\S]*flex:1 0 230px/);
});

test("rating selection checkbox uses a compact column beside rating information", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /selectable-rating-row/);
  assert.match(css, /\.ratings-history article\.selectable-rating-row\{grid-template-columns:16px minmax\(0,1fr\) 45px 78px auto\}/);
  assert.match(css, /\.selectable-rating-row>\.bulk-row-check\{width:16px!important;height:16px;margin:0\}/);
  assert.match(css, /article\.selectable-rating-row\{grid-template-columns:16px minmax\(0,1fr\) 40px\}/);
});

test("role help uses an isolated single-column scrollable dialog", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /<aside className="role-help-roles"/);
  assert.match(page, /<main className="role-help-content"/);
  assert.match(page, /<footer className="role-help-actions"/);
  assert.match(css, /\.confirmation-dialog\.role-help-dialog\{display:grid;grid-template-rows:auto auto minmax\(0,1fr\) auto/);
  assert.match(css, /\.role-help-content\{display:block;min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto/);
  assert.match(css, /\.role-help-dialog \.modal-close-button\{flex:0 0 38px;width:38px;height:38px\}/);
});

test("event members and assigned referee coaches load into officials and check-in rosters", async () => {
  const [page, client] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
  ]);
  assert.ok(client.includes("event_memberships?event_id=eq.${enc(eventId)}&select=user_id"));
  assert.match(client, /coachAssignments\.map\(\(assignment\) => assignment\.coach_id\)/);
  assert.ok(client.includes("officials?organization_id=eq.${enc(eventOrganizationId)}&linked_user_id=in.(${eventUserIds.join(\",\")})"));
  assert.match(client, /new Map\(\[\.\.\.assignedOfficials, \.\.\.linkedEventOfficials\]/);
  assert.match(page, /const eventOfficialIds = new Set\(data\.officials\.map/);
  assert.match(page, /data\.officials\.find\(\(official\) => official\.linked_user_id === assignment\.coach_id\)/);
});

test("page refresh restores the current view and active event", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /function refreshCurrentPage\(\)/);
  assert.match(page, /sessionStorage\.setItem\("law18ref-refresh-view", view\)/);
  assert.match(page, /sessionStorage\.setItem\("law18ref-refresh-event", eventId\)/);
  assert.match(page, /refreshableViews\.includes\(refreshView\)/);
  assert.match(page, /onClick=\{refreshCurrentPage\}/);
});

test("organization administrators can upload a logo for the active organization bar", async () => {
  const [page, client, css, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/admin-features.css"),
    read("supabase/migrations/202607300028_organization_logos.sql"),
  ]);
  assert.match(page, /function OrganizationLogoEditor/);
  assert.match(page, /className="event-organization-logo"/);
  assert.match(page, /Save Group Settings/);
  assert.match(client, /export async function uploadOrganizationLogo/);
  assert.match(client, /organization-logos/);
  assert.match(css, /\.event-organization-logo/);
  assert.match(migration, /add column if not exists logo_url text/);
  assert.match(migration, /public\.has_org_role/);
  assert.match(migration, /organization_admin/);
});

test("official directory sorts populated values before missing values", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /const directoryNameSortKey/);
  assert.match(page, /name: \[directoryNameSortKey\(a\.full_name\), directoryNameSortKey\(b\.full_name\)\]/);
  assert.match(page, /const compareDirectoryValues/);
  assert.match(page, /if \(leftMissing !== rightMissing\) return leftMissing \? 1 : -1/);
  assert.match(page, /last_login: \[a\.last_login_at, b\.last_login_at\]/);
  assert.match(page, /rating: \[officialAverage\(a\.id\), officialAverage\(b\.id\)\]/);
  assert.match(page, /const \[sortDirection, setSortDirection\]/);
  assert.match(page, /direction === "desc" \? -comparison : comparison/);
  assert.match(page, /Low–High/);
  assert.match(page, /Newest–Oldest/);
  assert.match(page, />Order<select/);
});

test("site owner and delegated administrator access follow protected removal hierarchy", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300027_protected_administrator_roles.sql"),
  ]);
  assert.match(page, /Site Owner, Group Director, and Group Admin accounts cannot be mass deleted/);
  assert.match(page, /protectedRole/);
  assert.match(page, /protectedEventAdmin && !canRemoveProtectedEventAdmin/);
  assert.match(client, /preserveEventAdmin/);
  assert.match(migration, /The site-owner account cannot be removed/);
  assert.match(migration, /Organization administrators can only remove their own access/);
  assert.match(migration, /last organization administrator must deactivate the organization before leaving/);
  assert.match(migration, /Site owners and organization administrators cannot be deleted in bulk/);
  assert.match(migration, /role <> 'event_admin' or user_id = auth\.uid\(\)/);
});

test("archived event selection and restore control share one compact row", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/admin-features.css")]);
  assert.match(page, /className="archived-event-actions"><input className="bulk-row-check"/);
  assert.match(css, /\.archived-event-row > \.archived-event-actions/);
  assert.match(css, /\.archived-event-actions > \.secondary \{[\s\S]*width: max-content/);
  assert.doesNotMatch(css, /\.archived-event-row button \{[\s\S]*width: 100%/);
});

test("responsive shell and header remain contained within the viewport", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /html,body\{width:100%;max-width:100%;overflow-x:hidden\}/);
  assert.match(css, /\.topbar nav\{flex:1 1 auto;min-width:0;max-width:100%;overflow-x:auto/);
  assert.match(css, /\.topbar-account-actions\{max-width:100%;min-width:0\}/);
  assert.match(css, /\.eventbar>div\{display:grid;width:100%;grid-template-columns:35px repeat\(2,minmax\(0,1fr\)\)/);
});

test("only an expired auth session returns to login", async () => {
  const [page, authPanel] = await Promise.all([read("app/page.tsx"), read("app/auth-panel.tsx")]);
  assert.doesNotMatch(page, /Setup needed/);
  assert.match(page, /Log back in, session expired\./);
  assert.match(page, /isSessionExpiredError\(reason\)/);
  assert.match(page, /dashboardLoadError/);
  assert.match(authPanel, /initialMessage/);
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
  assert.match(page, /Group Roles/);
  assert.match(page, /roles\.map\(\(role\) => <span className="role-badge"/);
});

test("official editor uses structured fields and role cards", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /official-fields-grid/);
  assert.match(page, /official-role-grid/);
  assert.match(page, /official-edit-actions/);
});

test("active-event permissions are integrated into the official editor and site-owner access is locked", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /ACTIVE EVENT PERMISSIONS/);
  assert.match(page, /These permissions apply only to the current active event/);
  assert.match(page, /saveUserEventAccess\(session, event\.id, editing\.linked_user_id/);
  assert.match(page, /Full schedule access/);
  assert.match(page, /Enable coaching tools/);
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
  assert.match(page, /isCoach\s*\?\s*\[\["dashboard", "Dashboard"\], \.\.\.\(eventFeatureEnabled\(event, "check_in"\) && coachHasCurrentOrFutureAssignment/);
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
  assert.match(page, /Account and Group/);
  assert.match(page, /\{!adminView && <article><span className="metric-icon green">◇/);
  assert.match(page, /\{!adminView && <article><span className="metric-icon blue">☷/);
  assert.match(page, /Your account role/);
});

test("official names open the shared full-event schedule modal", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /className="checkin-official-button"/);
  assert.match(page, /function OfficialEventScheduleModal/);
  assert.match(page, /FULL EVENT SCHEDULE/);
  assert.match(page, /onSelectOfficial=\{setScheduleOfficialId\}/);
  assert.match(page, /Edit Official/);
  assert.match(css, /\.official-event-schedule-dialog/);
});

test("official schedule modal is scrollable and grays completed assignments", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /completionCutoff = Date\.now\(\) - \(2 \* 60 \* 60 \* 1000\)/);
  assert.match(page, /official-event-schedule-card \$\{completed \? "completed"/);
  assert.match(page, /className="selected-position"/);
  assert.match(page, /data\.assignments\.filter\(\(item\) => item\.game_id === game\.id\)/);
  assert.match(page, /positionLabel\(crewAssignment\.position, crewAssignment\.position_title\)/);
  assert.match(css, /\.official-event-schedule-list\{[^}]*overflow-y:auto/);
  assert.match(css, /\.official-event-schedule-card\.completed/);
  assert.match(css, /\.checkin-crew-member\.selected-official/);
});

test("rating configuration requires an explicit reliable save and Basic Eval stores notes", async () => {
  const [page, client, migration] = await Promise.all([read("app/page.tsx"), read("app/supabase-client.ts"), read("supabase/migrations/202608050042_rating_configuration_save.sql")]);
  assert.match(page, /Save Configuration/);
  assert.match(page, /saveConfiguration/);
  assert.match(page, /rating-config-message/);
  assert.match(client, /rpc\/update_event_rating_settings/);
  assert.match(migration, /create or replace function public\.update_event_rating_settings/);
  assert.match(migration, /organization_director/);
  assert.match(page, /configuration\.ratingType === event\.rating_type/);
  assert.match(page, /className="basic-eval-notes"/);
  assert.match(page, /coach_notes: rating\.coach_notes \|\| null/);
  assert.match(page, /className="inline-basic-rating"/);
  assert.match(page, /<option value="">N\/A<\/option>/);
  assert.match(page, /overall_rating: e\.target\.value \? Number\(e\.target\.value\) : null/);
  assert.match(page, /<textarea rows=\{2\}/);
});

test("Skills Eval uses position-specific categories and expanded written feedback", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608050043_position_specific_skills_eval.sql"),
  ]);
  assert.match(page, /Match Control/);
  assert.match(page, /Signaling\/Offside/);
  assert.match(page, /Teamwork/);
  assert.match(page, /Positioning and Movement/);
  assert.match(page, /Management of the Technical Area/);
  assert.match(page, /Positive Areas of Performance/);
  assert.match(page, /Areas for Improvement/);
  assert.match(page, /Additional Comments\/Suggestions/);
  assert.match(page, /Private Coach\/Admin Notes/);
  assert.match(page, /skillValuesForAssignment/);
  assert.match(client, /additional_comments: string \| null/);
  assert.match(migration, /add column if not exists additional_comments text/);
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
  assert.match(page, /canCreateEvent=\{Boolean\(profile\.is_site_owner \|\| organizationRoles\.includes\("organization_director"\) \|\| organizationRoles\.includes\("organization_admin"\) \|\| organizationRoles\.includes\("event_admin"\)\)\}/);
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
  assert.match(page, /Open My Assignments to view one schedule containing all of your Law18Ref games/);
  assert.match(page, /Select Rate Crew on a game to open its evaluation form/);
  assert.match(page, /activeGroupRoles/);
  assert.match(page, /Follow the directions below for your role/);
  for (const role of ["site_owner", "organization_director", "organization_admin", "event_admin", "assignor", "site_coordinator", "referee_coach", "referee"]) {
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
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
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
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(110px,1fr\)\) minmax\(220px,1\.35fr\)/);
  assert.match(css, /@media\(max-width:900px\)\{\.ratings-filter-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:520px\)\{\.ratings-filter-grid\{grid-template-columns:1fr/);
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
  assert.match(page, /<option value="rating">Average Rating<\/option>/);
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

test("account merge review supports field-by-field profile resolution", async () => {
  const page = await read("app/page.tsx");
  const client = await read("app/supabase-client.ts");
  const migration = await read("supabase/migrations/202608060046_account_merge_profile_review.sql");
  assert.match(page, /merge-profile-review/);
  for (const field of ["full_name", "secondary_email", "date_of_birth", "phone", "badge_level"]) {
    assert.match(page, new RegExp(field));
  }
  assert.match(client, /secure_merge_organization_accounts_with_profile/);
  assert.match(migration, /primary_official\.personal_contact_locked/);
  assert.match(migration, /account_merge_profile_resolved/);
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

test("organization admins can review audited actions and copy one officials join link", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300023_audit_join_links_and_member_removal.sql"),
  ]);
  assert.match(page, /Copy Join Link/);
  assert.match(page, /async function copyJoinLink/);
  assert.doesNotMatch(page, /Create Join Group Link/);
  assert.doesNotMatch(page, /ACTIVE LINKS/);
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
  assert.match(page, /Remove From Group/);
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
