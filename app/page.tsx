"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AuthPanel } from "./auth-panel";
import { auth, type Law18Session } from "./auth-client";
import {
  checkIn,
  assignEventRole,
  beginOrganizationAction,
  completeOrganizationAction,
  createGame,
  createOfficial,
  createOrganization,
  createAppearanceCampaign,
  deleteAppearanceCampaign,
  deleteAppearanceTheme,
  importTournament,
  importOfficials,
  leaveCurrentOrganization,
  linkCurrentReferee,
  loadEventData,
  loadEvents,
  loadAppearanceCampaigns,
  loadAppearanceThemes,
  loadAuthorizedRatingHistory,
  loadOrganization,
  loadOrganizations,
  loadOrganizationOfficials,
  loadProfile,
  loadMemberships,
  parseAssignrCsv,
  parseAssignrOfficialsCsv,
  saveAssessment,
  restoreDefaultAppearance,
  saveAppearanceTheme,
  reactivateOrganization,
  updateOrganizationName,
  updateOfficial,
  updateEventRatingSettings,
  updatePositionTitleAliases,
  positionAliasKey,
  updateOwnProfile,
  zonedLocalDateTimeToIso,
  type AssignmentRecord,
  type CheckInRecord,
  type EventRecord,
  type GameRecord,
  type ImportRow,
  type OfficialRecord,
  type OfficialImportRow,
  type OfficialImportResult,
  type AssessmentRecord,
  type MembershipRole,
  type OrganizationRecord,
  type Profile,
} from "./supabase-client";

type View = "dashboard" | "board" | "checkin" | "schedule" | "officials" | "coaching" | "assessments" | "import" | "appearance" | "account" | "groups";
type EventData = {
  games: GameRecord[];
  assignments: AssignmentRecord[];
  officials: OfficialRecord[];
  checkIns: CheckInRecord[];
  assessments: AssessmentRecord[];
};

function Mark() {
  return <span className="logo-lockup"><img src="/logo-draft-law18referee-management-v4.png" alt="Law18Referee Management" /></span>;
}

const defaultLogoUrl = "/logo-draft-law18referee-management-v4.png";

function displayAppearance(campaign?: { primary_color: string | null; accent_color: string | null; logo_url: string | null }) {
  const primaryVariables = ["--green", "--chrome", "--footer", "--nav-active"];
  const accentVariables = ["--berry", "--nav-underline", "--event-mark"];
  primaryVariables.forEach((variable) => campaign?.primary_color
    ? document.documentElement.style.setProperty(variable, campaign.primary_color)
    : document.documentElement.style.removeProperty(variable));
  accentVariables.forEach((variable) => campaign?.accent_color
    ? document.documentElement.style.setProperty(variable, campaign.accent_color)
    : document.documentElement.style.removeProperty(variable));
  document.querySelectorAll<HTMLImageElement>(".logo-lockup img").forEach((image) => {
    image.src = campaign?.logo_url || defaultLogoUrl;
  });
}

function initials(name: string) {
  return name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

const roleNames: Record<MembershipRole, string> = {
  site_owner: "Site owner",
  organization_admin: "Organization admin",
  event_admin: "Event admin",
  assignor: "Assignor",
  referee_coach: "Referee coach",
  referee: "Referee",
};
const organizationRoleChoices: MembershipRole[] = ["organization_admin", "assignor", "referee_coach", "referee"];

function formatTime(value: string) {
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function timeSortValue(value: string) {
  const parts = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function formatDate(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat([], { weekday: "long", month: "short", day: "numeric" }).format(date);
}

function positionLabel(position: AssignmentRecord["position"], importedTitle?: string | null) {
  if (importedTitle?.trim()) return importedTitle.trim();
  return {
    referee: "Referee",
    assistant_referee: "Assistant Referee",
    fourth_official: "Fourth Official",
    mentor: "Mentor",
    referee_coach: "Referee Coach",
    site_coordinator: "Site Coordinator",
    site_supervisor: "Site Supervisor",
    standby: "Standby",
    other: "Official",
  }[position];
}

function Status({ checked, due = false }: { checked: boolean; due?: boolean }) {
  return <span className={`status ${checked ? "checked-in" : due ? "due-soon" : ""}`}><b />{checked ? "Checked in" : due ? "Due soon" : "Expected"}</span>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="panel empty-state"><span>◎</span><p>{children}</p></div>;
}

function AssignmentBoard({ data }: { data: EventData }) {
  const officials = useMemo(() => new Map(data.officials.map((official) => [official.id, official])), [data.officials]);
  const fields = [...new Set(data.games.map((game) => game.field_name))];
  const times = [...new Map(data.games.map((game) => [formatTime(game.starts_at), timeSortValue(game.starts_at)])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);
  if (!data.games.length) return <EmptyState>Import a schedule to populate the assignment board.</EmptyState>;
  return (
    <section className="page-section">
      <div className="section-title">
        <div><p className="eyebrow">LIVE ASSIGNMENT BOARD</p><h1>Full-day staffing</h1><p>Checked-in officials are highlighted as arrivals happen.</p></div>
        <div className="legend"><Status checked /><Status checked={false} /></div>
      </div>
      <div className="board-wrap panel">
        <table className="assignment-board">
          <thead><tr><th>Time</th>{fields.map((field) => <th key={field}>{field}</th>)}</tr></thead>
          <tbody>{times.map((time) => (
            <tr key={time}><th>{time}</th>{fields.map((field) => {
              const game = data.games.find((item) => item.field_name === field && formatTime(item.starts_at) === time);
              if (!game) return <td key={field} className="board-empty">—</td>;
              const crew = data.assignments.filter((assignment) => assignment.game_id === game.id);
              return <td key={field}>
                <article className="board-game">
                  <strong>{game.home_team} <span>vs.</span> {game.away_team}</strong>
                  <small>{game.division || "Tournament match"}</small>
                  <div className="crew-chips">{crew.map((assignment) => {
                    const official = officials.get(assignment.official_id);
                    const gameDate = game.starts_at.slice(0, 10);
                    const isChecked = data.checkIns.some((item) => item.official_id === assignment.official_id && item.event_date === gameDate && item.status === "checked_in");
                    return <span className={isChecked ? "crew-chip arrived" : "crew-chip"} key={assignment.id} title={positionLabel(assignment.position, assignment.position_title)}>
                      <b>{official ? initials(official.full_name) : "?"}</b>
                      <span>{official?.full_name || "Unassigned"}</span>
                      <small>{positionLabel(assignment.position, assignment.position_title)}</small>
                    </span>;
                  })}</div>
                </article>
              </td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function RefereeDay({
  event,
  data,
  session,
}: {
  event: EventRecord;
  data: EventData;
  session: Law18Session;
}) {
  const email = session.user.email?.toLowerCase();
  const official = data.officials.find((item) => item.email?.toLowerCase() === email || item.linked_user_id === session.user.id);
  const assignments = official ? data.assignments.filter((item) => item.official_id === official.id) : [];
  const games = assignments.map((assignment) => ({
    assignment,
    game: data.games.find((game) => game.id === assignment.game_id),
  })).filter((item): item is { assignment: AssignmentRecord; game: GameRecord } => Boolean(item.game));
  const checkInDate = new URLSearchParams(window.location.search).get("date")
    || games[0]?.game.starts_at.slice(0, 10)
    || new Date().toISOString().slice(0, 10);
  const isChecked = Boolean(official && data.checkIns.some((item) => item.official_id === official.id && item.event_date === checkInDate && item.status === "checked_in"));

  if (!official || !games.length) return <EmptyState>No imported assignments match {session.user.email}. Ask your assignor to confirm the email in the CSV.</EmptyState>;
  return <section className="referee-home">
    <div className="referee-hero">
      <p className="eyebrow">MY TOURNAMENT DAY</p>
      <h1>Hi, {official.full_name.split(" ")[0]}.</h1>
      <p>{event.name} · {event.venue_name}</p>
      <p className="pilot-message">{isChecked ? "✓ You are checked in for this event day." : "Scan the on-site QR code from the Check-in section when you arrive."}</p>
      {message && <p className="pilot-message">{message}</p>}
    </div>
    <section className="mobile-actions">
      <a href="#my-schedule"><span>☷</span><strong>My schedule</strong></a>
      <span><span>⌗</span><strong>On-site QR required</strong></span>
    </section>
    <section className="panel my-games" id="my-schedule">
      <div className="panel-head"><div><p className="eyebrow">ASSIGNED — NO ACCEPTANCE REQUIRED</p><h2>Today’s games</h2></div></div>
      {games.map(({ assignment, game }) => <article key={assignment.id}>
        <time>{formatTime(game.starts_at)}</time>
        <div><strong>{game.home_team} vs. {game.away_team}</strong><p>{game.field_name} · {positionLabel(assignment.position, assignment.position_title)}</p></div>
        <Status checked={isChecked} />
      </article>)}
    </section>
  </section>;
}

function QrScanner({ onFound }: { onFound: (rawValue: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !("BarcodeDetector" in window)) {
      setMessage("This browser cannot open the in-app scanner. Try the latest version of your mobile browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanning(true);
      const Detector = (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        const codes = await detector.detect(videoRef.current).catch(() => []);
        if (codes.length) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setScanning(false);
          onFound(codes[0].rawValue);
          return;
        }
        window.setTimeout(scan, 350);
      };
      window.setTimeout(scan, 600);
    } catch {
      setMessage("Camera access was not available. Allow camera permission and try again.");
    }
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  return <section className="panel scanner-card" id="scan">
    <div><p className="eyebrow">EVENT QR</p><h2>Scan at referee headquarters</h2><p>Use Law18Referee Management or your phone’s Camera app.</p></div>
    <video ref={videoRef} autoPlay muted playsInline className={scanning ? "scanner-video active" : "scanner-video"} />
    <button className="secondary" onClick={start} disabled={scanning}>{scanning ? "Scanning…" : "Open QR scanner"}</button>
    {message && <p className="pilot-message">{message}</p>}
  </section>;
}

function RefereeCheckIn({ event, data, session, onCheckedIn }: { event: EventRecord; data: EventData; session: Law18Session; onCheckedIn: () => void }) {
  const email = session.user.email?.toLowerCase();
  const official = data.officials.find((item) => item.email?.toLowerCase() === email || item.linked_user_id === session.user.id);
  const assignmentDates = new Set((official ? data.assignments.filter((item) => item.official_id === official.id) : [])
    .map((assignment) => data.games.find((game) => game.id === assignment.game_id)?.starts_at.slice(0, 10)).filter(Boolean));
  const [message, setMessage] = useState("");
  async function scanned(rawValue: string) {
    if (!official) return;
    try {
      const scannedUrl = new URL(rawValue);
      const scannedEvent = scannedUrl.searchParams.get("event");
      const scannedDate = scannedUrl.searchParams.get("date");
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (scannedUrl.origin !== window.location.origin || scannedEvent !== event.check_in_slug || !scannedDate || scannedDate < today || !assignmentDates.has(scannedDate)) {
        throw new Error("This QR code does not match one of your assigned event days.");
      }
      await checkIn(session, event.id, official.id, "qr", scannedDate);
      setMessage("You’re checked in. Have a great day!");
      onCheckedIn();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "That QR code could not be verified.");
    }
  }
  return <section className="page-section referee-checkin"><div className="section-title"><div><p className="eyebrow">OFFICIAL CHECK-IN</p><h1>Scan the on-site code</h1><p>The check-in QR is displayed or printed by event staff at the venue.</p></div></div><QrScanner onFound={scanned} />{message && <p className="pilot-message">{message}</p>}</section>;
}

function CheckInView({ event, data }: { event: EventRecord; data: EventData }) {
  const eventDates = [...new Set(data.games.map((game) => game.starts_at.slice(0, 10)))].sort();
  const [eventDate, setEventDate] = useState(eventDates[0] || event.starts_on);
  const url = `${window.location.origin}/?event=${event.check_in_slug}&date=${eventDate}`;
  const checked = new Set(data.checkIns.filter((item) => item.event_date === eventDate).map((item) => item.official_id));
  const assignedToday = new Set(data.assignments.filter((assignment) => data.games.some((game) => game.id === assignment.game_id && game.starts_at.startsWith(eventDate))).map((assignment) => assignment.official_id));
  const roster = data.officials.filter((official) => assignedToday.has(official.id));
  return <section className="page-section">
    <div className="section-title"><div><p className="eyebrow">TOURNAMENT CHECK-IN</p><h1>Arrival station</h1><p>Each event day has its own printable QR code and attendance roster.</p></div><label className="day-picker">Event day<select value={eventDate} onChange={(event) => setEventDate(event.target.value)}>{eventDates.map((date) => <option value={date} key={date}>{formatDate(date)}</option>)}</select></label></div>
    <div className="checkin-grid">
      <article className="panel qr-panel print-qr"><div className="qr"><QRCodeSVG value={url} size={210} /></div><h2>{event.name}</h2><strong>{formatDate(eventDate)}</strong><p>{url}</p><button className="secondary print-button" onClick={() => window.print()}>Print daily QR</button></article>
      <article className="panel roster-panel"><div className="panel-head"><div><p className="eyebrow">LIVE ROSTER</p><h2>{checked.size} checked in</h2></div></div>
        {roster.map((official) => <div className="official-row" key={official.id}><span className="avatar">{initials(official.full_name)}</span><div className="official-name"><strong>{official.full_name}</strong><span>{official.email || "Email not yet supplied"}</span></div><Status checked={checked.has(official.id)} /></div>)}
        {!roster.length && <EmptyState>No officials are assigned on this date.</EmptyState>}
      </article>
    </div>
  </section>;
}

function ScheduleView({ session, event, data, onCreated }: { session: Law18Session; event: EventRecord; data: EventData; onCreated: () => void }) {
  const officials = new Map(data.officials.map((official) => [official.id, official]));
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "time" | "site" | "field" | "age_group" | "gender" | "competition">("time");
  const [game, setGame] = useState({ starts_at: "", field_name: "", home_team: "", away_team: "", division: "" });
  async function addGame() {
    setBusy(true);
    setMessage("");
    try {
      const [date, time] = game.starts_at.split("T");
      await createGame(session, event.id, { ...game, starts_at: zonedLocalDateTimeToIso(date, `${time}:00`, event.timezone) });
      setGame({ starts_at: "", field_name: "", home_team: "", away_team: "", division: "" });
      setAdding(false);
      setMessage("Game added to this event.");
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to add the game.");
    } finally {
      setBusy(false);
    }
  }
  const groupLabel = (item: GameRecord) => {
    if (sortBy === "date") return formatDate(item.starts_at);
    if (sortBy === "time") return formatTime(item.starts_at);
    if (sortBy === "site") return item.venue_name || "Unspecified site";
    if (sortBy === "field") return item.field_name || "Unspecified field";
    if (sortBy === "age_group") return item.age_group || "Unspecified age group";
    if (sortBy === "gender") return item.gender || "Unspecified gender";
    return item.division || "Unspecified competition";
  };
  const compareGroups = (a: GameRecord, b: GameRecord) => sortBy === "time"
    ? timeSortValue(a.starts_at) - timeSortValue(b.starts_at)
    : groupLabel(a).localeCompare(groupLabel(b), undefined, { numeric: true });
  const groupedGames = [...data.games].sort((a, b) => compareGroups(a, b) || a.starts_at.localeCompare(b.starts_at))
    .reduce<Record<string, GameRecord[]>>((groups, item) => ({ ...groups, [groupLabel(item)]: [...(groups[groupLabel(item)] || []), item] }), {});
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">EVENT SCHEDULE</p><h1>Games and crews</h1><p>{data.games.length} imported games</p></div></div>
    <div className="schedule-tools"><label>Sort and group by<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="date">Date</option><option value="time">Time</option><option value="site">Site</option><option value="field">Field</option><option value="age_group">Age group</option><option value="gender">Gender</option><option value="competition">Competition</option></select></label><button className="secondary" onClick={() => setAdding((value) => !value)}>{adding ? "Cancel" : "Add game manually"}</button></div>
    {adding && <article className="panel manual-entry-form"><h2>Add a game to {event.name}</h2><div className="manual-form-grid"><label>Date and time<input type="datetime-local" value={game.starts_at} onChange={(e) => setGame({ ...game, starts_at: e.target.value })} /></label><label>Field<input value={game.field_name} onChange={(e) => setGame({ ...game, field_name: e.target.value })} /></label><label>Home team<input value={game.home_team} onChange={(e) => setGame({ ...game, home_team: e.target.value })} /></label><label>Away team<input value={game.away_team} onChange={(e) => setGame({ ...game, away_team: e.target.value })} /></label><label>Division or competition<input value={game.division} onChange={(e) => setGame({ ...game, division: e.target.value })} /></label></div><button className="primary" disabled={busy || !game.starts_at || !game.field_name.trim() || !game.home_team.trim() || !game.away_team.trim()} onClick={addGame}>{busy ? "Adding…" : "Add game"}</button></article>}
    {message && <p className="pilot-message">{message}</p>}
    <div className="schedule-groups">{Object.entries(groupedGames).map(([label, games]) => <details className="panel schedule-group" open key={label}><summary><span>{label}</span><small>{games.length} game{games.length === 1 ? "" : "s"}</small></summary><div className="schedule-list">{games.map((game) => {
      const crew = data.assignments.filter((assignment) => assignment.game_id === game.id);
      return <article className="schedule-card" key={game.id}><div className="timebox"><time>{formatDate(game.starts_at)}</time><strong>{formatTime(game.starts_at)}</strong><span>{game.field_name}</span></div><div><h2>{game.home_team} vs. {game.away_team}</h2><p>{[game.age_group, game.gender, game.division].filter(Boolean).join(" · ")}</p><span className="crew-line">{crew.map((assignment) => `${positionLabel(assignment.position, assignment.position_title)}: ${officials.get(assignment.official_id)?.full_name || "Open"}`).join(" · ")}</span></div></article>;
    })}</div></details>)}</div>
  </section>;
}

function ImportView({
  session,
  profile,
  organizationId,
  organization,
  events,
  canConfigureAliases,
  onImported,
}: {
  session: Law18Session;
  profile: Profile;
  organizationId: string;
  organization: OrganizationRecord;
  events: EventRecord[];
  canConfigureAliases: boolean;
  onImported: (event: EventRecord) => void;
}) {
  const [mode, setMode] = useState<"schedule" | "officials">("schedule");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [officialRows, setOfficialRows] = useState<OfficialImportRow[]>([]);
  const [officialResult, setOfficialResult] = useState<OfficialImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [destinationEventId, setDestinationEventId] = useState("");
  const [details, setDetails] = useState({ name: "", venue: "", startsOn: "", endsOn: "" });
  const [aliasScope, setAliasScope] = useState<"organization" | "event">("organization");
  const [aliasText, setAliasText] = useState("");
  const destinationEvent = events.find((event) => event.id === destinationEventId);

  useEffect(() => {
    const aliases = aliasScope === "event"
      ? destinationEvent?.position_title_aliases || {}
      : organization.position_title_aliases || {};
    setAliasText(Object.entries(aliases).map(([source, display]) => `${source} = ${display}`).join("\n"));
  }, [aliasScope, destinationEvent, organization]);

  async function saveAliases() {
    const targetId = aliasScope === "event" ? destinationEvent?.id : organization.id;
    if (!targetId) return;
    const aliases = Object.fromEntries(aliasText.split(/\r?\n/)
      .map((line) => line.split("="))
      .filter((parts) => parts.length >= 2 && parts[0].trim() && parts.slice(1).join("=").trim())
      .map((parts) => [positionAliasKey(parts[0]), parts.slice(1).join("=").trim()]));
    setBusy(true);
    try {
      await updatePositionTitleAliases(session, aliasScope, targetId, aliases);
      setMessage(`${aliasScope === "event" ? "Event" : "Organization"} position titles saved for future imports.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save position titles.");
    } finally {
      setBusy(false);
    }
  }

  function chooseDestination(eventId: string) {
    setDestinationEventId(eventId);
    const selectedEvent = events.find((event) => event.id === eventId);
    if (selectedEvent) {
      setDetails({
        name: selectedEvent.name,
        venue: selectedEvent.venue_name,
        startsOn: selectedEvent.starts_on,
        endsOn: selectedEvent.ends_on,
      });
      setMessage(rows.length
        ? `${rows.length} assignment rows will be added to ${selectedEvent.name}.`
        : `The next CSV will be added to ${selectedEvent.name}.`);
    } else if (rows.length) {
      const dates = rows.map((row) => row.date).sort();
      setDetails({
        name: fileName.replace(/\.csv$/i, "").replace(/[-_]+/g, " "),
        venue: rows[0].venue,
        startsOn: dates[0],
        endsOn: dates[dates.length - 1],
      });
      setMessage(`${rows.length} assignment rows are ready to create a new event.`);
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    try {
      const contents = await file.text();
      if (mode === "officials") {
        const parsedOfficials = parseAssignrOfficialsCsv(contents);
        setOfficialRows(parsedOfficials);
        setRows([]);
        setFileName(file.name);
        setOfficialResult(null);
        setMessage(`${parsedOfficials.length} officials are ready for review. No invitation emails will be sent.`);
        return;
      }
      const parsed = parseAssignrCsv(contents);
      setRows(parsed);
      setOfficialRows([]);
      setFileName(file.name);
      const dates = parsed.map((row) => row.date).sort();
      setDetails(destinationEvent
        ? {
            name: destinationEvent.name,
            venue: destinationEvent.venue_name,
            startsOn: destinationEvent.starts_on < dates[0] ? destinationEvent.starts_on : dates[0],
            endsOn: destinationEvent.ends_on > dates[dates.length - 1] ? destinationEvent.ends_on : dates[dates.length - 1],
          }
        : {
            name: file.name.replace(/\.csv$/i, "").replace(/[-_]+/g, " "),
            venue: parsed[0].venue,
            startsOn: dates[0],
            endsOn: dates[dates.length - 1],
          });
      setMessage(destinationEvent
        ? `${parsed.length} assignment rows are ready to add to ${destinationEvent.name}.`
        : `${parsed.length} assignment rows are ready to create a new event.`);
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : "Unable to read that CSV.");
    }
  }

  async function confirmOfficialImport() {
    if (!officialRows.length) return;
    setBusy(true);
    setMessage("Importing officials…");
    try {
      const result = await importOfficials(session, profile, organizationId, fileName, officialRows);
      setOfficialResult(result);
      setMessage(`${result.created} officials added and ${result.updated} updated. ${result.conflicts.length} need review.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Officials import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!rows.length || !details.name || !details.venue) return;
    setBusy(true);
    setMessage("Importing tournament…");
    try {
      const event = await importTournament(
        session,
        profile,
        organizationId,
        { ...details, fileName, eventId: destinationEventId || undefined },
        rows,
      );
      setMessage(destinationEventId
        ? `Schedule added to ${event.name} successfully.`
        : "Tournament created successfully.");
      onImported(event);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  const games = new Set(rows.map((row) => row.external_id)).size;
  const referees = new Set(rows.map((row) => row.official_email)).size;
  return <section className="page-section">
    <div className="section-title"><div><p className="eyebrow">ASSIGNR BRIDGE</p><h1>Import center</h1><p>Import the official directory separately, then add one or more schedule days to an event.</p></div></div>
    <div className="segmented import-tabs">
      <button className={mode === "schedule" ? "active" : ""} onClick={() => { setMode("schedule"); setRows([]); setOfficialRows([]); setMessage(""); }}>Schedule export</button>
      <button className={mode === "officials" ? "active" : ""} onClick={() => { setMode("officials"); setRows([]); setOfficialRows([]); setMessage(""); }}>Officials export</button>
    </div>
    <div className="import-grid">
      <article className="panel import-card">
        <span className="upload-icon">↑</span><h2>{fileName || `Choose an Assignr ${mode === "schedule" ? "games" : "users"} CSV`}</h2>
        <p>{mode === "schedule" ? "Uses Assignr’s Games export with Position 1 / Official 1 crew columns." : "Uses Assignr’s Users export. Imported officials remain provisional until they create and verify their account."}</p>
        <label className="primary file-button">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => readFile(event.target.files?.[0])} /></label>
        {mode === "schedule" && <a className="text-button sample-link" href="/assignr-schedule.csv" download>Download sample CSV</a>}
      </article>
      <article className="panel import-review">
        <p className="eyebrow">IMPORT REVIEW</p>
        {mode === "officials" ? <>
          <h2>{officialRows.length ? `${officialRows.length} officials` : "Select a users export"}</h2>
          <p className="import-note">This import never creates login accounts and never sends email. Existing Assignr IDs are updated; duplicate primary emails are removed from the imported record and reported for review.</p>
          {message && <p className="pilot-message">{message}</p>}
          <button className="primary wide" disabled={busy || !officialRows.length} onClick={confirmOfficialImport}>{busy ? "Importing…" : "Import officials"}</button>
        </> : <>
        <h2>{rows.length ? `${games} games · ${referees} assigned officials` : "Select a games export"}</h2>
        <label>Import destination<select value={destinationEventId} onChange={(event) => chooseDestination(event.target.value)}><option value="">Create a new event</option>{events.map((event) => <option value={event.id} key={event.id}>Add to {event.name}</option>)}</select></label>
        <label>Event name<input value={details.name} disabled={Boolean(destinationEvent)} onChange={(event) => setDetails({ ...details, name: event.target.value })} /></label>
        <label>Default venue<input value={details.venue} disabled={Boolean(destinationEvent)} onChange={(event) => setDetails({ ...details, venue: event.target.value })} /></label>
        <div className="date-fields"><label>Starts<input type="date" value={details.startsOn} onChange={(event) => setDetails({ ...details, startsOn: event.target.value })} /></label><label>Ends<input type="date" value={details.endsOn} onChange={(event) => setDetails({ ...details, endsOn: event.target.value })} /></label></div>
        {destinationEvent && <p className="import-note">Games with new Assignr IDs will be added. Matching game IDs and their imported referee crews will be updated. Existing check-ins and other event days stay in place.</p>}
        {message && <p className="pilot-message">{message}</p>}
        <button className="primary wide" disabled={busy || !rows.length} onClick={confirmImport}>{busy ? "Importing…" : destinationEvent ? "Add schedule to event" : "Create event"}</button>
        </>}
      </article>
    </div>
    {mode === "schedule" && rows.length > 0 && <div className="panel preview-table"><table><thead><tr><th>Game</th><th>Date/time</th><th>Field</th><th>Official</th><th>Position</th></tr></thead><tbody>{rows.slice(0, 12).map((row, index) => <tr key={`${row.external_id}-${row.official_name}-${index}`}><td>{row.home_team} vs. {row.away_team}</td><td>{row.date} {row.start_time}</td><td>{row.field}</td><td>{row.official_name}<small>{row.official_email || "Matched from officials directory"}</small></td><td>{row.position}</td></tr>)}</tbody></table>{rows.length > 12 && <p>Showing 12 of {rows.length} assignment rows.</p>}</div>}
    {mode === "schedule" && canConfigureAliases && <article className="panel position-alias-settings"><div><p className="eyebrow">POSITION TITLES</p><h2>Import display names</h2><p>One replacement per line, such as <code>Asst. Referee = AR</code>. Event settings override organization settings.</p></div><label>Applies to<select value={aliasScope} onChange={(event) => setAliasScope(event.target.value as "organization" | "event")}><option value="organization">{organization.name}</option><option value="event" disabled={!destinationEvent}>Selected event</option></select></label><label>Aliases<textarea value={aliasText} onChange={(event) => setAliasText(event.target.value)} placeholder={"Asst. Referee = AR\nRef Coord = Referee Coach"} /></label><button className="secondary" disabled={busy || (aliasScope === "event" && !destinationEvent)} onClick={saveAliases}>Save position titles</button></article>}
    {mode === "officials" && officialRows.length > 0 && <div className="panel preview-table"><table><thead><tr><th>Official</th><th>Primary email</th><th>Secondary email</th><th>Assignr ID</th><th>Badge</th></tr></thead><tbody>{officialRows.slice(0, 12).map((row, index) => <tr key={`${row.source_official_id}-${index}`}><td>{row.full_name}</td><td>{row.primary_email || "Missing"}</td><td>{row.secondary_email || "—"}</td><td>{row.source_official_id || "—"}</td><td>{row.badge_level || "—"}</td></tr>)}</tbody></table>{officialRows.length > 12 && <p>Showing 12 of {officialRows.length} officials.</p>}{officialResult?.conflicts.length ? <div className="import-conflicts"><strong>Needs review</strong>{officialResult.conflicts.slice(0, 10).map((conflict) => <p key={`${conflict.name}-${conflict.email}`}>{conflict.name}: {conflict.reason}</p>)}</div> : null}</div>}
  </section>;
}

function OfficialsDirectory({
  session,
  profile,
  organizationRoles,
  eventRoles,
  canManageOrganizationRoles,
  organizationId,
  officials,
  data,
  event,
  events,
  onCreated,
}: {
  session: Law18Session;
  profile: Profile;
  organizationRoles: MembershipRole[];
  eventRoles: MembershipRole[];
  canManageOrganizationRoles: boolean;
  organizationId: string;
  officials: OfficialRecord[];
  data: EventData;
  event?: EventRecord;
  events: EventRecord[];
  onCreated: () => void;
}) {
  const [query, setQuery] = useState("");
  const eventOfficialIds = new Set(data.assignments.map((assignment) => assignment.official_id));
  const [scope, setScope] = useState<"organization" | "event">("organization");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "email" | "phone" | "badge" | "identity" | "role" | "event">("name");
  const [managing, setManaging] = useState<OfficialRecord | null>(null);
  const [editing, setEditing] = useState<OfficialRecord | null>(null);
  const [eventRole, setEventRole] = useState<"event_admin" | "assignor" | "referee_coach" | "referee">("referee");
  const [ratingScope, setRatingScope] = useState<"none" | "specific" | "all">("none");
  const [ratingEventIds, setRatingEventIds] = useState<string[]>([]);
  const [official, setOfficial] = useState({ full_name: "", email: "", secondary_email: "", date_of_birth: "", phone: "", badge_level: "", pending_org_roles: ["referee"] as MembershipRole[] });
  const [editValues, setEditValues] = useState({ full_name: "", email: "", secondary_email: "", date_of_birth: "", phone: "", badge_level: "", pending_org_roles: ["referee"] as MembershipRole[] });
  const ownerAlreadyListed = officials.some((item) => item.linked_user_id === profile.id || item.email?.toLowerCase() === (profile.primary_email || profile.email).toLowerCase());
  const selfOwnerRecord: OfficialRecord | null = profile.is_site_owner && !ownerAlreadyListed ? {
    id: `site-owner-${profile.id}`,
    organization_id: organizationId,
    full_name: profile.full_name,
    email: profile.primary_email || profile.email,
    secondary_email: profile.secondary_email,
    date_of_birth: profile.date_of_birth,
    phone: profile.phone,
    linked_user_id: profile.id,
    identity_status: "linked",
    source: "site_owner_profile",
    pending_org_roles: [...new Set([...organizationRoles, ...eventRoles])],
  } : null;
  const directoryOfficials = selfOwnerRecord ? [...officials, selfOwnerRecord] : officials;
  const filtered = directoryOfficials.filter((official) => {
    if (scope === "event" && !eventOfficialIds.has(official.id)) return false;
    const haystack = `${official.full_name} ${official.email || ""} ${official.badge_level || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }).sort((a, b) => {
    const values = {
      name: [a.full_name, b.full_name],
      email: [a.email || "", b.email || ""],
      phone: [a.phone || "", b.phone || ""],
      badge: [a.badge_level || "", b.badge_level || ""],
      identity: [a.linked_user_id ? "linked" : "provisional", b.linked_user_id ? "linked" : "provisional"],
      role: [(a.pending_org_roles || [a.pending_org_role || "referee"]).join(","), (b.pending_org_roles || [b.pending_org_role || "referee"]).join(",")],
      event: [eventOfficialIds.has(a.id) ? "assigned" : "unassigned", eventOfficialIds.has(b.id) ? "assigned" : "unassigned"],
    }[sortBy];
    return values[0].localeCompare(values[1]);
  });
  async function addOfficial() {
    setBusy(true);
    setMessage("");
    try {
      await createOfficial(session, organizationId, official);
      setOfficial({ full_name: "", email: "", secondary_email: "", date_of_birth: "", phone: "", badge_level: "", pending_org_roles: ["referee"] });
      setAdding(false);
      setMessage("Official added to this organization. No login account or email was created.");
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to add the official.");
    } finally {
      setBusy(false);
    }
  }
  async function saveEventRole() {
    if (!managing?.linked_user_id || !event) return;
    setBusy(true);
    try {
      await assignEventRole(session, event.id, managing.linked_user_id, eventRole, ratingScope, ratingEventIds);
      setMessage(`${managing.full_name} is now ${roleNames[eventRole]} for ${event.name}.`);
      setManaging(null);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to assign the event role.");
    } finally {
      setBusy(false);
    }
  }
  function beginEdit(target: OfficialRecord) {
    setEditing(target);
    setEditValues({
      full_name: target.full_name,
      email: target.email || "",
      secondary_email: target.secondary_email || "",
      date_of_birth: target.date_of_birth || "",
      phone: target.phone || "",
      badge_level: target.badge_level || "",
      pending_org_roles: target.pending_org_roles?.length ? target.pending_org_roles : [target.pending_org_role || "referee"],
    });
    setMessage("");
  }
  function toggleRole(current: MembershipRole[], role: MembershipRole) {
    if (current.includes(role)) {
      const remaining = current.filter((item) => item !== role);
      return remaining.length ? remaining : ["referee" as MembershipRole];
    }
    return [...current, role];
  }
  async function saveOfficial() {
    if (!editing || !editValues.full_name.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await updateOfficial(session, editing, editValues, canManageOrganizationRoles);
      setMessage(`${editing.full_name}'s official record was updated.`);
      setEditing(null);
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update the official.");
    } finally {
      setBusy(false);
    }
  }
  return <section className="page-section">
    <div className="section-title"><div><p className="eyebrow">OFFICIALS</p><h1>Referee directory</h1><p>Organization officials and the active event roster.</p></div></div>
    <div className="directory-tools">
      <div className="segmented"><button className={scope === "organization" ? "active" : ""} onClick={() => setScope("organization")}>Organization</button><button className={scope === "event" ? "active" : ""} onClick={() => setScope("event")}>Active event</button></div>
      <input className="search" type="search" placeholder="Search name, email, or badge…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <label className="compact-sort">Sort by<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="name">Name</option><option value="email">Email</option><option value="phone">Phone</option><option value="badge">Badge</option><option value="identity">Account status</option><option value="role">Organization role</option><option value="event">Event assignment</option></select></label>
      <button className="secondary" onClick={() => setAdding((value) => !value)}>{adding ? "Cancel" : "Add official"}</button>
    </div>
    {adding && <article className="panel manual-entry-form"><h2>Add an official</h2><div className="manual-form-grid"><label>Full name<input value={official.full_name} onChange={(e) => setOfficial({ ...official, full_name: e.target.value })} /></label><label>Primary email<input type="email" value={official.email} onChange={(e) => setOfficial({ ...official, email: e.target.value })} /></label><label>Secondary email<input type="email" value={official.secondary_email} onChange={(e) => setOfficial({ ...official, secondary_email: e.target.value })} /></label><label>Date of birth<input type="date" value={official.date_of_birth} onChange={(e) => setOfficial({ ...official, date_of_birth: e.target.value })} /></label><label>Phone<input value={official.phone} onChange={(e) => setOfficial({ ...official, phone: e.target.value })} /></label><label>Badge or level<input value={official.badge_level} onChange={(e) => setOfficial({ ...official, badge_level: e.target.value })} /></label><fieldset className="role-checkboxes" disabled={!canManageOrganizationRoles}><legend>Organization roles</legend>{organizationRoleChoices.map((role) => <label key={role}><input type="checkbox" checked={official.pending_org_roles.includes(role)} onChange={() => setOfficial({ ...official, pending_org_roles: toggleRole(official.pending_org_roles, role) })} />{roleNames[role]}</label>)}</fieldset></div><button className="primary" disabled={busy || !official.full_name.trim()} onClick={addOfficial}>{busy ? "Adding…" : "Add official"}</button></article>}
    {message && <p className="pilot-message">{message}</p>}
    <article className="panel directory-list">
      <div className="directory-row directory-head"><span>Official</span><span>Contact</span><span>Identity</span><span>Event</span></div>
      {filtered.map((official) => <div className="directory-row" key={official.id}>
        <div className="official-name-cell"><span className="avatar">{initials(official.full_name)}</span><div><strong>{official.full_name}</strong><small>{official.badge_level || "Badge not supplied"}</small></div></div>
        <div><span>{official.email || "Email required"}</span><small>{official.phone || "No phone imported"}</small></div>
        <span className={`identity-pill ${official.linked_user_id ? "linked" : ""}`}>{official.linked_user_id ? "Account linked" : "Provisional"}</span>
        <span>{eventOfficialIds.has(official.id) ? "Assigned" : "—"}{official.source !== "site_owner_profile" && <button className="text-button manage-role" onClick={() => beginEdit(official)}>Edit</button>}{official.source !== "site_owner_profile" && official.linked_user_id && event && <button className="text-button manage-role" onClick={() => setManaging(official)}>Manage role</button>}</span>
      </div>)}
      {!filtered.length && <EmptyState>No officials match this view.</EmptyState>}
    </article>
    {editing && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog role-dialog official-edit-dialog" role="dialog" aria-modal="true"><p className="eyebrow">OFFICIAL RECORD</p><h2>Edit {editing.full_name}</h2>{editing.linked_user_id && <p className="import-note">This account is linked. The user manages their name and contact information in Account Settings; organization staff can update only the badge and organization roles.</p>}<div className="manual-form-grid"><label>Full name<input value={editValues.full_name} disabled={Boolean(editing.linked_user_id)} onChange={(e) => setEditValues({ ...editValues, full_name: e.target.value })} /></label><label>Primary email<input type="email" value={editValues.email} disabled={Boolean(editing.linked_user_id)} onChange={(e) => setEditValues({ ...editValues, email: e.target.value })} /></label><label>Secondary email<input type="email" value={editValues.secondary_email} disabled={Boolean(editing.linked_user_id)} onChange={(e) => setEditValues({ ...editValues, secondary_email: e.target.value })} /></label><label>Date of birth<input type="date" value={editValues.date_of_birth} disabled={Boolean(editing.linked_user_id)} onChange={(e) => setEditValues({ ...editValues, date_of_birth: e.target.value })} /></label><label>Phone<input value={editValues.phone} disabled={Boolean(editing.linked_user_id)} onChange={(e) => setEditValues({ ...editValues, phone: e.target.value })} /></label><label>Badge or level<input value={editValues.badge_level} onChange={(e) => setEditValues({ ...editValues, badge_level: e.target.value })} /></label><fieldset className="role-checkboxes" disabled={!canManageOrganizationRoles}><legend>Organization roles</legend>{organizationRoleChoices.map((role) => <label key={role}><input type="checkbox" checked={editValues.pending_org_roles.includes(role)} onChange={() => setEditValues({ ...editValues, pending_org_roles: toggleRole(editValues.pending_org_roles, role) })} />{roleNames[role]}</label>)}</fieldset></div><p className="import-note">Event Admin is assigned for a specific event using Manage Role. Assignr source identifiers are preserved for future imports.</p><div><button className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={busy || !editValues.full_name.trim()} onClick={saveOfficial}>{busy ? "Saving…" : "Save official"}</button></div></section></div>}
    {managing && event && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog role-dialog" role="dialog" aria-modal="true"><p className="eyebrow">EVENT ACCESS</p><h2>{managing.full_name}</h2><p>Assign access for {event.name}.</p><label>Event role<select value={eventRole} onChange={(e) => setEventRole(e.target.value as typeof eventRole)}><option value="event_admin">Event admin</option><option value="assignor">Assignor</option><option value="referee_coach">Referee coach</option><option value="referee">Referee</option></select></label><label>Previous-event ratings<select value={ratingScope} onChange={(e) => setRatingScope(e.target.value as typeof ratingScope)}><option value="none">No previous events</option><option value="specific">Selected previous events</option><option value="all">All organization events</option></select></label>{ratingScope === "specific" && <fieldset><legend>Allowed events</legend>{events.filter((item) => item.id !== event.id).map((item) => <label className="event-access-check" key={item.id}><input type="checkbox" checked={ratingEventIds.includes(item.id)} onChange={(e) => setRatingEventIds((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{item.name}</label>)}</fieldset>}<div><button className="secondary" onClick={() => setManaging(null)}>Cancel</button><button className="primary" disabled={busy} onClick={saveEventRole}>Save event access</button></div></section></div>}
  </section>;
}

type CrewRatingDraft = {
  overall_rating: number;
  positioning: number;
  decision_making: number;
  communication: number;
  match_control: number;
  strengths: string;
  development_focus: string;
  coach_notes: string;
};

const blankCrewRating = (): CrewRatingDraft => ({
  overall_rating: 3,
  positioning: 3,
  decision_making: 3,
  communication: 3,
  match_control: 3,
  strengths: "",
  development_focus: "",
  coach_notes: "",
});

function AssessmentCenter({
  session,
  event,
  events,
  organizationId,
  data,
  canSubmit,
  canConfigure,
  onSaved,
  onEventUpdated,
}: {
  session: Law18Session;
  event: EventRecord;
  events: EventRecord[];
  organizationId: string;
  data: EventData;
  canSubmit: boolean;
  canConfigure: boolean;
  onSaved: () => void;
  onEventUpdated: (event: EventRecord) => void;
}) {
  const [gameId, setGameId] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">(event.ratings_admin_only ? "private" : "public");
  const [drafts, setDrafts] = useState<Record<string, CrewRatingDraft>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ratingSort, setRatingSort] = useState<"date" | "gender" | "age_group" | "referee" | "position">("date");
  const [historyEventId, setHistoryEventId] = useState("all");
  const [history, setHistory] = useState({ assessments: data.assessments, games: data.games, assignments: data.assignments, officials: data.officials });
  useEffect(() => {
    loadAuthorizedRatingHistory(session).then(setHistory).catch(() => undefined);
  }, [session, data.assessments.length]);
  const officialMap = new Map(data.officials.map((official) => [official.id, official]));
  const gameMap = new Map(data.games.map((game) => [game.id, game]));
  const historyOfficialMap = new Map(history.officials.map((official) => [official.id, official]));
  const historyGameMap = new Map(history.games.map((game) => [game.id, game]));
  const gameAssignments = [...new Map(data.assignments.filter((assignment) => assignment.game_id === gameId).map((assignment) => [assignment.official_id, assignment])).values()];
  const eligibleGames = data.games.filter((game) => !game.operational).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const sortedAssessments = history.assessments.filter((item) => historyEventId === "all" || historyGameMap.get(item.game_id)?.event_id === historyEventId).sort((a, b) => {
    const aGame = historyGameMap.get(a.game_id);
    const bGame = historyGameMap.get(b.game_id);
    if (ratingSort === "referee") return (historyOfficialMap.get(a.official_id)?.full_name || "").localeCompare(historyOfficialMap.get(b.official_id)?.full_name || "");
    if (ratingSort === "gender") return (aGame?.gender || "").localeCompare(bGame?.gender || "");
    if (ratingSort === "age_group") return (aGame?.age_group || "").localeCompare(bGame?.age_group || "");
    if (ratingSort === "position") {
      const aPosition = history.assignments.find((item) => item.game_id === a.game_id && item.official_id === a.official_id)?.position_title || "";
      const bPosition = history.assignments.find((item) => item.game_id === b.game_id && item.official_id === b.official_id)?.position_title || "";
      return aPosition.localeCompare(bPosition);
    }
    return (aGame?.starts_at || "").localeCompare(bGame?.starts_at || "");
  });

  function chooseGame(nextGameId: string) {
    setGameId(nextGameId);
    const nextDrafts: Record<string, CrewRatingDraft> = {};
    data.assignments.filter((assignment) => assignment.game_id === nextGameId).forEach((assignment) => {
      const saved = data.assessments.find((assessment) => assessment.game_id === nextGameId && assessment.official_id === assignment.official_id && assessment.coach_id === session.user.id);
      nextDrafts[assignment.official_id] = saved ? {
        overall_rating: saved.overall_rating || 3,
        positioning: saved.positioning || 3,
        decision_making: saved.decision_making || 3,
        communication: saved.communication || 3,
        match_control: saved.match_control || 3,
        strengths: saved.strengths || "",
        development_focus: saved.development_focus || "",
        coach_notes: saved.coach_notes || "",
      } : blankCrewRating();
    });
    setDrafts(nextDrafts);
  }

  function updateDraft(officialId: string, changes: Partial<CrewRatingDraft>) {
    setDrafts((current) => ({ ...current, [officialId]: { ...(current[officialId] || blankCrewRating()), ...changes } }));
  }

  async function submitCrew(status: "draft" | "submitted") {
    if (!organizationId || !gameId || !gameAssignments.length) return;
    setBusy(true);
    setMessage("");
    try {
      await Promise.all(gameAssignments.map((assignment) => {
        const rating = drafts[assignment.official_id] || blankCrewRating();
        return saveAssessment(session, organizationId, {
          game_id: gameId,
          official_id: assignment.official_id,
          visibility: event.ratings_admin_only ? "private" : visibility,
          status,
          evaluation_type: event.rating_type,
          overall_rating: event.rating_type === "basic_eval" ? rating.overall_rating : null,
          positioning: event.rating_type === "skills_eval" ? rating.positioning : null,
          decision_making: event.rating_type === "skills_eval" ? rating.decision_making : null,
          communication: event.rating_type === "skills_eval" ? rating.communication : null,
          match_control: event.rating_type === "skills_eval" ? rating.match_control : null,
          strengths: event.rating_type === "skills_eval" ? rating.strengths || null : null,
          development_focus: event.rating_type === "skills_eval" ? rating.development_focus || null : null,
          coach_notes: event.rating_type === "skills_eval" ? rating.coach_notes || null : null,
        });
      }));
      setMessage(status === "draft" ? `Draft ratings saved for ${gameAssignments.length} officials.` : `Ratings submitted for ${gameAssignments.length} officials.`);
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the ratings.");
    } finally {
      setBusy(false);
    }
  }

  async function configure(ratingType: EventRecord["rating_type"], adminOnly: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateEventRatingSettings(session, event.id, ratingType, adminOnly);
      onEventUpdated(updated);
      setVisibility(adminOnly ? "private" : visibility);
      setMessage("Event rating settings updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update event rating settings.");
    } finally {
      setBusy(false);
    }
  }

  if (!canSubmit) return <section className="page-section"><div className="section-title"><div><p className="eyebrow">MY FEEDBACK</p><h1>Ratings history</h1><p>Ratings shared with you appear here.</p></div></div><EmptyState>No public ratings are available yet.</EmptyState></section>;
  return <section className="page-section ratings-page">
    <div className="section-title"><div><p className="eyebrow">REFEREE DEVELOPMENT</p><h1>Ratings</h1><p>Rate every official assigned to a game in one view.</p></div></div>
    {canConfigure && <article className="panel rating-settings"><div><p className="eyebrow">EVENT SETTINGS</p><h2>Rating configuration</h2><p>These settings apply to every game in {event.name}.</p></div><label>Evaluation type<select value={event.rating_type} disabled={busy} onChange={(e) => configure(e.target.value as EventRecord["rating_type"], event.ratings_admin_only)}><option value="skills_eval">Skills Eval</option><option value="basic_eval">Basic Eval</option></select></label><label className="visibility-lock"><input type="checkbox" checked={event.ratings_admin_only} disabled={busy} onChange={(e) => configure(event.rating_type, e.target.checked)} /><span><strong>Lock visibility to event staff</strong><small>Only administrators, event/game assignors, and referee coaches can view ratings.</small></span></label></article>}
    <article className="panel crew-rating-workspace">
      <div className="panel-head"><div><p className="eyebrow">{event.rating_type === "skills_eval" ? "SKILLS EVAL" : "BASIC EVAL"}</p><h2>Select a game</h2></div></div>
      <div className="assessment-selects"><label>Game<select value={gameId} onChange={(e) => chooseGame(e.target.value)}><option value="">Choose a game</option>{eligibleGames.map((game) => <option value={game.id} key={game.id}>{formatDate(game.starts_at)} · {formatTime(game.starts_at)} · {game.field_name} · {game.home_team} vs. {game.away_team}</option>)}</select></label><label>Visibility<select value={event.ratings_admin_only ? "private" : visibility} disabled={event.ratings_admin_only} onChange={(e) => setVisibility(e.target.value as "public" | "private")}><option value="private">Private — event staff and referee coaches</option><option value="public">Public — visible to each referee</option></select></label>{event.ratings_admin_only && <p className="import-note">Visibility is locked to event staff for this event.</p>}</div>
      <div className="crew-rating-list">{gameAssignments.map((assignment) => {
        const rating = drafts[assignment.official_id] || blankCrewRating();
        return <section className="crew-rating-card" key={assignment.official_id}><div className="crew-rating-heading"><span className="avatar">{initials(officialMap.get(assignment.official_id)?.full_name || "R")}</span><div><h3>{officialMap.get(assignment.official_id)?.full_name || "Official"}</h3><p>{positionLabel(assignment.position, assignment.position_title)}</p></div></div>
          {event.rating_type === "basic_eval"
            ? <label className="basic-rating"><span><strong>Overall Rating</strong><small>1 developing · 5 excellent</small></span><select value={rating.overall_rating} onChange={(e) => updateDraft(assignment.official_id, { overall_rating: Number(e.target.value) })}>{[1,2,3,4,5].map((score) => <option key={score}>{score}</option>)}</select></label>
            : <><div className="skill-rating-grid">{([
              ["positioning", "Positioning"],
              ["decision_making", "Decision Making"],
              ["communication", "Communication"],
              ["match_control", "Match Control"],
            ] as const).map(([key, label]) => <label key={key}><span>{label}</span><select value={rating[key]} onChange={(e) => updateDraft(assignment.official_id, { [key]: Number(e.target.value) })}>{[1,2,3,4,5].map((score) => <option key={score}>{score}</option>)}</select></label>)}</div><div className="crew-notes-grid"><label>Strengths<textarea value={rating.strengths} onChange={(e) => updateDraft(assignment.official_id, { strengths: e.target.value })} /></label><label>Development Focus<textarea value={rating.development_focus} onChange={(e) => updateDraft(assignment.official_id, { development_focus: e.target.value })} /></label><label>Private Coach Notes<textarea value={rating.coach_notes} onChange={(e) => updateDraft(assignment.official_id, { coach_notes: e.target.value })} /></label></div></>}
        </section>;
      })}{gameId && !gameAssignments.length && <EmptyState>No officials are assigned to this game.</EmptyState>}</div>
      {message && <p className="pilot-message assessment-message">{message}</p>}
      <div className="assessment-actions"><button className="secondary" disabled={busy || !gameAssignments.length} onClick={() => submitCrew("draft")}>Save crew draft</button><button className="primary" disabled={busy || !gameAssignments.length} onClick={() => submitCrew("submitted")}>Submit all ratings</button></div>
    </article>
    <article className="panel history ratings-history"><div className="panel-head"><div><p className="eyebrow">HISTORY</p><h2>{sortedAssessments.length} ratings</h2></div><div className="history-filters"><label className="compact-sort">Event<select value={historyEventId} onChange={(e) => setHistoryEventId(e.target.value)}><option value="all">All permitted events</option>{[...new Set(history.games.map((game) => game.event_id))].map((id) => <option value={id} key={id}>{events.find((item) => item.id === id)?.name || `Previous event · ${id.slice(0, 8)}`}</option>)}</select></label><label className="compact-sort">Sort by<select value={ratingSort} onChange={(e) => setRatingSort(e.target.value as typeof ratingSort)}><option value="date">Date</option><option value="gender">Gender</option><option value="age_group">Age group</option><option value="referee">Referee</option><option value="position">Position</option></select></label></div></div>{sortedAssessments.map((assessment) => {
      const skillAverage = [assessment.positioning, assessment.decision_making, assessment.communication, assessment.match_control].filter((item): item is number => item !== null).reduce((sum, item, _, all) => sum + item / all.length, 0);
      const score = assessment.evaluation_type === "basic_eval" ? assessment.overall_rating : skillAverage;
      return <article key={assessment.id}><div><strong>{historyOfficialMap.get(assessment.official_id)?.full_name || "Referee"}</strong><p>{historyGameMap.get(assessment.game_id)?.home_team} vs. {historyGameMap.get(assessment.game_id)?.away_team}</p><small>{assessment.evaluation_type === "basic_eval" ? "Basic Eval" : "Skills Eval"} · {assessment.visibility === "public" ? "Public" : "Admin only"}</small></div><span className="score">{score ? Number(score).toFixed(1) : "—"}</span><span className={`identity-pill ${assessment.status !== "draft" ? "linked" : ""}`}>{assessment.status}</span></article>;
    })}{!sortedAssessments.length && <EmptyState>No ratings match these filters.</EmptyState>}</article>
  </section>;
}

function AppearanceSettings({ session }: { session: Law18Session }) {
  const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof loadAppearanceCampaigns>>>([]);
  const [themes, setThemes] = useState<Awaited<ReturnType<typeof loadAppearanceThemes>>>([]);
  const [form, setForm] = useState({
    name: "",
    logo_url: "",
    primary_color: "#315f8d",
    accent_color: "#b53367",
    starts_at: "",
    ends_at: "",
  });
  const [message, setMessage] = useState("");
  useEffect(() => {
    Promise.all([loadAppearanceCampaigns(session), loadAppearanceThemes(session)])
      .then(([nextCampaigns, nextThemes]) => { setCampaigns(nextCampaigns); setThemes(nextThemes); })
      .catch(() => undefined);
  }, [session]);
  async function schedule() {
    try {
      await createAppearanceCampaign(session, {
        ...form,
        logo_url: form.logo_url || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        active: true,
      });
      const nextCampaigns = await loadAppearanceCampaigns(session);
      setCampaigns(nextCampaigns);
      const now = Date.now();
      displayAppearance(nextCampaigns.find((item) => item.active && new Date(item.starts_at).getTime() <= now && new Date(item.ends_at).getTime() > now));
      setMessage("Appearance campaign scheduled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to schedule this appearance.");
    }
  }
  async function restore() {
    await restoreDefaultAppearance(session);
    setCampaigns(await loadAppearanceCampaigns(session));
    displayAppearance();
    setMessage("The default Law18Ref appearance has been restored.");
  }
  async function unschedule(campaignId: string, campaignName: string) {
    if (!window.confirm(`Unschedule and delete “${campaignName}”? This does not delete a saved reusable theme.`)) return;
    try {
      await deleteAppearanceCampaign(session, campaignId);
      const nextCampaigns = await loadAppearanceCampaigns(session);
      setCampaigns(nextCampaigns);
      const now = Date.now();
      displayAppearance(nextCampaigns.find((item) => item.active && new Date(item.starts_at).getTime() <= now && new Date(item.ends_at).getTime() > now));
      setMessage(`${campaignName} was unscheduled.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to unschedule this appearance.");
    }
  }
  async function saveTheme() {
    try {
      await saveAppearanceTheme(session, {
        name: form.name.trim(),
        logo_url: form.logo_url.trim() || null,
        primary_color: form.primary_color,
        accent_color: form.accent_color,
      });
      setThemes(await loadAppearanceThemes(session));
      setMessage(`${form.name.trim()} was saved to your theme library.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save this theme.");
    }
  }
  function loadTheme(theme: Awaited<ReturnType<typeof loadAppearanceThemes>>[number]) {
    setForm({
      ...form,
      name: theme.name,
      logo_url: theme.logo_url || "",
      primary_color: theme.primary_color,
      accent_color: theme.accent_color,
    });
    displayAppearance(theme);
    setMessage(`${theme.name} loaded. Choose dates to schedule it, or adjust it and save as another theme.`);
  }
  async function removeTheme(themeId: string, themeName: string) {
    if (!window.confirm(`Delete the saved theme “${themeName}”? Existing scheduled campaigns will not be changed.`)) return;
    try {
      await deleteAppearanceTheme(session, themeId);
      setThemes(await loadAppearanceThemes(session));
      setMessage(`${themeName} was removed from the theme library.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete this theme.");
    }
  }
  return <section className="page-section settings-page">
    <div className="section-title"><div><p className="eyebrow">SITE OWNER</p><h1>Site appearance</h1><p>Save reusable themes or schedule a temporary appearance for every user.</p></div><button className="secondary" onClick={restore}>Restore default view</button></div>
    <article className="panel theme-library">
      <div className="panel-head"><div><p className="eyebrow">SAVED THEMES</p><h2>Theme library</h2><p>Load a saved logo and color scheme into the scheduler whenever you need it.</p></div></div>
      <div className="theme-library-grid">{themes.map((theme) => <div className="theme-card" key={theme.id}><div className="theme-swatches"><span style={{ background: theme.primary_color }} /><span style={{ background: theme.accent_color }} /></div><div><strong>{theme.name}</strong><small>{theme.logo_url ? "Custom logo included" : "Default logo"}</small></div><button className="secondary" onClick={() => loadTheme(theme)}>Load</button><button className="text-button theme-delete" onClick={() => removeTheme(theme.id, theme.name)}>Delete</button></div>)}{!themes.length && <p className="empty-theme-library">No saved themes yet. Configure one below and choose “Save to theme library.”</p>}</div>
    </article>
    <div className="appearance-grid">
      <article className="panel settings-card appearance-form">
        <label>Theme or campaign name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Temporary logo URL<input type="url" value={form.logo_url} onChange={(event) => setForm({ ...form, logo_url: event.target.value })} placeholder="Optional HTTPS image URL" /></label>
        <label>Primary color<input type="color" value={form.primary_color} onChange={(event) => setForm({ ...form, primary_color: event.target.value })} /></label>
        <label>Accent color<input type="color" value={form.accent_color} onChange={(event) => setForm({ ...form, accent_color: event.target.value })} /></label>
        <label>Starts<input type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} /></label>
        <label>Ends<input type="datetime-local" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} /></label>
        {message && <p className="pilot-message">{message}</p>}
        <div className="appearance-form-actions"><button className="secondary" onClick={() => displayAppearance({ primary_color: form.primary_color, accent_color: form.accent_color, logo_url: form.logo_url || null })}>Preview</button><button className="secondary" disabled={form.name.trim().length < 2} onClick={saveTheme}>Save to theme library</button><button className="primary" disabled={!form.name || !form.starts_at || !form.ends_at} onClick={schedule}>Schedule appearance</button></div>
      </article>
      <article className="panel campaign-list"><div className="panel-head"><div><p className="eyebrow">SCHEDULE</p><h2>Appearance campaigns</h2></div></div>{campaigns.map((campaign) => {
        const now = Date.now();
        const status = !campaign.active || new Date(campaign.ends_at).getTime() <= now ? "Ended" : new Date(campaign.starts_at).getTime() <= now ? "Active" : "Scheduled";
        return <div className="campaign-row" key={campaign.id}><span style={{ background: campaign.primary_color || undefined }} /><div><strong>{campaign.name}</strong><small>{new Date(campaign.starts_at).toLocaleString()} – {new Date(campaign.ends_at).toLocaleString()}</small></div><b>{status}</b><button className="text-button campaign-delete" onClick={() => unschedule(campaign.id, campaign.name)}>Unschedule</button></div>;
      })}{!campaigns.length && <EmptyState>No appearance campaigns are scheduled.</EmptyState>}</article>
    </div>
  </section>;
}

function Placeholder({ title, copy }: { title: string; copy: string }) {
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">PILOT WORKSPACE</p><h1>{title}</h1><p>{copy}</p></div></div><EmptyState>This area is ready for the next pilot iteration.</EmptyState></section>;
}

function DashboardHome({
  profile,
  event,
  data,
  events,
  onNavigate,
}: {
  profile: Profile;
  event?: EventRecord;
  data: EventData;
  events: EventRecord[];
  onNavigate: (view: View) => void;
}) {
  const checkedIn = new Set(data.checkIns.filter((item) => item.status === "checked_in").map((item) => item.official_id)).size;
  const roleLabel = profile.role === "admin" ? "Administrator" : profile.role === "assignor" ? "Assignor" : profile.role === "coach" ? "Referee coach" : "Referee";
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const relevantEvents = events.filter((item) => new Date(`${item.ends_on}T23:59:59`).getTime() >= sevenDaysAgo)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  return <section className="page-section dashboard-home">
    <div className="welcome">
      <div><p className="eyebrow">DASHBOARD</p><h1>Welcome, {profile.full_name.split(" ")[0]}.</h1><p>Your events, assignments, and tournament-day tools in one place.</p></div>
    </div>
    <div className="metrics dashboard-metrics">
      <article><span className="metric-icon green">◇</span><div><strong>{events.length}</strong><p>Available events</p></div></article>
      <article><span className="metric-icon blue">☷</span><div><strong>{data.games.length}</strong><p>Games in active event</p></div></article>
      <article><span className="metric-icon green">✓</span><div><strong>{checkedIn}</strong><p>Officials checked in</p></div></article>
      <article><span className="metric-icon blue">◎</span><div><strong className="role-metric">{roleLabel}</strong><p>Your account role</p></div></article>
    </div>
    <div className="dashboard-grid">
      <article className="panel dashboard-event">
        <div className="panel-head"><div><p className="eyebrow">CURRENT AND UPCOMING</p><h2>{relevantEvents.length} active events</h2></div></div>
        {relevantEvents.length ? <div className="dashboard-event-body dashboard-event-list">
          {relevantEvents.map((item) => <p className={item.id === event?.id ? "selected-dashboard-event" : ""} key={item.id}><strong>{item.name}</strong><span>{formatDate(item.starts_on)} through {formatDate(item.ends_on)} · {item.venue_name}</span></p>)}
          <div className="dashboard-actions">
            <button className="primary" onClick={() => onNavigate(profile.role === "referee" ? "board" : "schedule")}>{profile.role === "referee" ? "Open my day" : "View schedule"}</button>
            <button className="secondary" onClick={() => onNavigate("checkin")}>Check-in tools</button>
          </div>
        </div> : <div className="empty-dashboard"><p>No tournament is available yet.</p>{profile.role !== "referee" && <button className="primary" onClick={() => onNavigate("import")}>Import an event</button>}</div>}
      </article>
      <article className="panel dashboard-quick">
        <div className="panel-head"><div><p className="eyebrow">QUICK ACCESS</p><h2>Account and organization</h2></div></div>
        <button onClick={() => onNavigate("account")}><span>Personal details</span><b>Account settings →</b></button>
        <button onClick={() => onNavigate("groups")}><span>Membership</span><b>View my groups →</b></button>
      </article>
    </div>
  </section>;
}

function AccountSettings({
  session,
  profile,
  onUpdated,
}: {
  session: Law18Session;
  profile: Profile;
  onUpdated: (profile: Profile) => void;
}) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [preferredName, setPreferredName] = useState(profile.preferred_name || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [dateOfBirth, setDateOfBirth] = useState(profile.date_of_birth || "");
  const [secondaryEmail, setSecondaryEmail] = useState(profile.secondary_email || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const minor = Boolean(dateOfBirth && new Date(dateOfBirth) > new Date(new Date().setFullYear(new Date().getFullYear() - 18)));
  async function save() {
    if (minor && !secondaryEmail.trim()) {
      setMessage("A parent or guardian email is required for referees under 18.");
      return;
    }
    if (secondaryEmail.trim().toLowerCase() === profile.email.trim().toLowerCase()) {
      setMessage("The secondary email must be different from the primary email.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateOwnProfile(session, {
        full_name: fullName.trim(),
        preferred_name: preferredName.trim() || null,
        phone: phone.trim() || null,
        date_of_birth: dateOfBirth || null,
        secondary_email: secondaryEmail.trim().toLowerCase() || null,
      });
      if (updated) onUpdated(updated);
      setMessage("Your account details were saved.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save your account.");
    } finally {
      setBusy(false);
    }
  }
  return <section className="page-section settings-page">
    <div className="section-title"><div><p className="eyebrow">ACCOUNT SETTINGS</p><h1>Personal information</h1><p>Keep the details your organizations may need current.</p></div></div>
    <article className="panel settings-card">
      <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
      <label>Preferred name<input value={preferredName} onChange={(event) => setPreferredName(event.target.value)} placeholder="Optional" /></label>
      <label>Primary email<input value={profile.primary_email || profile.email} disabled /></label>
      <label>Date of birth<input type="date" required value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} /></label>
      <label>{minor ? "Parent or guardian email" : "Secondary email"}<input type="email" required={minor} value={secondaryEmail} onChange={(event) => setSecondaryEmail(event.target.value)} placeholder={minor ? "Required for referees under 18" : "Optional"} /></label>
      <label>Phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Optional" /></label>
      <label>Role<input value={profile.role} disabled /></label>
      {message && <p className="pilot-message">{message}</p>}
      <button className="primary" disabled={busy || !fullName.trim()} onClick={save}>{busy ? "Saving…" : "Save account details"}</button>
    </article>
  </section>;
}

function GroupsSettings({
  session,
  organization,
}: {
  session: Law18Session;
  organization: OrganizationRecord | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function leave() {
    if (!window.confirm(`Leave ${organization?.name || "this group"}? You will lose access to its events and schedules.`)) return;
    setBusy(true);
    try {
      await leaveCurrentOrganization(session);
      auth.signOut();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to leave this group.");
      setBusy(false);
    }
  }
  return <section className="page-section settings-page">
    <div className="section-title"><div><p className="eyebrow">GROUPS</p><h1>Organization membership</h1><p>Review the organizations connected to your account.</p></div></div>
    <article className="panel group-card">
      <span className="group-mark">{organization?.name?.[0] || "L"}</span>
      <div><h2>{organization?.name || "Current organization"}</h2><p>Your events and assignments from this organization appear in Law18Ref.</p></div>
      <button className="danger-button" disabled={busy} onClick={leave}>{busy ? "Leaving…" : "Leave group"}</button>
      {message && <p className="group-message">{message}</p>}
    </article>
  </section>;
}

function SiteGroupsAdmin({ session, ownerEmail, onOpen }: { session: Law18Session; ownerEmail: string; onOpen: (organizationId: string) => void }) {
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ organization: OrganizationRecord; action: "deactivate" | "delete" } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [editing, setEditing] = useState<OrganizationRecord | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showDeactivated, setShowDeactivated] = useState(false);
  const refreshOrganizations = useCallback(async () => {
    setOrganizations(await loadOrganizations(session));
  }, [session]);

  useEffect(() => {
    refreshOrganizations().catch((reason) => setMessage(reason instanceof Error ? reason.message : "Unable to load organizations."));
  }, [refreshOrganizations]);

  async function create() {
    setBusy(true);
    setMessage("");
    try {
      const created = await createOrganization(session, name.trim());
      setName("");
      await refreshOrganizations();
      setMessage(`${created.name} was created. You can now add organization administrators and events.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to create the organization.");
    } finally {
      setBusy(false);
    }
  }

  async function reactivate(organization: OrganizationRecord) {
    setBusy(true);
    setMessage("");
    try {
      await reactivateOrganization(session, organization.id);
      await refreshOrganizations();
      setMessage(`${organization.name} is active again.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to reactivate the organization.");
    } finally {
      setBusy(false);
    }
  }

  async function saveOrganizationSettings() {
    if (!editing) return;
    setBusy(true);
    setMessage("");
    try {
      await updateOrganizationName(session, editing.id, editingName);
      setEditing(null);
      await refreshOrganizations();
      setMessage("Organization settings saved.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save organization settings.");
    } finally {
      setBusy(false);
    }
  }

  async function requestVerification() {
    if (!pending) return;
    if (pending.action === "delete" && confirmName.trim() !== pending.organization.name) {
      setMessage(`Type “${pending.organization.name}” exactly to confirm permanent deletion.`);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const refreshed = await auth.verifyPassword(ownerEmail, password);
      const challengeId = await beginOrganizationAction(refreshed, pending.organization.id, pending.action);
      await auth.sendOrganizationVerification(ownerEmail, challengeId);
      setPending(null);
      setPassword("");
      setConfirmName("");
      setMessage(`Verification email sent to ${ownerEmail}. Open its link within 15 minutes to ${pending.action} ${pending.organization.name}.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to start email verification.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="page-section site-groups-page">
    <div className="section-title"><div><p className="eyebrow">SITE OWNER · GROUPS</p><h1>Organizations</h1><p>Create and manage every organization using Law18Ref.</p></div></div>
    <div className="organization-admin-grid">
      <article className="panel create-organization-card">
        <div className="panel-head"><div><p className="eyebrow">NEW ORGANIZATION</p><h2>Create a group</h2><p>Only the site owner can create organizations.</p></div></div>
        <label>Organization name<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Example Soccer Association" /></label>
        <button className="primary" disabled={busy || name.trim().length < 2} onClick={create}>{busy ? "Working…" : "Create organization"}</button>
      </article>
      <article className="panel organization-safety">
        <p className="eyebrow">SAFE ORGANIZATION CONTROL</p>
        <h2>Deactivate before deleting</h2>
        <p>Deactivation immediately suspends access and changes while preserving all records. It is reversible. Permanent deletion becomes available after seven days and cannot be undone.</p>
      </article>
    </div>
    {message && <p className="pilot-message organization-message">{message}</p>}
    {organizations.some((item) => item.active === false) && <button className="secondary collapsed-section-control" onClick={() => setShowDeactivated((value) => !value)}>{showDeactivated ? "Collapse" : "Show"} deactivated groups ({organizations.filter((item) => item.active === false).length})</button>}
    <div className="organization-list">
      {organizations.filter((item) => item.active !== false || showDeactivated).map((item) => {
        const deleteAvailable = Boolean(item.deactivated_at && Date.now() - new Date(item.deactivated_at).getTime() >= 7 * 24 * 60 * 60 * 1000);
        return <article className={`panel organization-admin-row ${item.active === false ? "deactivated" : ""}`} key={item.id}>
          <span className="group-mark">{item.name[0]}</span>
          <div><h2>{item.name}</h2><p>{item.slug}</p><span className={`status ${item.active === false ? "missing" : "ready"}`}><b />{item.active === false ? "Deactivated" : "Active"}</span></div>
          <div className="organization-actions">
            {item.active !== false && <button className="primary" onClick={() => onOpen(item.id)}>Open organization</button>}
            <button className="secondary" onClick={() => { setEditing(item); setEditingName(item.name); }}>Settings</button>
            {item.active === false
              ? <>
                <button className="secondary" disabled={busy} onClick={() => reactivate(item)}>Reactivate</button>
                <button className="danger-button" disabled={busy || !deleteAvailable} title={deleteAvailable ? "Permanently delete organization" : "Available seven days after deactivation"} onClick={() => { setPending({ organization: item, action: "delete" }); setMessage(""); }}>Delete permanently</button>
              </>
              : <button className="danger-button" disabled={busy} onClick={() => { setPending({ organization: item, action: "deactivate" }); setMessage(""); }}>Deactivate</button>}
          </div>
          {item.active === false && item.deactivated_at && <small className="deactivation-note">Deactivated {formatDate(item.deactivated_at)}{deleteAvailable ? " · Eligible for permanent deletion" : " · Seven-day recovery period in progress"}</small>}
        </article>;
      })}
      {!organizations.length && <article className="panel empty-state">No organizations have been created yet.</article>}
    </div>
    {pending && <div className="confirmation-backdrop" role="presentation">
      <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="organization-confirm-title">
        <p className="eyebrow">{pending.action === "delete" ? "PERMANENT ACTION" : "SECURITY CONFIRMATION"}</p>
        <h2 id="organization-confirm-title">{pending.action === "delete" ? "Permanently delete" : "Deactivate"} {pending.organization.name}?</h2>
        <p>{pending.action === "delete"
          ? "This permanently removes the organization and all connected events, schedules, officials, ratings, and history. It cannot be recovered."
          : "Members will lose access and event operations will stop. All data remains stored and the organization can be reactivated."}</p>
        {pending.action === "delete" && <label>Type the organization name<input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} /></label>}
        <label>Confirm your password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <p className="verification-note">After password confirmation, Law18Ref will email you a one-time verification link. The action occurs only when you open that link.</p>
        <div><button className="secondary" disabled={busy} onClick={() => { setPending(null); setPassword(""); setConfirmName(""); }}>Cancel</button><button className="danger-button" disabled={busy || !password} onClick={requestVerification}>{busy ? "Verifying…" : "Email verification link"}</button></div>
      </section>
    </div>}
    {editing && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog" role="dialog" aria-modal="true"><p className="eyebrow">ORGANIZATION SETTINGS</p><h2>{editing.name}</h2><label>Organization name<input value={editingName} maxLength={120} onChange={(event) => setEditingName(event.target.value)} /></label><p className="verification-note">The internal organization address remains unchanged so imports and existing links continue working.</p><div><button className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={busy || editingName.trim().length < 2} onClick={saveOrganizationSettings}>{busy ? "Saving…" : "Save settings"}</button></div></section></div>}
  </section>;
}

function Dashboard({ session }: { session: Law18Session }) {
  const [view, setView] = useState<View>("dashboard");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<OrganizationRecord | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [organizationRoles, setOrganizationRoles] = useState<MembershipRole[]>([]);
  const [eventRoles, setEventRoles] = useState<MembershipRole[]>([]);
  const [organizationOfficials, setOrganizationOfficials] = useState<OfficialRecord[]>([]);
  const [allEvents, setAllEvents] = useState<EventRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventId, setEventId] = useState("");
  const [data, setData] = useState<EventData>({ games: [], assignments: [], officials: [], checkIns: [], assessments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [organizationActionMessage, setOrganizationActionMessage] = useState("");
  const [qrCheckInMessage, setQrCheckInMessage] = useState("");
  const allRoles = new Set<MembershipRole>([
    ...(profile?.is_site_owner ? ["site_owner" as MembershipRole] : []),
    ...organizationRoles,
    ...eventRoles,
  ]);
  const isStaff = ["site_owner", "organization_admin", "event_admin", "assignor"].some((role) => allRoles.has(role as MembershipRole));
  const isCoach = allRoles.has("referee_coach");
  const canAssess = isCoach || isStaff;
  const canConfigureRatings = ["site_owner", "organization_admin", "event_admin"].some((role) => allRoles.has(role as MembershipRole));
  const event = events.find((item) => item.id === eventId);

  const refresh = useCallback(async (selectedId = eventId) => {
    if (!selectedId) return;
    setData(await loadEventData(session, selectedId));
  }, [eventId, session]);

  useEffect(() => {
    (async () => {
      try {
        await linkCurrentReferee(session);
        const [currentProfile, availableEvents, memberships, availableOrganizations] = await Promise.all([loadProfile(session), loadEvents(session), loadMemberships(session), loadOrganizations(session)]);
        setProfile(currentProfile);
        setOrganizations(availableOrganizations.filter((item) => item.active !== false));
        setAllEvents(availableEvents);
        const eventSlug = new URLSearchParams(window.location.search).get("event");
        const linkedEvent = availableEvents.find((item) => item.check_in_slug === eventSlug);
        const storedOrganizationId = localStorage.getItem("law18ref-active-organization");
        const organizationId = linkedEvent?.organization_id
          || (availableOrganizations.some((item) => item.id === storedOrganizationId && item.active !== false) ? storedOrganizationId : null)
          || memberships.organizations[0]?.organization_id
          || currentProfile?.organization_id
          || availableOrganizations.find((item) => item.active !== false)?.id;
        if (currentProfile && organizationId) {
          setOrganization(availableOrganizations.find((item) => item.id === organizationId) || await loadOrganization(session, organizationId));
          setOrganizationOfficials(await loadOrganizationOfficials(session, organizationId));
          localStorage.setItem("law18ref-active-organization", organizationId);
        }
        const organizationEvents = availableEvents.filter((item) => item.organization_id === organizationId);
        setEvents(organizationEvents);
        const selected = organizationEvents.find((item) => item.check_in_slug === eventSlug)?.id || organizationEvents[0]?.id || "";
        setOrganizationRoles(memberships.organizations.filter((membership) => membership.organization_id === organizationId).map((membership) => membership.role));
        setEventRoles(memberships.events.filter((membership) => membership.event_id === selected).map((membership) => membership.role));
        setEventId(selected);
        if (selected) {
          let selectedData = await loadEventData(session, selected);
          const scannedDate = new URLSearchParams(window.location.search).get("date");
          if (eventSlug && scannedDate) {
            setView("checkin");
            const selectedEvent = organizationEvents.find((item) => item.id === selected);
            const official = selectedData.officials.find((item) => item.linked_user_id === session.user.id || item.email?.toLowerCase() === session.user.email?.toLowerCase());
            const assignedThatDay = Boolean(official && selectedData.assignments.some((assignment) =>
              assignment.official_id === official.id
              && selectedData.games.some((game) => game.id === assignment.game_id && game.starts_at.startsWith(scannedDate))));
            const today = selectedEvent
              ? new Intl.DateTimeFormat("en-CA", { timeZone: selectedEvent.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
              : "";
            if (!selectedEvent || selectedEvent.check_in_slug !== eventSlug || scannedDate < today || !official || !assignedThatDay) {
              setQrCheckInMessage("This QR code does not match one of your assigned event days.");
            } else {
              try {
                await checkIn(session, selectedEvent.id, official.id, "qr", scannedDate);
                selectedData = await loadEventData(session, selected);
                setQrCheckInMessage(`You are checked in for ${formatDate(scannedDate)} as ${official.full_name}.`);
              } catch (reason) {
                setQrCheckInMessage(reason instanceof Error ? reason.message : "The QR code was valid, but check-in could not be recorded.");
              }
            }
          }
          setData(selectedData);
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to load Law18Referee Management.");
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  useEffect(() => {
    const challengeId = new URLSearchParams(window.location.search).get("organization_action");
    if (!challengeId) return;
    completeOrganizationAction(session, challengeId).then((result) => {
      setOrganizationActionMessage(result);
      setView("groups");
      history.replaceState(null, "", window.location.pathname);
    }).catch((reason) => {
      setOrganizationActionMessage(reason instanceof Error ? reason.message : "Unable to complete the organization action.");
      setView("groups");
      history.replaceState(null, "", window.location.pathname);
    });
  }, [session]);

  useEffect(() => {
    loadAppearanceCampaigns(session).then((campaigns) => {
      const now = Date.now();
      const active = campaigns.find((campaign) => campaign.active && new Date(campaign.starts_at).getTime() <= now && new Date(campaign.ends_at).getTime() > now);
      displayAppearance(active);
    }).catch(() => undefined);
  }, [session, view]);

  async function switchEvent(nextId: string) {
    setEventId(nextId);
    setLoading(true);
    try {
      const [nextData, memberships] = await Promise.all([loadEventData(session, nextId), loadMemberships(session)]);
      setData(nextData);
      setEventRoles(memberships.events.filter((membership) => membership.event_id === nextId).map((membership) => membership.role));
    } finally {
      setLoading(false);
    }
  }

  async function switchOrganization(nextId: string, nextView?: View) {
    let nextOrganization = organizations.find((item) => item.id === nextId);
    if (!nextOrganization) {
      const refreshedOrganizations = (await loadOrganizations(session)).filter((item) => item.active !== false);
      setOrganizations(refreshedOrganizations);
      nextOrganization = refreshedOrganizations.find((item) => item.id === nextId);
    }
    if (!nextOrganization) return;
    setLoading(true);
    try {
      localStorage.setItem("law18ref-active-organization", nextId);
      setOrganization(nextOrganization);
      const nextEvents = allEvents.filter((item) => item.organization_id === nextId);
      setEvents(nextEvents);
      const [nextOfficials, memberships] = await Promise.all([loadOrganizationOfficials(session, nextId), loadMemberships(session)]);
      setOrganizationOfficials(nextOfficials);
      const nextEventId = nextEvents[0]?.id || "";
      setEventId(nextEventId);
      setOrganizationRoles(memberships.organizations.filter((membership) => membership.organization_id === nextId).map((membership) => membership.role));
      setEventRoles(memberships.events.filter((membership) => membership.event_id === nextEventId).map((membership) => membership.role));
      setData(nextEventId ? await loadEventData(session, nextEventId) : { games: [], assignments: [], officials: [], checkIns: [], assessments: [] });
      if (nextView) setView(nextView);
    } finally {
      setLoading(false);
    }
  }

  async function handleImported(newEvent: EventRecord) {
    const nextEvents = await loadEvents(session);
    setAllEvents(nextEvents);
    setEvents(nextEvents.filter((item) => item.organization_id === organization?.id));
    await switchEvent(newEvent.id);
  }

  function handleEventUpdated(updated: EventRecord) {
    setEvents((current) => current.map((item) => item.id === updated.id ? updated : item));
    setAllEvents((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  const refereeOfficial = data.officials.find((item) => item.linked_user_id === session.user.id || item.email?.toLowerCase() === session.user.email?.toLowerCase());
  const todayInEvent = event
    ? new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
    : "";
  const refereeHasCurrentOrFutureAssignment = Boolean(refereeOfficial && data.assignments.some((assignment) => {
    if (assignment.official_id !== refereeOfficial.id) return false;
    const game = data.games.find((item) => item.id === assignment.game_id);
    if (!game || !event) return false;
    const gameDate = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(game.starts_at));
    return gameDate >= todayInEvent;
  }));

  const nav: [View, string][] = isStaff
    ? [["dashboard", "Dashboard"], ["board", "Assignment Board"], ["checkin", "Check-In"], ["schedule", "Schedule"], ["officials", "Officials"], ["coaching", "Coaching"], ["assessments", "Ratings"], ["import", "Import"]]
    : isCoach
      ? [["dashboard", "Dashboard"], ["schedule", "Schedule"], ["coaching", "Coaching"], ["assessments", "Ratings"]]
      : [["dashboard", "Dashboard"], ["board", "My Assignments"], ...(refereeHasCurrentOrFutureAssignment ? [["checkin", "Check-In"] as [View, string]] : []), ["assessments", "My Evals"]];

  if (loading) return <main className="auth-page"><p className="auth-loading">Loading tournament data…</p></main>;
  if (error) return <main className="auth-page"><section className="auth-card"><h1>Setup needed</h1><p className="auth-intro">{error}</p><p>Run the latest Law18Referee Management Supabase migration, then reload this page.</p><button className="secondary wide" onClick={() => auth.signOut()}>Sign out</button></section></main>;

  return <main>
    <header className="topbar">
      <button className="brand" aria-label="Law18Referee Management dashboard" onClick={() => setView("dashboard")}><Mark /></button>
      <nav>{nav.map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</nav>
      <div className="account-menu">
        <button className="avatar account-avatar" aria-label="Open account menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}>{initials(profile?.full_name || session.user.email || "RH")}</button>
        {accountOpen && <div className="account-popover">
          <div className="account-identity"><strong>{profile?.full_name}</strong><span>{profile?.email}</span></div>
          <div className="account-roles">{[...allRoles].map((role) => <span key={role}>{roleNames[role]}</span>)}</div>
          <button onClick={() => { setView("account"); setAccountOpen(false); }}><span>⚙</span><div><strong>Account settings</strong><small>Personal information</small></div></button>
          <button onClick={() => { setView("groups"); setAccountOpen(false); }}><span>♙</span><div><strong>Groups</strong><small>Organization membership</small></div></button>
          {allRoles.has("site_owner") && <button onClick={() => { setView("appearance"); setAccountOpen(false); }}><span>◐</span><div><strong>Site appearance</strong><small>Theme and schedule</small></div></button>}
          <button className="signout-menu" onClick={() => auth.signOut()}><span>↪</span><div><strong>Sign out</strong></div></button>
        </div>}
      </div>
    </header>
    <div className="eventbar">
      <div><span className="event-mark">{organization?.name[0] || "R"}</span>{organizations.length > 1 && <label><span>Active organization</span><select value={organization?.id || ""} onChange={(event) => switchOrganization(event.target.value)}>{organizations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}<label><span>{isStaff ? "Active event" : "My event"}</span><select value={eventId} onChange={(event) => switchEvent(event.target.value)} disabled={!events.length}><option value="">{events.length ? "Select event" : "No events yet"}</option>{events.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
      <span>{event ? formatDate(event.starts_on) : "No event imported"}</span>
    </div>
    <div className="shell">
      {organizationActionMessage && <p className="pilot-message organization-message">{organizationActionMessage}</p>}
      {qrCheckInMessage && <p className="pilot-message qr-checkin-message">{qrCheckInMessage}</p>}
      {profile && view === "dashboard" && <DashboardHome profile={profile} event={event} data={data} events={events} onNavigate={setView} />}
      {event && view === "board" && (isStaff ? <AssignmentBoard data={data} /> : <RefereeDay event={event} data={data} session={session} />)}
      {event && view === "checkin" && (isStaff ? <CheckInView event={event} data={data} /> : refereeHasCurrentOrFutureAssignment ? <RefereeCheckIn event={event} data={data} session={session} onCheckedIn={() => refresh(event.id)} /> : null)}
      {event && view === "schedule" && (isStaff || isCoach) && <ScheduleView session={session} event={event} data={data} onCreated={() => refresh(event.id)} />}
      {profile && organization && view === "officials" && <OfficialsDirectory session={session} profile={profile} organizationRoles={organizationRoles} eventRoles={eventRoles} canManageOrganizationRoles={Boolean(profile.is_site_owner || organizationRoles.includes("organization_admin"))} organizationId={organization.id} officials={organizationOfficials} data={data} event={event} events={events} onCreated={() => loadOrganizationOfficials(session, organization.id).then(setOrganizationOfficials)} />}
      {event && view === "coaching" && <Placeholder title="Coaching assignments" copy="Assign coaches to this event and its matches." />}
      {event && organization && view === "assessments" && <AssessmentCenter session={session} event={event} events={events} organizationId={organization.id} data={data} canSubmit={canAssess} canConfigure={canConfigureRatings} onSaved={() => refresh(event.id)} onEventUpdated={handleEventUpdated} />}
      {isStaff && organization && view === "import" && profile && <ImportView session={session} profile={profile} organizationId={organization.id} organization={organization} events={events} canConfigureAliases={canConfigureRatings} onImported={handleImported} />}
      {profile && view === "account" && <AccountSettings session={session} profile={profile} onUpdated={setProfile} />}
      {view === "groups" && (allRoles.has("site_owner")
        ? <SiteGroupsAdmin session={session} ownerEmail={profile?.primary_email || profile?.email || session.user.email || ""} onOpen={(organizationId) => switchOrganization(organizationId, "dashboard")} />
        : <GroupsSettings session={session} organization={organization} />)}
      {view === "appearance" && allRoles.has("site_owner") && <AppearanceSettings session={session} />}
    </div>
    <footer><div className="brand footer-brand"><Mark /></div><span>© 2026 Law18Ref · Version 0.4.3</span></footer>
  </main>;
}

export default function Home() {
  const [session, setSession] = useState<Law18Session | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [loading, setLoading] = useState(true);
  const handleSession = useCallback((nextSession: Law18Session) => {
    setRecovery(false);
    setSession(nextSession);
  }, []);
  useEffect(() => {
    const initial = auth.initialize();
    // Authentication is stored outside React and hydrated once on startup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(initial.recovery ? null : initial.session);
    setRecovery(initial.recovery);
    setLoading(false);
    return auth.subscribe(setSession);
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  if (loading) return <main className="auth-page"><p className="auth-loading">Loading Law18Referee Management…</p></main>;
  if (!session || recovery) return <AuthPanel onSession={handleSession} recovery={recovery} />;
  return <Dashboard session={session} />;
}
