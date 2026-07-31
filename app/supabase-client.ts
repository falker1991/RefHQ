import type { Law18Session } from "./auth-client";

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Profile = {
  id: string;
  organization_id: string | null;
  full_name: string;
  email: string;
  primary_email?: string | null;
  secondary_email?: string | null;
  date_of_birth?: string | null;
  preferred_name?: string | null;
  is_site_owner?: boolean;
  phone?: string | null;
  role: "admin" | "assignor" | "referee" | "coach";
};

export type MembershipRole = "site_owner" | "organization_admin" | "event_admin" | "assignor" | "site_coordinator" | "referee_coach" | "referee";

export type OrganizationMembership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: MembershipRole;
  status: "pending" | "active" | "suspended" | "archived";
};

export type EventMembership = {
  id: string;
  event_id: string;
  user_id: string;
  role: MembershipRole;
  full_schedule_access: boolean;
  coaching_tools_enabled: boolean;
  ratings_history_scope: "none" | "specific" | "all";
  ratings_event_ids: string[];
  assigned_game_ids: string[];
};

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  active?: boolean;
  deactivated_at?: string | null;
  deactivated_by?: string | null;
  position_title_aliases: Record<string, string>;
  public_rating_approval_role?: "none" | "organization_admin" | "event_admin";
};

export type EventRecord = {
  id: string;
  organization_id: string;
  name: string;
  venue_name: string;
  starts_on: string;
  ends_on: string;
  timezone: string;
  check_in_slug: string;
  rating_type: "skills_eval" | "basic_eval";
  ratings_admin_only: boolean;
  public_rating_approval_role?: "inherit" | "none" | "organization_admin" | "event_admin";
  position_title_aliases: Record<string, string>;
  auto_archive_at?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
};

export type GameRecord = {
  id: string;
  event_id: string;
  external_id: string;
  starts_at: string;
  field_name: string;
  home_team: string;
  away_team: string;
  division: string;
  venue_name: string | null;
  age_group: string | null;
  gender: string | null;
  game_type: string | null;
  operational: boolean;
};

export type OfficialRecord = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string | null;
  secondary_email?: string | null;
  date_of_birth?: string | null;
  phone?: string | null;
  badge_level?: string | null;
  source?: string;
  source_official_id?: string | null;
  source_display_name?: string | null;
  linked_user_id?: string | null;
  last_login_at?: string | null;
  identity_status?: string;
  merged_into_official_id?: string | null;
  pending_org_role?: MembershipRole;
  pending_org_roles?: MembershipRole[];
  archived_at?: string | null;
};

export type OrganizationJoinLink = {
  id: string;
  organization_id: string;
  token: string;
  label: string;
  default_role: MembershipRole;
  active: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  use_count: number;
};

export type AuditRecord = {
  id: number;
  event_id: string | null;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type AssignmentRecord = {
  id: string;
  game_id: string;
  official_id: string;
  position:
    | "referee"
    | "assistant_referee"
    | "fourth_official"
    | "mentor"
    | "referee_coach"
    | "site_coordinator"
    | "site_supervisor"
    | "standby"
    | "other";
  position_title: string | null;
  source_position_title: string | null;
};

export type CheckInRecord = {
  id: string;
  event_id: string;
  official_id: string;
  checked_in_at: string;
  status: "checked_in" | "late" | "missing" | "excused";
  method: string;
  event_date: string;
};

export type CoachAssignmentRecord = {
  id: string;
  event_id: string;
  game_id: string | null;
  coach_id: string;
  official_id: string | null;
  scope_date: string | null;
  venue_name: string | null;
  field_name: string | null;
  full_schedule: boolean;
};

export type AssessmentRecord = {
  id: string;
  game_id: string;
  official_id: string;
  coach_id: string;
  visibility: "public" | "private";
  status: "draft" | "submitted" | "shared";
  evaluation_type: "skills_eval" | "basic_eval";
  overall_rating: number | null;
  positioning: number | null;
  decision_making: number | null;
  communication: number | null;
  match_control: number | null;
  strengths: string | null;
  development_focus: string | null;
  coach_notes: string | null;
  submitted_at: string | null;
  created_at?: string;
  archived_at?: string | null;
  archived_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  shared_at?: string | null;
  referee_seen_at?: string | null;
  deleted_at?: string | null;
  retained_for_referee?: boolean;
};

export type RatingHistory = {
  assessments: AssessmentRecord[];
  games: GameRecord[];
  assignments: AssignmentRecord[];
  officials: OfficialRecord[];
  events: EventRecord[];
  submitters: { id: string; full_name: string }[];
};

export type AppearanceCampaign = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  starts_at: string;
  ends_at: string;
  active: boolean;
};

export type AppearanceTheme = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  created_at: string;
  updated_at: string;
};

function configuration() {
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  return { baseUrl, anonKey };
}

async function rest<T>(
  session: Law18Session,
  path: string,
  init: RequestInit = {},
  prefer?: string,
): Promise<T> {
  const config = configuration();
  const response = await fetch(`${config.baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.hint || "Supabase request failed.");
  }
  return payload as T;
}

const enc = encodeURIComponent;

export async function loadProfile(session: Law18Session) {
  const rows = await rest<Profile[]>(session, `profiles?id=eq.${enc(session.user.id)}&select=*`);
  return rows[0] ?? null;
}

export async function loadOrganization(session: Law18Session, organizationId: string) {
  const rows = await rest<OrganizationRecord[]>(
    session,
    `organizations?id=eq.${enc(organizationId)}&select=*`,
  );
  return rows[0] ?? null;
}

export async function loadOrganizations(session: Law18Session) {
  return rest<OrganizationRecord[]>(session, "organizations?select=*&order=name.asc");
}

export function positionAliasKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function updatePositionTitleAliases(
  session: Law18Session,
  scope: "organization" | "event",
  id: string,
  aliases: Record<string, string>,
) {
  const table = scope === "organization" ? "organizations" : "events";
  const rows = await rest<(OrganizationRecord | EventRecord)[]>(
    session,
    `${table}?id=eq.${enc(id)}`,
    { method: "PATCH", body: JSON.stringify({ position_title_aliases: aliases }) },
    "return=representation",
  );
  return rows[0];
}

export async function createOrganization(session: Law18Session, name: string) {
  return rest<OrganizationRecord>(session, "rpc/create_organization", {
    method: "POST",
    body: JSON.stringify({ organization_name: name }),
  });
}

export async function reactivateOrganization(session: Law18Session, organizationId: string) {
  return rest<OrganizationRecord>(session, "rpc/reactivate_organization", {
    method: "POST",
    body: JSON.stringify({ target_organization_id: organizationId }),
  });
}

export async function updateOrganizationName(session: Law18Session, organizationId: string, name: string) {
  const rows = await rest<OrganizationRecord[]>(
    session,
    `organizations?id=eq.${enc(organizationId)}`,
    { method: "PATCH", body: JSON.stringify({ name: name.trim() }) },
    "return=representation",
  );
  return rows[0];
}

export async function updateOrganizationSettings(
  session: Law18Session,
  organizationId: string,
  values: { name: string; logo_url: string | null; public_rating_approval_role?: OrganizationRecord["public_rating_approval_role"] },
) {
  const rows = await rest<OrganizationRecord[]>(
    session,
    `organizations?id=eq.${enc(organizationId)}`,
    { method: "PATCH", body: JSON.stringify({ name: values.name.trim(), logo_url: values.logo_url, ...(values.public_rating_approval_role ? { public_rating_approval_role: values.public_rating_approval_role } : {}) }) },
    "return=representation",
  );
  return rows[0];
}

export async function beginOrganizationAction(
  session: Law18Session,
  organizationId: string,
  action: "deactivate" | "delete",
) {
  return rest<string>(session, "rpc/begin_organization_action", {
    method: "POST",
    body: JSON.stringify({ target_organization_id: organizationId, action_name: action }),
  });
}

export async function completeOrganizationAction(session: Law18Session, challengeId: string) {
  return rest<string>(session, "rpc/complete_organization_action", {
    method: "POST",
    body: JSON.stringify({ challenge_id: challengeId }),
  });
}

export async function loadMemberships(session: Law18Session) {
  const [organizations, events] = await Promise.all([
    rest<OrganizationMembership[]>(session, "organization_memberships?select=*&status=eq.active"),
    rest<EventMembership[]>(session, "event_memberships?select=*"),
  ]);
  return { organizations, events };
}

export async function recordCurrentLogin(session: Law18Session) {
  await rest(session, "rpc/record_current_login", {
    method: "POST",
    body: "{}",
  }, "return=minimal");
}

export async function loadOrganizationActivity(
  session: Law18Session,
  organizationId: string,
  limit = 250,
) {
  return rest<AuditRecord[]>(session, "rpc/organization_activity", {
    method: "POST",
    body: JSON.stringify({ target_organization: organizationId, result_limit: limit }),
  });
}

export async function loadOrganizationJoinLinks(
  session: Law18Session,
  organizationId: string,
) {
  return rest<OrganizationJoinLink[]>(
    session,
    `organization_join_links?organization_id=eq.${enc(organizationId)}&select=*&order=created_at.desc`,
  );
}

export async function createOrganizationJoinLink(
  session: Law18Session,
  organizationId: string,
  label: string,
  role: MembershipRole = "referee",
  expiresAt: string | null = null,
) {
  const rows = await rest<OrganizationJoinLink[]>(session, "rpc/create_organization_join_link", {
    method: "POST",
    body: JSON.stringify({
      target_organization: organizationId,
      link_label: label,
      link_role: role,
      link_expires_at: expiresAt,
    }),
  });
  return rows[0];
}

export async function setOrganizationJoinLinkActive(
  session: Law18Session,
  linkId: string,
  active: boolean,
) {
  await rest(session, "rpc/set_organization_join_link_active", {
    method: "POST",
    body: JSON.stringify({ join_link_id: linkId, enabled: active }),
  }, "return=minimal");
}

export async function claimOrganizationJoinLink(session: Law18Session, token: string) {
  const rows = await rest<{ organization_id: string; organization_name: string }[]>(
    session,
    "rpc/claim_organization_join_link",
    { method: "POST", body: JSON.stringify({ join_token: token }) },
  );
  return rows[0];
}

export async function removeOrganizationMember(
  session: Law18Session,
  organizationId: string,
  userId: string,
) {
  await rest(session, "rpc/remove_organization_member", {
    method: "POST",
    body: JSON.stringify({ target_organization: organizationId, target_user: userId }),
  }, "return=minimal");
}

export async function loadAppearanceCampaigns(session: Law18Session) {
  return rest<AppearanceCampaign[]>(session, "site_appearance_campaigns?select=*&order=starts_at.desc");
}

export async function uploadAppearanceLogo(session: Law18Session, file: File) {
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const objectPath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${baseUrl}/storage/v1/object/appearance-logos/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || result.error || "Unable to upload the logo.");
  }
  return `${baseUrl}/storage/v1/object/public/appearance-logos/${objectPath.split("/").map(enc).join("/")}`;
}

export async function uploadOrganizationLogo(session: Law18Session, organizationId: string, file: File) {
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const objectPath = `${organizationId}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${baseUrl}/storage/v1/object/organization-logos/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || result.error || "Unable to upload the organization logo.");
  }
  return `${baseUrl}/storage/v1/object/public/organization-logos/${objectPath.split("/").map(enc).join("/")}`;
}

export async function createAppearanceCampaign(
  session: Law18Session,
  values: Omit<AppearanceCampaign, "id">,
) {
  const rows = await rest<AppearanceCampaign[]>(session, "site_appearance_campaigns", {
    method: "POST",
    body: JSON.stringify({ ...values, created_by: session.user.id }),
  }, "return=representation");
  return rows[0];
}

export async function restoreDefaultAppearance(session: Law18Session) {
  await rest(session, "site_appearance_campaigns?active=eq.true", {
    method: "PATCH",
    body: JSON.stringify({ active: false }),
  }, "return=minimal");
}

export async function deleteAppearanceCampaign(session: Law18Session, campaignId: string) {
  await rest(session, `site_appearance_campaigns?id=eq.${enc(campaignId)}`, {
    method: "DELETE",
  }, "return=minimal");
}

export async function loadAppearanceThemes(session: Law18Session) {
  return rest<AppearanceTheme[]>(session, "site_appearance_themes?select=*&order=name.asc");
}

export async function saveAppearanceTheme(
  session: Law18Session,
  values: Pick<AppearanceTheme, "name" | "logo_url" | "primary_color" | "accent_color">,
) {
  const rows = await rest<AppearanceTheme[]>(session, "site_appearance_themes", {
    method: "POST",
    body: JSON.stringify({ ...values, created_by: session.user.id }),
  }, "return=representation");
  return rows[0];
}

export async function deleteAppearanceTheme(session: Law18Session, themeId: string) {
  await rest(session, `site_appearance_themes?id=eq.${enc(themeId)}`, {
    method: "DELETE",
  }, "return=minimal");
}

export async function updateOwnProfile(
  session: Law18Session,
  changes: Pick<Profile, "full_name" | "phone" | "secondary_email" | "date_of_birth" | "preferred_name">,
) {
  const rows = await rest<Profile[]>(
    session,
    `profiles?id=eq.${enc(session.user.id)}`,
    { method: "PATCH", body: JSON.stringify(changes) },
    "return=representation",
  );
  return rows[0];
}

export async function leaveCurrentOrganization(session: Law18Session) {
  await rest<null>(
    session,
    "rpc/leave_current_organization",
    { method: "POST", body: "{}" },
  );
}

export async function linkCurrentReferee(session: Law18Session) {
  const config = configuration();
  const response = await fetch(`${config.baseUrl}/rest/v1/rpc/link_current_referee`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Unable to link this referee account.");
  }
}

export async function loadEvents(session: Law18Session) {
  await rest(session, "rpc/materialize_due_event_archives", {
    method: "POST",
    body: "{}",
  });
  return rest<EventRecord[]>(session, "events?select=*&order=starts_on.desc");
}

export async function configureEventAutoArchive(
  session: Law18Session,
  eventId: string,
  daysAfterEnd: number | null,
) {
  return rest<string | null>(session, "rpc/configure_event_auto_archive", {
    method: "POST",
    body: JSON.stringify({ target_event: eventId, days_after_end: daysAfterEnd }),
  });
}

export async function archiveEvent(session: Law18Session, eventId: string) {
  await rest(session, "rpc/archive_event", {
    method: "POST",
    body: JSON.stringify({ target_event: eventId }),
  }, "return=minimal");
}

export async function loadArchivedEvents(session: Law18Session, organizationId: string) {
  return rest<EventRecord[]>(session, "rpc/organization_event_archive", {
    method: "POST",
    body: JSON.stringify({ target_organization: organizationId }),
  });
}

export async function restoreEvent(session: Law18Session, eventId: string) {
  await rest(session, "rpc/restore_event", {
    method: "POST",
    body: JSON.stringify({ target_event: eventId }),
  }, "return=minimal");
}

export async function createEvent(
  session: Law18Session,
  profile: Profile,
  organizationId: string,
  values: {
    name: string;
    venue_name: string;
    starts_on: string;
    ends_on: string;
    timezone: string;
  },
) {
  if (!organizationId) throw new Error("Select an organization before creating an event.");
  if (!values.name.trim()) throw new Error("Enter an event name.");
  if (!values.venue_name.trim()) throw new Error("Enter a default venue.");
  if (!values.starts_on || !values.ends_on) throw new Error("Enter the event dates.");
  if (values.ends_on < values.starts_on) throw new Error("The end date cannot be before the start date.");
  const slugBase = values.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
  const rows = await rest<EventRecord[]>(
    session,
    "events",
    {
      method: "POST",
      body: JSON.stringify({
        organization_id: organizationId,
        name: values.name.trim(),
        venue_name: values.venue_name.trim(),
        starts_on: values.starts_on,
        ends_on: values.ends_on,
        timezone: values.timezone,
        check_in_slug: `${slugBase}-${Date.now().toString(36)}`,
        created_by: profile.id,
      }),
    },
    "return=representation",
  );
  if (!rows[0]) throw new Error("The event could not be created.");
  return rows[0];
}

export async function loadEventData(session: Law18Session, eventId: string) {
  const [games, coachAssignments, eventMembers, eventRows] = await Promise.all([
    rest<GameRecord[]>(session, `games?event_id=eq.${enc(eventId)}&select=*&order=starts_at.asc`),
    rest<CoachAssignmentRecord[]>(session, `coach_assignments?event_id=eq.${enc(eventId)}&select=*`),
    rest<{ user_id: string }[]>(session, `event_memberships?event_id=eq.${enc(eventId)}&select=user_id`),
    rest<{ organization_id: string }[]>(session, `events?id=eq.${enc(eventId)}&select=organization_id`),
  ]);
  const eventOrganizationId = eventRows[0]?.organization_id;
  const gameIds = games.map((game) => game.id).join(",");
  const assignments = gameIds
    ? await rest<AssignmentRecord[]>(session, `assignments?game_id=in.(${gameIds})&select=*`)
    : [];
  const officialIds = [...new Set(assignments.map((assignment) => assignment.official_id).filter(Boolean))];
  const eventUserIds = [...new Set([
    ...eventMembers.map((membership) => membership.user_id),
    ...coachAssignments.map((assignment) => assignment.coach_id),
  ].filter(Boolean))];
  const [assignedOfficials, linkedEventOfficials] = await Promise.all([
    officialIds.length
    ? await rest<OfficialRecord[]>(session, `officials?id=in.(${officialIds.join(",")})&select=*`)
      : [],
    eventUserIds.length && eventOrganizationId
      ? await rest<OfficialRecord[]>(session, `officials?organization_id=eq.${enc(eventOrganizationId)}&linked_user_id=in.(${eventUserIds.join(",")})&select=*`)
      : [],
  ]);
  const officials = [...new Map([...assignedOfficials, ...linkedEventOfficials].map((official) => [official.id, official])).values()];
  const checkIns = await rest<CheckInRecord[]>(
    session,
    `check_ins?event_id=eq.${enc(eventId)}&select=*`,
  );
  const assessments = gameIds
    ? await rest<AssessmentRecord[]>(session, `assessments?game_id=in.(${gameIds})&select=*`)
    : [];
  return { games, assignments, officials, checkIns, assessments, coachAssignments };
}

export async function createCoachAssignment(
  session: Law18Session,
  eventId: string,
  coachId: string,
  gameId: string | null,
) {
  const rows = await rest<CoachAssignmentRecord[]>(session, "coach_assignments", {
    method: "POST",
    body: JSON.stringify({
      event_id: eventId,
      game_id: gameId,
      coach_id: coachId,
      full_schedule: !gameId,
    }),
  }, "return=representation");
  return rows[0];
}

export async function deleteCoachAssignment(session: Law18Session, assignmentId: string) {
  await rest(session, `coach_assignments?id=eq.${enc(assignmentId)}`, { method: "DELETE" }, "return=minimal");
}

export async function loadEventCheckIns(session: Law18Session, eventId: string) {
  return rest<CheckInRecord[]>(
    session,
    `check_ins?event_id=eq.${enc(eventId)}&select=*&order=checked_in_at.desc`,
  );
}

export async function loadAuthorizedRatingHistory(session: Law18Session): Promise<RatingHistory> {
  return rest<RatingHistory>(session, "rpc/authorized_rating_history", {
    method: "POST",
    body: "{}",
  });
}

export async function setRatingArchived(session: Law18Session, assessmentId: string, archived: boolean) {
  await rest(session, "rpc/set_rating_archived", {
    method: "POST",
    body: JSON.stringify({ target_assessment: assessmentId, should_archive: archived }),
  });
}

export async function deleteRating(session: Law18Session, assessmentId: string, retainForReferee = false) {
  await rest(session, "rpc/delete_rating", {
    method: "POST",
    body: JSON.stringify({ target_assessment: assessmentId, keep_for_referee: retainForReferee }),
  });
}

export async function bulkManageRecords(
  session: Law18Session,
  recordType: "officials" | "ratings" | "events",
  action: "archive" | "restore" | "delete",
  recordIds: string[],
) {
  return rest<{ processed: number; skipped: number }>(session, "rpc/bulk_manage_records", {
    method: "POST",
    body: JSON.stringify({ record_type: recordType, lifecycle_action: action, record_ids: recordIds }),
  });
}

export async function logRatingExport(session: Law18Session, ratingCount: number, gameCount: number) {
  await rest(session, "rpc/log_rating_export", {
    method: "POST",
    body: JSON.stringify({ rating_count: ratingCount, game_count: gameCount }),
  });
}

export async function updateEventRatingSettings(
  session: Law18Session,
  eventId: string,
  ratingType: EventRecord["rating_type"],
  ratingsAdminOnly: boolean,
  publicRatingApprovalRole: EventRecord["public_rating_approval_role"],
) {
  const rows = await rest<EventRecord[]>(
    session,
    `events?id=eq.${enc(eventId)}`,
    { method: "PATCH", body: JSON.stringify({ rating_type: ratingType, ratings_admin_only: ratingsAdminOnly, public_rating_approval_role: publicRatingApprovalRole }) },
    "return=representation",
  );
  return rows[0];
}

export async function approvePublicRating(session: Law18Session, assessmentId: string) {
  return rest<AssessmentRecord>(session, "rpc/approve_public_rating", {
    method: "POST",
    body: JSON.stringify({ target_assessment: assessmentId }),
  });
}

export async function markEventRatingsSeen(session: Law18Session, eventId: string) {
  return rest(session, "rpc/mark_event_ratings_seen", {
    method: "POST",
    body: JSON.stringify({ target_event: eventId }),
  });
}

export async function checkIn(
  session: Law18Session,
  eventId: string,
  officialId: string,
  method: "qr" | "app" | "assignor" = "app",
  eventDate = new Date().toISOString().slice(0, 10),
) {
  const rows = await rest<CheckInRecord[]>(
    session,
    "check_ins?on_conflict=event_id,event_date,official_id",
    {
      method: "POST",
      body: JSON.stringify({
        event_id: eventId,
        event_date: eventDate,
        official_id: officialId,
        status: "checked_in",
        method,
        recorded_by: session.user.id,
        checked_in_at: new Date().toISOString(),
      }),
    },
    "resolution=merge-duplicates,return=representation",
  );
  return rows[0];
}

export async function undoCheckIn(
  session: Law18Session,
  eventId: string,
  officialId: string,
  eventDate: string,
) {
  await rest(
    session,
    `check_ins?event_id=eq.${enc(eventId)}&official_id=eq.${enc(officialId)}&event_date=eq.${enc(eventDate)}`,
    { method: "DELETE" },
    "return=minimal",
  );
}

export type ImportRow = {
  external_id: string;
  date: string;
  start_time: string;
  venue: string;
  field: string;
  home_team: string;
  away_team: string;
  division: string;
  age_group: string;
  gender: string;
  game_type: string;
  official_name: string;
  official_email: string | null;
  position: string;
};

export type OfficialImportRow = {
  full_name: string;
  primary_email: string | null;
  secondary_email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  badge_level: string | null;
  source_official_id: string | null;
};

export type OfficialImportResult = {
  created: number;
  updated: number;
  missingEmail: number;
  conflicts: { name: string; email: string; reason: string }[];
};

function csvRecords(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      record.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      record.push(value.trim());
      if (record.some(Boolean)) records.push(record);
      record = [];
      value = "";
    } else {
      value += character;
    }
  }
  record.push(value.trim());
  if (record.some(Boolean)) records.push(record);
  return records;
}

function headerMap(headers: string[]) {
  return new Map(headers.map((header, index) => [header.trim().toLowerCase(), index]));
}

function cell(row: string[], headers: Map<string, number>, name: string) {
  const index = headers.get(name.toLowerCase());
  return index === undefined ? "" : (row[index] || "").trim();
}

function toIsoTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i);
  if (!match) throw new Error(`Unrecognized start time "${value}".`);
  let hours = Number(match[1]);
  const minutes = match[2];
  const seconds = match[3] || "00";
  const period = match[4]?.toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${minutes}:${seconds}`;
}

export function zonedLocalDateTimeToIso(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    throw new Error(`Invalid local date/time "${date} ${time}".`);
  }
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(wallTimeAsUtc))
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
  const representedWallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return new Date(wallTimeAsUtc - (representedWallTime - wallTimeAsUtc)).toISOString();
}

function displayName(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : value.trim();
}

export function normalizeOfficialName(value: string) {
  return displayName(value).toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isOperationalGame(row: Pick<ImportRow, "field" | "home_team" | "away_team" | "game_type">) {
  const values = [row.field, row.home_team, row.away_team, row.game_type].map((value) => (value || "").toLowerCase());
  const operationalTitles = [
    "standby", "ref coordinator", "ref coord", "ref coach", "referee coach",
    "site coordinator", "site coord", "site supervisor",
  ];
  return values.some((value) => value.includes("hq"))
    || values.some((value) => operationalTitles.some((title) => value.trim() === title));
}

export function parseAssignrCsv(text: string): ImportRow[] {
  const records = csvRecords(text);
  if (records.length < 2) throw new Error("The CSV does not contain schedule rows.");
  const headers = headerMap(records[0]);

  // Actual Assignr games export: one game per row and Position/Official pairs.
  if (headers.has("game id") && headers.has("official 1")) {
    const required = ["game id", "date", "start time", "venue", "sub-venue", "home team", "away team"];
    const missing = required.filter((name) => !headers.has(name));
    if (missing.length) throw new Error(`This Assignr export is missing: ${missing.join(", ")}.`);
    const rows: ImportRow[] = [];
    records.slice(1).forEach((record, rowIndex) => {
      const gameId = cell(record, headers, "game id");
      const externalId = cell(record, headers, "assignr database id") || gameId;
      const date = cell(record, headers, "date");
      const startTime = cell(record, headers, "start time");
      if (!gameId && !date && !startTime) return; // Assignr may include a totals/footer row.
      if (!externalId || !date || !startTime) throw new Error(`Assignr row ${rowIndex + 2} is missing its game ID, date, or start time.`);
      for (let slot = 1; slot <= 12; slot += 1) {
        const name = cell(record, headers, `official ${slot}`);
        const position = cell(record, headers, `position ${slot}`);
        if (!name) continue;
        rows.push({
          external_id: externalId,
          date,
          start_time: toIsoTime(startTime),
          venue: cell(record, headers, "venue"),
          field: cell(record, headers, "sub-venue") || cell(record, headers, "venue"),
          home_team: cell(record, headers, "home team") || "TBD",
          away_team: cell(record, headers, "away team") || "TBD",
          division: [cell(record, headers, "age group"), cell(record, headers, "league")].filter(Boolean).join(" · "),
          age_group: cell(record, headers, "age group"),
          gender: cell(record, headers, "gender"),
          game_type: cell(record, headers, "game type"),
          official_name: displayName(name),
          official_email: null,
          position: position || "Official",
        });
      }
    });
    if (!rows.length) throw new Error("No assigned officials were found in this Assignr schedule.");
    return rows;
  }

  // Backward-compatible Law18Ref pilot template.
  const required = ["external_id", "date", "start_time", "venue", "field", "home_team", "away_team", "official_name", "position"];
  const missing = required.filter((column) => !headers.has(column));
  if (missing.length) throw new Error(`Unrecognized schedule template. Missing columns: ${missing.join(", ")}`);
  return records.slice(1).map((record, rowIndex) => {
    const row = Object.fromEntries([...headers].map(([header, index]) => [header, record[index] ?? ""])) as unknown as ImportRow;
    if (!row.external_id || !row.date || !row.start_time || !row.official_name) {
      throw new Error(`Row ${rowIndex + 2} is missing a game ID, date, time, or official.`);
    }
    row.start_time = toIsoTime(row.start_time);
    row.official_email = row.official_email?.trim().toLowerCase() || null;
    return row;
  });
}

export function parseAssignrOfficialsCsv(text: string): OfficialImportRow[] {
  const records = csvRecords(text);
  if (records.length < 2) throw new Error("The CSV does not contain officials.");
  const headers = headerMap(records[0]);
  const required = ["last name", "first name", "primary email", "assignr database id"];
  const missing = required.filter((name) => !headers.has(name));
  if (missing.length) throw new Error(`This is not an Assignr officials export. Missing: ${missing.join(", ")}.`);
  return records.slice(1)
    .filter((record) => cell(record, headers, "is an official?").toUpperCase() !== "NO")
    .map((record) => {
      const first = cell(record, headers, "first name");
      const last = cell(record, headers, "last name");
      return {
        full_name: `${first} ${last}`.trim(),
        primary_email: cell(record, headers, "primary email").toLowerCase() || null,
        secondary_email: cell(record, headers, "secondary email").toLowerCase() || null,
        phone: cell(record, headers, "mobile phone") || cell(record, headers, "home phone") || null,
        date_of_birth: null,
        badge_level: cell(record, headers, "grade/badge level") || cell(record, headers, "ussf referee certification") || null,
        source_official_id: cell(record, headers, "assignr database id") || null,
      };
    })
    .filter((row) => row.full_name);
}

export function normalizePosition(position: string): AssignmentRecord["position"] {
  const rawValue = position.toLowerCase();
  const value = position.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if (value === "ar" || value.startsWith("asst") || value.includes("assistant")) return "assistant_referee";
  if (rawValue.includes("4th") || value.includes("fourth")) return "fourth_official";
  if (
    value.includes("referee_coach")
    || value.includes("ref_coach")
    || value.includes("ref_coord")
    || value.includes("referee_coord")
  ) return "referee_coach";
  if (value.includes("site_supervisor")) return "site_supervisor";
  if (value.includes("site_coord")) return "site_coordinator";
  if (value.includes("standby")) return "standby";
  if (value.includes("mentor")) return "mentor";
  if (value === "ref" || value.includes("referee")) return "referee";
  return "other";
}

export async function loadOrganizationOfficials(session: Law18Session, organizationId: string, includeMerged = false) {
  return rest<OfficialRecord[]>(
    session,
    `officials?organization_id=eq.${enc(organizationId)}${includeMerged ? "" : "&merged_into_official_id=is.null&identity_status=neq.removed&archived_at=is.null"}&select=*&order=full_name.asc`,
  );
}

export async function mergeOrganizationAccounts(
  session: Law18Session,
  organizationId: string,
  primaryOfficialId: string,
  secondaryOfficialId: string,
) {
  return rest<{
    primary_official_id: string;
    primary_user_id: string;
    primary_email: string;
  }>(session, "rpc/merge_organization_accounts", {
    method: "POST",
    body: JSON.stringify({
      organization_uuid: organizationId,
      primary_official_uuid: primaryOfficialId,
      secondary_official_uuid: secondaryOfficialId,
    }),
  });
}

export async function importOfficials(
  session: Law18Session,
  profile: Profile,
  organizationId: string,
  fileName: string,
  rows: OfficialImportRow[],
): Promise<OfficialImportResult> {
  if (!organizationId) throw new Error("Select an organization before importing officials.");
  const existing = await loadOrganizationOfficials(session, organizationId, true);
  const byId = new Map(existing.map((item) => [item.id, item]));
  const resolvedOfficial = (official?: OfficialRecord) =>
    official?.merged_into_official_id ? byId.get(official.merged_into_official_id) || official : official;
  const bySource = new Map(existing.filter((item) => item.source_official_id).map((item) => [item.source_official_id!, item]));
  const byEmail = new Map(existing.filter((item) => item.email).map((item) => [item.email!.trim().toLowerCase(), item]));
  const provisionalByName = new Map<string, OfficialRecord[]>();
  existing.filter((item) => item.identity_status === "provisional").forEach((item) => {
    const key = normalizeOfficialName(item.source_display_name || item.full_name);
    provisionalByName.set(key, [...(provisionalByName.get(key) || []), item]);
  });
  const emailsInFile = new Set<string>();
  const conflicts: OfficialImportResult["conflicts"] = [];
  const createPayload: Record<string, unknown>[] = [];
  const updates: { id: string; changes: Record<string, unknown> }[] = [];

  for (const row of rows) {
    let email = row.primary_email?.trim().toLowerCase() || null;
    if (email && emailsInFile.has(email)) {
      conflicts.push({ name: row.full_name, email, reason: "Duplicate primary email in this import" });
      email = null;
    }
    if (email) emailsInFile.add(email);
    const directSourceMatch = row.source_official_id ? bySource.get(row.source_official_id) : undefined;
    const nameCandidates = provisionalByName.get(normalizeOfficialName(row.full_name)) || [];
    const sourceMatch = directSourceMatch || (nameCandidates.length === 1 ? nameCandidates[0] : undefined);
    const emailMatch = email ? byEmail.get(email) : undefined;
    if (emailMatch && sourceMatch && emailMatch.id !== sourceMatch.id) {
      conflicts.push({ name: row.full_name, email: email!, reason: "Email belongs to a different existing official" });
      email = null;
    } else if (emailMatch && !sourceMatch) {
      conflicts.push({ name: row.full_name, email: email!, reason: "Email already exists; administrator review required" });
      email = null;
    }
    if (!directSourceMatch && !sourceMatch && nameCandidates.length > 1) {
      conflicts.push({ name: row.full_name, email: email || "", reason: "Multiple provisional officials have this name; manual identity review required" });
    }
    const match = resolvedOfficial(sourceMatch);
    const changes = {
      full_name: match?.linked_user_id ? match.full_name : row.full_name,
      source_display_name: row.full_name,
      email,
      secondary_email: row.secondary_email,
      phone: row.phone,
      date_of_birth: row.date_of_birth,
      badge_level: row.badge_level,
      source: "assignr",
      source_official_id: row.source_official_id,
      updated_at: new Date().toISOString(),
    };
    if (match) updates.push({ id: match.id, changes });
    else createPayload.push({
      organization_id: organizationId,
      identity_status: "provisional",
      ...changes,
    });
  }

  for (let index = 0; index < createPayload.length; index += 250) {
    await rest(session, "officials", {
      method: "POST",
      body: JSON.stringify(createPayload.slice(index, index + 250)),
    }, "return=minimal");
  }
  for (const update of updates) {
    await rest(session, `officials?id=eq.${enc(update.id)}`, {
      method: "PATCH",
      body: JSON.stringify(update.changes),
    }, "return=minimal");
  }
  await rest(session, "import_jobs", {
    method: "POST",
    body: JSON.stringify({
      organization_id: organizationId,
      uploaded_by: profile.id,
      source: "assignr_officials_csv",
      file_name: fileName,
      row_count: rows.length,
      status: conflicts.length ? "completed_with_warnings" : "completed",
      errors: conflicts,
    }),
  }, "return=minimal");
  return {
    created: createPayload.length,
    updated: updates.length,
    missingEmail: rows.filter((row) => !row.primary_email).length,
    conflicts,
  };
}

export async function saveAssessment(
  session: Law18Session,
  organizationId: string,
  values: Omit<AssessmentRecord, "id" | "coach_id" | "submitted_at">,
) {
  const rows = await rest<AssessmentRecord[]>(
    session,
    "assessments?on_conflict=game_id,official_id,coach_id",
    {
      method: "POST",
      body: JSON.stringify({
        ...values,
        organization_id: organizationId,
        coach_id: session.user.id,
        submitted_at: values.status === "draft" ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    },
    "resolution=merge-duplicates,return=representation",
  );
  return rows[0];
}

export async function importTournament(
  session: Law18Session,
  profile: Profile,
  organizationId: string,
  details: {
    name: string;
    venue: string;
    startsOn: string;
    endsOn: string;
    fileName: string;
    eventId?: string;
  },
  rows: ImportRow[],
) {
  if (!organizationId) throw new Error("Select an organization before importing a schedule.");
  let event: EventRecord;
  if (details.eventId) {
    const existingEvents = await rest<EventRecord[]>(
      session,
      `events?id=eq.${enc(details.eventId)}&organization_id=eq.${enc(organizationId)}&select=*`,
    );
    const existingEvent = existingEvents[0];
    if (!existingEvent) throw new Error("The selected event is no longer available.");
    const updatedEvents = await rest<EventRecord[]>(
      session,
      `events?id=eq.${enc(existingEvent.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          starts_on: details.startsOn < existingEvent.starts_on ? details.startsOn : existingEvent.starts_on,
          ends_on: details.endsOn > existingEvent.ends_on ? details.endsOn : existingEvent.ends_on,
        }),
      },
      "return=representation",
    );
    event = updatedEvents[0] ?? existingEvent;
  } else {
    const slug = `${details.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
    const events = await rest<EventRecord[]>(
      session,
      "events",
      {
        method: "POST",
        body: JSON.stringify({
          organization_id: organizationId,
          name: details.name,
          venue_name: details.venue,
          starts_on: details.startsOn,
          ends_on: details.endsOn,
          check_in_slug: slug,
          created_by: profile.id,
        }),
      },
      "return=representation",
    );
    event = events[0];
  }

  const existingOfficials = await loadOrganizationOfficials(session, organizationId, true);
  const byName = new Map<string, OfficialRecord[]>();
  existingOfficials.forEach((official) => {
    const key = normalizeOfficialName(official.source_display_name || official.full_name);
    byName.set(key, [...(byName.get(key) || []), official]);
  });
  const newNames = [...new Set(rows.map((row) => normalizeOfficialName(row.official_name)))]
    .filter((key) => (byName.get(key)?.length || 0) === 0);
  if (newNames.length) {
    const displayByName = new Map(rows.map((row) => [normalizeOfficialName(row.official_name), row.official_name]));
    await rest(session, "officials", {
      method: "POST",
      body: JSON.stringify(newNames.map((key) => ({
        organization_id: organizationId,
        full_name: displayByName.get(key),
        email: null,
        source: "assignr_schedule_name",
        source_official_id: key,
        source_display_name: displayByName.get(key),
        identity_status: "provisional",
      }))),
    }, "return=minimal");
  }
  const officials = await loadOrganizationOfficials(session, organizationId, true);
  const officialsById = new Map(officials.map((official) => [official.id, official]));
  const resolveMergedOfficial = (official: OfficialRecord) =>
    official.merged_into_official_id
      ? officialsById.get(official.merged_into_official_id) || official
      : official;
  const officialByEmail = new Map(officials.filter((official) => official.email)
    .map((official) => [official.email!.trim().toLowerCase(), resolveMergedOfficial(official)]));
  const officialByName = new Map<string, OfficialRecord[]>();
  officials.forEach((official) => {
    const key = normalizeOfficialName(official.source_display_name || official.full_name);
    const resolved = resolveMergedOfficial(official);
    const current = officialByName.get(key) || [];
    if (!current.some((item) => item.id === resolved.id)) officialByName.set(key, [...current, resolved]);
  });

  const uniqueGames = [...new Map(rows.map((row) => [
    row.external_id,
    {
      event_id: event.id,
      external_id: row.external_id,
      starts_at: zonedLocalDateTimeToIso(row.date, row.start_time, event.timezone || "America/New_York"),
      field_name: row.field,
      venue_name: row.venue,
      home_team: row.home_team,
      away_team: row.away_team,
      division: row.division,
      age_group: row.age_group || null,
      gender: row.gender || null,
      game_type: row.game_type || null,
      operational: isOperationalGame(row),
    },
  ])).values()];
  const games = await rest<GameRecord[]>(
    session,
    "games?on_conflict=event_id,external_id",
    { method: "POST", body: JSON.stringify(uniqueGames) },
    "resolution=merge-duplicates,return=representation",
  );
  const gameByExternalId = new Map(games.map((game) => [game.external_id, game]));
  const organizationRows = await rest<Pick<OrganizationRecord, "position_title_aliases">[]>(
    session,
    `organizations?id=eq.${enc(organizationId)}&select=position_title_aliases`,
  );
  const positionAliases = {
    ...(organizationRows[0]?.position_title_aliases || {}),
    ...(event.position_title_aliases || {}),
  };
  const assignmentPayload = rows.map((row) => {
    const gameId = gameByExternalId.get(row.external_id)?.id;
    const emailMatch = row.official_email ? officialByEmail.get(row.official_email)?.id : undefined;
    const nameMatches = officialByName.get(normalizeOfficialName(row.official_name)) || [];
    const officialId = emailMatch || (nameMatches.length === 1 ? nameMatches[0].id : undefined);
    if (!gameId || !officialId) throw new Error(`Unable to match assignment for game ${row.external_id}.`);
    return {
      game_id: gameId,
      official_id: officialId,
      position: normalizePosition(row.position),
      position_title: positionAliases[positionAliasKey(row.position)] || row.position.trim() || "Official",
      source_position_title: row.position.trim() || "Official",
      accepted: true,
    };
  });
  if (details.eventId) {
    const importedGameIds = [...new Set(assignmentPayload.map((assignment) => assignment.game_id))];
    await Promise.all(importedGameIds.map((gameId) => rest(
      session,
      `assignments?game_id=eq.${enc(gameId)}`,
      { method: "DELETE" },
      "return=minimal",
    )));
  }
  await rest(
    session,
    "assignments?on_conflict=game_id,official_id,position",
    { method: "POST", body: JSON.stringify(assignmentPayload) },
    "resolution=merge-duplicates,return=minimal",
  );
  await rest(
    session,
    "import_jobs",
    {
      method: "POST",
      body: JSON.stringify({
        organization_id: organizationId,
        event_id: event.id,
        uploaded_by: profile.id,
        file_name: details.fileName,
        row_count: rows.length,
        status: "completed",
      }),
    },
    "return=minimal",
  );
  return event;
}

export async function createOfficial(
  session: Law18Session,
  organizationId: string,
  values: { full_name: string; email?: string | null; secondary_email?: string | null; date_of_birth?: string | null; phone?: string | null; badge_level?: string | null; pending_org_roles?: MembershipRole[] },
) {
  const rows = await rest<OfficialRecord[]>(session, "officials", {
    method: "POST",
    body: JSON.stringify({
      organization_id: organizationId,
      full_name: values.full_name.trim(),
      email: values.email?.trim().toLowerCase() || null,
      secondary_email: values.secondary_email?.trim().toLowerCase() || null,
      date_of_birth: values.date_of_birth || null,
      phone: values.phone?.trim() || null,
      badge_level: values.badge_level?.trim() || null,
      pending_org_role: values.pending_org_roles?.[0] || "referee",
      pending_org_roles: values.pending_org_roles?.length ? values.pending_org_roles : ["referee"],
      source: "manual",
      source_display_name: values.full_name.trim(),
      identity_status: "provisional",
    }),
  }, "return=representation");
  return rows[0];
}

export async function updateOfficial(
  session: Law18Session,
  official: OfficialRecord,
  values: { full_name: string; email?: string | null; secondary_email?: string | null; date_of_birth?: string | null; phone?: string | null; badge_level?: string | null; pending_org_roles?: MembershipRole[] },
  syncMembershipRoles = false,
) {
  const email = values.email?.trim().toLowerCase() || null;
  const existing = email
    ? await rest<Pick<OfficialRecord, "id">[]>(
      session,
      `officials?organization_id=eq.${enc(official.organization_id)}&email=ilike.${enc(email)}&id=neq.${enc(official.id)}&select=id`,
    )
    : [];
  if (existing.length) throw new Error("That primary email is already used by another official in this organization.");

  const intendedRoles = values.pending_org_roles?.length ? values.pending_org_roles : ["referee" as MembershipRole];
  const changes = official.linked_user_id
    ? {
      badge_level: values.badge_level?.trim() || null,
      pending_org_role: intendedRoles[0],
      pending_org_roles: intendedRoles,
      updated_at: new Date().toISOString(),
    }
    : {
      full_name: values.full_name.trim(),
      email,
      secondary_email: values.secondary_email?.trim().toLowerCase() || null,
      date_of_birth: values.date_of_birth || null,
      phone: values.phone?.trim() || null,
      badge_level: values.badge_level?.trim() || null,
      pending_org_role: intendedRoles[0],
      pending_org_roles: intendedRoles,
      updated_at: new Date().toISOString(),
    };

  try {
    const rows = await rest<OfficialRecord[]>(session, `officials?id=eq.${enc(official.id)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }, "return=representation");
    if (official.linked_user_id && syncMembershipRoles) {
      const managedRoles = ["organization_admin", "assignor", "referee_coach", "referee"];
      const existingMemberships = await rest<{ role: MembershipRole }[]>(
        session,
        `organization_memberships?organization_id=eq.${enc(official.organization_id)}&user_id=eq.${enc(official.linked_user_id)}&select=role`,
      );
      const existingRoles = new Set(existingMemberships.map((membership) => membership.role));
      const removedRoles = managedRoles.filter((role) => !intendedRoles.includes(role as MembershipRole));
      if (removedRoles.length) {
        await rest(session,
          `organization_memberships?organization_id=eq.${enc(official.organization_id)}&user_id=eq.${enc(official.linked_user_id)}&role=in.(${removedRoles.join(",")})`,
          { method: "DELETE" },
          "return=minimal",
        );
      }
      const addedRoles = intendedRoles.filter((role) => !existingRoles.has(role));
      if (addedRoles.length) await rest(session, "organization_memberships?on_conflict=organization_id,user_id,role", {
        method: "POST",
        body: JSON.stringify(addedRoles.map((role) => ({
          organization_id: official.organization_id,
          user_id: official.linked_user_id,
          role,
          status: "active",
        }))),
      }, "resolution=merge-duplicates,return=minimal");
    }
    return rows[0];
  } catch (reason) {
    if (reason instanceof Error && /unique|duplicate/i.test(reason.message)) {
      throw new Error("That primary email is already used by another official in this organization.");
    }
    throw reason;
  }
}

export async function createGame(
  session: Law18Session,
  eventId: string,
  values: { starts_at: string; field_name: string; home_team: string; away_team: string; division?: string },
) {
  const rows = await rest<GameRecord[]>(session, "games", {
    method: "POST",
    body: JSON.stringify({
      event_id: eventId,
      external_id: `manual-${Date.now().toString(36)}`,
      starts_at: values.starts_at,
      field_name: values.field_name.trim(),
      home_team: values.home_team.trim(),
      away_team: values.away_team.trim(),
      division: values.division?.trim() || "",
    }),
  }, "return=representation");
  return rows[0];
}

export async function assignEventRole(
  session: Law18Session,
  eventId: string,
  userId: string,
  role: "event_admin" | "assignor" | "site_coordinator" | "referee_coach" | "referee",
  ratingsHistoryScope: "none" | "specific" | "all" = "none",
  ratingsEventIds: string[] = [],
) {
  return rest<EventMembership[]>(session, "event_memberships?on_conflict=event_id,user_id,role", {
    method: "POST",
    body: JSON.stringify({
      event_id: eventId,
      user_id: userId,
      role,
      ratings_history_scope: ratingsHistoryScope,
      ratings_event_ids: ratingsEventIds,
      created_by: session.user.id,
    }),
  }, "resolution=merge-duplicates,return=representation");
}

export async function loadUserEventMemberships(
  session: Law18Session,
  eventId: string,
  userId: string,
) {
  return rest<EventMembership[]>(
    session,
    `event_memberships?event_id=eq.${enc(eventId)}&user_id=eq.${enc(userId)}&select=*`,
  );
}

export async function saveUserEventAccess(
  session: Law18Session,
  eventId: string,
  userId: string,
  roles: Exclude<MembershipRole, "site_owner" | "organization_admin">[],
  options: {
    fullScheduleAccess: boolean;
    coachingToolsEnabled: boolean;
    ratingsHistoryScope: "none" | "specific" | "all";
    ratingsEventIds: string[];
    assignedGameIds: string[];
    preserveEventAdmin?: boolean;
  },
) {
  const managedRoles = options.preserveEventAdmin
    ? roles.filter((role) => role !== "event_admin")
    : roles;
  await rest(
    session,
    `event_memberships?event_id=eq.${enc(eventId)}&user_id=eq.${enc(userId)}${options.preserveEventAdmin ? "&role=neq.event_admin" : ""}`,
    { method: "DELETE" },
    "return=minimal",
  );
  if (!managedRoles.length) return [];
  return rest<EventMembership[]>(
    session,
    "event_memberships",
    {
      method: "POST",
      body: JSON.stringify(managedRoles.map((role) => ({
        event_id: eventId,
        user_id: userId,
        role,
        full_schedule_access: options.fullScheduleAccess,
        coaching_tools_enabled: options.coachingToolsEnabled,
        ratings_history_scope: options.ratingsHistoryScope,
        ratings_event_ids: options.ratingsEventIds,
        assigned_game_ids: options.fullScheduleAccess ? [] : options.assignedGameIds,
        created_by: session.user.id,
      }))),
    },
    "return=representation",
  );
}
