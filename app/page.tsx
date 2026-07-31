"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AuthPanel } from "./auth-panel";
import { auth, isSessionExpiredError, type Law18Session } from "./auth-client";
import {
  archiveEvent,
  approvePublicRating,
  bulkManageRecords,
  checkIn,
  claimOrganizationJoinLink,
  createCoachAssignment,
  createOrganizationJoinLink,
  beginOrganizationAction,
  completeOrganizationAction,
  configureEventAutoArchive,
  createEvent,
  createGame,
  createOfficial,
  createOrganization,
  createAppearanceCampaign,
  deleteAppearanceCampaign,
  deleteAppearanceTheme,
  deleteCoachAssignment,
  deleteRating,
  importTournament,
  importOfficials,
  leaveCurrentOrganization,
  linkCurrentReferee,
  loadEventData,
  loadEvents,
  loadAppearanceCampaigns,
  loadAppearanceThemes,
  loadArchivedEvents,
  loadAuthorizedRatingHistory,
  loadEventCheckIns,
  loadOrganization,
  loadOrganizationActivity,
  loadOrganizationJoinLinks,
  loadOrganizations,
  loadOrganizationOfficials,
  loadProfile,
  loadMemberships,
  loadUserEventMemberships,
  logRatingExport,
  mergeOrganizationAccounts,
  markEventRatingsSeen,
  parseAssignrCsv,
  parseAssignrOfficialsCsv,
  saveAssessment,
  setRatingArchived,
  saveUserEventAccess,
  restoreDefaultAppearance,
  restoreEvent,
  saveAppearanceTheme,
  reactivateOrganization,
  recordCurrentLogin,
  removeOrganizationMember,
  setOrganizationJoinLinkActive,
  updateOrganizationSettings,
  updateOfficial,
  updateEventRatingSettings,
  updatePositionTitleAliases,
  uploadAppearanceLogo,
  uploadOrganizationLogo,
  positionAliasKey,
  updateOwnProfile,
  undoCheckIn,
  zonedLocalDateTimeToIso,
  type AssignmentRecord,
  type CheckInRecord,
  type CoachAssignmentRecord,
  type EventRecord,
  type EventMembership,
  type GameRecord,
  type ImportRow,
  type OfficialRecord,
  type OfficialImportRow,
  type OfficialImportResult,
  type AssessmentRecord,
  type MembershipRole,
  type OrganizationRecord,
  type AuditRecord,
  type Profile,
} from "./supabase-client";

type View = "dashboard" | "board" | "checkin" | "schedule" | "officials" | "coaching" | "assessments" | "import" | "activity" | "appearance" | "account" | "groups";
const refreshableViews: View[] = ["dashboard", "board", "checkin", "schedule", "officials", "coaching", "assessments", "import", "activity", "appearance", "account", "groups"];
type EventData = {
  games: GameRecord[];
  assignments: AssignmentRecord[];
  officials: OfficialRecord[];
  checkIns: CheckInRecord[];
  assessments: AssessmentRecord[];
  coachAssignments: CoachAssignmentRecord[];
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
  site_coordinator: "Site coordinator",
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

function isRateableGame(game: GameRecord) {
  return !game.operational
    && !`${game.field_name} ${game.venue_name || ""}`.toLowerCase().includes("hq");
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

function BoardGameTile({ game, data, officials }: { game: GameRecord; data: EventData; officials: Map<string, OfficialRecord> }) {
  const crew = data.assignments.filter((assignment) => assignment.game_id === game.id);
  return <article className="board-game">
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
  </article>;
}

function AssignmentBoard({ data }: { data: EventData }) {
  const officials = useMemo(() => new Map(data.officials.map((official) => [official.id, official])), [data.officials]);
  const [boardView, setBoardView] = useState<"grid" | "field" | "first_assignment">("grid");
  const [collapsedFields, setCollapsedFields] = useState<Set<string>>(new Set());
  const fields = [...new Set(data.games.map((game) => game.field_name))];
  const times = [...new Map(data.games.map((game) => [formatTime(game.starts_at), timeSortValue(game.starts_at)])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);
  const firstAssignments = data.officials.map((official) => {
    const first = data.assignments
      .filter((assignment) => assignment.official_id === official.id)
      .map((assignment) => ({ assignment, game: data.games.find((game) => game.id === assignment.game_id) }))
      .filter((item): item is { assignment: AssignmentRecord; game: GameRecord } => Boolean(item.game))
      .sort((a, b) => a.game.starts_at.localeCompare(b.game.starts_at))[0];
    return first ? { official, ...first } : null;
  }).filter((item): item is { official: OfficialRecord; assignment: AssignmentRecord; game: GameRecord } => Boolean(item))
    .sort((a, b) => {
      const timeOrder = a.game.starts_at.localeCompare(b.game.starts_at);
      if (timeOrder) return timeOrder;
      const fieldOrder = a.game.field_name.localeCompare(b.game.field_name, undefined, { numeric: true, sensitivity: "base" });
      if (fieldOrder) return fieldOrder;
      const aLastName = a.official.full_name.trim().split(/\s+/).at(-1) || a.official.full_name;
      const bLastName = b.official.full_name.trim().split(/\s+/).at(-1) || b.official.full_name;
      return aLastName.localeCompare(bLastName, undefined, { sensitivity: "base" })
        || a.official.full_name.localeCompare(b.official.full_name, undefined, { sensitivity: "base" });
    });
  if (!data.games.length) return <EmptyState>Import a schedule to populate the assignment board.</EmptyState>;
  return (
    <section className="page-section">
      <div className="section-title">
        <div><p className="eyebrow">LIVE ASSIGNMENT BOARD</p><h1>Full-day staffing</h1><p>Checked-in officials are highlighted as arrivals happen.</p></div>
        <div className="legend"><Status checked /><Status checked={false} /></div>
      </div>
      <div className="board-view-tools panel"><span>View</span><div className="segmented"><button className={boardView === "grid" ? "active" : ""} onClick={() => setBoardView("grid")}>Time and Field Grid</button><button className={boardView === "field" ? "active" : ""} onClick={() => setBoardView("field")}>By Field</button><button className={boardView === "first_assignment" ? "active" : ""} onClick={() => setBoardView("first_assignment")}>First Assignment</button></div></div>
      {boardView === "grid" && <div className="board-wrap panel">
        <table className="assignment-board">
          <thead><tr><th>Time</th>{fields.map((field) => <th key={field}>{field}</th>)}</tr></thead>
          <tbody>{times.map((time) => (
            <tr key={time}><th>{time}</th>{fields.map((field) => {
              const game = data.games.find((item) => item.field_name === field && formatTime(item.starts_at) === time);
              if (!game) return <td key={field} className="board-empty">—</td>;
              return <td key={field}>
                <BoardGameTile game={game} data={data} officials={officials} />
              </td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>}
      {boardView === "field" && <div className="field-board-list">{fields.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((field) => {
        const collapsed = collapsedFields.has(field);
        const games = data.games.filter((game) => game.field_name === field).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        return <article className="panel field-board-group" key={field}><button className="field-board-heading" onClick={() => setCollapsedFields((current) => {
          const next = new Set(current);
          if (next.has(field)) next.delete(field); else next.add(field);
          return next;
        })}><span><strong>{field}</strong><small>{games.length} game{games.length === 1 ? "" : "s"}</small></span><b>{collapsed ? "+" : "−"}</b></button>{!collapsed && <div className="field-board-games">{games.map((game) => <div className="field-board-game" key={game.id}><time><strong>{formatTime(game.starts_at)}</strong><small>{formatDate(game.starts_at)}</small></time><BoardGameTile game={game} data={data} officials={officials} /></div>)}</div>}</article>;
      })}</div>}
      {boardView === "first_assignment" && <div className="panel first-assignment-board"><div className="first-assignment-row first-assignment-head"><span>Official</span><span>First Assignment</span><span>Field</span><span>Position</span><span>Status</span></div>{firstAssignments.map(({ official, assignment, game }) => {
        const checked = data.checkIns.some((item) => item.official_id === official.id && item.event_date === game.starts_at.slice(0, 10) && item.status === "checked_in");
        return <div className={`first-assignment-row ${checked ? "arrived" : ""}`} key={official.id}><span className="official-name-cell"><span className="avatar">{initials(official.full_name)}</span><strong>{official.full_name}</strong></span><span><strong>{formatTime(game.starts_at)}</strong><small>{formatDate(game.starts_at)}</small></span><span>{game.field_name}</span><span>{positionLabel(assignment.position, assignment.position_title)}</span><Status checked={checked} /></div>;
      })}</div>}
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
    <button className="primary scan-qr-button" onClick={start} disabled={scanning}>{scanning ? "Scanning…" : "Scan QR Code"}</button>
    {message && <p className="pilot-message">{message}</p>}
  </section>;
}

function RefereeCheckIn({ event, data, session, onCheckedIn }: { event: EventRecord; data: EventData; session: Law18Session; onCheckedIn: () => void }) {
  const email = session.user.email?.toLowerCase();
  const official = data.officials.find((item) => item.email?.toLowerCase() === email || item.linked_user_id === session.user.id);
  const assignmentDates = new Set((official ? data.assignments.filter((item) => item.official_id === official.id) : [])
    .map((assignment) => data.games.find((game) => game.id === assignment.game_id)?.starts_at.slice(0, 10)).filter(Boolean));
  data.coachAssignments.filter((assignment) => assignment.coach_id === session.user.id).forEach((assignment) => {
    if (assignment.full_schedule) data.games.forEach((game) => assignmentDates.add(game.starts_at.slice(0, 10)));
    else {
      const game = data.games.find((item) => item.id === assignment.game_id);
      if (game) assignmentDates.add(game.starts_at.slice(0, 10));
    }
  });
  const [message, setMessage] = useState("");
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const selectedDate = new URLSearchParams(window.location.search).get("date") || today;
  const isCheckedIn = justCheckedIn || Boolean(official && data.checkIns.some((item) =>
    item.official_id === official.id && item.event_date === selectedDate && item.status === "checked_in"));
  async function scanned(rawValue: string) {
    if (!official) return;
    try {
      const scannedUrl = new URL(rawValue);
      const scannedEvent = scannedUrl.searchParams.get("event");
      const scannedDate = scannedUrl.searchParams.get("date");
      if (scannedUrl.origin !== window.location.origin || scannedEvent !== event.check_in_slug || !scannedDate || scannedDate < today || !assignmentDates.has(scannedDate)) {
        throw new Error("This QR code does not match one of your assigned event days.");
      }
      await checkIn(session, event.id, official.id, "qr", scannedDate);
      setJustCheckedIn(true);
      setMessage("You’re checked in. Have a great day!");
      onCheckedIn();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "That QR code could not be verified.");
    }
  }
  return <section className="page-section referee-checkin"><div className="section-title"><div><p className="eyebrow">OFFICIAL CHECK-IN</p><h1>{isCheckedIn ? "Check-in complete" : "Scan the on-site code"}</h1><p>{isCheckedIn ? `You are checked in for ${formatDate(selectedDate)}.` : "The check-in QR is displayed or printed by event staff at the venue."}</p></div></div>{!isCheckedIn && <QrScanner onFound={scanned} />}{message && <p className="pilot-message">{message}</p>}{isCheckedIn && !message && <p className="pilot-message">✓ You’re checked in. Have a great day!</p>}</section>;
}

function CheckInView({ event, data, session, canManageCheckIns, onRefresh }: { event: EventRecord; data: EventData; session: Law18Session; canManageCheckIns: boolean; onRefresh: () => Promise<void> }) {
  const eventDates = [...new Set(data.games.map((game) => game.starts_at.slice(0, 10)))].sort();
  const [eventDate, setEventDate] = useState(eventDates[0] || event.starts_on);
  const [statusFilter, setStatusFilter] = useState<"all" | "checked_in" | "expected">("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [rosterSort, setRosterSort] = useState<"first_assignment" | "last_name" | "field">("first_assignment");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [newArrivals, setNewArrivals] = useState<Set<string>>(new Set());
  const [scheduleOfficialId, setScheduleOfficialId] = useState<string | null>(null);
  const [manualCheckInOfficialId, setManualCheckInOfficialId] = useState<string | null>(null);
  const refreshingRef = useRef(false);
  const previousCheckedRef = useRef<{ date: string; ids: Set<string> } | null>(null);
  const url = `${window.location.origin}/?event=${event.check_in_slug}&date=${eventDate}`;
  const checked = new Set(data.checkIns.filter((item) => item.event_date === eventDate).map((item) => item.official_id));
  const assignedToday = new Set(data.assignments.filter((assignment) => data.games.some((game) => game.id === assignment.game_id && game.starts_at.startsWith(eventDate))).map((assignment) => assignment.official_id));
  const coachingOfficialIds = new Set<string>();
  data.coachAssignments.forEach((assignment) => {
    const appliesToday = assignment.full_schedule
      ? data.games.some((game) => game.starts_at.startsWith(eventDate))
      : data.games.some((game) => game.id === assignment.game_id && game.starts_at.startsWith(eventDate));
    const coachOfficial = data.officials.find((official) => official.linked_user_id === assignment.coach_id);
    if (appliesToday && coachOfficial) {
      assignedToday.add(coachOfficial.id);
      coachingOfficialIds.add(coachOfficial.id);
    }
  });
  const currentOfficial = data.officials.find((item) => item.linked_user_id === session.user.id || item.email?.toLowerCase() === session.user.email?.toLowerCase());
  const canSelfCheckIn = Boolean(currentOfficial && assignedToday.has(currentOfficial.id) && !checked.has(currentOfficial.id));
  const roster = data.officials.filter((official) => assignedToday.has(official.id));
  const gamesById = new Map(data.games.map((game) => [game.id, game]));
  const rosterDetails = roster.map((official) => {
    const refereeGames = data.assignments
      .filter((assignment) => assignment.official_id === official.id)
      .map((assignment) => gamesById.get(assignment.game_id))
      .filter((game): game is GameRecord => Boolean(game?.starts_at.startsWith(eventDate)));
    const coachingGames = data.coachAssignments
      .filter((assignment) => assignment.coach_id === official.linked_user_id)
      .flatMap((assignment) => assignment.full_schedule
        ? data.games.filter((game) => game.starts_at.startsWith(eventDate))
        : data.games.filter((game) => game.id === assignment.game_id && game.starts_at.startsWith(eventDate)));
    const games = [...new Map([...refereeGames, ...coachingGames].map((game) => [game.id, game])).values()]
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const firstGame = games[0];
    return {
      official,
      games,
      firstGame,
      firstSite: firstGame?.venue_name || firstGame?.field_name || "Unspecified site",
      firstField: firstGame?.field_name || "Unspecified field",
      lastName: official.full_name.trim().split(/\s+/).at(-1) || official.full_name,
      isChecked: checked.has(official.id),
      isCoachExpected: coachingOfficialIds.has(official.id),
    };
  });
  const sites = [...new Set(rosterDetails.flatMap((item) => item.games.map((game) => game.venue_name || game.field_name || "Unspecified site")))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const visibleRoster = rosterDetails
    .filter((item) => statusFilter === "all" || (statusFilter === "checked_in" ? item.isChecked : !item.isChecked))
    .filter((item) => siteFilter === "all" || item.games.some((game) => (game.venue_name || game.field_name || "Unspecified site") === siteFilter))
    .sort((a, b) => {
      if (rosterSort === "last_name") return a.lastName.localeCompare(b.lastName) || a.official.full_name.localeCompare(b.official.full_name);
      if (rosterSort === "field") return a.firstField.localeCompare(b.firstField, undefined, { numeric: true }) || (a.firstGame?.starts_at || "").localeCompare(b.firstGame?.starts_at || "");
      return (a.firstGame?.starts_at || "9999").localeCompare(b.firstGame?.starts_at || "9999") || a.lastName.localeCompare(b.lastName);
    });
  const scheduleOfficial = rosterDetails.find((item) => item.official.id === scheduleOfficialId);
  const refreshAttendance = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
      setLastUpdated(new Date());
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [onRefresh]);
  async function scanForSelf(rawValue: string) {
    if (!currentOfficial) return;
    try {
      const scannedUrl = new URL(rawValue);
      if (scannedUrl.origin !== window.location.origin || scannedUrl.searchParams.get("event") !== event.check_in_slug || scannedUrl.searchParams.get("date") !== eventDate) {
        throw new Error("This QR code does not match the selected event day.");
      }
      await checkIn(session, event.id, currentOfficial.id, "qr", eventDate);
      await refreshAttendance();
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : "That QR code could not be verified.");
    }
  }
  async function toggleManualCheckIn(official: OfficialRecord, isChecked: boolean) {
    setManualCheckInOfficialId(official.id);
    try {
      if (isChecked) await undoCheckIn(session, event.id, official.id, eventDate);
      else await checkIn(session, event.id, official.id, "assignor", eventDate);
      await refreshAttendance();
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : "Unable to update this check-in.");
    } finally {
      setManualCheckInOfficialId(null);
    }
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshAttendance().catch(() => undefined);
    }, 15000);
    const becameVisible = () => {
      if (document.visibilityState === "visible") refreshAttendance().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", becameVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", becameVisible);
    };
  }, [refreshAttendance]);
  useEffect(() => {
    const previous = previousCheckedRef.current;
    if (previous?.date === eventDate) {
      const arrivals = new Set([...checked].filter((id) => !previous.ids.has(id)));
      if (arrivals.size) {
        setNewArrivals(arrivals);
        const timer = window.setTimeout(() => setNewArrivals(new Set()), 5000);
        previousCheckedRef.current = { date: eventDate, ids: checked };
        return () => window.clearTimeout(timer);
      }
    }
    previousCheckedRef.current = { date: eventDate, ids: checked };
  }, [data.checkIns, eventDate]);
  return <section className="page-section">
    <div className="section-title"><div><p className="eyebrow">TOURNAMENT CHECK-IN</p><h1>Arrival station</h1><p>Attendance refreshes every 15 seconds while this page is visible. Last updated {lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}.</p></div><div className="checkin-refresh-tools"><label className="day-picker">Event day<select value={eventDate} onChange={(event) => { setEventDate(event.target.value); setSiteFilter("all"); }}>{eventDates.map((date) => <option value={date} key={date}>{formatDate(date)}</option>)}</select></label><button className="secondary" disabled={refreshing} onClick={() => refreshAttendance()}>{refreshing ? "Refreshing…" : "Refresh Now"}</button></div></div>
    <div className="checkin-grid">
      <article className="panel qr-panel print-qr"><div className="qr"><QRCodeSVG value={url} size={210} /></div><h2>{event.name}</h2><strong>{formatDate(eventDate)}</strong><p>{url}</p><button className="secondary print-button" onClick={() => window.print()}>Print daily QR</button></article>
      <article className="panel roster-panel"><div className="panel-head"><div><p className="eyebrow">LIVE ROSTER</p><h2>{checked.size} checked in</h2><p>{visibleRoster.length} of {roster.length} officials shown</p></div></div>
        <div className="roster-controls"><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All officials</option><option value="checked_in">Checked in</option><option value="expected">Not yet checked in</option></select></label><label>Sort by<select value={rosterSort} onChange={(event) => setRosterSort(event.target.value as typeof rosterSort)}><option value="first_assignment">First assignment time</option><option value="last_name">Last name</option><option value="field">Field</option></select></label><label>Site<select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}><option value="all">All sites</option>{sites.map((site) => <option value={site} key={site}>{site}</option>)}</select></label></div>
        {visibleRoster.map(({ official, firstGame, firstSite, isChecked, isCoachExpected }) => <div className={`official-row ${newArrivals.has(official.id) ? "new-arrival" : ""}`} key={official.id}><span className="avatar">{initials(official.full_name)}</span><div className="official-name"><button className="checkin-official-button" onClick={() => setScheduleOfficialId(official.id)}>{official.full_name}</button><span>{isCoachExpected ? `Referee Coach${firstGame ? ` · ${formatTime(firstGame.starts_at)} · ${firstSite}` : ""}` : firstGame ? `${formatTime(firstGame.starts_at)} · ${firstSite} · ${firstGame.field_name}` : "No assignment details"}</span></div><div className="checkin-status-actions"><Status checked={isChecked} />{canManageCheckIns && <button className={isChecked ? "text-button undo-checkin-button" : "secondary manual-checkin-button"} disabled={manualCheckInOfficialId === official.id} onClick={() => toggleManualCheckIn(official, isChecked)}>{manualCheckInOfficialId === official.id ? "Updating…" : isChecked ? "Undo Check-In" : "Check In"}</button>}</div></div>)}
        {!roster.length && <EmptyState>No officials are assigned on this date.</EmptyState>}
        {roster.length > 0 && !visibleRoster.length && <EmptyState>No officials match these filters.</EmptyState>}
      </article>
    </div>
    {canSelfCheckIn && <QrScanner onFound={scanForSelf} />}
    {currentOfficial && assignedToday.has(currentOfficial.id) && checked.has(currentOfficial.id) && <p className="pilot-message staff-self-checkin">✓ You are checked in for this event day.</p>}
    {scheduleOfficial && <div className="confirmation-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setScheduleOfficialId(null); }}><section className="confirmation-dialog checkin-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="checkin-schedule-title">
      <header><div><p className="eyebrow">DAILY SCHEDULE</p><h2 id="checkin-schedule-title">{scheduleOfficial.official.full_name}</h2><p>{formatDate(eventDate)} · {scheduleOfficial.isCoachExpected ? "Referee Coach" : `${scheduleOfficial.games.length} assignment${scheduleOfficial.games.length === 1 ? "" : "s"}`}</p></div><button className="modal-close-button" aria-label="Close schedule" onClick={() => setScheduleOfficialId(null)}>×</button></header>
      <div className="checkin-day-schedule">{scheduleOfficial.games.map((game) => {
        const assignment = data.assignments.find((item) => item.game_id === game.id && item.official_id === scheduleOfficial.official.id);
        const isCoachingGame = data.coachAssignments.some((item) => item.coach_id === scheduleOfficial.official.linked_user_id && (item.full_schedule || item.game_id === game.id));
        const selectedPosition = assignment ? positionLabel(assignment.position, assignment.position_title) : isCoachingGame ? "Referee Coach" : "Event assignment";
        const crew = data.assignments.filter((item) => item.game_id === game.id).map((item) => ({
          assignment: item,
          official: data.officials.find((official) => official.id === item.official_id),
        })).filter((item) => Boolean(item.official));
        return <article className="checkin-game-card" key={game.id}>
          <div className="checkin-game-card-head"><div><time>{formatTime(game.starts_at)}</time><strong>{game.home_team} vs. {game.away_team}</strong><span>{game.venue_name || event.venue_name} · {game.field_name}</span></div><span className="selected-position">{selectedPosition}</span></div>
          <div className="checkin-game-crew"><p className="eyebrow">GAME CREW</p>{crew.map(({ assignment: crewAssignment, official }) => <div className={`checkin-crew-member ${official!.id === scheduleOfficial.official.id ? "selected-official" : ""}`} key={crewAssignment.id}><span className="avatar">{initials(official!.full_name)}</span><div><strong>{official!.full_name}</strong><small>{positionLabel(crewAssignment.position, crewAssignment.position_title)}</small></div>{official!.id === scheduleOfficial.official.id && <span className="you-marker">Selected</span>}</div>)}{!crew.length && <p className="empty-crew">No referee crew is assigned.</p>}</div>
        </article>;
      })}{!scheduleOfficial.games.length && <EmptyState>No scheduled games are available for this event day.</EmptyState>}</div>
    </section></div>}
  </section>;
}

function ScheduleView({ session, event, data, canEdit, canRateCrew, coachView, onRateCrew, onCreated }: { session: Law18Session; event: EventRecord; data: EventData; canEdit: boolean; canRateCrew: boolean; coachView: boolean; onRateCrew: (gameId: string) => void; onCreated: () => void }) {
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
  const visibleGames = coachView
    ? data.games.filter(isRateableGame)
    : data.games;
  const groupedGames = [...visibleGames].sort((a, b) => compareGroups(a, b) || a.starts_at.localeCompare(b.starts_at))
    .reduce<Record<string, GameRecord[]>>((groups, item) => ({ ...groups, [groupLabel(item)]: [...(groups[groupLabel(item)] || []), item] }), {});
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">EVENT SCHEDULE</p><h1>Games and crews</h1><p>{visibleGames.length} imported games</p></div></div>
    <div className="schedule-tools"><label>Sort and group by<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="date">Date</option><option value="time">Time</option><option value="site">Site</option><option value="field">Field</option><option value="age_group">Age group</option><option value="gender">Gender</option><option value="competition">Competition</option></select></label>{canEdit && <button className="secondary" onClick={() => setAdding((value) => !value)}>{adding ? "Cancel" : "Add game manually"}</button>}</div>
    {adding && <article className="panel manual-entry-form"><h2>Add a game to {event.name}</h2><div className="manual-form-grid"><label>Date and time<input type="datetime-local" value={game.starts_at} onChange={(e) => setGame({ ...game, starts_at: e.target.value })} /></label><label>Field<input value={game.field_name} onChange={(e) => setGame({ ...game, field_name: e.target.value })} /></label><label>Home team<input value={game.home_team} onChange={(e) => setGame({ ...game, home_team: e.target.value })} /></label><label>Away team<input value={game.away_team} onChange={(e) => setGame({ ...game, away_team: e.target.value })} /></label><label>Division or competition<input value={game.division} onChange={(e) => setGame({ ...game, division: e.target.value })} /></label></div><button className="primary" disabled={busy || !game.starts_at || !game.field_name.trim() || !game.home_team.trim() || !game.away_team.trim()} onClick={addGame}>{busy ? "Adding…" : "Add game"}</button></article>}
    {message && <p className="pilot-message">{message}</p>}
    <div className="schedule-groups">{Object.entries(groupedGames).map(([label, games]) => <details className="panel schedule-group" open key={label}><summary><span>{label}</span><small>{games.length} game{games.length === 1 ? "" : "s"}</small></summary><div className="schedule-list">{games.map((game) => {
      const crew = data.assignments.filter((assignment) => assignment.game_id === game.id);
      return <article className="schedule-card coach-schedule-card" key={game.id}><div className="timebox"><time>{formatDate(game.starts_at)}</time><strong>{formatTime(game.starts_at)}</strong><span>{game.field_name}</span></div><div className="schedule-game-details"><h2>{game.home_team} vs. {game.away_team}</h2><p>{[game.age_group, game.gender, game.division].filter(Boolean).join(" · ")}</p><div className="schedule-crew-list">{crew.map((assignment) => <span key={assignment.id}><b>{positionLabel(assignment.position, assignment.position_title)}</b><strong>{officials.get(assignment.official_id)?.full_name || "Open"}</strong></span>)}{!crew.length && <small>No crew assignments are visible for this game.</small>}</div></div>{canRateCrew && isRateableGame(game) && <button className="primary rate-crew-button" onClick={() => onRateCrew(game.id)}>Rate Crew</button>}</article>;
    })}</div></details>)}</div>
  </section>;
}

function EventLifecyclePanel({
  session,
  event,
  onChanged,
}: {
  session: Law18Session;
  event: EventRecord;
  onChanged: () => Promise<void>;
}) {
  const initialDelay = () => {
    if (!event.auto_archive_at) return "never";
    const archiveDate = new Date(event.auto_archive_at);
    const archiveDay = Date.UTC(archiveDate.getUTCFullYear(), archiveDate.getUTCMonth(), archiveDate.getUTCDate());
    const [year, month, day] = event.ends_on.split("-").map(Number);
    return String(Math.max(0, Math.round((archiveDay - Date.UTC(year, month - 1, day)) / 86400000) - 1));
  };
  const [delay, setDelay] = useState(initialDelay);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function saveSchedule() {
    setBusy(true);
    setMessage("");
    try {
      await configureEventAutoArchive(session, event.id, delay === "never" ? null : Number(delay));
      setMessage(delay === "never" ? "Automatic archiving is disabled." : `This event will archive ${delay === "0" ? "after its final day" : `${delay} day${delay === "1" ? "" : "s"} after it ends`}.`);
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save the event archive setting.");
    } finally {
      setBusy(false);
    }
  }
  async function archiveNow() {
    setBusy(true);
    setMessage("");
    try {
      await archiveEvent(session, event.id);
      setConfirmingArchive(false);
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to archive this event.");
    } finally {
      setBusy(false);
    }
  }
  return <article className="panel event-lifecycle-panel">
    <div><p className="eyebrow">EVENT LIFECYCLE</p><h2>Archive {event.name}</h2><p>Archiving removes the event from active views while preserving schedules, check-ins, ratings, and audit history.</p></div>
    <label>Automatic archive<select value={delay} onChange={(event) => setDelay(event.target.value)}><option value="never">Never</option><option value="0">After the final event day</option><option value="1">1 day after completion</option><option value="3">3 days after completion</option><option value="7">7 days after completion</option><option value="14">14 days after completion</option><option value="30">30 days after completion</option></select></label>
    <div className="event-lifecycle-actions"><button className="secondary" disabled={busy} onClick={saveSchedule}>{busy ? "Saving…" : "Save Archive Schedule"}</button><button className="danger-button" disabled={busy} onClick={() => setConfirmingArchive(true)}>Archive Now</button></div>
    {event.auto_archive_at && <small>Currently scheduled for {new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.auto_archive_at))}.</small>}
    {message && <p className="pilot-message">{message}</p>}
    {confirmingArchive && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog" role="dialog" aria-modal="true"><p className="eyebrow">ARCHIVE EVENT</p><h2>Archive {event.name} now?</h2><p>The event will leave active dashboards and selectors. Organization administrators can restore it later from Activity.</p><div><button className="secondary" disabled={busy} onClick={() => setConfirmingArchive(false)}>Cancel</button><button className="danger-button" disabled={busy} onClick={archiveNow}>{busy ? "Archiving…" : "Archive Event"}</button></div></section></div>}
  </article>;
}

function ImportView({
  session,
  profile,
  organizationId,
  organization,
  events,
  activeEvent,
  canCreateEvent,
  canManageLifecycle,
  canConfigureAliases,
  onEventsChanged,
  onImported,
}: {
  session: Law18Session;
  profile: Profile;
  organizationId: string;
  organization: OrganizationRecord;
  events: EventRecord[];
  activeEvent?: EventRecord;
  canCreateEvent: boolean;
  canManageLifecycle: boolean;
  canConfigureAliases: boolean;
  onEventsChanged: () => Promise<void>;
  onImported: (event: EventRecord) => void;
}) {
  const [mode, setMode] = useState<"schedule" | "officials">("schedule");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [officialRows, setOfficialRows] = useState<OfficialImportRow[]>([]);
  const [officialResult, setOfficialResult] = useState<OfficialImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const dragDepth = useRef(0);
  const [destinationEventId, setDestinationEventId] = useState("");
  const [details, setDetails] = useState({ name: "", venue: "", startsOn: "", endsOn: "" });
  const [aliasScope, setAliasScope] = useState<"organization" | "event">("organization");
  const [aliasText, setAliasText] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [eventDetails, setEventDetails] = useState({
    name: "",
    venue_name: "",
    starts_on: "",
    ends_on: "",
    timezone: "America/New_York",
  });
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
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setMessage("Please drop an Assignr CSV file.");
      return;
    }
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

  function dropFile(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDraggingFile(false);
    const files = [...event.dataTransfer.files];
    if (files.length !== 1) {
      setMessage("Drop one Assignr CSV file at a time.");
      return;
    }
    readFile(files[0]);
  }

  function enterDropZone(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setDraggingFile(true);
  }

  function leaveDropZone(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDraggingFile(false);
  }

  function switchImportMode(nextMode: "schedule" | "officials") {
    setMode(nextMode);
    setRows([]);
    setOfficialRows([]);
    setOfficialResult(null);
    setFileName("");
    setMessage("");
    setDraggingFile(false);
    dragDepth.current = 0;
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

  async function confirmEventCreation() {
    setBusy(true);
    setMessage("");
    try {
      const event = await createEvent(session, profile, organizationId, eventDetails);
      setMessage(`${event.name} was created. You can now import a schedule or add games manually.`);
      setCreatingEvent(false);
      setEventDetails({ name: "", venue_name: "", starts_on: "", ends_on: "", timezone: "America/New_York" });
      onImported(event);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create the event.");
    } finally {
      setBusy(false);
    }
  }

  const games = new Set(rows.map((row) => row.external_id)).size;
  const referees = new Set(rows.map((row) => row.official_email)).size;
  return <section className="page-section">
    <div className="section-title"><div><p className="eyebrow">EVENTS & ASSIGNR BRIDGE</p><h1>Import center</h1><p>Create an empty event, import the official directory separately, or add one or more schedule days.</p></div>{canCreateEvent && <button className="primary" onClick={() => setCreatingEvent((value) => !value)}>{creatingEvent ? "Cancel" : "Create New Event"}</button>}</div>
    {creatingEvent && <article className="panel manual-entry-form empty-event-form">
      <div><p className="eyebrow">NEW EVENT</p><h2>Create an event without a schedule</h2><p>Schedules and individual games can be added after the event is created.</p></div>
      <div className="manual-form-grid">
        <label>Event name<input value={eventDetails.name} maxLength={160} onChange={(event) => setEventDetails({ ...eventDetails, name: event.target.value })} /></label>
        <label>Default venue<input value={eventDetails.venue_name} maxLength={160} onChange={(event) => setEventDetails({ ...eventDetails, venue_name: event.target.value })} /></label>
        <label>Starts<input type="date" value={eventDetails.starts_on} onChange={(event) => setEventDetails({ ...eventDetails, starts_on: event.target.value, ends_on: eventDetails.ends_on || event.target.value })} /></label>
        <label>Ends<input type="date" min={eventDetails.starts_on} value={eventDetails.ends_on} onChange={(event) => setEventDetails({ ...eventDetails, ends_on: event.target.value })} /></label>
        <label>Time zone<select value={eventDetails.timezone} onChange={(event) => setEventDetails({ ...eventDetails, timezone: event.target.value })}><option value="America/New_York">Eastern Time</option><option value="America/Chicago">Central Time</option><option value="America/Denver">Mountain Time</option><option value="America/Phoenix">Arizona Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="America/Anchorage">Alaska Time</option><option value="Pacific/Honolulu">Hawaii Time</option></select></label>
      </div>
      <button className="primary" disabled={busy || !eventDetails.name.trim() || !eventDetails.venue_name.trim() || !eventDetails.starts_on || !eventDetails.ends_on || eventDetails.ends_on < eventDetails.starts_on} onClick={confirmEventCreation}>{busy ? "Creating…" : "Create Event"}</button>
    </article>}
    {activeEvent && canManageLifecycle && <EventLifecyclePanel session={session} event={activeEvent} onChanged={onEventsChanged} />}
    <div className="segmented import-tabs">
      <button className={mode === "schedule" ? "active" : ""} onClick={() => switchImportMode("schedule")}>Schedule export</button>
      <button className={mode === "officials" ? "active" : ""} onClick={() => switchImportMode("officials")}>Officials export</button>
    </div>
    <div className="import-grid">
      <article className={`panel import-card ${draggingFile ? "dragging" : ""}`} onDragEnter={enterDropZone} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={leaveDropZone} onDrop={dropFile}>
        <span className="upload-icon">{draggingFile ? "↓" : "↑"}</span><h2>{draggingFile ? "Drop CSV to upload" : fileName || `Drag an Assignr ${mode === "schedule" ? "games" : "users"} CSV here`}</h2>
        <p>{mode === "schedule" ? "Uses Assignr’s Games export with Position 1 / Official 1 crew columns." : "Uses Assignr’s Users export. Imported officials remain provisional until they create and verify their account."}</p>
        <span className="drop-or">or</span><label className="primary file-button">Browse Files<input type="file" accept=".csv,text/csv" onChange={(event) => readFile(event.target.files?.[0])} /></label>
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
  const [directoryAssessments, setDirectoryAssessments] = useState<AssessmentRecord[]>([]);
  const eventOfficialIds = new Set(data.officials.map((official) => official.id));
  const [scope, setScope] = useState<"organization" | "event">("organization");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "email" | "phone" | "badge" | "identity" | "role" | "event" | "rating" | "last_login">("name");
  const [managing, setManaging] = useState<OfficialRecord | null>(null);
  const [editing, setEditing] = useState<OfficialRecord | null>(null);
  const [removing, setRemoving] = useState<OfficialRecord | null>(null);
  const [selectedOfficialIds, setSelectedOfficialIds] = useState<string[]>([]);
  const [showArchivedOfficials, setShowArchivedOfficials] = useState(false);
  const [archivedOfficials, setArchivedOfficials] = useState<OfficialRecord[]>([]);
  const eventRoleChoices: Exclude<MembershipRole, "site_owner" | "organization_admin">[] = ["event_admin", "assignor", "site_coordinator", "referee_coach", "referee"];
  const [eventRoleSelections, setEventRoleSelections] = useState<Exclude<MembershipRole, "site_owner" | "organization_admin">[]>(["referee"]);
  const [fullScheduleAccess, setFullScheduleAccess] = useState(true);
  const [assignedGameIds, setAssignedGameIds] = useState<string[]>([]);
  const [coachingToolsEnabled, setCoachingToolsEnabled] = useState(false);
  const [merging, setMerging] = useState(false);
  const [primaryMergeId, setPrimaryMergeId] = useState("");
  const [secondaryMergeId, setSecondaryMergeId] = useState("");
  const [mergeConfirmation, setMergeConfirmation] = useState("");
  const [ratingScope, setRatingScope] = useState<"none" | "specific" | "all">("none");
  const [ratingEventIds, setRatingEventIds] = useState<string[]>([]);
  const [protectedEventAdmin, setProtectedEventAdmin] = useState(false);
  const [official, setOfficial] = useState({ full_name: "", email: "", secondary_email: "", date_of_birth: "", phone: "", badge_level: "", pending_org_roles: ["referee"] as MembershipRole[] });
  const [editValues, setEditValues] = useState({ full_name: "", email: "", secondary_email: "", date_of_birth: "", phone: "", badge_level: "", pending_org_roles: ["referee"] as MembershipRole[] });
  useEffect(() => {
    loadAuthorizedRatingHistory(session).then((result) => setDirectoryAssessments(result.assessments)).catch(() => setDirectoryAssessments([]));
  }, [session]);
  const refreshArchivedOfficials = useCallback(() => loadOrganizationOfficials(session, organizationId, true)
    .then((records) => setArchivedOfficials(records.filter((item) => Boolean(item.archived_at)))), [organizationId, session]);
  useEffect(() => { refreshArchivedOfficials().catch(() => undefined); }, [refreshArchivedOfficials]);
  const officialAverage = (officialId: string) => {
    const scores = directoryAssessments
      .filter((assessment) => assessment.official_id === officialId && assessment.status !== "draft")
      .map(assessmentScore)
      .filter((score): score is number => score !== null);
    return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  };
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
    pending_org_roles: [...new Set(["site_owner" as MembershipRole, ...organizationRoles])],
  } : null;
  const baseDirectoryOfficials = showArchivedOfficials ? [...officials, ...archivedOfficials] : officials;
  const directoryOfficials = selfOwnerRecord ? [...baseDirectoryOfficials, selfOwnerRecord] : baseDirectoryOfficials;
  const directoryNameSortKey = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const suffixes = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);
    const lastNameIndex = parts.length > 1 && suffixes.has(parts.at(-1)!.toLowerCase())
      ? parts.length - 2
      : parts.length - 1;
    return `${parts[lastNameIndex] || ""}\u0000${fullName}`;
  };
  const compareDirectoryValues = (left: string | number | null | undefined, right: string | number | null | undefined) => {
    const leftMissing = left === null || left === undefined || left === "";
    const rightMissing = right === null || right === undefined || right === "";
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (leftMissing && rightMissing) return 0;
    if (typeof left === "number" && typeof right === "number") return left - right;
    return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  };
  const filtered = directoryOfficials.filter((official) => {
    if (scope === "event" && !eventOfficialIds.has(official.id)) return false;
    const haystack = `${official.full_name} ${official.email || ""} ${official.badge_level || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }).sort((a, b) => {
    const values = {
      name: [directoryNameSortKey(a.full_name), directoryNameSortKey(b.full_name)],
      email: [a.email, b.email],
      phone: [a.phone, b.phone],
      badge: [a.badge_level, b.badge_level],
      identity: [a.linked_user_id ? "linked" : "provisional", b.linked_user_id ? "linked" : "provisional"],
      role: [a.pending_org_roles?.length ? a.pending_org_roles.join(",") : a.pending_org_role, b.pending_org_roles?.length ? b.pending_org_roles.join(",") : b.pending_org_role],
      event: [eventOfficialIds.has(a.id) ? "assigned" : "unassigned", eventOfficialIds.has(b.id) ? "assigned" : "unassigned"],
      rating: [officialAverage(a.id), officialAverage(b.id)],
      last_login: [a.last_login_at, b.last_login_at],
    }[sortBy];
    return compareDirectoryValues(values[0], values[1]) || compareDirectoryValues(directoryNameSortKey(a.full_name), directoryNameSortKey(b.full_name));
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
  async function copyJoinLink() {
    setBusy(true);
    setMessage("");
    try {
      const existingLinks = await loadOrganizationJoinLinks(session, organizationId);
      let joinLink = existingLinks.find((link) => link.active) || existingLinks[0];
      if (!joinLink) {
        joinLink = await createOrganizationJoinLink(session, organizationId, "Officials join link");
      } else if (!joinLink.active) {
        await setOrganizationJoinLinkActive(session, joinLink.id, true);
      }
      if (!joinLink) throw new Error("The officials join link could not be created.");
      const url = `${window.location.origin}/?join=${encodeURIComponent(joinLink.token)}`;
      try {
        await navigator.clipboard.writeText(url);
        setMessage("Officials join link copied.");
      } catch {
        window.prompt("Copy this officials join link:", url);
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to copy the officials join link.");
    } finally {
      setBusy(false);
    }
  }
  async function saveEventRole() {
    if (!managing?.linked_user_id || !event) return;
    setBusy(true);
    try {
      await saveUserEventAccess(session, event.id, managing.linked_user_id, eventRoleSelections, {
        fullScheduleAccess,
        assignedGameIds,
        coachingToolsEnabled,
        ratingsHistoryScope: ratingScope,
        ratingsEventIds: ratingEventIds,
        preserveEventAdmin: protectedEventAdmin && !canRemoveProtectedEventAdmin,
      });
      setMessage(`${managing.full_name}'s access for ${event.name} was updated.`);
      setManaging(null);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to assign the event role.");
    } finally {
      setBusy(false);
    }
  }
  async function beginManageRole(target: OfficialRecord) {
    if (!target.linked_user_id || !event) return;
    setBusy(true);
    setMessage("");
    try {
      const memberships = await loadUserEventMemberships(session, event.id, target.linked_user_id);
      const roles = memberships.map((membership) => membership.role)
        .filter((role): role is Exclude<MembershipRole, "site_owner" | "organization_admin"> =>
          !["site_owner", "organization_admin"].includes(role));
      const first = memberships[0];
      setEventRoleSelections(roles.length ? roles : ["referee"]);
      setFullScheduleAccess(first?.full_schedule_access ?? true);
      setAssignedGameIds(first?.assigned_game_ids || []);
      setCoachingToolsEnabled(first?.coaching_tools_enabled || false);
      setRatingScope(first?.ratings_history_scope || "none");
      setRatingEventIds(first?.ratings_event_ids || []);
      setProtectedEventAdmin(roles.includes("event_admin"));
      setManaging(target);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to load event access.");
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
  async function mergeAccounts() {
    const primary = officials.find((item) => item.id === primaryMergeId);
    const secondary = officials.find((item) => item.id === secondaryMergeId);
    if (!primary || !secondary || mergeConfirmation !== "MERGE") return;
    setBusy(true);
    setMessage("");
    try {
      const result = await mergeOrganizationAccounts(session, organizationId, primary.id, secondary.id);
      setMessage(`Accounts merged. ${result.primary_email} is now the primary login and assignments from both records were preserved.`);
      setMerging(false);
      setPrimaryMergeId("");
      setSecondaryMergeId("");
      setMergeConfirmation("");
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to merge the accounts.");
    } finally {
      setBusy(false);
    }
  }
  async function removeMember() {
    if (!removing?.linked_user_id) return;
    setBusy(true);
    setMessage("");
    try {
      await removeOrganizationMember(session, organizationId, removing.linked_user_id);
      setMessage(`${removing.full_name} was removed from this organization. Their account and historical records were preserved.`);
      setRemoving(null);
      setEditing(null);
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to remove this organization member.");
    } finally {
      setBusy(false);
    }
  }
  async function bulkOfficials(action: "archive" | "restore" | "delete") {
    if (!selectedOfficialIds.length) return;
    const protectedIds = new Set(directoryOfficials
      .filter((item) => item.linked_user_id && (
        (item.linked_user_id === profile.id && profile.is_site_owner)
        || (item.pending_org_roles || [item.pending_org_role || "referee"]).includes("organization_admin")
      ))
      .map((item) => item.id));
    const applicableIds = action === "delete"
      ? selectedOfficialIds.filter((id) => !protectedIds.has(id))
      : selectedOfficialIds;
    if (!applicableIds.length) {
      setMessage("Site-owner and organization-admin accounts cannot be mass deleted. Open an administrator's profile to manage their access.");
      return;
    }
    const prompt = action === "delete"
      ? `Permanently delete ${applicableIds.length} eligible selected provisional officials? Administrator accounts, linked officials, and records with history will be skipped.`
      : `${action === "archive" ? "Archive" : "Restore"} ${selectedOfficialIds.length} selected officials? Their historical records will be preserved.`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await bulkManageRecords(session, "officials", action, applicableIds);
      setSelectedOfficialIds([]);
      setMessage(`${result.processed} officials ${action === "delete" ? "deleted" : `${action}d`}.${result.skipped ? ` ${result.skipped} protected records were skipped.` : ""}`);
      onCreated();
      await refreshArchivedOfficials();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update the selected officials.");
    } finally {
      setBusy(false);
    }
  }
  const linkedAccounts = officials.filter((item) => item.linked_user_id && !item.merged_into_official_id);
  const editingIsSiteOwner = Boolean(editing?.linked_user_id === profile.id && profile.is_site_owner);
  const editingIsOrganizationAdmin = Boolean(editing && (editing.pending_org_roles || [editing.pending_org_role || "referee"]).includes("organization_admin"));
  const editingIsSelf = Boolean(editing?.linked_user_id === profile.id);
  const canRemoveEditingMember = Boolean(
    editing?.linked_user_id
    && !editingIsSiteOwner
    && (!editingIsOrganizationAdmin || profile.is_site_owner || editingIsSelf)
  );
  const canRemoveProtectedEventAdmin = Boolean(
    profile.is_site_owner
    || organizationRoles.includes("organization_admin")
    || managing?.linked_user_id === profile.id
  );
  const displayedOrganizationRoles: MembershipRole[] = editingIsSiteOwner
    ? ["site_owner", ...organizationRoleChoices]
    : organizationRoleChoices;
  return <section className="page-section">
    <div className="section-title"><div><p className="eyebrow">OFFICIALS</p><h1>Referee directory</h1><p>Organization officials and the active event roster.</p></div>{canManageOrganizationRoles && <button className="primary" disabled={busy} onClick={copyJoinLink}>{busy ? "Preparing…" : "Copy Join Link"}</button>}</div>
    <div className="directory-tools">
      <div className="segmented"><button className={scope === "organization" ? "active" : ""} onClick={() => setScope("organization")}>Organization</button><button className={scope === "event" ? "active" : ""} onClick={() => setScope("event")}>Active event</button></div>
      <input className="search" type="search" placeholder="Search name, email, or badge…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <label className="compact-sort">Sort by<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="name">Name</option><option value="email">Email</option><option value="phone">Phone</option><option value="badge">Badge</option><option value="identity">Account status</option><option value="role">Organization role</option><option value="event">Event assignment</option><option value="rating">Average rating</option><option value="last_login">Last login</option></select></label>
      {canManageOrganizationRoles && <label className="show-archived-ratings"><input type="checkbox" checked={showArchivedOfficials} onChange={(event) => setShowArchivedOfficials(event.target.checked)} /> Show Archived</label>}
      {canManageOrganizationRoles && <button className="secondary" disabled={linkedAccounts.length < 2} onClick={() => setMerging(true)}>Merge accounts</button>}
      <button className="secondary" onClick={() => setAdding((value) => !value)}>{adding ? "Cancel" : "Add official"}</button>
    </div>
    {adding && <article className="panel manual-entry-form"><h2>Add an official</h2><div className="manual-form-grid"><label>Full name<input value={official.full_name} onChange={(e) => setOfficial({ ...official, full_name: e.target.value })} /></label><label>Primary email<input type="email" value={official.email} onChange={(e) => setOfficial({ ...official, email: e.target.value })} /></label><label>Secondary email<input type="email" value={official.secondary_email} onChange={(e) => setOfficial({ ...official, secondary_email: e.target.value })} /></label><label>Date of birth<input type="date" value={official.date_of_birth} onChange={(e) => setOfficial({ ...official, date_of_birth: e.target.value })} /></label><label>Phone<input value={official.phone} onChange={(e) => setOfficial({ ...official, phone: e.target.value })} /></label><label>Badge or level<input value={official.badge_level} onChange={(e) => setOfficial({ ...official, badge_level: e.target.value })} /></label><fieldset className="role-checkboxes" disabled={!canManageOrganizationRoles}><legend>Organization roles</legend>{organizationRoleChoices.map((role) => <label key={role}><input type="checkbox" checked={official.pending_org_roles.includes(role)} onChange={() => setOfficial({ ...official, pending_org_roles: toggleRole(official.pending_org_roles, role) })} />{roleNames[role]}</label>)}</fieldset></div><button className="primary" disabled={busy || !official.full_name.trim()} onClick={addOfficial}>{busy ? "Adding…" : "Add official"}</button></article>}
    {message && <p className="pilot-message">{message}</p>}
    {canManageOrganizationRoles && <div className="bulk-action-bar panel"><label><input type="checkbox" checked={filtered.length > 0 && filtered.filter((item) => item.source !== "site_owner_profile").every((item) => selectedOfficialIds.includes(item.id))} onChange={(event) => setSelectedOfficialIds(event.target.checked ? filtered.filter((item) => item.source !== "site_owner_profile").map((item) => item.id) : [])} /> Select All Visible</label><strong>{selectedOfficialIds.length} selected</strong><button className="secondary" disabled={busy || !selectedOfficialIds.length} onClick={() => bulkOfficials("archive")}>Archive</button>{showArchivedOfficials && <button className="secondary" disabled={busy || !selectedOfficialIds.length} onClick={() => bulkOfficials("restore")}>Restore</button>}<button className="danger-button" disabled={busy || !selectedOfficialIds.length} onClick={() => bulkOfficials("delete")}>Delete Eligible</button></div>}
    <article className="panel directory-list">
      <div className="directory-row directory-head"><span>Official</span><span className="directory-contact">Contact</span><span>Identity</span><span>Organization Roles</span><span className="directory-average">Average Rating</span><span className="directory-login">Last Login</span><span className="directory-event">Event</span></div>
      {filtered.map((official) => {
        const listedRoles = official.pending_org_roles?.length
          ? official.pending_org_roles
          : [official.pending_org_role || "referee"];
        const isSiteOwnerRecord = profile.is_site_owner && official.linked_user_id === profile.id;
        const roles = isSiteOwnerRecord
          ? [...new Set(["site_owner" as MembershipRole, ...listedRoles])]
          : listedRoles;
        return <div className={`directory-row ${official.archived_at ? "archived-rating" : ""}`} key={official.id}>
        <div className="official-name-cell">{canManageOrganizationRoles && official.source !== "site_owner_profile" && <input className="bulk-row-check" type="checkbox" aria-label={`Select ${official.full_name}`} checked={selectedOfficialIds.includes(official.id)} onChange={(event) => setSelectedOfficialIds((current) => event.target.checked ? [...current, official.id] : current.filter((id) => id !== official.id))} />}<span className="avatar">{initials(official.full_name)}</span><div><strong>{official.full_name}</strong><small>{official.badge_level || "Badge not supplied"}</small></div></div>
        <div className="directory-contact"><span>{official.email || "Email required"}</span><small>{official.phone || "No phone imported"}</small></div>
        <span className={`identity-pill ${official.linked_user_id ? "linked" : ""}`}>{official.linked_user_id ? "Account linked" : "Provisional"}</span>
        <span className="directory-roles">{roles.map((role) => <span className="role-badge" key={role}>{roleNames[role]}</span>)}</span>
        <span className="directory-average directory-rating-score">{officialAverage(official.id)?.toFixed(2) || "—"}</span>
        <span className="directory-login">{official.last_login_at ? new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" }).format(new Date(official.last_login_at)) : official.linked_user_id ? "Not recorded" : "No account"}</span>
        <span className="directory-event">{eventOfficialIds.has(official.id) ? "Assigned" : "—"}{official.source !== "site_owner_profile" && <button className="text-button manage-role" onClick={() => beginEdit(official)}>Edit</button>}{official.source !== "site_owner_profile" && official.linked_user_id && event && !isSiteOwnerRecord && <button className="text-button manage-role" disabled={busy} onClick={() => beginManageRole(official)}>Event Access</button>}</span>
      </div>;
      })}
      {!filtered.length && <EmptyState>No officials match this view.</EmptyState>}
    </article>
    {editing && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog role-dialog official-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-official-title">
      <header className="official-edit-header"><p className="eyebrow">OFFICIAL RECORD</p><h2 id="edit-official-title">Edit {editing.full_name}</h2></header>
      <div className="official-edit-body">
        {editing.linked_user_id && <p className="linked-account-note">This account is linked. The user manages their personal information in Account Settings; organization staff can update the badge and organization roles.</p>}
        <section className="official-edit-section"><h3>Personal information</h3><div className="official-fields-grid">
          <label>Full name<input value={editValues.full_name} disabled={Boolean(editing.linked_user_id)} onChange={(e) => setEditValues({ ...editValues, full_name: e.target.value })} /></label>
          <label>Primary email<input type="email" value={editValues.email} disabled={Boolean(editing.linked_user_id)} onChange={(e) => setEditValues({ ...editValues, email: e.target.value })} /></label>
          <label>Secondary email<input type="email" value={editValues.secondary_email} disabled={Boolean(editing.linked_user_id)} onChange={(e) => setEditValues({ ...editValues, secondary_email: e.target.value })} /></label>
          <label>Date of birth<input type="date" value={editValues.date_of_birth} disabled={Boolean(editing.linked_user_id)} onChange={(e) => setEditValues({ ...editValues, date_of_birth: e.target.value })} /></label>
          <label>Phone<input value={editValues.phone} disabled={Boolean(editing.linked_user_id)} onChange={(e) => setEditValues({ ...editValues, phone: e.target.value })} /></label>
          <label>Badge or level<input value={editValues.badge_level} onChange={(e) => setEditValues({ ...editValues, badge_level: e.target.value })} /></label>
        </div></section>
        <section className="official-edit-section"><h3>Organization roles</h3><fieldset className={`official-role-grid ${editingIsSiteOwner ? "owner-locked" : ""}`} disabled={editingIsSiteOwner || !canManageOrganizationRoles}>{displayedOrganizationRoles.map((role) => {
          const checked = editingIsSiteOwner || editValues.pending_org_roles.includes(role);
          const protectedAdminRole = role === "organization_admin" && editingIsOrganizationAdmin && !profile.is_site_owner && !editingIsSelf;
          return <label className={`${checked ? "selected" : ""} ${editingIsSiteOwner || protectedAdminRole ? "locked" : ""}`} key={role}><input type="checkbox" checked={checked} disabled={protectedAdminRole} onChange={() => !editingIsSiteOwner && !protectedAdminRole && setEditValues({ ...editValues, pending_org_roles: toggleRole(editValues.pending_org_roles, role) })} /><span>{roleNames[role]}</span>{(editingIsSiteOwner || protectedAdminRole) && <small className="role-lock">Locked</small>}</label>;
        })}</fieldset></section>
        {editingIsSiteOwner
          ? <div className="official-edit-note owner-access-note"><strong>Site Owner — Full Access</strong><span>Your site-owner account automatically inherits every organization and event capability. These permissions are locked and cannot be removed here.</span></div>
          : <div className="official-edit-note official-event-note"><div><strong>Event-specific access</strong><span>Event Admin, Assignor, Site Coordinator, and Referee Coach access are managed separately for the active event. Assignr source identifiers are preserved for future imports.</span></div>{editing.linked_user_id && event && <button className="secondary" disabled={busy} onClick={() => { const target = editing; setEditing(null); void beginManageRole(target); }}>Open Event Access</button>}</div>}
      </div>
      <div className="official-edit-actions">{canManageOrganizationRoles && canRemoveEditingMember && <button className="danger-button remove-member-button" disabled={busy} onClick={() => setRemoving(editing)}>Remove From Organization</button>}<button className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={busy || !editValues.full_name.trim()} onClick={saveOfficial}>{busy ? "Saving…" : "Save official"}</button></div>
    </section></div>}
    {removing && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog" role="dialog" aria-modal="true"><p className="eyebrow">REMOVE ORGANIZATION MEMBER</p><h2>Remove {removing.full_name}?</h2><p>This removes their organization and event access. Their Law18Ref account, assignments, ratings, check-ins, and audit history are preserved.</p><div><button className="secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="danger-button" disabled={busy} onClick={removeMember}>{busy ? "Removing…" : "Remove Member"}</button></div></section></div>}
    {managing && event && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog role-dialog event-access-dialog" role="dialog" aria-modal="true"><p className="eyebrow">EVENT ACCESS</p><h2>{managing.full_name}</h2><p>Assign one or more roles and schedule access for {event.name}.</p><fieldset className="role-checkboxes"><legend>Event roles</legend>{eventRoleChoices.map((role) => {
      const locked = role === "event_admin" && protectedEventAdmin && !canRemoveProtectedEventAdmin;
      return <label key={role}><input type="checkbox" checked={eventRoleSelections.includes(role)} disabled={locked} onChange={() => !locked && setEventRoleSelections((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role])} />{roleNames[role]}{locked && <small className="role-lock">Locked</small>}</label>;
    })}</fieldset>{protectedEventAdmin && !canRemoveProtectedEventAdmin && <p className="import-note">Another event administrator cannot remove this access. The administrator can remove themselves, or an organization administrator or site owner can remove it.</p>}<label className="visibility-lock"><input type="checkbox" checked={fullScheduleAccess} onChange={(event) => setFullScheduleAccess(event.target.checked)} /><span><strong>Full schedule access</strong><small>When disabled, this person sees only the selected games below.</small></span></label>{!fullScheduleAccess && <fieldset className="event-game-scope"><legend>Assigned games</legend>{data.games.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((game) => <label key={game.id}><input type="checkbox" checked={assignedGameIds.includes(game.id)} onChange={(event) => setAssignedGameIds((current) => event.target.checked ? [...current, game.id] : current.filter((id) => id !== game.id))} /><span><strong>{formatTime(game.starts_at)} · {game.field_name}</strong><small>{game.home_team} vs. {game.away_team}</small></span></label>)}</fieldset>}<label className="visibility-lock"><input type="checkbox" checked={coachingToolsEnabled} onChange={(event) => setCoachingToolsEnabled(event.target.checked)} /><span><strong>Enable coaching tools</strong><small>Allows an assignor or coordinator to submit ratings when otherwise authorized.</small></span></label><label>Previous-event ratings<select value={ratingScope} onChange={(e) => setRatingScope(e.target.value as typeof ratingScope)}><option value="none">No previous events</option><option value="specific">Selected previous events</option><option value="all">All organization events</option></select></label>{ratingScope === "specific" && <fieldset><legend>Allowed events</legend>{events.filter((item) => item.id !== event.id).map((item) => <label className="event-access-check" key={item.id}><input type="checkbox" checked={ratingEventIds.includes(item.id)} onChange={(e) => setRatingEventIds((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{item.name}</label>)}</fieldset>}<div><button className="secondary" onClick={() => setManaging(null)}>Cancel</button><button className="primary" disabled={busy} onClick={saveEventRole}>Save event access</button></div></section></div>}
    {merging && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog merge-dialog" role="dialog" aria-modal="true"><p className="eyebrow">IDENTITY REVIEW</p><h2>Merge existing accounts</h2><p>Select the account and email that should remain primary. All assignments, check-ins, evaluations, and organization/event roles from the second account will be transferred.</p><label>Primary account and email<select value={primaryMergeId} onChange={(event) => setPrimaryMergeId(event.target.value)}><option value="">Choose the account to keep</option>{linkedAccounts.map((official) => <option value={official.id} key={official.id}>{official.full_name} — {official.email || "Email unavailable"}</option>)}</select></label><label>Account to merge into primary<select value={secondaryMergeId} onChange={(event) => setSecondaryMergeId(event.target.value)}><option value="">Choose the duplicate account</option>{linkedAccounts.filter((official) => official.id !== primaryMergeId).map((official) => <option value={official.id} key={official.id}>{official.full_name} — {official.email || "Email unavailable"}</option>)}</select></label><p className="import-note">The secondary login will no longer have access to this organization. Its Assignr identity remains mapped to the primary official so future imports continue matching correctly.</p><label>Type MERGE to confirm<input value={mergeConfirmation} onChange={(event) => setMergeConfirmation(event.target.value.toUpperCase())} /></label><div><button className="secondary" disabled={busy} onClick={() => { setMerging(false); setMergeConfirmation(""); }}>Cancel</button><button className="danger-button" disabled={busy || !primaryMergeId || !secondaryMergeId || primaryMergeId === secondaryMergeId || mergeConfirmation !== "MERGE"} onClick={mergeAccounts}>{busy ? "Merging…" : "Merge accounts"}</button></div></section></div>}
  </section>;
}

type CrewRatingDraft = {
  overall_rating: number | null;
  positioning: number;
  decision_making: number;
  communication: number;
  match_control: number;
  strengths: string;
  development_focus: string;
  coach_notes: string;
};

const blankCrewRating = (): CrewRatingDraft => ({
  overall_rating: null,
  positioning: 3,
  decision_making: 3,
  communication: 3,
  match_control: 3,
  strengths: "",
  development_focus: "",
  coach_notes: "",
});

function assessmentScore(assessment: AssessmentRecord): number | null {
  if (assessment.evaluation_type === "basic_eval") return assessment.overall_rating;
  const skills = [assessment.positioning, assessment.decision_making, assessment.communication, assessment.match_control]
    .filter((score): score is number => score !== null);
  return skills.length ? skills.reduce((sum, score) => sum + score, 0) / skills.length : null;
}

function AssessmentCenter({
  session,
  event,
  events,
  organizationId,
  data,
  canSubmit,
  canConfigure,
  canApprovePublic,
  onSaved,
  onEventUpdated,
  initialGameId,
  modal = false,
  onClose,
  hideWorkspace = false,
  onOpenRating,
  onEditRating,
}: {
  session: Law18Session;
  event: EventRecord;
  events: EventRecord[];
  organizationId: string;
  data: EventData;
  canSubmit: boolean;
  canConfigure: boolean;
  canApprovePublic: boolean;
  onSaved: () => void;
  onEventUpdated: (event: EventRecord) => void;
  initialGameId?: string;
  modal?: boolean;
  onClose?: () => void;
  hideWorkspace?: boolean;
  onOpenRating?: () => void;
  onEditRating?: (gameId: string, eventId: string) => void;
}) {
  const [gameId, setGameId] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">(event.ratings_admin_only ? "private" : "public");
  const [drafts, setDrafts] = useState<Record<string, CrewRatingDraft>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [configuration, setConfiguration] = useState<{ ratingType: EventRecord["rating_type"]; adminOnly: boolean; approvalRole: NonNullable<EventRecord["public_rating_approval_role"]> }>({ ratingType: event.rating_type, adminOnly: event.ratings_admin_only, approvalRole: event.public_rating_approval_role || "inherit" });
  const [ratingSort, setRatingSort] = useState<"date" | "gender" | "age_group" | "referee" | "position" | "score">("date");
  const [historyEventId, setHistoryEventId] = useState("all");
  const [historyFilters, setHistoryFilters] = useState({ referees: [] as string[], ageGroups: [] as string[], genders: [] as string[], positions: [] as string[], scores: [] as string[] });
  const [refereeFilterSearch, setRefereeFilterSearch] = useState("");
  const [historyDateRange, setHistoryDateRange] = useState({ from: "", through: "" });
  const [historyView, setHistoryView] = useState<"individual" | "game">("individual");
  const [showArchivedRatings, setShowArchivedRatings] = useState(false);
  const [selectedRatingIds, setSelectedRatingIds] = useState<string[]>([]);
  const [collapsedRatingGameIds, setCollapsedRatingGameIds] = useState<string[]>([]);
  const filterDropdownsRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState({ assessments: data.assessments, games: data.games, assignments: data.assignments, officials: data.officials, events: [] as EventRecord[], submitters: [] as { id: string; full_name: string }[] });
  const refreshRatingHistory = useCallback(() => loadAuthorizedRatingHistory(session).then(setHistory), [session]);
  useEffect(() => {
    refreshRatingHistory().catch(() => undefined);
  }, [refreshRatingHistory, data.assessments.length]);
  useEffect(() => {
    const closeDropdowns = (event: PointerEvent) => {
      filterDropdownsRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((dropdown) => {
        if (!dropdown.contains(event.target as Node)) dropdown.removeAttribute("open");
      });
    };
    document.addEventListener("pointerdown", closeDropdowns);
    return () => document.removeEventListener("pointerdown", closeDropdowns);
  }, []);
  useEffect(() => {
    setConfiguration({ ratingType: event.rating_type, adminOnly: event.ratings_admin_only, approvalRole: event.public_rating_approval_role || "inherit" });
  }, [event.id, event.rating_type, event.ratings_admin_only, event.public_rating_approval_role]);
  const officialMap = new Map(data.officials.map((official) => [official.id, official]));
  const gameMap = new Map(data.games.map((game) => [game.id, game]));
  const historyOfficialMap = new Map(history.officials.map((official) => [official.id, official]));
  const ratingSubmitterMap = new Map((history.submitters || []).map((submitter) => [submitter.id, submitter.full_name]));
  const historyGameMap = new Map(history.games.map((game) => [game.id, game]));
  const gameAssignments = [...new Map(data.assignments.filter((assignment) => assignment.game_id === gameId).map((assignment) => [assignment.official_id, assignment])).values()];
  const eligibleGames = data.games.filter(isRateableGame).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const historyAssignment = (assessment: AssessmentRecord) => history.assignments.find((item) => item.game_id === assessment.game_id && item.official_id === assessment.official_id);
  const historyPosition = (assessment: AssessmentRecord) => historyAssignment(assessment)?.position_title || "Unspecified position";
  const ratingScoreLabel = (assessment: AssessmentRecord) => {
    const score = assessmentScore(assessment);
    return score === null ? "Unscored" : Number(score.toFixed(2)).toString();
  };
  const crewPositionPriority = (assessment: AssessmentRecord) => {
    const assignment = historyAssignment(assessment);
    const position = assignment?.position || "";
    const title = (assignment?.position_title || "").trim().toLowerCase();
    if (position === "referee" || /^(center |centre )?referee$/.test(title)) return 0;
    if (position === "assistant_referee" || /^(ar(?:\s*\d+)?|assistant referee(?:\s*\d+)?|asst\.? referee(?:\s*\d+)?)$/.test(title)) return 1;
    if (position === "fourth_official" || /^(4th|fourth) official$/.test(title)) return 2;
    return 3;
  };
  const crewAssignmentOrder = (assessment: AssessmentRecord) => {
    const index = history.assignments.findIndex((assignment) => assignment.game_id === assessment.game_id && assignment.official_id === assessment.official_id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const orderGameRatings = (ratings: AssessmentRecord[]) => ratings.map((assessment, index) => ({ assessment, index })).sort((a, b) => {
    const priorityDifference = crewPositionPriority(a.assessment) - crewPositionPriority(b.assessment);
    if (priorityDifference) return priorityDifference;
    const assignmentDifference = crewAssignmentOrder(a.assessment) - crewAssignmentOrder(b.assessment);
    return assignmentDifference || a.index - b.index;
  }).map(({ assessment }) => assessment);
  const filterOptions = {
    referees: [...new Set(history.assessments.map((item) => historyOfficialMap.get(item.official_id)?.full_name).filter((item): item is string => Boolean(item)))].sort(),
    ageGroups: [...new Set(history.games.map((game) => game.age_group || "Unspecified age group"))].sort(),
    genders: [...new Set(history.games.map((game) => game.gender || "Unspecified gender"))].sort(),
    positions: [...new Set(history.assessments.map(historyPosition))].sort(),
    scores: [...new Set(history.assessments.map(ratingScoreLabel))].sort((a, b) => {
      if (a === "Unscored") return 1;
      if (b === "Unscored") return -1;
      return Number(b) - Number(a);
    }),
  };
  const toggleHistoryFilter = (key: keyof typeof historyFilters, value: string) => setHistoryFilters((current) => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
  }));
  const activeHistoryFilterCount = Object.values(historyFilters).reduce((sum, values) => sum + values.length, 0)
    + Number(Boolean(historyDateRange.from)) + Number(Boolean(historyDateRange.through));
  const sortedAssessments = history.assessments.filter((item) => {
    const game = historyGameMap.get(item.game_id);
    const referee = historyOfficialMap.get(item.official_id)?.full_name || "Unknown official";
    const gameDate = game?.starts_at.slice(0, 10) || "";
    return (!canSubmit || showArchivedRatings || !item.archived_at)
      && (historyEventId === "all" || game?.event_id === historyEventId)
      && (!historyFilters.referees.length || historyFilters.referees.includes(referee))
      && (!historyFilters.ageGroups.length || historyFilters.ageGroups.includes(game?.age_group || "Unspecified age group"))
      && (!historyFilters.genders.length || historyFilters.genders.includes(game?.gender || "Unspecified gender"))
      && (!historyFilters.positions.length || historyFilters.positions.includes(historyPosition(item)))
      && (!historyFilters.scores.length || historyFilters.scores.includes(ratingScoreLabel(item)))
      && (!historyDateRange.from || gameDate >= historyDateRange.from)
      && (!historyDateRange.through || gameDate <= historyDateRange.through);
  }).sort((a, b) => {
    const aGame = historyGameMap.get(a.game_id);
    const bGame = historyGameMap.get(b.game_id);
    if (ratingSort === "referee") return (historyOfficialMap.get(a.official_id)?.full_name || "").localeCompare(historyOfficialMap.get(b.official_id)?.full_name || "");
    if (ratingSort === "gender") return (aGame?.gender || "").localeCompare(bGame?.gender || "");
    if (ratingSort === "age_group") return (aGame?.age_group || "").localeCompare(bGame?.age_group || "");
    if (ratingSort === "position") {
      const aPosition = historyPosition(a);
      const bPosition = historyPosition(b);
      return aPosition.localeCompare(bPosition);
    }
    if (ratingSort === "score") {
      const aScore = assessmentScore(a);
      const bScore = assessmentScore(b);
      if (aScore === null || bScore === null) return aScore === bScore ? 0 : aScore === null ? 1 : -1;
      return bScore - aScore;
    }
    return (aGame?.starts_at || "").localeCompare(bGame?.starts_at || "");
  });
  const filteredScores = sortedAssessments.map(assessmentScore).filter((score): score is number => score !== null);
  const filteredAverage = filteredScores.length ? filteredScores.reduce((sum, score) => sum + score, 0) / filteredScores.length : null;
  const groupedAssessments = [...sortedAssessments.reduce((groups, assessment) => {
    const key = assessment.game_id;
    groups.set(key, [...(groups.get(key) || []), assessment]);
    return groups;
  }, new Map<string, AssessmentRecord[]>()).entries()];

  async function changeRatingArchive(assessment: AssessmentRecord, archived: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await setRatingArchived(session, assessment.id, archived);
      await refreshRatingHistory();
      setMessage(archived ? "Rating archived." : "Rating restored.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the rating.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRating(assessment: AssessmentRecord) {
    const canRetain = assessment.visibility === "public" && assessment.status === "shared";
    const retainForReferee = canRetain && window.confirm("Keep this public rating in the referee’s account after removing it from administrative records?\n\nChoose OK to retain the referee’s copy. Choose Cancel to continue to the full-delete choice.");
    if (!retainForReferee && !window.confirm("Fully delete this rating from Law18Ref? The referee will no longer be able to view it. This cannot be undone.")) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteRating(session, assessment.id, retainForReferee);
      await refreshRatingHistory();
      setMessage(retainForReferee ? "Rating removed from administration and retained for the referee." : "Rating fully deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete the rating.");
    } finally {
      setBusy(false);
    }
  }

  async function approveRating(assessment: AssessmentRecord) {
    setBusy(true);
    setMessage("");
    try {
      await approvePublicRating(session, assessment.id);
      await refreshRatingHistory();
      setMessage("Public rating approved and shared with the referee.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to approve the rating.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkRatings(action: "archive" | "restore" | "delete") {
    if (!selectedRatingIds.length) return;
    let retainPublicForReferees = false;
    if (action === "delete") {
      const hasSharedPublic = history.assessments.some((assessment) => selectedRatingIds.includes(assessment.id) && assessment.visibility === "public" && assessment.status === "shared");
      retainPublicForReferees = hasSharedPublic && window.confirm("Keep shared public ratings in each referee’s account?\n\nChoose OK to retain referee copies. Choose Cancel to continue to the full-delete choice.");
      if (!retainPublicForReferees && !window.confirm(`Fully delete ${selectedRatingIds.length} selected ratings? Referees will lose access and this cannot be undone.`)) return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = action === "delete"
        ? (await Promise.all(selectedRatingIds.map((id) => deleteRating(session, id, retainPublicForReferees))), { processed: selectedRatingIds.length, skipped: 0 })
        : await bulkManageRecords(session, "ratings", action, selectedRatingIds);
      setSelectedRatingIds([]);
      await refreshRatingHistory();
      setMessage(`${result.processed} ratings ${action === "delete" ? (retainPublicForReferees ? "removed; shared referee copies were retained" : "fully deleted") : `${action}d`}.${result.skipped ? ` ${result.skipped} could not be changed.` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the selected ratings.");
    } finally {
      setBusy(false);
    }
  }

  async function exportRatings() {
    if (!groupedAssessments.length) return;
    const maximumCrew = Math.max(...groupedAssessments.map(([, ratings]) => ratings.length));
    const headings = ["Event", "Date", "Time", "Field", "Home Team", "Away Team", "Age Group", "Gender"];
    for (let index = 1; index <= maximumCrew; index += 1) {
      headings.push(
        `Official ${index} Name`, `Official ${index} Position`, `Official ${index} Eval Type`,
        `Official ${index} Score`, `Official ${index} Positioning`, `Official ${index} Decision Making`,
        `Official ${index} Communication`, `Official ${index} Match Control`,
        `Official ${index} Strengths`, `Official ${index} Development Focus`, `Official ${index} Notes`,
      );
    }
    const escapeCell = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
    const rows = groupedAssessments.map(([gameId, ratings]) => {
      const ratedGame = historyGameMap.get(gameId);
      const ratedEvent = history.events.find((item) => item.id === ratedGame?.event_id);
      const cells: unknown[] = [
        ratedEvent?.name || "", ratedGame ? formatDate(ratedGame.starts_at) : "",
        ratedGame ? formatTime(ratedGame.starts_at) : "", ratedGame?.field_name || "",
        ratedGame?.home_team || "", ratedGame?.away_team || "", ratedGame?.age_group || "", ratedGame?.gender || "",
      ];
      ratings.forEach((rating) => cells.push(
        historyOfficialMap.get(rating.official_id)?.full_name || "Unknown official",
        historyPosition(rating),
        rating.evaluation_type === "basic_eval" ? "Basic Eval" : "Skills Eval",
        assessmentScore(rating)?.toFixed(2) || "",
        rating.positioning ?? "", rating.decision_making ?? "", rating.communication ?? "", rating.match_control ?? "",
        rating.strengths || "", rating.development_focus || "", rating.coach_notes || "",
      ));
      while (cells.length < headings.length) cells.push("");
      return cells.map(escapeCell).join(",");
    });
    const csv = [headings.map(escapeCell).join(","), ...rows].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `law18ref-ratings-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    await logRatingExport(session, sortedAssessments.length, groupedAssessments.length).catch(() => undefined);
  }

  function chooseGame(nextGameId: string) {
    setGameId(nextGameId);
    const nextDrafts: Record<string, CrewRatingDraft> = {};
    data.assignments.filter((assignment) => assignment.game_id === nextGameId).forEach((assignment) => {
      const saved = data.assessments.find((assessment) => assessment.game_id === nextGameId && assessment.official_id === assignment.official_id && assessment.coach_id === session.user.id);
      nextDrafts[assignment.official_id] = saved ? {
        overall_rating: saved.overall_rating ?? null,
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
  useEffect(() => {
    if (initialGameId && data.games.some((game) => game.id === initialGameId)) chooseGame(initialGameId);
  }, [initialGameId]);

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
          coach_notes: rating.coach_notes || null,
        });
      }));
      setMessage(status === "draft" ? `Draft ratings saved for ${gameAssignments.length} officials.` : `Ratings submitted for ${gameAssignments.length} officials.`);
      onSaved();
      if (status === "submitted") {
        if (modal) onClose?.();
        else chooseGame("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the ratings.");
    } finally {
      setBusy(false);
    }
  }

  async function saveConfiguration() {
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateEventRatingSettings(session, event.id, configuration.ratingType, configuration.adminOnly, configuration.approvalRole);
      onEventUpdated(updated);
      setVisibility(configuration.adminOnly ? "private" : visibility);
      setMessage("Event rating settings updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update event rating settings.");
    } finally {
      setBusy(false);
    }
  }

  const canManageRating = (assessment: AssessmentRecord) => canConfigure || assessment.coach_id === session.user.id;
  const ratingActions = (assessment: AssessmentRecord, ratedGame?: GameRecord) => canManageRating(assessment) ? <div className="rating-history-actions">
    {canApprovePublic && assessment.visibility === "public" && assessment.status === "submitted" && <button className="primary" disabled={busy} onClick={() => approveRating(assessment)}>Approve & Share</button>}
    {!assessment.archived_at && ratedGame && onEditRating && <button className="secondary edit-rating-button" disabled={busy} onClick={() => onEditRating(assessment.game_id, ratedGame.event_id)}>Edit</button>}
    <button className="secondary" disabled={busy} onClick={() => changeRatingArchive(assessment, !assessment.archived_at)}>{assessment.archived_at ? "Restore" : "Archive"}</button>
    <button className="danger-button" disabled={busy} onClick={() => removeRating(assessment)}>Delete</button>
  </div> : null;

  return <section className={`page-section ratings-page${modal ? " rating-modal" : ""}`} role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label={modal ? "Rate crew" : undefined} onClick={modal ? (click) => { if (click.target === click.currentTarget) onClose?.(); } : undefined}>
    <div className="section-title"><div><p className="eyebrow">{canSubmit ? "REFEREE DEVELOPMENT" : "MY FEEDBACK"}</p><h1>{canSubmit ? "Ratings" : "My Evals"}</h1><p>{canSubmit ? "Rate every official assigned to a game in one view." : "Review ratings that have been shared with you."}</p></div>{canSubmit && hideWorkspace && <button className="primary" onClick={onOpenRating}>Rate a Crew</button>}</div>
    {canConfigure && <article className="panel rating-settings"><div><p className="eyebrow">EVENT SETTINGS</p><h2>Rating configuration</h2><p>Changes remain private to this form until you save them.</p></div><label>Evaluation type<select value={configuration.ratingType} disabled={busy} onChange={(e) => setConfiguration({ ...configuration, ratingType: e.target.value as EventRecord["rating_type"] })}><option value="skills_eval">Skills Eval</option><option value="basic_eval">Basic Eval</option></select></label><label>Public Eval Approval<select value={configuration.approvalRole} disabled={busy || configuration.adminOnly} onChange={(e) => setConfiguration({ ...configuration, approvalRole: e.target.value as NonNullable<EventRecord["public_rating_approval_role"]> })}><option value="inherit">Use Organization Setting</option><option value="none">No Approval — Share Immediately</option><option value="organization_admin">Organization Admin Approval</option><option value="event_admin">Event Admin Approval</option></select></label><label className="visibility-lock"><input type="checkbox" checked={configuration.adminOnly} disabled={busy} onChange={(e) => setConfiguration({ ...configuration, adminOnly: e.target.checked })} /><span><strong>Lock visibility to event staff</strong><small>Only administrators, event/game assignors, and referee coaches can view ratings.</small></span></label><button className="primary rating-config-save" disabled={busy || (configuration.ratingType === event.rating_type && configuration.adminOnly === event.ratings_admin_only && configuration.approvalRole === (event.public_rating_approval_role || "inherit"))} onClick={saveConfiguration}>{busy ? "Saving…" : "Save Configuration"}</button></article>}
    {canSubmit && !hideWorkspace && <article className="panel crew-rating-workspace">
      <div className="panel-head"><div><p className="eyebrow">{event.rating_type === "skills_eval" ? "SKILLS EVAL" : "BASIC EVAL"}</p><h2>{modal ? "Rate Crew" : "Select a game"}</h2></div>{modal && <button className="modal-close" aria-label="Close rating form" onClick={onClose}>×</button>}</div>
      <div className="assessment-selects"><label>Game<select value={gameId} onChange={(e) => chooseGame(e.target.value)}><option value="">Choose a game</option>{eligibleGames.map((game) => <option value={game.id} key={game.id}>{formatDate(game.starts_at)} · {game.field_name} · {formatTime(game.starts_at)}</option>)}</select></label><label>Visibility<select value={event.ratings_admin_only ? "private" : visibility} disabled={event.ratings_admin_only} onChange={(e) => setVisibility(e.target.value as "public" | "private")}><option value="private">Private — event staff and referee coaches</option><option value="public">Public — visible to each referee</option></select></label>{event.ratings_admin_only && <p className="import-note">Visibility is locked to event staff for this event.</p>}</div>
      <div className="crew-rating-list">{gameAssignments.map((assignment) => {
        const rating = drafts[assignment.official_id] || blankCrewRating();
        return <section className="crew-rating-card" key={assignment.official_id}><div className="crew-rating-heading"><span className="avatar">{initials(officialMap.get(assignment.official_id)?.full_name || "R")}</span><div className="crew-rating-identity"><h3>{officialMap.get(assignment.official_id)?.full_name || "Official"}</h3><p>{positionLabel(assignment.position, assignment.position_title)}</p></div>{event.rating_type === "basic_eval" && <label className="inline-basic-rating"><span>Rating</span><select aria-label={`Rating for ${officialMap.get(assignment.official_id)?.full_name || "official"}`} value={rating.overall_rating ?? ""} onChange={(e) => updateDraft(assignment.official_id, { overall_rating: e.target.value ? Number(e.target.value) : null })}><option value="">N/A</option>{[1,2,3,4,5].map((score) => <option value={score} key={score}>{score}</option>)}</select></label>}</div>
          {event.rating_type === "basic_eval"
            ? <div className="basic-eval-fields"><label className="basic-eval-notes">Notes<textarea rows={2} value={rating.coach_notes} placeholder="Add notes about this official…" onChange={(e) => updateDraft(assignment.official_id, { coach_notes: e.target.value })} /></label></div>
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
    </article>}
    <article className="panel history ratings-history"><div className="panel-head"><div><p className="eyebrow">HISTORY</p><h2>{sortedAssessments.length} matching rating{sortedAssessments.length === 1 ? "" : "s"}</h2><p className="filtered-rating-average">Average Score <strong>{filteredAverage?.toFixed(2) || "—"}</strong></p></div><div className="rating-history-toolbar"><div className="segmented-control" aria-label="Rating history view"><button className={historyView === "individual" ? "active" : ""} onClick={() => setHistoryView("individual")}>Individual Ratings</button><button className={historyView === "game" ? "active" : ""} onClick={() => setHistoryView("game")}>Full Game Ratings</button></div><button className="secondary" disabled={!sortedAssessments.length} onClick={exportRatings}>Export Spreadsheet</button></div><div className="history-filters"><label className="compact-sort">Event<select value={historyEventId} onChange={(e) => setHistoryEventId(e.target.value)}><option value="all">All permitted events</option>{[...new Set(history.games.map((game) => game.event_id))].map((id) => <option value={id} key={id}>{history.events.find((item) => item.id === id)?.name || events.find((item) => item.id === id)?.name || `Previous event · ${id.slice(0, 8)}`}</option>)}</select></label><label className="compact-sort">Sort by<select value={ratingSort} onChange={(e) => setRatingSort(e.target.value as typeof ratingSort)}><option value="date">Date</option><option value="gender">Gender</option><option value="age_group">Age group</option><option value="referee">Referee</option><option value="position">Position</option><option value="score">Rating Score</option></select></label><label className="show-archived-ratings"><input type="checkbox" checked={showArchivedRatings} onChange={(event) => setShowArchivedRatings(event.target.checked)} /> Show Archived Ratings</label></div></div>
      {canConfigure && <div className="bulk-action-bar"><label><input type="checkbox" checked={sortedAssessments.length > 0 && sortedAssessments.every((item) => selectedRatingIds.includes(item.id))} onChange={(event) => setSelectedRatingIds(event.target.checked ? sortedAssessments.map((item) => item.id) : [])} /> Select All Visible</label><strong>{selectedRatingIds.length} selected</strong><button className="secondary" disabled={busy || !selectedRatingIds.length} onClick={() => bulkRatings("archive")}>Archive</button>{showArchivedRatings && <button className="secondary" disabled={busy || !selectedRatingIds.length} onClick={() => bulkRatings("restore")}>Restore</button>}<button className="danger-button" disabled={busy || !selectedRatingIds.length} onClick={() => bulkRatings("delete")}>Delete</button></div>}
      <details className="ratings-filter-panel"><summary>Filter Ratings{activeHistoryFilterCount ? ` · ${activeHistoryFilterCount} selected` : ""}</summary><div className="ratings-filter-grid" ref={filterDropdownsRef}>{([
        ["referees", "Referees", filterOptions.referees],
        ["ageGroups", "Age Groups", filterOptions.ageGroups],
        ["genders", "Genders", filterOptions.genders],
        ["positions", "Positions", filterOptions.positions],
        ["scores", "Rating Scores", filterOptions.scores],
      ] as const).map(([key, label, options]) => {
        const visibleOptions = key === "referees" && refereeFilterSearch.trim()
          ? options.filter((option) => option.toLowerCase().includes(refereeFilterSearch.trim().toLowerCase()))
          : options;
        const allSelected = options.length > 0 && options.every((option) => historyFilters[key].includes(option));
        return <details className="rating-filter-dropdown" key={key}><summary><span>{label}</span><small>{historyFilters[key].length ? `${historyFilters[key].length} selected` : "All"}</small></summary><div className="rating-filter-options">{key === "referees" && <input className="rating-referee-search" type="search" value={refereeFilterSearch} placeholder="Search referees…" aria-label="Search referees" onChange={(event) => setRefereeFilterSearch(event.target.value)} />}<label className="rating-select-all"><input type="checkbox" checked={allSelected} onChange={() => setHistoryFilters((current) => ({ ...current, [key]: allSelected ? [] : [...options] }))} /><strong>Select All</strong></label>{visibleOptions.map((option) => <label key={option}><input type="checkbox" checked={historyFilters[key].includes(option)} onChange={() => toggleHistoryFilter(key, option)} /><span>{option}</span></label>)}{!visibleOptions.length && <small>No matching referees</small>}</div></details>;
      })}<fieldset className="rating-date-range"><legend>Date Range</legend><label>From<input type="date" value={historyDateRange.from} max={historyDateRange.through || undefined} onChange={(event) => setHistoryDateRange((current) => ({ ...current, from: event.target.value }))} /></label><label>Through<input type="date" value={historyDateRange.through} min={historyDateRange.from || undefined} onChange={(event) => setHistoryDateRange((current) => ({ ...current, through: event.target.value }))} /></label></fieldset></div><button className="text-button clear-rating-filters" disabled={!activeHistoryFilterCount} onClick={() => { setHistoryFilters({ referees: [], ageGroups: [], genders: [], positions: [], scores: [] }); setHistoryDateRange({ from: "", through: "" }); setRefereeFilterSearch(""); }}>Clear All Filters</button></details>
      {message && <p className="pilot-message assessment-message">{message}</p>}
      {historyView === "individual" && sortedAssessments.map((assessment) => {
      const score = assessmentScore(assessment);
      const ratedGame = historyGameMap.get(assessment.game_id);
      return <article className={`${canConfigure ? "selectable-rating-row " : ""}${assessment.archived_at ? "archived-rating" : ""}`.trim()} key={assessment.id}>{canConfigure && <input className="bulk-row-check" type="checkbox" aria-label={`Select rating for ${historyOfficialMap.get(assessment.official_id)?.full_name || "official"}`} checked={selectedRatingIds.includes(assessment.id)} onChange={(event) => setSelectedRatingIds((current) => event.target.checked ? [...current, assessment.id] : current.filter((id) => id !== assessment.id))} />}<div><strong>{historyOfficialMap.get(assessment.official_id)?.full_name || "Referee"}</strong><p>{ratedGame?.home_team} vs. {ratedGame?.away_team}</p><small>{assessment.evaluation_type === "basic_eval" ? "Basic Eval" : "Skills Eval"} · {assessment.visibility === "public" ? "Public" : "Admin only"}{assessment.archived_at ? " · Archived" : ""}</small><small className="rating-submitter">Submitted by {ratingSubmitterMap.get(assessment.coach_id) || "Unknown user"}</small></div><span className="score">{score ? Number(score).toFixed(1) : "—"}</span><span className={`identity-pill ${assessment.status !== "draft" ? "linked" : ""}`}>{assessment.status}</span>{ratingActions(assessment, ratedGame)}</article>;
    })}
      {historyView === "game" && groupedAssessments.map(([ratedGameId, ratings]) => {
        const ratedGame = historyGameMap.get(ratedGameId);
        const gameSelected = ratings.every((assessment) => selectedRatingIds.includes(assessment.id));
        const collapsed = collapsedRatingGameIds.includes(ratedGameId);
        return <article className={`game-rating-history-card ${collapsed ? "collapsed" : ""}`} key={ratedGameId}><header>{canConfigure && <input className="bulk-row-check" type="checkbox" aria-label="Select all ratings for this game" checked={gameSelected} onChange={(change) => setSelectedRatingIds((current) => change.target.checked ? [...new Set([...current, ...ratings.map((item) => item.id)])] : current.filter((id) => !ratings.some((item) => item.id === id)))} />}<div><strong>{ratedGame?.home_team} vs. {ratedGame?.away_team}</strong><p>{ratedGame ? `${formatDate(ratedGame.starts_at)} · ${formatTime(ratedGame.starts_at)} · ${ratedGame.field_name}` : "Game details unavailable"}</p></div><span>{ratings.length} official{ratings.length === 1 ? "" : "s"}</span><button className="game-rating-collapse" aria-label={`${collapsed ? "Expand" : "Collapse"} ratings for this game`} aria-expanded={!collapsed} onClick={() => setCollapsedRatingGameIds((current) => current.includes(ratedGameId) ? current.filter((id) => id !== ratedGameId) : [...current, ratedGameId])}>{collapsed ? "▾" : "▴"}</button></header>{!collapsed && <div className="game-rating-officials">{orderGameRatings(ratings).map((assessment) => <div className={assessment.archived_at ? "archived-rating" : ""} key={assessment.id}><div><strong>{historyOfficialMap.get(assessment.official_id)?.full_name || "Referee"}</strong><small>{historyPosition(assessment)}{assessment.archived_at ? " · Archived" : ""}</small><small className="rating-submitter">Submitted by {ratingSubmitterMap.get(assessment.coach_id) || "Unknown user"}</small></div><span className="score">{assessmentScore(assessment)?.toFixed(1) || "—"}</span>{ratingActions(assessment, ratedGame)}</div>)}</div>}</article>;
      })}
      {!sortedAssessments.length && <EmptyState>No ratings match these filters.</EmptyState>}</article>
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
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const [logoFileName, setLogoFileName] = useState("");
  useEffect(() => {
    Promise.all([loadAppearanceCampaigns(session), loadAppearanceThemes(session)])
      .then(([nextCampaigns, nextThemes]) => { setCampaigns(nextCampaigns); setThemes(nextThemes); })
      .catch(() => undefined);
  }, [session]);
  async function selectLogo(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("Choose a PNG, JPEG, or WebP logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("The logo must be 5 MB or smaller.");
      return;
    }
    setLogoUploading(true);
    setMessage("Uploading temporary logo…");
    try {
      const logoUrl = await uploadAppearanceLogo(session, file);
      setForm((current) => ({ ...current, logo_url: logoUrl }));
      setLogoFileName(file.name);
      setMessage(`${file.name} is ready to preview, save, or schedule.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload the logo.");
    } finally {
      setLogoUploading(false);
    }
  }
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
    setLogoFileName(theme.logo_url ? "Saved custom logo" : "");
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
        <div className={`appearance-logo-upload ${logoDragging ? "dragging" : ""} ${form.logo_url ? "has-logo" : ""}`} onDragEnter={(event) => { event.preventDefault(); setLogoDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setLogoDragging(false); }} onDrop={(event) => { event.preventDefault(); setLogoDragging(false); void selectLogo(event.dataTransfer.files[0]); }}>
          <span className="upload-icon">↑</span>
          <div><strong>{logoUploading ? "Uploading…" : form.logo_url ? logoFileName || "Custom logo selected" : "Drop a temporary logo here"}</strong><small>PNG, JPEG, or WebP · maximum 5 MB</small></div>
          <label className="secondary file-button">{form.logo_url ? "Replace File" : "Choose File"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={logoUploading} onChange={(event) => { void selectLogo(event.target.files?.[0]); event.target.value = ""; }} /></label>
          {form.logo_url && <><img src={form.logo_url} alt="Temporary logo preview" /><button className="text-button appearance-logo-remove" type="button" onClick={() => { setForm({ ...form, logo_url: "" }); setLogoFileName(""); }}>Use Default Logo</button></>}
        </div>
        <label>Primary color<input type="color" value={form.primary_color} onChange={(event) => setForm({ ...form, primary_color: event.target.value })} /></label>
        <label>Accent color<input type="color" value={form.accent_color} onChange={(event) => setForm({ ...form, accent_color: event.target.value })} /></label>
        <label>Starts<input type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} /></label>
        <label>Ends<input type="datetime-local" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} /></label>
        {message && <p className="pilot-message">{message}</p>}
        <div className="appearance-form-actions"><button className="secondary" disabled={logoUploading} onClick={() => displayAppearance({ primary_color: form.primary_color, accent_color: form.accent_color, logo_url: form.logo_url || null })}>Preview</button><button className="secondary" disabled={logoUploading || form.name.trim().length < 2} onClick={saveTheme}>Save to theme library</button><button className="primary" disabled={logoUploading || !form.name || !form.starts_at || !form.ends_at} onClick={schedule}>Schedule appearance</button></div>
      </article>
      <article className="panel campaign-list"><div className="panel-head"><div><p className="eyebrow">SCHEDULE</p><h2>Appearance campaigns</h2></div></div>{campaigns.map((campaign) => {
        const now = Date.now();
        const status = !campaign.active || new Date(campaign.ends_at).getTime() <= now ? "Ended" : new Date(campaign.starts_at).getTime() <= now ? "Active" : "Scheduled";
        return <div className="campaign-row" key={campaign.id}><span style={{ background: campaign.primary_color || undefined }} /><div><strong>{campaign.name}</strong><small>{new Date(campaign.starts_at).toLocaleString()} – {new Date(campaign.ends_at).toLocaleString()}</small></div><b>{status}</b><button className="text-button campaign-delete" onClick={() => unschedule(campaign.id, campaign.name)}>Unschedule</button></div>;
      })}{!campaigns.length && <EmptyState>No appearance campaigns are scheduled.</EmptyState>}</article>
    </div>
  </section>;
}

function CoachWorkspace({
  session,
  event,
  data,
  organizationOfficials,
  canManage,
  onSaved,
}: {
  session: Law18Session;
  event: EventRecord;
  data: EventData;
  organizationOfficials: OfficialRecord[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [coachId, setCoachId] = useState("");
  const [scope, setScope] = useState<"full" | "games">("full");
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("all");
  const [scheduleField, setScheduleField] = useState("all");
  const [scheduleTime, setScheduleTime] = useState("all");
  const [scheduleQuery, setScheduleQuery] = useState("");
  const [gameCoachSelections, setGameCoachSelections] = useState<Record<string, string>>({});
  const linkedOfficials = organizationOfficials.filter((official) => official.linked_user_id);
  const visibleAssignments = canManage
    ? data.coachAssignments
    : data.coachAssignments.filter((assignment) => assignment.coach_id === session.user.id);
  const officialByUser = new Map(organizationOfficials.filter((official) => official.linked_user_id).map((official) => [official.linked_user_id!, official]));
  const gameById = new Map(data.games.map((game) => [game.id, game]));
  const scheduleGames = data.games.filter((game) => !game.operational).sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.field_name.localeCompare(b.field_name, undefined, { numeric: true }));
  const scheduleDates = [...new Set(scheduleGames.map((game) => game.starts_at.slice(0, 10)))];
  const scheduleFields = [...new Set(scheduleGames.map((game) => game.field_name))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const scheduleTimes = [...new Set(scheduleGames.map((game) => formatTime(game.starts_at)))];
  const filteredScheduleGames = scheduleGames.filter((game) =>
    (scheduleDate === "all" || game.starts_at.startsWith(scheduleDate))
    && (scheduleField === "all" || game.field_name === scheduleField)
    && (scheduleTime === "all" || formatTime(game.starts_at) === scheduleTime)
    && `${game.home_team} ${game.away_team} ${game.division || ""} ${game.field_name}`.toLowerCase().includes(scheduleQuery.toLowerCase()));
  function assignmentExists(targetCoachId: string, targetGameId: string | null) {
    return data.coachAssignments.some((assignment) => assignment.coach_id === targetCoachId
      && (targetGameId ? assignment.game_id === targetGameId : assignment.full_schedule));
  }
  async function assignCoach() {
    const coach = linkedOfficials.find((official) => official.linked_user_id === coachId);
    if (!coach) return;
    setBusy(true);
    try {
      const targets = scope === "full" ? [null] : selectedGameIds;
      const newTargets = targets.filter((target) => !assignmentExists(coachId, target));
      await Promise.all(newTargets.map((target) => createCoachAssignment(session, event.id, coachId, target)));
      setMessage(newTargets.length
        ? `${coach.full_name} was assigned to ${scope === "full" ? "the full event schedule" : `${newTargets.length} selected game${newTargets.length === 1 ? "" : "s"}`}.`
        : `${coach.full_name} already has the selected coaching access.`);
      if (scope === "games") setSelectedGameIds([]);
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to assign the coach.");
    } finally {
      setBusy(false);
    }
  }
  async function assignScheduleGame(gameId: string) {
    const selectedCoachId = gameCoachSelections[gameId];
    const coach = linkedOfficials.find((official) => official.linked_user_id === selectedCoachId);
    if (!coach) return;
    setBusy(true);
    try {
      if (!assignmentExists(selectedCoachId, gameId)) await createCoachAssignment(session, event.id, selectedCoachId, gameId);
      setMessage(`${coach.full_name} was assigned to ${gameById.get(gameId)?.home_team || "the selected game"}.`);
      setGameCoachSelections((current) => ({ ...current, [gameId]: "" }));
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to assign the coach.");
    } finally {
      setBusy(false);
    }
  }
  async function removeAssignment(id: string) {
    setBusy(true);
    try {
      await deleteCoachAssignment(session, id);
      setMessage("Coach assignment removed.");
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to remove the coach assignment.");
    } finally {
      setBusy(false);
    }
  }
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">REFEREE DEVELOPMENT</p><h1>Coaching Assignments</h1><p>Assign coaches to the complete event schedule or selected games.</p></div></div>
    {canManage && <article className="panel coach-assignment-form bulk-coach-form"><label>Referee coach<select value={coachId} onChange={(event) => setCoachId(event.target.value)}><option value="">Select a linked organization member</option>{linkedOfficials.map((official) => <option value={official.linked_user_id!} key={official.id}>{official.full_name} — {official.email}</option>)}</select></label><label>Schedule scope<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="full">Full event schedule</option><option value="games">Multiple selected games</option></select></label>{scope === "games" && <fieldset className="coach-game-picker"><legend>Select games</legend>{scheduleGames.map((game) => <label key={game.id}><input type="checkbox" checked={selectedGameIds.includes(game.id)} onChange={(event) => setSelectedGameIds((current) => event.target.checked ? [...current, game.id] : current.filter((id) => id !== game.id))} /><span><strong>{formatDate(game.starts_at)} · {formatTime(game.starts_at)} · {game.field_name}</strong><small>{game.home_team} vs. {game.away_team}</small></span></label>)}</fieldset>}<button className="primary" disabled={busy || !coachId || (scope === "games" && !selectedGameIds.length)} onClick={assignCoach}>{busy ? "Saving…" : scope === "games" ? `Assign Coach to ${selectedGameIds.length || ""} Game${selectedGameIds.length === 1 ? "" : "s"}` : "Assign Coach"}</button></article>}
    {message && <p className="pilot-message">{message}</p>}
    {canManage && <article className="panel coach-schedule-manager">
      <div className="panel-head"><div><p className="eyebrow">FULL SCHEDULE</p><h2>Assign Coaches by Game</h2><p>Filter the event schedule, then choose a coach for any game.</p></div></div>
      <div className="coach-schedule-filters"><label>Day<select value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)}><option value="all">All days</option>{scheduleDates.map((date) => <option value={date} key={date}>{formatDate(date)}</option>)}</select></label><label>Field<select value={scheduleField} onChange={(event) => setScheduleField(event.target.value)}><option value="all">All fields</option>{scheduleFields.map((field) => <option value={field} key={field}>{field}</option>)}</select></label><label>Time<select value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)}><option value="all">All times</option>{scheduleTimes.map((time) => <option value={time} key={time}>{time}</option>)}</select></label><label>Teams, age group, or division<input type="search" value={scheduleQuery} onChange={(event) => setScheduleQuery(event.target.value)} placeholder="Search schedule…" /></label></div>
      <div className="coach-schedule-list">{filteredScheduleGames.map((game) => {
        const assigned = data.coachAssignments.filter((assignment) => assignment.game_id === game.id).map((assignment) => officialByUser.get(assignment.coach_id)?.full_name).filter(Boolean);
        return <div className="coach-schedule-row" key={game.id}><time><strong>{formatTime(game.starts_at)}</strong><small>{formatDate(game.starts_at)}</small></time><div><strong>{game.home_team} vs. {game.away_team}</strong><small>{game.field_name}{game.division ? ` · ${game.division}` : ""}</small><span>{assigned.length ? `Assigned: ${assigned.join(", ")}` : "No coach assigned"}</span></div><select aria-label={`Coach for ${game.home_team} versus ${game.away_team}`} value={gameCoachSelections[game.id] || ""} onChange={(event) => setGameCoachSelections((current) => ({ ...current, [game.id]: event.target.value }))}><option value="">Choose coach</option>{linkedOfficials.map((official) => <option value={official.linked_user_id!} key={official.id}>{official.full_name}</option>)}</select><button className="secondary" disabled={busy || !gameCoachSelections[game.id]} onClick={() => assignScheduleGame(game.id)}>Assign</button></div>;
      })}{!filteredScheduleGames.length && <EmptyState>No games match these schedule filters.</EmptyState>}</div>
    </article>}
    <div className="coach-assignment-list">{visibleAssignments.map((assignment) => {
      const coach = officialByUser.get(assignment.coach_id);
      const game = assignment.game_id ? gameById.get(assignment.game_id) : null;
      return <article className="panel coach-scope-card" key={assignment.id}><div className="official-name-cell"><span className="avatar">{initials(coach?.full_name || "Coach")}</span><div><strong>{coach?.full_name || "Linked coach account"}</strong><small>{assignment.full_schedule ? "Full event schedule" : game ? `${formatDate(game.starts_at)} · ${formatTime(game.starts_at)} · ${game.field_name}` : "Selected game"}</small></div></div>{game && <p>{game.home_team} vs. {game.away_team}</p>}{canManage && <button className="text-button" disabled={busy} onClick={() => removeAssignment(assignment.id)}>Remove</button>}</article>;
    })}{!visibleAssignments.length && <EmptyState>{canManage ? "No referee coaches have been assigned yet." : "No coaching schedule is assigned to your account."}</EmptyState>}</div>
  </section>;
}

function DashboardHome({
  profile,
  event,
  data,
  events,
  adminView,
  onNavigate,
}: {
  profile: Profile;
  event?: EventRecord;
  data: EventData;
  events: EventRecord[];
  adminView: boolean;
  onNavigate: (view: View) => void;
}) {
  const today = event ? new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) : "";
  const todayGameIds = new Set(data.games.filter((game) =>
    event && new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(game.starts_at)) === today
  ).map((game) => game.id));
  const expectedToday = new Set(data.assignments.filter((assignment) => todayGameIds.has(assignment.game_id)).map((assignment) => assignment.official_id));
  data.coachAssignments.forEach((assignment) => {
    if (!todayGameIds.size || (!assignment.full_schedule && (!assignment.game_id || !todayGameIds.has(assignment.game_id)))) return;
    const coachOfficial = data.officials.find((official) => official.linked_user_id === assignment.coach_id);
    if (coachOfficial) expectedToday.add(coachOfficial.id);
  });
  const checkedIn = new Set(data.checkIns.filter((item) => item.event_date === today && item.status === "checked_in" && expectedToday.has(item.official_id)).map((item) => item.official_id)).size;
  const roleLabel = profile.role === "admin" ? "Administrator" : profile.role === "assignor" ? "Assignor" : profile.role === "coach" ? "Referee coach" : "Referee";
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const relevantEvents = events.filter((item) => new Date(`${item.ends_on}T23:59:59`).getTime() >= sevenDaysAgo)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  return <section className="page-section dashboard-home">
    <div className="welcome">
      <div><p className="eyebrow">DASHBOARD</p><h1>Welcome, {profile.full_name.split(" ")[0]}.</h1><p>Your events, assignments, and tournament-day tools in one place.</p></div>
    </div>
    <div className={`metrics dashboard-metrics${adminView ? " admin-dashboard-metrics" : ""}`}>
      {!adminView && <article><span className="metric-icon green">◇</span><div><strong>{events.length}</strong><p>Available events</p></div></article>}
      {!adminView && <article><span className="metric-icon blue">☷</span><div><strong>{data.games.length}</strong><p>Games in active event</p></div></article>}
      <article><span className="metric-icon green">✓</span><div><strong>{adminView ? `${checkedIn}/${expectedToday.size}` : checkedIn}</strong><p>{adminView ? "Today's Check-ins" : "Officials checked in"}</p></div></article>
      <article><span className="metric-icon blue">◎</span><div><strong className="role-metric">{roleLabel}</strong><p>Your account role</p></div></article>
    </div>
    <div className="dashboard-grid">
      <article className="panel dashboard-event">
        <div className="panel-head"><div><p className="eyebrow">CURRENT AND UPCOMING</p><h2>{relevantEvents.length} Active Events</h2></div></div>
        {relevantEvents.length ? <div className="dashboard-event-body dashboard-event-list">
          {relevantEvents.map((item) => <p className={item.id === event?.id ? "selected-dashboard-event" : ""} key={item.id}><strong>{item.name}</strong><span>{formatDate(item.starts_on)} through {formatDate(item.ends_on)} · {item.venue_name}</span></p>)}
          <div className="dashboard-actions">
            <button className="primary" onClick={() => onNavigate(profile.role === "referee" ? "board" : "schedule")}>{profile.role === "referee" ? "Open my day" : "View schedule"}</button>
            <button className="secondary" onClick={() => onNavigate("checkin")}>Check-in tools</button>
          </div>
        </div> : <div className="empty-dashboard"><p>No tournament is available yet.</p>{profile.role !== "referee" && <button className="primary" onClick={() => onNavigate("import")}>Import an event</button>}</div>}
      </article>
      <article className="panel dashboard-quick">
        <div className="panel-head"><div><p className="eyebrow">QUICK ACCESS</p><h2>Account and Organization</h2></div></div>
        <button onClick={() => onNavigate("account")}><span>Personal details</span><b>Account settings →</b></button>
        <button onClick={() => onNavigate("groups")}><span>Membership</span><b>View my groups →</b></button>
      </article>
    </div>
  </section>;
}

function OrganizationActivity({
  session,
  organization,
  events,
  onEventsChanged,
}: {
  session: Law18Session;
  organization: OrganizationRecord;
  events: EventRecord[];
  onEventsChanged: () => Promise<void>;
}) {
  const [activity, setActivity] = useState<AuditRecord[]>([]);
  const [archivedEvents, setArchivedEvents] = useState<EventRecord[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const refresh = useCallback(async () => {
    const nextArchivedEvents = await loadArchivedEvents(session, organization.id);
    const nextActivity = await loadOrganizationActivity(session, organization.id);
    setActivity(nextActivity);
    setArchivedEvents(nextArchivedEvents);
  }, [organization.id, session]);
  useEffect(() => {
    // Activity is loaded from the remote organization audit stream.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((reason) => setMessage(reason instanceof Error ? reason.message : "Unable to load organization activity."));
  }, [refresh]);
  async function restoreArchivedEvent(event: EventRecord) {
    setBusy(true);
    setMessage("");
    try {
      await restoreEvent(session, event.id);
      setMessage(`${event.name} was restored. Automatic archiving was cleared.`);
      await Promise.all([refresh(), onEventsChanged()]);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to restore the event.");
    } finally {
      setBusy(false);
    }
  }
  async function bulkEvents(action: "archive" | "restore" | "delete") {
    const applicableIds = selectedEventIds.filter((id) => action === "archive"
      ? events.some((item) => item.id === id)
      : archivedEvents.some((item) => item.id === id));
    if (!applicableIds.length) return;
    if (!window.confirm(action === "delete"
      ? `Permanently delete ${applicableIds.length} archived events and all connected operational data? This cannot be undone.`
      : `${action === "archive" ? "Archive" : "Restore"} ${applicableIds.length} selected events?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await bulkManageRecords(session, "events", action, applicableIds);
      setSelectedEventIds([]);
      setMessage(`${result.processed} events ${action === "delete" ? "deleted" : `${action}d`}.${result.skipped ? ` ${result.skipped} were skipped.` : ""}`);
      await Promise.all([refresh(), onEventsChanged()]);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update the selected events.");
    } finally {
      setBusy(false);
    }
  }
  const actionLabel = (action: string) => action.split(".").map((part) =>
    part.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  ).join(" · ");
  return <section className="page-section organization-activity-page">
    <div className="section-title"><div><p className="eyebrow">ORGANIZATION ADMINISTRATION</p><h1>Activity</h1><p>Review meaningful organization changes and manage archived events.</p></div><button className="secondary" disabled={busy} onClick={() => refresh()}>{busy ? "Refreshing…" : "Refresh"}</button></div>
    {message && <p className="pilot-message">{message}</p>}
    <article className="panel archived-event-list"><div className="panel-head"><div><p className="eyebrow">ARCHIVED EVENTS</p><h2>Bulk event actions</h2><p>Archive active events, restore archived events, or permanently delete events already in the archive.</p></div></div>
      <div className="bulk-action-bar"><strong>{selectedEventIds.length} selected</strong><button className="secondary" disabled={busy || !selectedEventIds.some((id) => events.some((item) => item.id === id))} onClick={() => bulkEvents("archive")}>Archive Selected</button><button className="secondary" disabled={busy || !selectedEventIds.some((id) => archivedEvents.some((item) => item.id === id))} onClick={() => bulkEvents("restore")}>Restore Selected</button><button className="danger-button" disabled={busy || !selectedEventIds.length || selectedEventIds.some((id) => !archivedEvents.some((item) => item.id === id))} onClick={() => bulkEvents("delete")}>Delete Archived</button></div>
      <h3 className="lifecycle-list-title">Active Events</h3>{events.map((event) => <div className="archived-event-row" key={event.id}><div><strong>{event.name}</strong><small>{formatDate(event.starts_on)} through {formatDate(event.ends_on)}</small></div><input className="bulk-row-check" type="checkbox" aria-label={`Select ${event.name}`} checked={selectedEventIds.includes(event.id)} onChange={(change) => setSelectedEventIds((current) => change.target.checked ? [...current, event.id] : current.filter((id) => id !== event.id))} /></div>)}{!events.length && <EmptyState>No active events.</EmptyState>}
      <h3 className="lifecycle-list-title">Archived Events</h3>{archivedEvents.map((event) => <div className="archived-event-row" key={event.id}><div><strong>{event.name}</strong><small>{formatDate(event.starts_on)} through {formatDate(event.ends_on)} · {event.archive_reason === "automatic" ? "Automatically archived" : "Manually archived"}</small></div><div className="archived-event-actions"><input className="bulk-row-check" type="checkbox" aria-label={`Select ${event.name}`} checked={selectedEventIds.includes(event.id)} onChange={(change) => setSelectedEventIds((current) => change.target.checked ? [...current, event.id] : current.filter((id) => id !== event.id))} /><button className="secondary" disabled={busy} onClick={() => restoreArchivedEvent(event)}>Restore Event</button></div></div>)}{!archivedEvents.length && <EmptyState>No events are archived.</EmptyState>}</article>
    <article className="panel activity-log"><div className="panel-head"><div><p className="eyebrow">AUDIT LOG</p><h2>Organization activity</h2><p>Ratings, imports, schedules, assignments, members, events, check-ins, and other meaningful changes appear here.</p></div></div>
      <div className="activity-log-head"><span>Action</span><span>Performed by</span><span>Record</span><span>Date</span></div>
      {activity.map((item) => <div className="activity-log-row" key={item.id}><strong>{actionLabel(item.action)}</strong><span>{item.actor_name}</span><span>{item.entity_type.replace(/_/g, " ")}</span><time>{new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time></div>)}
      {!activity.length && <EmptyState>No organization activity has been recorded yet.</EmptyState>}
    </article>
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

function OrganizationLogoEditor({
  session,
  organizationId,
  logoUrl,
  onChange,
  onBusyChange,
  onError,
}: {
  session: Law18Session;
  organizationId: string;
  logoUrl: string;
  onChange: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  async function chooseLogo(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      onError("Choose a PNG, JPEG, or WebP organization logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError("Organization logos must be 5 MB or smaller.");
      return;
    }
    onBusyChange(true);
    onError("");
    try {
      onChange(await uploadOrganizationLogo(session, organizationId, file));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Unable to upload the organization logo.");
    } finally {
      onBusyChange(false);
    }
  }
  return <div className={`organization-logo-upload ${dragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); void chooseLogo(event.dataTransfer.files[0]); }}>
    <div className="organization-logo-preview">{logoUrl ? <img src={logoUrl} alt="Organization logo preview" /> : <span>ORG</span>}</div>
    <div><strong>{logoUrl ? "Organization logo selected" : "Add an organization logo"}</strong><small>Drop a PNG, JPEG, or WebP here · maximum 5 MB</small></div>
    <label className="secondary file-button">{logoUrl ? "Replace Logo" : "Choose Logo"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void chooseLogo(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {logoUrl && <button className="text-button organization-logo-remove" type="button" onClick={() => onChange("")}>Remove Logo</button>}
  </div>;
}

function GroupsSettings({
  session,
  organization,
  canManage,
  onUpdated,
}: {
  session: Law18Session;
  organization: OrganizationRecord | null;
  canManage: boolean;
  onUpdated: (organization: OrganizationRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [organizationName, setOrganizationName] = useState(organization?.name || "");
  const [logoUrl, setLogoUrl] = useState(organization?.logo_url || "");
  const [approvalRole, setApprovalRole] = useState<NonNullable<OrganizationRecord["public_rating_approval_role"]>>(organization?.public_rating_approval_role || "none");
  useEffect(() => {
    setOrganizationName(organization?.name || "");
    setLogoUrl(organization?.logo_url || "");
    setApprovalRole(organization?.public_rating_approval_role || "none");
  }, [organization?.id, organization?.logo_url, organization?.name, organization?.public_rating_approval_role]);
  async function saveSettings() {
    if (!organization || !canManage) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateOrganizationSettings(session, organization.id, { name: organizationName, logo_url: logoUrl || null, public_rating_approval_role: approvalRole });
      onUpdated(updated);
      setMessage("Organization settings saved.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save organization settings.");
    } finally {
      setBusy(false);
    }
  }
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
    {organization && canManage && <article className="panel organization-profile-settings">
      <div className="panel-head"><div><p className="eyebrow">ORGANIZATION SETTINGS</p><h2>Organization identity</h2><p>The logo appears in the active-organization bar for all members.</p></div></div>
      <label>Organization name<input value={organizationName} maxLength={120} onChange={(event) => setOrganizationName(event.target.value)} /></label>
      <OrganizationLogoEditor session={session} organizationId={organization.id} logoUrl={logoUrl} onChange={setLogoUrl} onBusyChange={setBusy} onError={setMessage} />
      <label>Default Public Eval Approval<select value={approvalRole} onChange={(event) => setApprovalRole(event.target.value as typeof approvalRole)}><option value="none">No Approval — Share Immediately</option><option value="organization_admin">Organization Admin Approval</option><option value="event_admin">Event Admin Approval</option></select><small>Events can inherit or override this setting.</small></label>
      <button className="primary" disabled={busy || organizationName.trim().length < 2} onClick={saveSettings}>{busy ? "Saving…" : "Save Organization Settings"}</button>
      {message && <p className="pilot-message">{message}</p>}
    </article>}
    <article className="panel group-card">
      {organization?.logo_url ? <img className="group-logo" src={organization.logo_url} alt="" /> : <span className="group-mark">{organization?.name?.[0] || "L"}</span>}
      <div><h2>{organization?.name || "Current organization"}</h2><p>Your events and assignments from this organization appear in Law18Ref.</p></div>
      <button className="danger-button" disabled={busy} onClick={leave}>{busy ? "Leaving…" : "Leave group"}</button>
      {message && <p className="group-message">{message}</p>}
    </article>
  </section>;
}

function SiteGroupsAdmin({ session, ownerEmail, onOpen, onUpdated }: { session: Law18Session; ownerEmail: string; onOpen: (organizationId: string) => void; onUpdated: (organization: OrganizationRecord) => void }) {
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ organization: OrganizationRecord; action: "deactivate" | "delete" } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [editing, setEditing] = useState<OrganizationRecord | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingLogoUrl, setEditingLogoUrl] = useState("");
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
      const updated = await updateOrganizationSettings(session, editing.id, { name: editingName, logo_url: editingLogoUrl || null });
      onUpdated(updated);
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
            <button className="secondary" onClick={() => { setEditing(item); setEditingName(item.name); setEditingLogoUrl(item.logo_url || ""); }}>Settings</button>
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
    {editing && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog organization-settings-dialog" role="dialog" aria-modal="true"><p className="eyebrow">ORGANIZATION SETTINGS</p><h2>{editing.name}</h2><label>Organization name<input value={editingName} maxLength={120} onChange={(event) => setEditingName(event.target.value)} /></label><OrganizationLogoEditor session={session} organizationId={editing.id} logoUrl={editingLogoUrl} onChange={setEditingLogoUrl} onBusyChange={setBusy} onError={setMessage} /><p className="verification-note">The logo appears in the active-organization bar. The internal organization address remains unchanged so imports and existing links continue working.</p><div><button className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={busy || editingName.trim().length < 2} onClick={saveOrganizationSettings}>{busy ? "Saving…" : "Save settings"}</button></div></section></div>}
  </section>;
}

function Dashboard({ session, onSessionExpired }: { session: Law18Session; onSessionExpired: () => void }) {
  const [view, setView] = useState<View>("dashboard");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<OrganizationRecord | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [organizationRoles, setOrganizationRoles] = useState<MembershipRole[]>([]);
  const [eventRoles, setEventRoles] = useState<MembershipRole[]>([]);
  const [eventAccess, setEventAccess] = useState<EventMembership[]>([]);
  const [organizationOfficials, setOrganizationOfficials] = useState<OfficialRecord[]>([]);
  const [allEvents, setAllEvents] = useState<EventRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventId, setEventId] = useState("");
  const [data, setData] = useState<EventData>({ games: [], assignments: [], officials: [], checkIns: [], assessments: [], coachAssignments: [] });
  const [loading, setLoading] = useState(true);
  const [dashboardLoadError, setDashboardLoadError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ratingModalGameId, setRatingModalGameId] = useState<string | null>(null);
  const [organizationActionMessage, setOrganizationActionMessage] = useState("");
  const [qrCheckInMessage, setQrCheckInMessage] = useState("");
  const allRoles = new Set<MembershipRole>([
    ...(profile?.is_site_owner ? ["site_owner" as MembershipRole] : []),
    ...organizationRoles,
    ...eventRoles,
  ]);
  const activeGroupRoles = [...new Set<MembershipRole>([
    ...(profile?.is_site_owner ? ["site_owner" as MembershipRole] : []),
    ...organizationRoles,
    ...eventRoles,
  ])];
  const helpByRole: Record<MembershipRole, { title: string; items: string[] }> = {
    site_owner: { title: "Site Owner Navigation", items: ["Use the organization selector below the header to open the group you want to manage.", "Open Groups from your initials menu to create, open, archive, restore, rename, or upload a logo for an organization.", "Open Site Appearance from your initials menu to edit, save, schedule, or restore site themes.", "Open Officials and use Copy Join Link to invite members to the active organization.", "Open Activity within an organization to review its audit log and event archive.", "After selecting an organization and event, use the same event tabs described for organization administrators."] },
    organization_admin: { title: "Organization Admin Navigation", items: ["Choose the organization and active event from the selectors below the header.", "Open Groups from your initials menu to update the active organization's name or logo.", "Open Officials to copy the organization join link, add or edit people, review last login, set organization roles, remove a member, merge accounts, or open Event Access. Use the selection boxes for bulk archive or deletion.", "Open Activity to review meaningful changes or bulk archive, restore, and delete events.", "Open Import to add officials, upload an Assignr schedule, configure automatic archiving, or archive the selected event now.", "Open Assignment Board or Schedule to review the day, Check-In to manage arrivals, and Coaching to assign coaches.", "Open Ratings to configure evaluations, filter history, switch between individual and full-game views, export a spreadsheet, or use selection boxes to archive and delete ratings. Archived-event ratings remain available here."] },
    event_admin: { title: "Event Admin Navigation", items: ["Select an assigned event from the Active Event menu below the header.", "Open Officials, then Event Access, to add or update event staff for that event.", "Open Import for event schedule data and Event Lifecycle controls, including automatic archiving or Archive Now.", "Open Schedule for game details, Check-In for arrivals, Coaching for coach assignments, and Ratings for evaluation settings and history."] },
    assignor: { title: "Assignor Navigation", items: ["Select the event you are working from the Active Event menu below the header.", "Open Import to upload an authorized schedule, then use Assignment Board or Schedule to review crews.", "Open Check-In to filter arrivals, manually check someone in, undo a check-in, or select an official’s name to see their daily schedule.", "Open Coaching to place coaches on games. Use Rate Crew on a schedule game, or open Ratings and choose a game, when coaching tools are enabled."] },
    site_coordinator: { title: "Site Coordinator Navigation", items: ["Select today’s event from the Active Event menu.", "Open Assignment Board or Schedule to review the games in your event scope.", "Open Check-In to monitor arrivals. Use its filters to narrow the roster, and select an official’s name to view that person’s full schedule for the day."] },
    referee_coach: { title: "Referee Coach Navigation", items: ["Select the event you are coaching from the My Event menu.", "Open Schedule to see games and crews in your coaching scope.", "Select Rate Crew on a game to open its evaluation form, complete the crew ratings, and submit them together.", "Open Ratings to choose a game, review individual or full-game history, filter results, or export the filtered ratings. Your permitted history remains available after an event is archived.", "When Check-In appears, open it at the venue, select Scan QR Code, and scan the code displayed by event staff."] },
    referee: { title: "Referee Navigation", items: ["Select the event you want from the My Event menu below the header.", "Open My Assignments to view your imported game schedule and positions.", "On an assigned event day, open Check-In, select Scan QR Code, and scan the code displayed by event staff. The scanner disappears after your check-in is recorded.", "Open My Evals to view evaluations that have been shared with you.", "Open your initials menu, then Account Settings, to update your contact and personal information."] },
  };
  const isAdministrativeStaff = ["site_owner", "organization_admin", "event_admin", "assignor"].some((role) => allRoles.has(role as MembershipRole));
  const isSiteCoordinator = allRoles.has("site_coordinator");
  const isStaff = isAdministrativeStaff || isSiteCoordinator;
  const isCoach = allRoles.has("referee_coach");
  const canAssess = isCoach
    || ["site_owner", "organization_admin", "event_admin"].some((role) => allRoles.has(role as MembershipRole))
    || eventAccess.some((membership) => membership.coaching_tools_enabled);
  const canConfigureRatings = ["site_owner", "organization_admin", "event_admin"].some((role) => allRoles.has(role as MembershipRole));
  const event = events.find((item) => item.id === eventId);
  const effectiveRatingApprovalRole = event?.public_rating_approval_role && event.public_rating_approval_role !== "inherit"
    ? event.public_rating_approval_role
    : organization?.public_rating_approval_role || "none";
  const canApprovePublicRatings = Boolean(
    profile?.is_site_owner
    || (effectiveRatingApprovalRole === "organization_admin" && organizationRoles.includes("organization_admin"))
    || (effectiveRatingApprovalRole === "event_admin" && eventRoles.includes("event_admin")),
  );

  const refresh = useCallback(async (selectedId = eventId) => {
    if (!selectedId) return;
    setData(await loadEventData(session, selectedId));
  }, [eventId, session]);
  const refreshCheckIns = useCallback(async () => {
    if (!eventId) return;
    const checkIns = await loadEventCheckIns(session, eventId);
    setData((current) => ({ ...current, checkIns }));
  }, [eventId, session]);

  useEffect(() => {
    (async () => {
      setDashboardLoadError("");
      try {
        const joinToken = new URLSearchParams(window.location.search).get("join") || localStorage.getItem("law18ref-join-token");
        if (joinToken) {
          try {
            const joined = await claimOrganizationJoinLink(session, joinToken);
            localStorage.removeItem("law18ref-join-token");
            if (joined?.organization_id) {
              localStorage.setItem("law18ref-active-organization", joined.organization_id);
              setOrganizationActionMessage(`You joined ${joined.organization_name}.`);
            }
          } catch (reason) {
            setOrganizationActionMessage(reason instanceof Error ? reason.message : "Unable to use this Join Group link.");
          }
          const url = new URL(window.location.href);
          url.searchParams.delete("join");
          history.replaceState(null, "", `${url.pathname}${url.search}`);
        }
        await recordCurrentLogin(session);
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
        const refreshEventId = sessionStorage.getItem("law18ref-refresh-event");
        const refreshView = sessionStorage.getItem("law18ref-refresh-view") as View | null;
        const selected = organizationEvents.find((item) => item.check_in_slug === eventSlug)?.id
          || organizationEvents.find((item) => item.id === refreshEventId)?.id
          || organizationEvents[0]?.id
          || "";
        setOrganizationRoles(memberships.organizations.filter((membership) => membership.organization_id === organizationId).map((membership) => membership.role));
        setEventRoles(memberships.events.filter((membership) => membership.event_id === selected).map((membership) => membership.role));
        setEventAccess(memberships.events.filter((membership) => membership.event_id === selected));
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
        if (!eventSlug && refreshView && refreshableViews.includes(refreshView)) setView(refreshView);
        sessionStorage.removeItem("law18ref-refresh-view");
        sessionStorage.removeItem("law18ref-refresh-event");
      } catch (reason) {
        if (isSessionExpiredError(reason)) onSessionExpired();
        else setDashboardLoadError(reason instanceof Error ? reason.message : "Law18Ref could not load. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [session.user.id, onSessionExpired]);

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
      setEventAccess(memberships.events.filter((membership) => membership.event_id === nextId));
    } finally {
      setLoading(false);
    }
  }

  function refreshCurrentPage() {
    sessionStorage.setItem("law18ref-refresh-view", view);
    if (eventId) sessionStorage.setItem("law18ref-refresh-event", eventId);
    else sessionStorage.removeItem("law18ref-refresh-event");
    window.location.reload();
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
      setEventAccess(memberships.events.filter((membership) => membership.event_id === nextEventId));
      setData(nextEventId ? await loadEventData(session, nextEventId) : { games: [], assignments: [], officials: [], checkIns: [], assessments: [], coachAssignments: [] });
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

  async function handleEventsChanged() {
    if (!organization) return;
    const nextEvents = await loadEvents(session);
    const organizationEvents = nextEvents.filter((item) => item.organization_id === organization.id);
    setAllEvents(nextEvents);
    setEvents(organizationEvents);
    const nextEventId = organizationEvents.some((item) => item.id === eventId) ? eventId : organizationEvents[0]?.id || "";
    setEventId(nextEventId);
    const memberships = await loadMemberships(session);
    setEventRoles(memberships.events.filter((membership) => membership.event_id === nextEventId).map((membership) => membership.role));
    setEventAccess(memberships.events.filter((membership) => membership.event_id === nextEventId));
    setData(nextEventId ? await loadEventData(session, nextEventId) : { games: [], assignments: [], officials: [], checkIns: [], assessments: [], coachAssignments: [] });
  }

  function handleEventUpdated(updated: EventRecord) {
    setEvents((current) => current.map((item) => item.id === updated.id ? updated : item));
    setAllEvents((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  const refereeOfficial = data.officials.find((item) => item.linked_user_id === session.user.id || item.email?.toLowerCase() === session.user.email?.toLowerCase());
  const unreadPublicRatingCount = refereeOfficial ? data.assessments.filter((assessment) =>
    assessment.official_id === refereeOfficial.id
    && assessment.visibility === "public"
    && assessment.status === "shared"
    && !assessment.referee_seen_at
  ).length : 0;
  async function openView(nextView: View) {
    setView(nextView);
    if (nextView === "assessments" && event && unreadPublicRatingCount) {
      await markEventRatingsSeen(session, event.id).catch(() => undefined);
      setData((current) => ({ ...current, assessments: current.assessments.map((assessment) =>
        assessment.official_id === refereeOfficial?.id && assessment.visibility === "public" && assessment.status === "shared"
          ? { ...assessment, referee_seen_at: new Date().toISOString() }
          : assessment,
      ) }));
    }
  }
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
  const coachHasCurrentOrFutureAssignment = data.coachAssignments.some((assignment) => {
    if (assignment.coach_id !== session.user.id || !event) return false;
    if (assignment.full_schedule) return event.ends_on >= todayInEvent;
    const game = data.games.find((item) => item.id === assignment.game_id);
    if (!game) return false;
    const gameDate = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(game.starts_at));
    return gameDate >= todayInEvent;
  });

  const nav: [View, string][] = isAdministrativeStaff
    ? [["dashboard", "Dashboard"], ["board", "Assignment Board"], ["checkin", "Check-In"], ["schedule", "Schedule"], ["officials", "Officials"], ["coaching", "Coaching"], ["assessments", "Ratings"], ["import", "Import"], ...(profile?.is_site_owner || organizationRoles.includes("organization_admin") ? [["activity", "Activity"] as [View, string]] : [])]
    : isSiteCoordinator
      ? [["dashboard", "Dashboard"], ["board", "Assignment Board"], ["checkin", "Check-In"], ["schedule", "Schedule"]]
    : isCoach
      ? [["dashboard", "Dashboard"], ...(coachHasCurrentOrFutureAssignment ? [["checkin", "Check-In"] as [View, string]] : []), ["schedule", "Schedule"], ["assessments", "Ratings"]]
      : [["dashboard", "Dashboard"], ["board", "My Assignments"], ...(refereeHasCurrentOrFutureAssignment ? [["checkin", "Check-In"] as [View, string]] : []), ["assessments", "My Evals"]];

  if (loading) return <main className="auth-page"><p className="auth-loading">Loading Dashboard</p></main>;
  if (dashboardLoadError) return <main className="auth-page"><section className="auth-card"><p className="eyebrow">CONNECTION ISSUE</p><h1>Unable to Load Law18Ref</h1><p>{dashboardLoadError}</p><p>Your login is still saved.</p><button className="primary" onClick={() => window.location.reload()}>Try Again</button></section></main>;
  return <main>
    <header className="topbar">
      <button className="brand" aria-label="Law18Referee Management dashboard" onClick={() => setView("dashboard")}><Mark /></button>
      <nav>{nav.map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => void openView(id)}>{label}{id === "assessments" && unreadPublicRatingCount > 0 && <span className="nav-notification-badge" aria-label={`${unreadPublicRatingCount} unread public ratings`}>{unreadPublicRatingCount > 99 ? "99+" : unreadPublicRatingCount}</span>}</button>)}</nav>
      <div className="topbar-account-actions">
        <button className="help-button" aria-label="Open role help" title="Help and how-to" onClick={() => setHelpOpen(true)}>?</button>
        <button className="page-refresh-button" aria-label="Refresh page" title="Refresh page" onClick={refreshCurrentPage}>↻</button>
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
      </div>
    </header>
    {helpOpen && <div className="confirmation-backdrop help-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}><section className="confirmation-dialog role-help-dialog" role="dialog" aria-modal="true" aria-labelledby="role-help-title">
      <header><div><p className="eyebrow">HELP & HOW-TO</p><h2 id="role-help-title">How to Navigate Law18Ref</h2><p>Follow the directions below for your role in {organization?.name || "the active organization"}.</p></div><button className="modal-close-button" aria-label="Close help" onClick={() => setHelpOpen(false)}>×</button></header>
      <aside className="role-help-roles" aria-label="Active organization roles">{activeGroupRoles.map((role) => <span className="role-badge" key={role}>{roleNames[role]}</span>)}</aside>
      <main className="role-help-content">{activeGroupRoles.map((role) => <section key={role}><h3>{helpByRole[role].title}</h3><ol>{helpByRole[role].items.map((item) => <li key={item}>{item}</li>)}</ol></section>)}{!activeGroupRoles.length && <EmptyState>No active role is assigned in this organization.</EmptyState>}</main>
      <footer className="role-help-actions"><button className="primary" onClick={() => setHelpOpen(false)}>Close Help</button></footer>
    </section></div>}
    <div className="eventbar">
      <div>{organization?.logo_url ? <img className="event-organization-logo" src={organization.logo_url} alt={`${organization.name} logo`} /> : <span className="event-mark">{organization?.name[0] || "R"}</span>}{organizations.length > 1 && <label><span>Active organization</span><select value={organization?.id || ""} onChange={(event) => switchOrganization(event.target.value)}>{organizations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}<label><span>{isStaff ? "Active event" : "My event"}</span><select value={eventId} onChange={(event) => switchEvent(event.target.value)} disabled={!events.length}><option value="">{events.length ? "Select event" : "No events yet"}</option>{events.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
      <span>{event ? formatDate(event.starts_on) : "No event imported"}</span>
    </div>
    <div className="shell">
      {organizationActionMessage && <p className="pilot-message organization-message">{organizationActionMessage}</p>}
      {qrCheckInMessage && <p className="pilot-message qr-checkin-message">{qrCheckInMessage}</p>}
      {profile && view === "dashboard" && <DashboardHome profile={profile} event={event} data={data} events={events} adminView={isAdministrativeStaff} onNavigate={setView} />}
      {event && view === "board" && (isStaff ? <AssignmentBoard data={data} /> : <RefereeDay event={event} data={data} session={session} />)}
      {event && view === "checkin" && (isStaff ? <CheckInView event={event} data={data} session={session} canManageCheckIns={isAdministrativeStaff} onRefresh={refreshCheckIns} /> : refereeHasCurrentOrFutureAssignment || coachHasCurrentOrFutureAssignment ? <RefereeCheckIn event={event} data={data} session={session} onCheckedIn={() => refresh(event.id)} /> : null)}
      {event && view === "schedule" && (isStaff || isCoach) && <ScheduleView session={session} event={event} data={data} canEdit={isAdministrativeStaff} canRateCrew={isCoach && canAssess} coachView={isCoach && !isAdministrativeStaff} onRateCrew={setRatingModalGameId} onCreated={() => refresh(event.id)} />}
      {isAdministrativeStaff && profile && organization && view === "officials" && <OfficialsDirectory session={session} profile={profile} organizationRoles={organizationRoles} eventRoles={eventRoles} canManageOrganizationRoles={Boolean(profile.is_site_owner || organizationRoles.includes("organization_admin"))} organizationId={organization.id} officials={organizationOfficials} data={data} event={event} events={events} onCreated={() => loadOrganizationOfficials(session, organization.id).then(setOrganizationOfficials)} />}
      {event && view === "coaching" && isAdministrativeStaff && <CoachWorkspace session={session} event={event} data={data} organizationOfficials={organizationOfficials} canManage onSaved={() => refresh(event.id)} />}
      {event && organization && view === "assessments" && <AssessmentCenter session={session} event={event} events={events} organizationId={organization.id} data={data} canSubmit={canAssess} canConfigure={canConfigureRatings} canApprovePublic={canApprovePublicRatings} hideWorkspace={canAssess} onOpenRating={() => setRatingModalGameId("")} onEditRating={async (gameId, targetEventId) => { if (targetEventId !== event.id) await switchEvent(targetEventId); setRatingModalGameId(gameId); }} onSaved={() => refresh(event.id)} onEventUpdated={handleEventUpdated} />}
      {isAdministrativeStaff && organization && view === "import" && profile && <ImportView session={session} profile={profile} organizationId={organization.id} organization={organization} events={events} activeEvent={event} canCreateEvent={Boolean(profile.is_site_owner || organizationRoles.includes("organization_admin") || organizationRoles.includes("event_admin"))} canManageLifecycle={Boolean(profile.is_site_owner || organizationRoles.includes("organization_admin") || eventRoles.includes("event_admin"))} canConfigureAliases={canConfigureRatings} onEventsChanged={handleEventsChanged} onImported={handleImported} />}
      {organization && view === "activity" && Boolean(profile?.is_site_owner || organizationRoles.includes("organization_admin")) && <OrganizationActivity session={session} organization={organization} events={events} onEventsChanged={handleEventsChanged} />}
      {profile && view === "account" && <AccountSettings session={session} profile={profile} onUpdated={setProfile} />}
      {view === "groups" && (allRoles.has("site_owner")
        ? <SiteGroupsAdmin session={session} ownerEmail={profile?.primary_email || profile?.email || session.user.email || ""} onOpen={(organizationId) => switchOrganization(organizationId, "dashboard")} onUpdated={(updated) => { setOrganizations((current) => current.map((item) => item.id === updated.id ? updated : item)); if (organization?.id === updated.id) setOrganization(updated); }} />
        : <GroupsSettings session={session} organization={organization} canManage={organizationRoles.includes("organization_admin")} onUpdated={(updated) => { setOrganization(updated); setOrganizations((current) => current.map((item) => item.id === updated.id ? updated : item)); }} />)}
      {view === "appearance" && allRoles.has("site_owner") && <AppearanceSettings session={session} />}
    </div>
    {event && organization && ratingModalGameId !== null && <AssessmentCenter session={session} event={event} events={events} organizationId={organization.id} data={data} canSubmit={canAssess} canConfigure={false} canApprovePublic={false} initialGameId={ratingModalGameId || undefined} modal onClose={() => setRatingModalGameId(null)} onSaved={() => refresh(event.id)} onEventUpdated={handleEventUpdated} />}
    <footer><div className="brand footer-brand"><Mark /></div><span>© 2026 Law18Ref · Version 0.9.1</span></footer>
  </main>;
}

export default function Home() {
  const [session, setSession] = useState<Law18Session | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const handleSession = useCallback((nextSession: Law18Session) => {
    setRecovery(false);
    setAuthMessage("");
    setSession(nextSession);
  }, []);
  const handleSessionExpired = useCallback(() => {
    setAuthMessage("Log back in, session expired.");
    auth.signOut();
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
  if (loading) return <main className="auth-page"><p className="auth-loading">Loading Dashboard</p></main>;
  if (!session || recovery) return <AuthPanel onSession={handleSession} recovery={recovery} initialMessage={authMessage} />;
  return <Dashboard session={session} onSessionExpired={handleSessionExpired} />;
}
