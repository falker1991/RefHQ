"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type View = "overview" | "checkin" | "schedule" | "coaching" | "assessments" | "import";
type Role = "Assignor" | "Referee" | "Referee coach";

const officials = [
  { name: "Maya Rodriguez", initials: "MR", role: "Referee", first: "8:00 AM", field: "Field 1", status: "Checked in", time: "7:24 AM" },
  { name: "Jordan Lee", initials: "JL", role: "Assistant referee", first: "8:00 AM", field: "Field 1", status: "Checked in", time: "7:31 AM" },
  { name: "Chris Bennett", initials: "CB", role: "Assistant referee", first: "8:00 AM", field: "Field 1", status: "Due soon", time: "—" },
  { name: "Avery Wilson", initials: "AW", role: "Referee", first: "8:30 AM", field: "Field 3", status: "Checked in", time: "7:42 AM" },
  { name: "Sam Patel", initials: "SP", role: "Assistant referee", first: "8:30 AM", field: "Field 3", status: "Late", time: "—" },
  { name: "Taylor Morgan", initials: "TM", role: "Referee", first: "9:00 AM", field: "Field 2", status: "Upcoming", time: "—" },
];

const games = [
  { time: "8:00 AM", field: "Field 1", match: "River City FC vs. Capital United", division: "U16 Boys • Premier", crew: "Maya R. · Jordan L. · Chris B.", status: "Crew due" },
  { time: "8:30 AM", field: "Field 3", match: "Northside SC vs. Lakeview FC", division: "U14 Girls • Gold", crew: "Avery W. · Sam P. · Devon K.", status: "Missing" },
  { time: "9:00 AM", field: "Field 2", match: "Metro Stars vs. Union Athletic", division: "U18 Boys • Showcase", crew: "Taylor M. · Casey N. · Riley J.", status: "Ready" },
  { time: "9:30 AM", field: "Field 4", match: "City Juniors vs. Eastern Elite", division: "U15 Girls • Premier", crew: "Morgan S. · Alex T. · Jamie D.", status: "Ready" },
];

const assessments = [
  { referee: "Maya Rodriguez", game: "River City FC vs. Capital United", date: "Jun 22", score: "4.4", focus: "Advantage & presence", state: "In progress" },
  { referee: "Avery Wilson", game: "Northside SC vs. Lakeview FC", date: "May 18", score: "4.1", focus: "Positioning", state: "Shared" },
  { referee: "Jordan Lee", game: "Metro Stars vs. Union Athletic", date: "Apr 27", score: "3.8", focus: "Flag technique", state: "Shared" },
];

function Mark({ small = false }: { small?: boolean }) {
  return <span className={small ? "mark small" : "mark"}><i /><i /><i /></span>;
}

function Status({ children }: { children: string }) {
  return <span className={`status ${children.toLowerCase().replace(" ", "-")}`}><b />{children}</span>;
}

function Overview({ setView }: { setView: (v: View) => void }) {
  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">SATURDAY, JUNE 28</p>
          <h1>Good morning, Alex.</h1>
          <p>Here’s what needs your attention at the Capital Cup.</p>
        </div>
        <button className="primary" onClick={() => setView("checkin")}><span className="scan-icon">⌗</span> Open check-in</button>
      </section>

      <section className="metrics" aria-label="Tournament summary">
        <article><span className="metric-icon green">✓</span><div><strong>42</strong><p>Checked in</p></div><em>of 48 due</em></article>
        <article><span className="metric-icon amber">!</span><div><strong>4</strong><p>Due soon</p></div><em>next 30 min</em></article>
        <article><span className="metric-icon red">×</span><div><strong>2</strong><p>Missing</p></div><em>needs action</em></article>
        <article><span className="metric-icon blue">◎</span><div><strong>7</strong><p>Assessments</p></div><em>3 complete</em></article>
      </section>

      <div className="content-grid">
        <section className="panel attendance">
          <div className="panel-head">
            <div><p className="eyebrow">LIVE ATTENDANCE</p><h2>Officials arriving now</h2></div>
            <button className="text-button" onClick={() => setView("checkin")}>View all <span>→</span></button>
          </div>
          <div className="official-list">
            {officials.slice(0, 5).map((person) => (
              <div className="official-row" key={person.name}>
                <span className="avatar">{person.initials}</span>
                <div className="official-name"><strong>{person.name}</strong><span>{person.role} · {person.field}</span></div>
                <div className="first-game"><span>FIRST GAME</span><strong>{person.first}</strong></div>
                <Status>{person.status}</Status>
              </div>
            ))}
          </div>
        </section>

        <aside>
          <section className="panel next-up">
            <div className="panel-head compact"><div><p className="eyebrow">NEXT UP</p><h2>8:00 AM kickoffs</h2></div><span className="count">3 games</span></div>
            {games.slice(0, 2).map((game) => (
              <button className="game-card" key={game.field} onClick={() => setView("schedule")}>
                <span className="field">{game.field}</span>
                <strong>{game.match}</strong>
                <small>{game.division}</small>
                <span className="crew"><span className="stacked">MR JL CB</span>{game.status}</span>
              </button>
            ))}
          </section>
          <section className="support">
            <span>?</span><div><strong>Need tournament help?</strong><p>View the quick-start guide or contact support.</p></div><button>Get help</button>
          </section>
        </aside>
      </div>
    </>
  );
}

function CheckIn() {
  const [checked, setChecked] = useState(false);
  return (
    <section className="page-section">
      <div className="section-title"><div><p className="eyebrow">TOURNAMENT OPERATIONS</p><h1>Referee check-in</h1><p>Capital Cup · Riverside Sports Complex</p></div><Status>Live</Status></div>
      <div className="checkin-grid">
        <article className="panel qr-panel">
          <div className="qr" aria-label="Tournament QR code">
            <QRCodeSVG value="https://refhq.app/check-in/capital-cup-2026" size={176} bgColor="#ffffff" fgColor="#12261f" level="M" />
          </div>
          <h2>Scan to check in</h2><p>Open <strong>refhq.app/check-in/capital-cup</strong> on any phone.</p>
          <button className="secondary">Download QR code</button>
        </article>
        <article className="panel self-check">
          <p className="eyebrow">MOBILE EXPERIENCE</p>
          <div className="phone-card">
            <Mark small />
            <span className="event-pill">Capital Cup</span>
            <h2>{checked ? "You’re checked in." : "Ready for match day?"}</h2>
            <p>{checked ? "Arrival recorded at 7:44 AM." : "Your first assignment is at 8:00 AM on Field 1."}</p>
            <div className="assignment-mini"><span>REFEREE</span><strong>River City FC<br />vs. Capital United</strong><small>Field 1 · 8:00 AM</small></div>
            <button className="primary wide" onClick={() => setChecked(true)} disabled={checked}>{checked ? "✓ Check-in complete" : "Check in now"}</button>
          </div>
        </article>
      </div>
      <section className="panel roster-panel">
        <div className="panel-head"><div><p className="eyebrow">TODAY’S ROSTER</p><h2>48 officials expected</h2></div><input className="search" aria-label="Search officials" placeholder="Search officials…" /></div>
        <div className="table">{officials.map(p => <div className="table-row" key={p.name}><span className="avatar">{p.initials}</span><strong>{p.name}</strong><span>{p.first} · {p.field}</span><span>{p.time}</span><Status>{p.status}</Status></div>)}</div>
      </section>
    </section>
  );
}

function Schedule() {
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">CAPITAL CUP</p><h1>Today’s schedule</h1><p>Saturday, June 28 · 24 games across 4 fields</p></div><button className="secondary">Filter schedule</button></div><div className="schedule-list">{games.map(g => <article className="panel schedule-card" key={g.match}><div className="timebox"><strong>{g.time}</strong><span>{g.field}</span></div><div><h2>{g.match}</h2><p>{g.division}</p><span className="crew-line">Crew: {g.crew}</span></div><Status>{g.status}</Status><button className="dots">•••</button></article>)}</div></section>;
}

function Coaching() {
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">REFEREE DEVELOPMENT</p><h1>Coaching assignments</h1><p>Plan observations and capture feedback while it’s fresh.</p></div><button className="primary">Assign coach</button></div><div className="coach-grid">{games.slice(0,3).map((g,i) => <article className="panel coach-card" key={g.match}><div className="coach-top"><span className="date-tile"><b>JUN</b><strong>28</strong></span><Status>{i === 0 ? "In progress" : "Planned"}</Status></div><h2>{g.match}</h2><p>{g.time} · {g.field} · {g.division}</p><hr/><span className="label">OBSERVING</span><div className="observing"><span className="avatar">{i ? "AW" : "MR"}</span><div><strong>{i ? "Avery Wilson" : "Maya Rodriguez"}</strong><small>{i ? "Referee" : "Referee · Advancement track"}</small></div></div><button className="secondary wide">{i === 0 ? "Continue assessment" : "Open game plan"}</button></article>)}</div></section>;
}

function Assessments() {
  const [saved, setSaved] = useState(false);
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">COACH WORKSPACE</p><h1>Assessment center</h1><p>Structured feedback that builds better referees.</p></div><button className="secondary">Export history</button></div><div className="assessment-grid"><form className="panel assessment-form" onSubmit={(e)=>{e.preventDefault();setSaved(true)}}><div className="panel-head"><div><p className="eyebrow">ACTIVE ASSESSMENT</p><h2>Maya Rodriguez</h2><p>River City FC vs. Capital United · Referee</p></div><span className="avatar big">MR</span></div>{["Positioning & movement","Decision making","Communication","Match control"].map((label,index)=><label className="rating" key={label}><span><strong>{label}</strong><small>{["Finds credible angles and anticipates play.","Applies the laws with accuracy and context.","Clear signals and confident presence.","Sets the temperature and manages players."][index]}</small></span><select defaultValue={index===3?"3":"4"}><option value="1">1 — Needs work</option><option value="2">2 — Developing</option><option value="3">3 — Effective</option><option value="4">4 — Strong</option><option value="5">5 — Exceptional</option></select></label>)}<label className="notes"><strong>Coach’s notes</strong><textarea defaultValue="Strong diagonal movement and calm communication. Look for earlier opportunities to use public warnings before the match temperature rises." /></label><button className="primary wide">{saved ? "✓ Assessment saved" : "Save assessment"}</button></form><section className="panel history"><div className="panel-head"><div><p className="eyebrow">RECENT</p><h2>Assessment history</h2></div></div>{assessments.map(a=><article key={a.referee}><div><strong>{a.referee}</strong><p>{a.game}</p><small>{a.date} · Focus: {a.focus}</small></div><span className="score">{a.score}</span><Status>{a.state}</Status></article>)}</section></div></section>;
}

function ImportView() {
  const [file, setFile] = useState("");
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">ASSIGNR BRIDGE</p><h1>Import a schedule</h1><p>Bring event, game, and crew data into RefHQ in minutes.</p></div></div><div className="import-grid"><article className="panel import-card"><span className="upload-icon">↑</span><h2>{file || "Drop your Assignr CSV here"}</h2><p>CSV files up to 10 MB. You’ll review every row before anything is added.</p><label className="primary file-button">Choose CSV<input type="file" accept=".csv" onChange={e=>setFile(e.target.files?.[0]?.name || "")}/></label></article><article className="panel mapping"><p className="eyebrow">EXPECTED COLUMNS</p><h2>A simple, forgiving importer</h2>{["Date and start time","Venue and field","Home and away teams","Official name, email, and position"].map((x,i)=><div key={x}><span>{i+1}</span><p><strong>{x}</strong><small>Recognized automatically or mapped during review.</small></p></div>)}<button className="text-button">Download sample CSV →</button></article></div></section>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [role, setRole] = useState<Role>("Assignor");
  const nav = useMemo(() => role === "Referee" ? [["overview","My day"],["checkin","Check in"],["schedule","Schedule"],["assessments","My feedback"]] : role === "Referee coach" ? [["overview","Overview"],["schedule","Schedule"],["coaching","Coaching"],["assessments","Assessments"]] : [["overview","Overview"],["checkin","Check-in"],["schedule","Schedule"],["coaching","Coaching"],["assessments","Assessments"],["import","Import"]], [role]) as [View,string][];
  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => setView("overview")}><Mark /><span><strong>RefHQ</strong><small>PROVIDED BY FALKSPORTS</small></span></button>
        <nav>{nav.map(([id,label])=><button key={id} className={view===id?"active":""} onClick={()=>setView(id)}>{label}</button>)}</nav>
        <div className="account"><span className="live-dot" /><select aria-label="Preview role" value={role} onChange={e=>{setRole(e.target.value as Role);setView("overview")}}><option>Assignor</option><option>Referee</option><option>Referee coach</option></select><span className="avatar">AF</span></div>
      </header>
      <div className="eventbar"><div><span className="event-mark">C</span><p><strong>Capital Cup 2026</strong><small>Riverside Sports Complex · Jun 28–29</small></p></div><span className="weather">☀ 72°F · Clear</span></div>
      <div className="shell">{view==="overview"&&<Overview setView={setView}/>} {view==="checkin"&&<CheckIn/>} {view==="schedule"&&<Schedule/>} {view==="coaching"&&<Coaching/>} {view==="assessments"&&<Assessments/>} {view==="import"&&<ImportView/>}</div>
      <footer><div className="brand footer-brand"><Mark small/><span><strong>RefHQ</strong><small>PROVIDED BY FALKSPORTS</small></span></div><p>Better prepared. Better supported. Better officiating.</p><span>© 2026 FalkSports</span></footer>
    </main>
  );
}
