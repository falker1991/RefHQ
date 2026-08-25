# Law18Referee Management

Future Assignment Core planning is maintained in [ASSIGNMENT_CORE_ROADMAP.md](ASSIGNMENT_CORE_ROADMAP.md).

## v0.40.9

- Refreshes Turnstile verification after login, signup, password-reset, and privileged password-verification attempts, so retries never reuse a consumed token.
- Cloudflare builds use pnpm 11.19.0 to match the project lockfile.

## v0.40.8

- Hardened production dependencies, replaced the vulnerable spreadsheet exporter, added compatibility-safe browser security headers, added optional Supabase-compatible Cloudflare Turnstile verification, and tightened elevated database-function execution and search paths.

## v0.40.7

- Keeps referee-facing and referee-coach schedules in the standard list view. Time-and-field, by-field, and first-assignment staffing views are available only to event staff.

## v0.40.6

- Reworked the submitted-reports modal into equal-width, variable-height cards stacked vertically in imported crew order: Referee, AR1, AR2, Fourth Official, then other positions.

## v0.40.4

- Replaced separate crew-rating and report controls with one permission-scoped **View Reports** marker: green for the viewer's submission, blue for other authorized submissions, and diagonally split when both exist.
- Fixed administrative rating edits when the current game crew differs from the officials contained in the original saved rating submission.

## v0.40.3

- Added a View My Eval control to a referee's Law18Ref games in My Assignments when that referee has a shared public evaluation.
- Restricted the personal assignment lookup to the signed-in referee's own evaluation, even when that account also holds an administrative role.
- Kept private coach/admin notes and the other officials' evaluations out of the referee-facing modal.

## v0.40.2

- Fixed the mobile navigation tray so navigation and account actions remain separated and scroll normally.
- Consolidated Assignment Board views into Schedule: list, time-and-field grid, by field, and first assignment.
- Added a compact View Reports action to schedule games with submitted, visible ratings reports.

## v0.40.1

- Consolidated an event workspace into one permission-aware database request, while retaining a deployment-safe compatibility fallback.
- Saved complete crew ratings atomically in one request instead of sending one request per official.
- Updated saved ratings locally instead of reloading every part of the selected event after submission.
- Deferred Excel and PDF export code until an export is requested, reducing the normal application download.

## v0.40.0

- Separated official first and last names while preserving full-name displays and standardized selectors as `Last, First`.
- Replaced the administrative dashboard's active-event panels with compact account, group, role, check-in, and role-accessible navigation controls.
- Locked submitted coach ratings, added administrator-only audited corrections with retained revisions, and identified the submitting and editing users.
- Added per-user and administrative crew-rating markers to Schedule and Assignment Board games.
- Corrected Assignment Board confirmation-button state styling and reviewed save-path performance.

## v0.39.4

- Event Admins and higher can confirm pending schedule changes directly from updated Assignment Board game tiles, clearing the orange marker without leaving the board.

## v0.39.3

- External referee schedule confirmation and completion cards show each partner's most recent earlier assignment that day, including position, time, and field, or identify the assignment as their first game.

## v0.39.2

- Authorized Assignment Board users can open the Game Info editor by selecting a matchup in the grid or By Field view.
- The Game Info editor now presents all editable fields in one vertical column.

## v0.39.1

- Game-detail swaps can optionally move each full staffed crew with its matchup when games switch schedule slots. The combined operation is atomic, permission checked, audited, sends no notifications, and leaves existing ratings unchanged.

## v0.39.0

- Adds permission-gated editing for game time, venue, field, matchup, competition details, and operational status while preserving source identifiers.
- Adds an atomic filtered-game option to swap matchups and competition details between schedule slots without moving their time, field, crew, ratings, or import identity.

## v0.38.3

- Adds an atomic full-crew swap option for two filtered Schedule games with matching staffed crew sizes, preserving each game's position structure and imported crew order.

## v0.38.2

- Limits the Schedule assignment-swap game selectors to games matching the Schedule's current filters.

## v0.38.1

- Adds an atomic schedule action for swapping two staffed assignments between games in the same event.
- Preserves each game's position slot, leaves existing ratings unchanged, audits the operation, and marks both games as updated without sending notifications.
- Applies the same game-management permissions used by direct assignment editing, including scoped Site Supervisor access.

## v0.38.0

- Separates referee first and last names in account and official records while preserving combined-name displays across schedules and reports.
- Sorts referee, coach, merge, rating, filter, and assignment selectors by last name and presents choices as `Last, First`.
- Adds first/last-name columns to official imports and exports, including safe backfill and synchronization for existing records.

## v0.37.1

- Splits the post-event summary's full schedule into a separate worksheet for every game date, making each day's assignments easier to print, distribute, and review.

## v0.37.0

- Adds an authorized Post-Event Summary Excel export with coordinated worksheets for event metrics, dated schedules, full-game ratings, individual ratings, event officials, and daily check-ins.
- Includes position-specific rating counts and averages, complete account/contact details, full evaluation content, crew assignments, and check-in time and method.

## v0.36.0

- Adds first-assignment-time check-in filtering and changed-assignment schedule filtering.
- Sorts assignment-editor officials by last name and expands directory phone search.
- Shows overall, Referee, and AR rating averages plus rating count in the directory.
- Adds admin event-rating access to the official schedule modal and Collapse All controls.
- Improves mobile rating submission spacing and makes the full account/navigation tray scroll safely in landscape.

## v0.35.5

- Lets authorized staff remove all access from a coach in one action or remove a selected coach from every selected/filtered game in bulk.
- Converts full-event coaching access into game-specific access when only part of that access is removed, preserving all unselected games.

## v0.35.4

- Highlights changed games throughout every Assignment Board view until an authorized administrator confirms the existing schedule-change marker.

## v0.35.3

- Expands the frozen-header Assignment Board grid toward the full viewport width and height.
- Restores natural page scroll chaining when the grid reaches its top or bottom boundary.

## v0.35.2

- Freezes the field header row and time header column while scrolling the Assignment Board grid in either direction.

## v0.35.1

- Makes crew-rating saves wait for both database confirmation and refreshed event data before reporting success or closing the rating form.
- Treats an empty Supabase upsert response as a failed save instead of allowing the interface to appear successful.

## v0.35.0

- Schedule PDFs use a paper-efficient position-column layout with dynamic R/AR1/AR2/4th and nonstandard crew columns, compact presets, abbreviated names, Letter/Legal sizing, optional details, and optional group separators.

## v0.34.5

- The installed web app now checks for a newer deployment on startup, focus, visibility changes, and every five minutes, activates versioned service-worker caches, and reloads once into the latest release.

## v0.34.4

- Ratings export filenames now describe the active filters with compact date ranges, event names, abbreviated referee names, and other selected criteria instead of using the UTC export date.

## v0.34.3

- Ratings exports now use deterministic event, date, time, venue, field, and game ordering, keeping duplicate full-game submissions in adjacent rows.

## v0.34.2

- Rating CSV exports now omit Skills Eval-only columns when the filtered export contains only Basic Evals.

## v0.34.1

- Shows the Ratings tab for users who have both Site Supervisor and Referee Coach access, preserving their combined event capabilities.

## v0.34.0

- Keeps referee-coach rating history private to the coach who submitted it while preserving authorized administrator and assignor access.
- Adds a Submitted/Draft/All status filter and lets a coach submit a saved draft directly from rating history.
- Adds filtered rating exports as individual official rows, full-game submission rows with duplicate-submission markers, or configurable grouped summaries.

## v0.33.0

- Lets authorized administrators retain a rating for staff while excluding it from all scoring averages and hiding it from the referee, then restore it later.
- Clearly labels excluded ratings in individual and full-game history views and records the setting in spreadsheet exports.
- Defaults all existing and future ratings to counted, protects the setting with server-side role checks, and logs every inclusion change.

## v0.32.5

- Adds a permission-gated Refresh Check-Ins button to the Assignment Board and Schedule.
- Reloads only check-in and attendance-expectation records, immediately updating highlights and counts without refreshing the full event.

## v0.32.4

- Applies stable natural numeric field ordering across every Assignment Board view, including the Time and Field Grid.
- Keeps numbered fields such as Field #2 ahead of Field #10 regardless of database return order.

## v0.32.3

- Shows the deployed application version beside Help in the header for the Site Owner only.
- Keeps the shared footer version synchronized with the application release.

## v0.32.2

- Makes the official schedule popup a single continuous scrolling surface so contact details cannot cover or clip the first assignment.
- Always opens the popup at its true top, with contact details followed by the complete event schedule.

## v0.32.1

- Makes updated schedule imports idempotent for game crews.
- Compares every incoming official, position title, source title, and crew-order value before writing assignments.
- Skips assignment deletion and reinsertion entirely when a rated game's imported crew has not changed, leaving its assignments and ratings untouched.

## v0.32.0

- Prevents games, groups, officials, or user profiles from cascade-deleting related ratings; ratings must be removed through the explicit rating deletion workflow.
- Stores each rating's position and automatically moves it when the same official changes position on that game.
- Adds an audited Full Game Ratings action for authorized administrators to swap two officials' ratings submitted by the same coach.

## v0.31.10

- Preserves each game's imported crew sequence with an explicit assignment order stored in Supabase.
- Treats the first repeated AR, Standby, or other matching role in the source file as the first one displayed throughout the site.
- Preserves the displayed crew sequence when assignments are later edited manually.

## v0.31.9

- Enables posted-assignment editing directly from Assignment Board game tiles for users who already have assignment-editing permission.
- Uses the age, league, or competition detail line beneath the matchup as the edit trigger without adding another visible action button.
- Reuses the contained assignment editor and keeps the detail line non-interactive for users without editing access.

## v0.31.8

- Standardizes the default event date across Assignment Board, Schedule, Check-In, Coaching, and date-specific official schedule views.
- Opens every operational tab on today when today is scheduled, the first upcoming event day before or between dates, or the final date for a completed event.
- Uses the event timezone consistently and still permits users to select multiple dates or clear date filters afterward.

## v0.31.7

- Opens the Check-In tab on the current event date when games are scheduled today.
- Selects the first upcoming event date when the event has not started or today is an off day between event dates.
- Falls back to the event's final date for completed events so the day selector always has a valid value.

## v0.31.6

- Makes the live check-in counter reflect the roster currently visible after applying name, status, and site filters.
- Counts checked-in officials against expected officials within the filtered results while continuing to exclude people marked Not Expected.
- Restores the full event-day attendance count automatically when filters are cleared.

## v0.31.5

- Rebuilds the schedule assignment editor as a contained, vertically stacked modal instead of allowing assignment cards to spread horizontally.
- Keeps the dialog within the visible browser area and gives the assignment list its own scrolling region.
- Preserves readable position, official, display-title, and removal controls across desktop and mobile widths.

## v0.31.4

- Restores game visibility for every linked Referee Coach based on their saved coaching assignments.
- Supports both individually assigned games and full-event coaching access without requiring duplicate game IDs in event membership records.
- Keeps coaches limited to their own coaching scope and does not broaden access for unlinked or unrelated accounts.

## v0.31.3

- Fixes Site Supervisor schedules displaying assigned crew positions as Unassigned.
- Adds narrowly scoped official-name visibility for crews on games the supervisor is already permitted to view.
- Does not expose the full group officials directory or crews outside the supervisor's assigned event scope.

## v0.31.2

- Adds a prominent full-width schedule link immediately below the welcome area on every dashboard.
- Opens the private My Assignments schedule for referees and the selected event schedule for staff and referee coaches.
- Keeps the schedule action mobile-friendly and visually distinct from secondary dashboard tools.

## v0.31.1

- Adds date-specific **Not Expected** attendance overrides without removing officials or changing their assignments.
- Adds a compact icon beside each name in the detailed check-in roster to exclude or restore an official.
- Excludes Not Expected officials from the dashboard and live-roster required check-in totals.
- Adds gray Not Expected roster styling, a dedicated filter, scoped staff permissions, and audit logging.

## v0.31.0

- Moves primary page navigation from the fixed header into a right-side tray opened by the user badge.
- Combines role-aware page links, account identity, roles, account settings, groups, appearance controls, and sign-out in one scrollable responsive tray.
- Keeps Help, Refresh, and Notifications immediately available in the compact fixed header.
- Supports closing the tray with its close button, the Escape key, a navigation choice, or a click outside the tray.

## v0.30.5

- Expands Help according to the active role hierarchy. Users see navigation instructions and available PDF quick guides for their own active roles and every subordinate role they oversee.
- Keeps the active-role badges unchanged so the additional material is clearly reference documentation rather than added account permission.

## v0.30.4

- Opens Referee Coach schedules on one date by default: the current event date, or the event's first game date when it has not started.
- Uses Field / Time / Date as the coach schedule's initial sort and starts every field group collapsed.

## v0.30.3

- Ensures Site Supervisors can read the crews for operational and REF HQ schedule records within their assigned dates and sites even when assignment editing is disabled.
- Shows a prominent Clear All Filters control in Schedule whenever date or advanced filters are active, preventing collapsed filters from silently hiding HQ or other games.

## v0.30.2

- Adds live first-name or last-name search to both administrative Check-In roster views.
- Shows each recorded check-in's time and source in the Detailed Roster, distinguishing manual, External Check-In, and Law18Ref account check-ins.

## v0.30.1

- Adds an event-level External Check-In completion mode. Events can retain the existing schedule-review confirmation step or check an official in immediately after their required identity details match.
- Immediate-mode attendance is recorded by the database before the success screen appears. The success screen then shows the configured confirmation message, event links, and the official’s full schedule for that day.

## v0.30.0

- Removes implicit anonymous execution from every elevated public database function. Anonymous access is restored only for the three RPCs required by External Check-In; authenticated application endpoints keep their existing explicit grants.
- Prevents direct client access to internal guest-check-in sessions, organization confirmation challenges, and encrypted personal calendar feeds with explicit deny-all RLS policies and revoked table grants.
- Removes direct client execution from trigger functions and internal security helpers while preserving database-triggered behavior and legacy authenticated RLS helpers.

## v0.29.5

- Schedule imports now skip only a conflicting contact field instead of stopping the batch. All assignments and valid contact updates continue, the import result identifies each skipped value and its existing owner, and the Import Job is retained as completed with warnings.
- Import conflict warnings are written to Group Activity and delivered as in-app notifications to both the importing administrator and the Site Owner. Notification access is recipient-scoped with row-level security.

## v0.29.4

- Limits Coaching-system assignments to ratings-enabled games. HQ and operational games are removed from Coaching selectors and rejected by the database, while imported Referee Coach and other schedule positions remain unchanged.

## v0.29.3

- Corrects Assignr contact and assignment matching when two officials share an email address. An unambiguous official name now takes precedence over email so each person's contact details and game assignments remain on the correct directory record.

## v0.29.2

- Uses nonblank email addresses and mobile phone numbers from Assignr Assignments exports to create or update Officials Directory records during a schedule import. Existing contact data is preserved when an imported cell is blank, personal contact locks remain enforced, and duplicate primary emails are not reassigned.

## v0.29.1

- Keeps every tall modal within the viewport with an accessible top edge and contained scrolling, and always opens an official's event schedule at the beginning of the schedule list.

## v0.29.0

- Added automatic support for Assignr Assignments exports where each official appears on a separate row. Repeated rows are grouped into one game using the Assignr Database ID, assigned crew details are preserved, and games with entirely open crews are still created.
- Refreshes the active group's Officials Directory immediately after a schedule import so newly created provisional officials appear without reloading the app.

## v0.28.1

- Keeps Schedule crew cards in fixed Referee, AR1, AR2, and Fourth Official columns even in browsers that do not apply modern range-style media queries.

## v0.28.0

- Replaces Last Login in the Officials directory with Last Active, refreshed when a linked user opens Law18Ref, navigates its tabs, returns to the visible app, or continues an active session.
- Throttles presence writes without adding routine navigation to the group activity audit log.

## v0.27.14

- Makes the administrative check-in QR card collapsible and collapsed by default while keeping QR generation and printing out of referee-only and coach-only views.

## v0.27.13

- Adds an in-app QR decoder fallback for mobile browsers, including iPhone Safari, that do not expose the native BarcodeDetector API.

## v0.27.12

- Aligns Referee, AR, and Fourth Official columns consistently across games in the desktop Schedule view.

## v0.27.11

- Redesigns Schedule assignment editing as a contained, stacked crew list with Position and Official aligned on every row.

## v0.27.10

- Makes each coach's assigned games collapsible within Coach Access Summary and makes the full game-assignment schedule collapsible by default.

## v0.27.9

- Moves the collapsed Coach Access Summary above the long game-assignment schedule for immediate access.

## v0.27.8

- Makes the Coaching tab's coach-access summary collapsible and collapsed by default, with the assigned-coach count visible in its header.

## v0.27.7

- Omits a misleading first field from Check-In when a referee coach covers multiple fields at their earliest coaching time.

## v0.27.6

- Suppresses browser-generated headers and footers when printing QR sheets while preserving safe internal page spacing.

## v0.27.5

- Prints every event-day check-in QR as a separate, clean page with large event and date labels.

## v0.27.4

- Adds Detailed Roster and Attendance Grid sub-tabs to Check-In, with compact aligned official cards and consistent first-assignment-time/field ordering.

## v0.27.3

- Normalizes North American phone numbers to `(000) 000-0000` during imports and edits, standardizes existing stored values, and makes displayed phone numbers callable links.

## v0.27.2

- Adds role-aware PDF quick guides to the Help modal for each supported active group or event role.

## v0.27.1

- Consolidates the Coaching tab's access summary into one card per referee coach, with all assigned game access listed inside that card.

Law18Referee Management is a responsive tournament referee operations MVP provided by FalkSport91. It complements Assignr with QR check-in, live attendance, coach assignments, structured assessments, and development history.

The pilot is hosted at `law18ref.com` on Cloudflare. The approved Law18Ref logo is stored at `public/logo-draft-law18referee-management-v4.png`.

Version 0.27.0 moves the schedule date control beside the page heading and places sorting and additional filters in separate collapsed-by-default cards. Version 0.26.1 keeps the official schedule modal independently scrollable on desktop and mobile while locking the page behind it. Version 0.26.0 removes the prefilled owner email from authentication and upgrades shared filters with clearer mobile controls, larger touch targets, selected counts, and dedicated Clear and Done actions. Version 0.25.3 adds a reusable multi-select Group Role filter to the Officials directory. Version 0.25.2 accepts both Assignr Database ID and Assignor Database ID headers during officials imports. Version 0.25.1 adds venue/site filtering to Coaching Assignments so staff can select every game at a venue without choosing each field individually. Version 0.25.0 upgrades the Assignment Board with venue filtering, horizontal field staffing cards, and collapsible first-assignment times, while giving Site Supervisors stable field/time schedule groups and view-only HQ operations visibility. Version 0.24.0 lets authorized staff select officials and add them to another group they manage without removing the source-group record or sending email.

Bulk lifecycle management remains available for officials, ratings, and events. Games and assignments are designed to join the same workflow when manual schedule editing is introduced.

## What is included

- Separate Assignr Users official-directory import and Assignr Games schedule import
- Repeat schedule imports that append new days or update matching games in an existing event
- Multiple-event switcher for assignors and officials
- Organization-admin and site-owner Activity view for meaningful changes such as ratings, imports, schedules, assignments, officials, roles, events, and check-ins
- Last-login visibility in the Officials directory
- Organization-member removal that preserves historical assignments, check-ins, ratings, and audit records
- Reusable Join Group links for existing users and new-account onboarding
- Manual event archiving for organization administrators and assigned event administrators
- Optional automatic archiving immediately after an event’s final day or after a configured delay
- Archived-event restoration for organization administrators, with schedules, check-ins, ratings, and audit history preserved
- Full-day field/time assignment board with checked-in referees highlighted
- Assignment-board grid, collapsible field, and first-assignment attendance views
- Tournament QR and authenticated self check-in
- Mobile-first referee schedule with no assignment acceptance step
- Installable Home Screen experience and in-app QR scanner where supported
- Event/game schedule and crew status backed by imported records
- Coach assignment workspace
- Assessment form and referee history
- Scoped organization/event membership foundation and site-owner appearance scheduler
- Organization-admin account merging with assignment, attendance, rating, and role preservation
- Whistle-and-ball browser and Home Screen icon
- Supabase schema, indexes, role-aware row-level security, and demo seed
- Cloudflare-compatible build
- Encrypted personal ICS/iCalendar feed connections with manual and scheduled synchronization
- Unified referee assignment view with source labels, source links, cancellations, and overlap warnings
- Private event PDF documents with authenticated Rules of Competition access
- Tournament and League event types, including league-linked tournaments and configurable check-in
- Full event settings with organization entitlement ceilings and per-event feature controls

## Local setup

Requirements: Node.js 22.13 or newer and pnpm (or npm).

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Open the local address shown in the terminal.

## Supabase setup

1. Create a free Supabase project.
2. Open **SQL Editor** and run the migrations in filename order:
   - `supabase/migrations/202607230001_refhq_schema.sql`
   - `supabase/migrations/202607240002_tournament_pilot.sql`
   - `supabase/migrations/202607240003_authenticated_grants.sql`
   - `supabase/migrations/202607240004_account_membership.sql`
   - `supabase/migrations/202607250005_tournament_operations_v020.sql`
   - `supabase/migrations/202607250006_remove_v010_checkin_compat.sql`
   - `supabase/migrations/202607250007_fix_event_policy_recursion.sql`
   - Continue with every later migration in filename order, including `supabase/migrations/202607300023_audit_join_links_and_member_removal.sql` and `supabase/migrations/202607300024_event_lifecycle_archiving.sql`.
3. Create at least one user in **Authentication → Users**.
4. Add that user to `public.profiles`, using the auth user ID and the demo organization ID.
5. Optionally run `supabase/seed.sql` for the Capital Cup event and demo games.
6. Copy the project URL and anon key into `.env.local`.

Example first profile:

```sql
insert into public.profiles (id, organization_id, full_name, email, role)
values (
  'AUTH-USER-UUID',
  '11111111-1111-4111-8111-111111111111',
  'Alex Falk',
  'alex@example.com',
  'admin'
);
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code or commit `.env.local`.

## Small-tournament pilot

1. Sign in as an administrator or assignor.
2. Open **Import**, select an Assignr-format CSV, choose **Create a new event**, review the detected event details, and confirm.
3. Switch to the imported event using the event selector.
4. Display the event QR from **Check-in** at referee headquarters.
5. Each referee selects **Create referee account** and uses the exact email address imported from Assignr.
6. Referees can open Law18Referee Management from their Home Screen, view confirmed assignments, scan the event QR, and check in.
7. The assignor monitors arrivals from **Assignment board**.

For a later schedule release, return to **Import**, choose **Add to [event name]** as the destination, and upload the next CSV. New Assignr game IDs are appended to the event. Matching game IDs and the referee crews included for those games are updated, while other days and existing check-ins remain intact. Every upload is retained in the import history.

The expected CSV template is downloadable inside Law18Referee Management and is also stored at `examples/assignr-schedule.csv`.

## Cloudflare deployment

The project is configured for Cloudflare-compatible ESM output through vinext.

### Optional login abuse protection

Law18Ref supports Cloudflare Turnstile without changing the login or account-creation workflow when it is not configured. To enable it in production:

1. Create a Turnstile widget in Cloudflare for `law18ref.com`.
2. Add its public site key as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the Cloudflare deployment settings.
3. In Supabase, open **Authentication > Bot and Abuse Protection**, select Cloudflare Turnstile, enter the widget secret, and enable CAPTCHA.
4. Redeploy and confirm login, account creation, password recovery, and password-confirmed Site Owner actions before relying on it.

Leave `NEXT_PUBLIC_TURNSTILE_SITE_KEY` unset until Supabase is configured. In that state the site behaves exactly as it does today and no challenge is shown.

### Security deployment checklist

- Apply every migration in `supabase/migrations`, including the current security-hardening migration.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `CALENDAR_FEED_ENCRYPTION_KEY`, and any Turnstile secret in encrypted Cloudflare secrets, never public variables or browser code.
- Run `pnpm audit --prod`, `pnpm test`, and Supabase Security Advisor before each production release.
- Keep Cloudflare proxying enabled for `law18ref.com`, and review WAF and rate-limit events during pilots.
- Restrict Supabase dashboard and Cloudflare account access to business-controlled accounts with MFA.

```bash
pnpm build
```

For a Cloudflare Workers/Pages deployment:

1. Connect the repository to Cloudflare.
2. Use `pnpm build` as the build command.
3. Add the environment values from `.env.example` in Cloudflare project settings.
4. Deploy the generated `dist` output using the worker entry generated by vinext.
5. Set `NEXT_PUBLIC_APP_URL` to the production address and add that address to Supabase Authentication URL configuration.

### Version 0.10.0 Connected Schedules

Run `supabase/migrations/202607310031_personal_calendar_feeds.sql`, then add these encrypted Cloudflare Worker secrets/variables:

- `SUPABASE_URL`: the Supabase project URL
- `SUPABASE_ANON_KEY`: the project anon/publishable key used to validate user sessions
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key; never expose it to browser code
- `CALENDAR_FEED_ENCRYPTION_KEY`: a unique high-entropy secret used to encrypt private feed URLs

Configure a Cloudflare Cron Trigger (recommended pilot interval: every 30 minutes) for the deployed Worker. The Worker synchronizes up to 100 active feeds per run. Users can also select **Sync Now** in Account Settings. Feed URLs must use HTTPS, are encrypted before storage, are never returned through the application API, and are deleted with their imported external assignments when disconnected.

The hosted pilot uses Supabase as its source of truth. Do not use it as the sole operational system until the import and check-in flow have been rehearsed with the tournament staff.

## Production checklist

- Phase 1 foundation delivered in Version 0.5.0:
  - Add the hierarchy: site owner → organization admin → event admin → assignor → referee coach → referee.
  - Allow organization admins to create/manage organizations, members, and events and inherit all lower-role capabilities.
  - Allow event admins to create events and fully manage only the events where they are listed as an event admin.
  - Allow organization and event admins to assign assignors and referee coaches to specific events.
  - Give assignors schedule import, assignment editing, referee messaging, check-in oversight, coaching-data access, and coach-assignment tools for their assigned events.
  - Let event admins enable or disable assignor access to evaluation and coaching tools.
  - Scope referee-coach schedule access to assigned dates, venues, games, crews, or referees, defaulting to the full event schedule.
  - Add public evaluations that evaluated referees can view and private evaluations limited to the submitting coach and the event’s assignors/admins, with organization admins and the site owner inheriting access.
  - Add audit history for role changes, event access, coaching-tool settings, and evaluation visibility changes.
  - Make event removal a recoverable archive action before permanent deletion is considered.
  - Add an organization referee directory so each referee belongs to the organization once and can participate in multiple events.
  - Automatically create or reuse organization referee records when officials first appear in a schedule import.
  - Add bulk referee import independent of an event, manual referee creation, and duplicate-account review tools.
- Phase 2 account invitations and onboarding:
  - Add optional invitation emails with secure, expiring account-creation links and pending, active, suspended, and archived membership states.
  - Default to an administrator-reviewed workflow: import referees, review new and matched records, then explicitly send invitations individually or in bulk.
  - Add invitation delivery states for pending, delivered, accepted, expired, and failed invitations.
  - Let administrators resend invitations, copy a secure invitation link, correct an email before resending, and defer invitations until the schedule is ready.
  - Suppress invitations during test imports and prevent duplicate or premature invitation emails across repeated schedule imports.
  - On account setup, have referees confirm their name and email, create a password, activate their organization membership, and immediately receive access to linked assignments.
  - Distinguish organization membership from participation or assignments within a particular event.
  - Support schedule rows without email addresses by creating unclaimed provisional referee records, while requiring an admin to add and verify an email before the referee can claim an account.
  - Add identity-matching review for provisional referees; never automatically merge people using name alone.
- Add automated tests for RLS role boundaries and check-in time rules.
- Add a server-managed invitation option for organizations that do not want referee self-registration.
- Add offline queuing for check-ins when tournament connectivity is unreliable.
- Set the assessment visibility/approval policy with pilot organizations.
- Add audit-log retention, privacy terms, backups, and monitoring before handling real youth-referee or assessment data.

## Future tournament-operations roadmap

### Organization capability controls

- Use a two-level capability model: site-owner organization entitlements followed by organization-admin member permissions.
- Let the site owner enable or disable major product capabilities separately for each organization. These settings are the organization’s capability ceiling.
- Let organization administrators remove any site-owner-enabled capability from the organization generally, from a role, or from an individual member.
- Never let an organization administrator enable a capability that the site owner has disabled for that organization.
- Calculate effective access from the intersection of the site-owner entitlement, organization setting, role permission, individual-member permission, event assignment, and the user’s active role.
- Control access to check-ins, assigning, and ratings/coaching independently.
- When a capability is disabled, remove its navigation and actions for the organization and reject related database/API mutations rather than relying only on hidden interface controls.
- Let the site owner enable or disable every supported evaluation form type independently for an organization.
- Let the site owner enable or disable public evaluations. When public evaluations are disabled, force all new organization evaluations to private and prevent event staff from overriding that restriction.
- Configure the check-in methods available to each organization: daily QR code, reusable NFC tag, and administrator manual check-in.
- Support any permitted combination of check-in methods, including manual-only operation.
- Preserve capability changes in an audit history with the acting site owner or organization administrator, affected organization/member, timestamp, previous value, and new value.
- Define safe behavior for existing events and records when a capability is disabled, retaining historical data while preventing new activity.

### Assignment-core live operations

- When importing a schedule that already contains assigned officials, require the importer to choose an assignment treatment for that import:
  - **Already accepted** — create confirmed assignments without asking officials to accept, supporting organizations that continue assigning in another platform and use Law18Ref for check-in and ratings.
  - **Require acceptance** — create new published offers that each official must accept or decline in Law18Ref.
- Let an organization configure its assignment-import policy as **Ask on each import**, **Always already accepted**, or **Always require acceptance**.
- Let an event inherit the organization policy or override it with one of those three choices.
- When the effective organization/event policy is **Always already accepted** or **Always require acceptance**, apply it automatically and do not show an assignment-treatment choice to the person importing the schedule.
- Show the effective locked treatment in the import review summary so the importer understands what will happen without being able to change it.
- Apply the effective treatment at the import-batch level, show it in the import review before committing, and audit the treatment, its policy source, the importer, and affected assignments.
- Do not notify officials while an assignment remains a draft. When assignments are published, notify each affected official according to the selected treatment and clearly distinguish confirmed imports from offers awaiting a response.
- Add an unread notification badge to **My Assignments** whenever an official receives a newly published assignment or one of their existing assignments is materially changed.
- Clear the assignment badge when the official opens **My Assignments**, and mark an edited assignment unread again even if the official previously viewed or accepted it.
- Keep assignment unread state separate from acceptance status: viewing an offer clears its badge but does not accept it, and an already-accepted imported assignment may still be unread until viewed.
- Replace attendance polling with Supabase Realtime subscriptions during the assignment-core update.
- Push check-in, assignment acceptance, crew changes, replacements, and operational alerts instantly to authorized dashboards.
- Scope every subscription by organization, event, site, and user role, with reconnect handling and a manual refresh fallback.
- Monitor Realtime messages and peak connections against the active Supabase plan.

### Configurable QR, NFC, and manual check-in

- Let each organization choose between daily event QR check-in and reusable NFC check-in links.
- Give organizations a set of stable, opaque NFC tag links that can be written to physical tags before an event.
- Let an event administrator assign a registered tag to an entire event or to a particular event site.
- Keep the daily QR code available as a fallback even when NFC is the primary method.
- Keep audited administrator and site-coordinator manual check-in available for device, account, or connectivity problems.
- Do not store a permanent event or referee identifier directly on an NFC tag. Resolve the tag's revocable token on the server to the currently assigned organization, event, site, and valid check-in window.
- Allow administrators to name, deactivate, replace, and rotate NFC tag links if a tag is lost or copied.
- Record the check-in method, tag, site, event day, time, checking user, and any administrator override in the attendance audit history.

### Multi-site events and site coordinators

- Add event sites as first-class records, with venues, fields, schedules, daily check-in settings, and assigned NFC tags.
- Add a site-coordinator role beneath assignor. By default, a site coordinator can view and manage only their assigned site.
- Give site coordinators a site-scoped dashboard showing that site's games, crews, expected officials, check-ins, missing officials, replacements, and operational alerts.
- Let event administrators optionally grant a site coordinator read access to other sites or the full event while retaining management rights only for assigned sites.
- Support granular optional permissions for viewing other schedules, attendance, referee contact information, coaching activity, and ratings.
- Map imported venues and fields to event sites, with an administrator review screen for unmatched or ambiguous locations.
- Allow an authorized administrator to move a game, official, or coordinator between sites while preserving an audit trail.
- Ensure database access policies enforce site scope rather than relying only on hidden interface controls.
# v0.40.1 performance update

- Event workspaces now load through one permission-aware database request, with a compatibility fallback during deployment.
- Complete crew ratings now save atomically in one request instead of one request per official.
- Successful rating submissions update the active workspace directly rather than reloading the entire event.
