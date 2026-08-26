# Law18Referee Management
## Future Development Plans
Owner planning document | Updated August 25, 2026

This document records ideas and preferred directions discussed by the site owner. It is not a release commitment, sales promise, or dated delivery schedule. Features require scoping, testing, and owner authorization before implementation. No feature below is being implemented by publishing this document.

### 1. Subscription billing and feature packages
- Proposed: group-paid subscriptions, with no subscription charge to referees or coaches. Offer Operations & Check-In and Coaching & Ratings as separate modules, with bundle discounts and usage tiers.
- Proposed: a group billing page, checkout, receipts, renewals, cancellation, failed-payment grace periods, and owner-controlled exceptions. Begin with externally processed payments and manual activation if appropriate; automate later.
- Existing group/event feature settings are a foundation, not a billing system. Purchased capabilities must become server-enforced entitlements; group admins may disable permitted features but may not unlock unpurchased features.
- Pricing discussed so far is illustrative, not final. Any future per-game assigning charge should be distinct from importing schedules for operations or ratings. Expiration must not silently delete historical records.

### 2. Messaging and email
- Prospective: messages to an entire group/event or selected roles, crews, sites, and individual users. Support in-app notifications and branded email with the site's theme.
- Preferred direction: evaluate Amazon SES for economical bulk sending when ready. Setup includes domain authentication, sender/reply-to addresses, provider approval and sending quotas, queued delivery, retries, bounce/complaint handling, and communication preferences.
- Separate optional announcements from essential account and operational notices. Build suitable safeguards for youth officials and guardian contacts. SMS remains optional and uncommitted.
- Earlier sequencing placed communications before assignment-core rollout; SES was discussed for the full-core stage. Final timing remains an owner decision. Do not enable automatic import invitations simply by adding messaging.

### 3. Mobile apps
- Prospective: free Android and iPhone/iPad companion apps, while retaining the website and Home Screen web app.
- Evaluate reuse of the existing web interface versus a larger native build. Scope camera scanning, secure sessions, deep links, push notifications, tablet layout, and any offline behavior explicitly.
- Required preparation: business-owned store accounts, privacy disclosures, test devices, review submissions, and ongoing OS maintenance. Decide where group subscriptions can be purchased under applicable store rules.
- A native app does not automatically solve database or network lag. Improve and measure the web/backend workflows independently.

---

## Assignment Platform and Referee Payments

### 4. Assignment core
- Exploratory product expansion, not a firm release goal. Develop in a separate test environment with group-level enablement; unfinished features must not appear in the live production workflow.
- Import schedules with empty crew slots. Configure the number of officials, position titles, eligibility requirements, restrictions, availability, and conflicts for each game.
- Use a dedicated editable game page, inspired by the practical workflow of former GameOfficials without copying its interface. Also allow direct assignments within the schedule. Include mentor/coach positions.
- Keep drafts private. Publish a full crew or selected positions: for example, publish ARs while the Referee remains a hidden draft. Notify the appropriate officials when published or changed.
- Track accepted, declined, pending/no response, and expired offers. Configure response deadlines; keep expiry distinguishable from a referee's deliberate decline. Show permitted crew acceptance information to assignors/admins and officials assigned to that game.
- For already-assigned imports, support either already accepted assignments or new offers requiring acceptance. A group/event default may suppress that choice during import. Assignment notifications should use unread badges.
- Group admins control whether assignors may upload/create games or only staff existing games. Multiple assignors may receive full-competition access or responsibility for specific games. Preserve broader admin access.
- Existing posted-schedule edits, swaps, change-confirmation markers, Rules of Competition links, and ratings are foundations to preserve, not new assignment-core promises.
- Later possibilities: assignment recommendations, more advanced conflict/travel rules, and approved external integrations. US Soccer license verification requires confirmed provider access and terms; do not assume Assignr's access transfers to Law18Ref.

### 5. Referee payments
- Prospective, separately scoped financial capability. Group funds should move through an approved payment provider to officials, separate from Law18Ref subscription revenue.
- Build fees and adjustments, payment approvals, optional two-person approval, batch processing, payment status, reconciliation, and duplicate-payment prevention. Begin with payment exports if direct payouts are not ready.
- Resolve bank/identity onboarding, youth-recipient requirements, funding delays, returns, disputes, fee allocation, and tax-reporting responsibility with the provider and professional advisers.
- Store payment-provider references rather than raw banking credentials. Require strong authorization and auditable financial records. Confirm the complete provider fee model before setting customer payout pricing.
- Officials should not pay a platform subscription. Whether groups absorb all processing charges remains a commercial decision; the preferred direction discussed is that officials receive their full game fees.

### 6. Event applications
- Proposed: event-application listings for eligible group officials, with account details prefilled for signed-in applicants. Eligibility may use selected officials, ratings, or other criteria.
- External application links must still permit outsiders to apply; internal eligibility filters must not silently block them. Applying alone must not create an account or group membership.
- Accepted external applicants should be linked to an existing account or enter a secure account-setup process and join the group. Do not email passwords or bypass identity verification to satisfy automatic provisioning.
- Allow customizable acceptance messages and next steps, recommend-accept/decline roles, a designated final approver, and optional two-person authorization.
- Application lists and permitted ratings are available to group leadership, event admins, and event assignors explicitly granted access. Define consent and privacy rules before implementation.

---

## Reports, Event Operations, and Reliability

### 7. Reports and referee development
- Proposed: optional game reports enabled by the site owner for a group, then by group/event administrators within that allowance. Supply standard site-wide templates and allow group-specific forms.
- Supplemental referee reports and designated coach-development reports should save structured answers, populate approved PDF templates, attach the resulting files to the game, and email designated recipients when messaging is ready.
- Enforce access separately for admins, assignors, the game crew, and coaches when permitted. Define private fields, revision history, document retention, and delivery tracking.
- Proposed: import older ratings without importing the historic games. Preserve source/provenance, detect duplicates, and define position, scale, permission, and average-inclusion rules before combining scores.
- Additional custom evaluation types remain a future extension; existing Basic and Skills Evals continue to serve current users.

### 8. Check-in and venue improvements
- On hold until expressly authorized: the account-based flow of sign in, choose Check In, scan an on-site QR/NFC tag, and receive confirmation. Preserve configurable external check-in for groups that do not require personal accounts.
- Proposed: reusable group-owned NFC check-in links assigned to events/sites, printed daily QR fallback, and manual staff check-in. Design tag activation/revocation and explain that ordinary QR codes or NFC URLs can be copied.
- Possible safeguards: event-controlled location verification or other arrival checks, subject to usability, permission, privacy, and connectivity testing. These are options to investigate, not promised protections against remote check-in.
- Existing site-supervisor scope and attendance tools remain foundations; extend them for site-specific check-in configuration as needed.
- Proposed: addresses and map locations for venues/fields, with driving-directions links from schedules.
- Deferred: real-time attendance propagation across relevant views in place of relying solely on periodic/manual refreshes. Measure traffic and subscription limits before choosing the implementation.

---

## Access, Reliability, and Priorities

### 9. Role and access refinements
- Proposed refinement: group membership is the durable relationship. Event duties and temporary overrides determine the active tools; users should not need redundant event membership just to participate.
- Combine capabilities when a user holds multiple event roles. Preserve game/site/date scope and enforce the same rules in database/API access, not just navigation.
- Existing group/event switches should evolve into consistent purchased-module controls, including report types, eval types, public evaluations, and permitted check-in methods.
- Connected external calendar feeds already exist. Further synchronization or provider integration is a separate exploration requiring legitimate access, not scraping user credentials.

### 10. Reliability, security, and operating readiness
- Planned review: audit redundant code, stale paths, broad data loads, permissions, indexes, and mobile layouts. Add realistic load tests and regression coverage before larger customers.
- Formalize production versus staging, monitoring/alerts, capacity thresholds, and controlled rollouts. Measure simultaneous usage and downloaded data, not only stored game counts.
- Establish automated off-provider database and file backups, encryption, retention, and tested restoration. Set backup frequency and recovery objectives before claiming a recovery guarantee.
- Deferred: durable storage for original schedule/official imports with restricted access, retention limits, and a traceable import history. Decide which generated reports need permanent storage versus regeneration.
- Review sensitive-data access, account recovery, youth data, payment security, and audit retention before broad commercial use. Additional capacity does not replace this work.

### Suggested sequence - subject to owner approval
1. Reliability/access audit and paid-production readiness; finalize subscriptions and module entitlements.
2. Messaging and delivery safeguards; operational reports and targeted improvements as prioritized.
3. Applications, historical rating imports, maps, and other independent modules as demand warrants.
4. Evaluate mobile apps and privately prototype assignment core. Add payments only after financial workflows are validated.

Maintain this document as decisions change. The detailed assignment workflow is recorded in ASSIGNMENT_CORE_ROADMAP.md. Current product overviews and version history document delivered work; this document records prospective work.
