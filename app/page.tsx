"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AuthPanel } from "./auth-panel";
import { auth, type RefHQSession } from "./auth-client";
import {
  checkIn,
  importTournament,
  linkCurrentReferee,
  loadEventData,
  loadEvents,
  loadProfile,
  parseAssignrCsv,
  type AssignmentRecord,
  type CheckInRecord,
  type EventRecord,
  type GameRecord,
  type ImportRow,
  type OfficialRecord,
  type Profile,
} from "./supabase-client";

type View = "board" | "checkin" | "schedule" | "coaching" | "assessments" | "import";
type EventData = {
  games: GameRecord[];
  assignments: AssignmentRecord[];
  officials: OfficialRecord[];
  checkIns: CheckInRecord[];
};

function Mark() {
  return <span className="mark"><i /><i /><i /></span>;
}

function initials(name: string) {
  return name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat([], { weekday: "long", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function positionLabel(position: AssignmentRecord["position"]) {
  return {
    referee: "Referee",
    assistant_referee: "Assistant referee",
    fourth_official: "Fourth official",
    mentor: "Mentor",
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
  const checked = useMemo(() => new Set(data.checkIns.filter((item) => item.status === "checked_in").map((item) => item.official_id)), [data.checkIns]);
  const fields = [...new Set(data.games.map((game) => game.field_name))];
  const times = [...new Set(data.games.map((game) => formatTime(game.starts_at)))];
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
                    const isChecked = checked.has(assignment.official_id);
                    return <span className={isChecked ? "crew-chip arrived" : "crew-chip"} key={assignment.id} title={positionLabel(assignment.position)}>
                      <b>{official ? initials(official.full_name) : "?"}</b>
                      <span>{official?.full_name || "Unassigned"}</span>
                      <small>{positionLabel(assignment.position)}</small>
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
  onCheckedIn,
}: {
  event: EventRecord;
  data: EventData;
  session: RefHQSession;
  onCheckedIn: () => void;
}) {
  const email = session.user.email?.toLowerCase();
  const official = data.officials.find((item) => item.email.toLowerCase() === email);
  const assignments = official ? data.assignments.filter((item) => item.official_id === official.id) : [];
  const games = assignments.map((assignment) => ({
    assignment,
    game: data.games.find((game) => game.id === assignment.game_id),
  })).filter((item): item is { assignment: AssignmentRecord; game: GameRecord } => Boolean(item.game));
  const isChecked = Boolean(official && data.checkIns.some((item) => item.official_id === official.id && item.status === "checked_in"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleCheckIn(method: "qr" | "app" = "app") {
    if (!official) return;
    setBusy(true);
    try {
      await checkIn(session, event.id, official.id, method);
      setMessage("You’re checked in. Have a great day!");
      onCheckedIn();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to check in.");
    } finally {
      setBusy(false);
    }
  }

  if (!official || !games.length) return <EmptyState>No imported assignments match {session.user.email}. Ask your assignor to confirm the email in the CSV.</EmptyState>;
  return <section className="referee-home">
    <div className="referee-hero">
      <p className="eyebrow">MY TOURNAMENT DAY</p>
      <h1>Hi, {official.full_name.split(" ")[0]}.</h1>
      <p>{event.name} · {event.venue_name}</p>
      <button className="primary checkin-cta" disabled={busy || isChecked} onClick={() => handleCheckIn("app")}>
        {isChecked ? "✓ Checked in" : busy ? "Checking in…" : "Check in now"}
      </button>
      {message && <p className="pilot-message">{message}</p>}
    </div>
    <section className="mobile-actions">
      <a href="#my-schedule"><span>☷</span><strong>My schedule</strong></a>
      <a href="#scan"><span>⌗</span><strong>Scan QR</strong></a>
      <button onClick={() => handleCheckIn("app")} disabled={isChecked}><span>✓</span><strong>Check in</strong></button>
    </section>
    <section className="panel my-games" id="my-schedule">
      <div className="panel-head"><div><p className="eyebrow">ASSIGNED — NO ACCEPTANCE REQUIRED</p><h2>Today’s games</h2></div></div>
      {games.map(({ assignment, game }) => <article key={assignment.id}>
        <time>{formatTime(game.starts_at)}</time>
        <div><strong>{game.home_team} vs. {game.away_team}</strong><p>{game.field_name} · {positionLabel(assignment.position)}</p></div>
        <Status checked={isChecked} />
      </article>)}
    </section>
    <QrScanner onFound={() => handleCheckIn("qr")} />
  </section>;
}

function QrScanner({ onFound }: { onFound: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !("BarcodeDetector" in window)) {
      setMessage("Use your phone’s Camera app to scan the event QR, or tap Check in.");
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
          onFound();
          return;
        }
        window.setTimeout(scan, 350);
      };
      window.setTimeout(scan, 600);
    } catch {
      setMessage("Camera access was not available. You can still tap Check in.");
    }
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  return <section className="panel scanner-card" id="scan">
    <div><p className="eyebrow">EVENT QR</p><h2>Scan at referee headquarters</h2><p>Use RefHQ or your phone’s Camera app.</p></div>
    <video ref={videoRef} autoPlay muted playsInline className={scanning ? "scanner-video active" : "scanner-video"} />
    <button className="secondary" onClick={start} disabled={scanning}>{scanning ? "Scanning…" : "Open QR scanner"}</button>
    {message && <p className="pilot-message">{message}</p>}
  </section>;
}

function CheckInView({ event, data, isStaff }: { event: EventRecord; data: EventData; isStaff: boolean }) {
  const url = `${window.location.origin}/?event=${event.check_in_slug}`;
  const checked = new Set(data.checkIns.map((item) => item.official_id));
  return <section className="page-section">
    <div className="section-title"><div><p className="eyebrow">TOURNAMENT CHECK-IN</p><h1>Arrival station</h1><p>Display or print this code at referee headquarters.</p></div></div>
    <div className="checkin-grid">
      <article className="panel qr-panel"><div className="qr"><QRCodeSVG value={url} size={210} /></div><h2>{event.name}</h2><p>{url}</p></article>
      <article className="panel roster-panel"><div className="panel-head"><div><p className="eyebrow">LIVE ROSTER</p><h2>{checked.size} checked in</h2></div></div>
        {data.officials.map((official) => <div className="official-row" key={official.id}><span className="avatar">{initials(official.full_name)}</span><div className="official-name"><strong>{official.full_name}</strong><span>{official.email}</span></div><Status checked={checked.has(official.id)} /></div>)}
        {!data.officials.length && <EmptyState>No officials have been imported.</EmptyState>}
      </article>
    </div>
    {!isStaff && <p className="pilot-message">Your personal check-in button is on My day.</p>}
  </section>;
}

function ScheduleView({ data }: { data: EventData }) {
  const officials = new Map(data.officials.map((official) => [official.id, official]));
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">EVENT SCHEDULE</p><h1>Games and crews</h1><p>{data.games.length} imported games</p></div></div>
    <div className="schedule-list">{data.games.map((game) => {
      const crew = data.assignments.filter((assignment) => assignment.game_id === game.id);
      return <article className="panel schedule-card" key={game.id}><div className="timebox"><strong>{formatTime(game.starts_at)}</strong><span>{game.field_name}</span></div><div><h2>{game.home_team} vs. {game.away_team}</h2><p>{game.division}</p><span className="crew-line">{crew.map((assignment) => `${positionLabel(assignment.position)}: ${officials.get(assignment.official_id)?.full_name || "Open"}`).join(" · ")}</span></div></article>;
    })}</div>
  </section>;
}

function ImportView({
  session,
  profile,
  onImported,
}: {
  session: RefHQSession;
  profile: Profile;
  onImported: (event: EventRecord) => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState({ name: "", venue: "", startsOn: "", endsOn: "" });

  async function readFile(file?: File) {
    if (!file) return;
    try {
      const parsed = parseAssignrCsv(await file.text());
      setRows(parsed);
      setFileName(file.name);
      const dates = parsed.map((row) => row.date).sort();
      setDetails({
        name: file.name.replace(/\.csv$/i, "").replace(/[-_]+/g, " "),
        venue: parsed[0].venue,
        startsOn: dates[0],
        endsOn: dates[dates.length - 1],
      });
      setMessage(`${parsed.length} assignment rows are ready to review.`);
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : "Unable to read that CSV.");
    }
  }

  async function confirmImport() {
    if (!rows.length || !details.name || !details.venue) return;
    setBusy(true);
    setMessage("Importing tournament…");
    try {
      const event = await importTournament(session, profile, { ...details, fileName }, rows);
      setMessage("Tournament imported successfully.");
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
    <div className="section-title"><div><p className="eyebrow">ASSIGNR BRIDGE</p><h1>Import a tournament</h1><p>Assignments arrive confirmed; referees only need to sign in and check in.</p></div></div>
    <div className="import-grid">
      <article className="panel import-card">
        <span className="upload-icon">↑</span><h2>{fileName || "Choose an Assignr CSV"}</h2>
        <p>Expected columns match the downloadable RefHQ template.</p>
        <label className="primary file-button">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => readFile(event.target.files?.[0])} /></label>
        <a className="text-button sample-link" href="/assignr-schedule.csv" download>Download sample CSV</a>
      </article>
      <article className="panel import-review">
        <p className="eyebrow">IMPORT REVIEW</p><h2>{rows.length ? `${games} games · ${referees} referees` : "Select a file to begin"}</h2>
        <label>Event name<input value={details.name} onChange={(event) => setDetails({ ...details, name: event.target.value })} /></label>
        <label>Primary venue<input value={details.venue} onChange={(event) => setDetails({ ...details, venue: event.target.value })} /></label>
        <div className="date-fields"><label>Starts<input type="date" value={details.startsOn} onChange={(event) => setDetails({ ...details, startsOn: event.target.value })} /></label><label>Ends<input type="date" value={details.endsOn} onChange={(event) => setDetails({ ...details, endsOn: event.target.value })} /></label></div>
        {message && <p className="pilot-message">{message}</p>}
        <button className="primary wide" disabled={busy || !rows.length} onClick={confirmImport}>{busy ? "Importing…" : "Import tournament"}</button>
      </article>
    </div>
    {rows.length > 0 && <div className="panel preview-table"><table><thead><tr><th>Game</th><th>Date/time</th><th>Field</th><th>Official</th><th>Position</th></tr></thead><tbody>{rows.slice(0, 12).map((row, index) => <tr key={`${row.external_id}-${row.official_email}-${index}`}><td>{row.home_team} vs. {row.away_team}</td><td>{row.date} {row.start_time}</td><td>{row.field}</td><td>{row.official_name}<small>{row.official_email}</small></td><td>{row.position}</td></tr>)}</tbody></table>{rows.length > 12 && <p>Showing 12 of {rows.length} rows.</p>}</div>}
  </section>;
}

function Placeholder({ title, copy }: { title: string; copy: string }) {
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">PILOT WORKSPACE</p><h1>{title}</h1><p>{copy}</p></div></div><EmptyState>This area is ready for the next pilot iteration.</EmptyState></section>;
}

function Dashboard({ session }: { session: RefHQSession }) {
  const [view, setView] = useState<View>("board");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventId, setEventId] = useState("");
  const [data, setData] = useState<EventData>({ games: [], assignments: [], officials: [], checkIns: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isStaff = profile?.role === "admin" || profile?.role === "assignor";
  const isCoach = profile?.role === "coach";
  const event = events.find((item) => item.id === eventId);

  const refresh = useCallback(async (selectedId = eventId) => {
    if (!selectedId) return;
    setData(await loadEventData(session, selectedId));
  }, [eventId, session]);

  useEffect(() => {
    (async () => {
      try {
        await linkCurrentReferee(session);
        const [currentProfile, availableEvents] = await Promise.all([loadProfile(session), loadEvents(session)]);
        setProfile(currentProfile);
        setEvents(availableEvents);
        const slug = new URLSearchParams(window.location.search).get("event");
        const selected = availableEvents.find((item) => item.check_in_slug === slug)?.id || availableEvents[0]?.id || "";
        setEventId(selected);
        if (selected) setData(await loadEventData(session, selected));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to load RefHQ.");
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  async function switchEvent(nextId: string) {
    setEventId(nextId);
    setLoading(true);
    try {
      setData(await loadEventData(session, nextId));
      setView(isStaff ? "board" : "schedule");
    } finally {
      setLoading(false);
    }
  }

  async function handleImported(newEvent: EventRecord) {
    const nextEvents = await loadEvents(session);
    setEvents(nextEvents);
    await switchEvent(newEvent.id);
  }

  const nav: [View, string][] = isStaff
    ? [["board", "Assignment board"], ["checkin", "Check-in"], ["schedule", "Schedule"], ["coaching", "Coaching"], ["assessments", "Assessments"], ["import", "Import"]]
    : isCoach
      ? [["schedule", "Schedule"], ["coaching", "Coaching"], ["assessments", "Assessments"]]
      : [["board", "My day"], ["checkin", "QR check-in"], ["schedule", "Schedule"], ["assessments", "My feedback"]];

  if (loading) return <main className="auth-page"><p className="auth-loading">Loading tournament data…</p></main>;
  if (error) return <main className="auth-page"><section className="auth-card"><h1>Setup needed</h1><p className="auth-intro">{error}</p><p>Run the latest RefHQ Supabase migration, then reload this page.</p><button className="secondary wide" onClick={() => auth.signOut()}>Sign out</button></section></main>;

  return <main>
    <header className="topbar">
      <button className="brand" onClick={() => setView(isStaff ? "board" : "schedule")}><Mark /><span><strong>RefHQ</strong><small>PROVIDED BY FALKSPORTS</small></span></button>
      <nav>{nav.map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</nav>
      <button className="avatar account-avatar" aria-label="Sign out" title="Sign out" onClick={() => auth.signOut()}>{initials(profile?.full_name || session.user.email || "RH")}</button>
    </header>
    <div className="eventbar">
      <div><span className="event-mark">{event?.name[0] || "R"}</span><label><span>{isStaff ? "Active event" : "My event"}</span><select value={eventId} onChange={(event) => switchEvent(event.target.value)} disabled={!events.length}>{events.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
      <span>{event ? `${event.venue_name} · ${formatDate(event.starts_on)}` : "No event imported"}</span>
    </div>
    <div className="shell">
      {!event && isStaff && <ImportView session={session} profile={profile!} onImported={handleImported} />}
      {event && view === "board" && (isStaff ? <AssignmentBoard data={data} /> : <RefereeDay event={event} data={data} session={session} onCheckedIn={() => refresh(event.id)} />)}
      {event && view === "checkin" && <CheckInView event={event} data={data} isStaff={Boolean(isStaff)} />}
      {event && view === "schedule" && <ScheduleView data={data} />}
      {event && view === "coaching" && <Placeholder title="Coaching assignments" copy="Assign coaches to this event and its matches." />}
      {event && view === "assessments" && <Placeholder title="Assessment center" copy="Complete and review structured referee feedback." />}
      {isStaff && view === "import" && profile && <ImportView session={session} profile={profile} onImported={handleImported} />}
    </div>
    <footer><div className="brand footer-brand"><Mark /><span><strong>RefHQ</strong><small>PROVIDED BY FALKSPORTS</small></span></div><p>Better prepared. Better supported. Better officiating.</p><span>© 2026 FalkSports</span></footer>
  </main>;
}

export default function Home() {
  const [session, setSession] = useState<RefHQSession | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [loading, setLoading] = useState(true);
  const handleSession = useCallback((nextSession: RefHQSession) => {
    setRecovery(false);
    setSession(nextSession);
  }, []);
  useEffect(() => {
    const initial = auth.initialize();
    setSession(initial.recovery ? null : initial.session);
    setRecovery(initial.recovery);
    setLoading(false);
    return auth.subscribe(setSession);
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  if (loading) return <main className="auth-page"><p className="auth-loading">Loading RefHQ…</p></main>;
  if (!session || recovery) return <AuthPanel onSession={handleSession} recovery={recovery} />;
  return <Dashboard session={session} />;
}
