# Law18Referee Management

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

Law18Referee Management is a responsive tournament referee operations MVP provided by FalkSports. It complements Assignr with QR check-in, live attendance, coach assignments, structured assessments, and development history.

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
