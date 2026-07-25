import type { RefHQSession } from "./auth-client";

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Profile = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: "admin" | "assignor" | "referee" | "coach";
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
};

export type OfficialRecord = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
};

export type AssignmentRecord = {
  id: string;
  game_id: string;
  official_id: string;
  position: "referee" | "assistant_referee" | "fourth_official" | "mentor";
};

export type CheckInRecord = {
  id: string;
  event_id: string;
  official_id: string;
  checked_in_at: string;
  status: "checked_in" | "late" | "missing" | "excused";
  method: string;
};

function configuration() {
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  return { baseUrl, anonKey };
}

async function rest<T>(
  session: RefHQSession,
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

export async function loadProfile(session: RefHQSession) {
  const rows = await rest<Profile[]>(session, `profiles?id=eq.${enc(session.user.id)}&select=*`);
  return rows[0] ?? null;
}

export async function linkCurrentReferee(session: RefHQSession) {
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

export async function loadEvents(session: RefHQSession) {
  return rest<EventRecord[]>(session, "events?select=*&order=starts_on.desc");
}

export async function loadEventData(session: RefHQSession, eventId: string) {
  const games = await rest<GameRecord[]>(
    session,
    `games?event_id=eq.${enc(eventId)}&select=*&order=starts_at.asc`,
  );
  if (!games.length) return { games, assignments: [], officials: [], checkIns: [] };
  const gameIds = games.map((game) => game.id).join(",");
  const assignments = await rest<AssignmentRecord[]>(
    session,
    `assignments?game_id=in.(${gameIds})&select=*`,
  );
  const officialIds = [...new Set(assignments.map((assignment) => assignment.official_id).filter(Boolean))];
  const officials = officialIds.length
    ? await rest<OfficialRecord[]>(session, `officials?id=in.(${officialIds.join(",")})&select=*`)
    : [];
  const checkIns = await rest<CheckInRecord[]>(
    session,
    `check_ins?event_id=eq.${enc(eventId)}&select=*`,
  );
  return { games, assignments, officials, checkIns };
}

export async function checkIn(
  session: RefHQSession,
  eventId: string,
  officialId: string,
  method: "qr" | "app" | "assignor" = "app",
) {
  const rows = await rest<CheckInRecord[]>(
    session,
    "check_ins?on_conflict=event_id,official_id",
    {
      method: "POST",
      body: JSON.stringify({
        event_id: eventId,
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

export type ImportRow = {
  external_id: string;
  date: string;
  start_time: string;
  venue: string;
  field: string;
  home_team: string;
  away_team: string;
  division: string;
  official_name: string;
  official_email: string;
  position: string;
};

function parseLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

export function parseAssignrCsv(text: string): ImportRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (lines.length < 2) throw new Error("The CSV does not contain schedule rows.");
  const headers = parseLine(lines[0]).map((header) => header.trim().toLowerCase());
  const required = [
    "external_id", "date", "start_time", "venue", "field", "home_team", "away_team",
    "official_name", "official_email", "position",
  ];
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`);
  return lines.slice(1).map((line, rowIndex) => {
    const values = parseLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as ImportRow;
    if (!row.external_id || !row.date || !row.start_time || !row.official_email) {
      throw new Error(`Row ${rowIndex + 2} is missing a game ID, date, time, or official email.`);
    }
    row.official_email = row.official_email.toLowerCase();
    return row;
  });
}

function normalizePosition(position: string): AssignmentRecord["position"] {
  const value = position.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if (value === "ar" || value.includes("assistant")) return "assistant_referee";
  if (value.includes("fourth")) return "fourth_official";
  if (value.includes("mentor")) return "mentor";
  return "referee";
}

export async function importTournament(
  session: RefHQSession,
  profile: Profile,
  details: { name: string; venue: string; startsOn: string; endsOn: string; fileName: string },
  rows: ImportRow[],
) {
  const slug = `${details.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
  const events = await rest<EventRecord[]>(
    session,
    "events",
    {
      method: "POST",
      body: JSON.stringify({
        organization_id: profile.organization_id,
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
  const event = events[0];

  const officialPayload = [...new Map(rows.map((row) => [
    row.official_email,
    {
      organization_id: profile.organization_id,
      full_name: row.official_name,
      email: row.official_email,
    },
  ])).values()];
  const officials = await rest<OfficialRecord[]>(
    session,
    "officials?on_conflict=organization_id,email",
    { method: "POST", body: JSON.stringify(officialPayload) },
    "resolution=merge-duplicates,return=representation",
  );
  const officialByEmail = new Map(officials.map((official) => [official.email, official]));

  const uniqueGames = [...new Map(rows.map((row) => [
    row.external_id,
    {
      event_id: event.id,
      external_id: row.external_id,
      starts_at: `${row.date}T${row.start_time}:00`,
      field_name: row.field,
      home_team: row.home_team,
      away_team: row.away_team,
      division: row.division,
    },
  ])).values()];
  const games = await rest<GameRecord[]>(
    session,
    "games?on_conflict=event_id,external_id",
    { method: "POST", body: JSON.stringify(uniqueGames) },
    "resolution=merge-duplicates,return=representation",
  );
  const gameByExternalId = new Map(games.map((game) => [game.external_id, game]));
  const assignmentPayload = rows.map((row) => ({
    game_id: gameByExternalId.get(row.external_id)?.id,
    official_id: officialByEmail.get(row.official_email)?.id,
    position: normalizePosition(row.position),
    accepted: true,
  }));
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
        organization_id: profile.organization_id,
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
