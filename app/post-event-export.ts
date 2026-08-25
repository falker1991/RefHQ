import type { AssignmentRecord, AssessmentRecord, AttendanceExpectationOverride, CheckInRecord, CoachAssignmentRecord, EventRecord, GameRecord, OfficialRecord } from "./supabase-client";
import { downloadExcelWorkbook } from "./excel-export.ts";

export type PostEventExportData = {
  games: GameRecord[];
  assignments: AssignmentRecord[];
  officials: OfficialRecord[];
  checkIns: CheckInRecord[];
  attendanceOverrides: AttendanceExpectationOverride[];
  assessments: AssessmentRecord[];
  coachAssignments: CoachAssignmentRecord[];
};

export type PostEventSheet = { name: string; rows: unknown[][]; widths: number[]; freezeRow: number; autoFilterRow?: number };

function filenamePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
}

function dateKey(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function dateLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat([], { timeZone: timezone, weekday: "short", year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat([], { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function positionLabel(assignment?: Pick<AssignmentRecord, "position" | "position_title"> | null) {
  if (!assignment) return "Other";
  if (assignment.position_title?.trim()) return assignment.position_title.trim();
  return ({ referee: "Referee", assistant_referee: "Assistant Referee", fourth_official: "Fourth Official", mentor: "Mentor", referee_coach: "Referee Coach", site_coordinator: "Site Coordinator", site_supervisor: "Site Supervisor", standby: "Standby", other: "Official" } as const)[assignment.position];
}

function positionGroup(position?: AssignmentRecord["position"] | null) {
  if (position === "referee") return "Ref";
  if (position === "assistant_referee") return "AR";
  if (position === "fourth_official") return "4th";
  return "Other";
}

function assessmentScore(assessment: AssessmentRecord) {
  if (assessment.evaluation_type === "basic_eval") return assessment.overall_rating;
  const values = [assessment.positioning, assessment.decision_making, assessment.communication, assessment.match_control].filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function average(values: Array<number | null>) {
  const scored = values.filter((value): value is number => value !== null);
  return scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : null;
}

function lastNameKey(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts.at(-1) || ""}\u0000${name}`;
}

function checkInMethod(method?: string) {
  if (!method) return "";
  if (method === "assignor") return "Manual";
  if (method === "guest_qr") return "External Check-In";
  if (method === "qr" || method === "app") return "Account Check-In";
  return method.replaceAll("_", " ");
}

function crewPriority(assignment: AssignmentRecord) {
  const title = `${assignment.position_title || ""} ${assignment.source_position_title || ""}`.toLowerCase();
  const assistantNumber = Number(title.match(/(?:ar|assistant referee|asst\.? referee)\s*#?\s*(\d+)/)?.[1] || 50);
  if (assignment.position === "referee") return 0;
  if (assignment.position === "assistant_referee") return 100 + assistantNumber;
  if (assignment.position === "fourth_official") return 300;
  return 400 + (assignment.crew_order || 0);
}

function sortCrew(assignments: AssignmentRecord[]) {
  return assignments.map((assignment, index) => ({ assignment, index })).sort((a, b) => crewPriority(a.assignment) - crewPriority(b.assignment) || (a.assignment.crew_order ?? a.index) - (b.assignment.crew_order ?? b.index) || a.index - b.index).map(({ assignment }) => assignment);
}

function ratingPosition(assessment: AssessmentRecord, assignments: AssignmentRecord[]) {
  return assessment.rated_position || assignments.find((assignment) => assignment.game_id === assessment.game_id && assignment.official_id === assessment.official_id)?.position || "other";
}

function ratingStats(assessments: AssessmentRecord[], assignments: AssignmentRecord[]) {
  const eligible = assessments.filter((assessment) => assessment.status !== "draft" && assessment.include_in_averages !== false);
  const group = (position?: AssignmentRecord["position"]) => eligible.filter((assessment) => !position || ratingPosition(assessment, assignments) === position);
  const summary = (items: AssessmentRecord[]) => ({ count: items.length, average: average(items.map(assessmentScore)) });
  return { total: summary(group()), referee: summary(group("referee")), ar: summary(group("assistant_referee")), fourth: summary(group("fourth_official")), other: summary(eligible.filter((assessment) => !["referee", "assistant_referee", "fourth_official"].includes(ratingPosition(assessment, assignments)))) };
}

function ratingSummaryRows(event: EventRecord, assessments: AssessmentRecord[], assignments: AssignmentRecord[]) {
  const stats = ratingStats(assessments, assignments);
  return [
    [`${event.name} — Ratings Summary`],
    ["Position", "Rating Count", "Average Score"],
    ["All Positions", stats.total.count, stats.total.average],
    ["Referee", stats.referee.count, stats.referee.average],
    ["Assistant Referee", stats.ar.count, stats.ar.average],
    ["Fourth Official", stats.fourth.count, stats.fourth.average],
    ["Other Positions", stats.other.count, stats.other.average],
    [],
  ];
}

export function buildPostEventSummarySheets(event: EventRecord, data: PostEventExportData): PostEventSheet[] {
  const games = [...data.games].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.field_name.localeCompare(b.field_name, undefined, { numeric: true }));
  const gameMap = new Map(games.map((game) => [game.id, game]));
  const officialMap = new Map(data.officials.map((official) => [official.id, official]));
  const submittedRatings = data.assessments.filter((assessment) => assessment.status !== "draft" && !assessment.deleted_at);
  const dates = [...new Set(games.map((game) => dateKey(game.starts_at, event.timezone)))].sort();
  const ratingDate = (assessment: AssessmentRecord) => gameMap.get(assessment.game_id) ? dateKey(gameMap.get(assessment.game_id)!.starts_at, event.timezone) : "";

  const frontRows: unknown[][] = [[`${event.name} — Post-Event Summary`], [`${event.starts_on} through ${event.ends_on}`, event.venue_name], [], ["Date", "Games", "Fields", "Officials", "Overall Average Rating", "Ratings Submitted"]];
  dates.forEach((date) => {
    const dayGames = games.filter((game) => dateKey(game.starts_at, event.timezone) === date);
    const dayGameIds = new Set(dayGames.map((game) => game.id));
    const officialIds = new Set(data.assignments.filter((assignment) => dayGameIds.has(assignment.game_id)).map((assignment) => assignment.official_id));
    data.coachAssignments.forEach((coach) => {
      const applies = coach.full_schedule ? dayGames.length > 0 : Boolean(coach.game_id && dayGameIds.has(coach.game_id));
      const official = data.officials.find((item) => item.id === coach.coach_official_id || item.linked_user_id === coach.coach_id);
      if (applies && official) officialIds.add(official.id);
    });
    const dayRatings = submittedRatings.filter((assessment) => ratingDate(assessment) === date);
    const countedScores = dayRatings.filter((assessment) => assessment.include_in_averages !== false).map(assessmentScore);
    frontRows.push([dateLabel(dayGames[0]?.starts_at || `${date}T12:00:00`, event.timezone), dayGames.length, new Set(dayGames.map((game) => game.field_name)).size, officialIds.size, average(countedScores), dayRatings.length]);
  });
  const totalStats = ratingStats(submittedRatings, data.assignments);
  frontRows.push([], ["Event Totals", games.length, new Set(games.map((game) => game.field_name)).size, new Set(data.assignments.map((assignment) => assignment.official_id)).size, totalStats.total.average, submittedRatings.length]);

  const maximumCrew = Math.max(0, ...games.map((game) => data.assignments.filter((assignment) => assignment.game_id === game.id).length));
  const scheduleHeadings = ["Date", "Time", "Site", "Field", "Home Team", "Away Team", "Age Group", "Gender", "Competition", "Game Type"];
  for (let index = 1; index <= maximumCrew; index += 1) scheduleHeadings.push(`Position ${index}`, `Official ${index}`);
  const scheduleSheets = dates.map((date) => {
    const dayGames = games.filter((game) => dateKey(game.starts_at, event.timezone) === date);
    const scheduleRows: unknown[][] = [[`${event.name} — Game Schedule — ${dateLabel(dayGames[0]?.starts_at || `${date}T12:00:00`, event.timezone)}`], [], scheduleHeadings];
    dayGames.forEach((game) => {
      const row: unknown[] = [dateLabel(game.starts_at, event.timezone), timeLabel(game.starts_at, event.timezone), game.venue_name || event.venue_name, game.field_name, game.home_team, game.away_team, game.age_group || "", game.gender || "", game.division || "", game.game_type || ""];
      sortCrew(data.assignments.filter((assignment) => assignment.game_id === game.id)).forEach((assignment) => row.push(positionLabel(assignment), officialMap.get(assignment.official_id)?.full_name || "Open"));
      while (row.length < scheduleHeadings.length) row.push("");
      scheduleRows.push(row);
    });
    return { name: `Schedule ${date}`, rows: scheduleRows, widths: scheduleHeadings.map((heading) => heading.includes("Team") || heading.includes("Official") ? 25 : 16), freezeRow: 3, autoFilterRow: 3 };
  });

  const ratingBaseFields = (assessment: AssessmentRecord) => {
    const game = gameMap.get(assessment.game_id);
    const position = ratingPosition(assessment, data.assignments);
    return [game ? dateLabel(game.starts_at, event.timezone) : "", game ? timeLabel(game.starts_at, event.timezone) : "", game?.field_name || "", game?.home_team || "", game?.away_team || "", game?.age_group || "", game?.gender || "", officialMap.get(assessment.official_id)?.full_name || "Unknown", positionLabel({ position, position_title: assessment.rated_position_title || null }), assessment.evaluation_type === "basic_eval" ? "Basic Eval" : "Skills Eval", assessmentScore(assessment), assessment.include_in_averages === false ? "No" : "Yes", officialMap.get(assessment.coach_id)?.full_name || data.officials.find((official) => official.linked_user_id === assessment.coach_id)?.full_name || "Unknown", assessment.submitted_at || assessment.created_at || ""];
  };
  const individualHeadings = ["Date", "Time", "Field", "Home Team", "Away Team", "Age Group", "Gender", "Official", "Position", "Eval Type", "Score", "Counted in Averages", "Submitted By", "Submitted At", "Positioning / Movement", "Signaling / Offside", "Teamwork", "Match Control / Technical Area", "Positive Areas of Performance", "Areas for Improvement", "Additional Comments / Suggestions", "Private Coach / Admin Notes", "Visibility", "Archived"];
  const individualRows: unknown[][] = [...ratingSummaryRows(event, submittedRatings, data.assignments), individualHeadings];
  submittedRatings.slice().sort((a, b) => (gameMap.get(a.game_id)?.starts_at || "").localeCompare(gameMap.get(b.game_id)?.starts_at || "") || lastNameKey(officialMap.get(a.official_id)?.full_name || "").localeCompare(lastNameKey(officialMap.get(b.official_id)?.full_name || ""))).forEach((assessment) => individualRows.push([...ratingBaseFields(assessment), assessment.positioning, assessment.decision_making, assessment.communication, assessment.match_control, assessment.strengths || "", assessment.development_focus || "", assessment.additional_comments || "", assessment.coach_notes || "", assessment.visibility, assessment.archived_at ? "Yes" : "No"]));

  const submissions = [...submittedRatings.reduce((groups, assessment) => { const key = `${assessment.game_id}:${assessment.coach_id}`; groups.set(key, [...(groups.get(key) || []), assessment]); return groups; }, new Map<string, AssessmentRecord[]>()).values()].sort((a, b) => (gameMap.get(a[0].game_id)?.starts_at || "").localeCompare(gameMap.get(b[0].game_id)?.starts_at || "") || a[0].coach_id.localeCompare(b[0].coach_id));
  const maximumRatedCrew = Math.max(0, ...submissions.map((submission) => submission.length));
  const gameRatingHeadings = ["Date", "Time", "Field", "Home Team", "Away Team", "Age Group", "Gender", "Submitted By", "Submitted At", "Ratings in Submission", "Submission Average"];
  for (let index = 1; index <= maximumRatedCrew; index += 1) gameRatingHeadings.push(`Official ${index}`, `Position ${index}`, `Eval Type ${index}`, `Score ${index}`, `Counted ${index}`, `Positive Areas ${index}`, `Improvement Areas ${index}`, `Additional Comments ${index}`, `Private Notes ${index}`);
  const gameRatingRows: unknown[][] = [...ratingSummaryRows(event, submittedRatings, data.assignments), gameRatingHeadings];
  submissions.forEach((ratings) => {
    const game = gameMap.get(ratings[0].game_id);
    const scores = ratings.filter((assessment) => assessment.include_in_averages !== false).map(assessmentScore);
    const submitter = data.officials.find((official) => official.linked_user_id === ratings[0].coach_id)?.full_name || "Unknown";
    const row: unknown[] = [game ? dateLabel(game.starts_at, event.timezone) : "", game ? timeLabel(game.starts_at, event.timezone) : "", game?.field_name || "", game?.home_team || "", game?.away_team || "", game?.age_group || "", game?.gender || "", submitter, ratings[0].submitted_at || ratings[0].created_at || "", ratings.length, average(scores)];
    ratings.slice().sort((a, b) => crewPriority({ id: a.id, game_id: a.game_id, official_id: a.official_id, position: ratingPosition(a, data.assignments), position_title: a.rated_position_title || null, source_position_title: null }) - crewPriority({ id: b.id, game_id: b.game_id, official_id: b.official_id, position: ratingPosition(b, data.assignments), position_title: b.rated_position_title || null, source_position_title: null })).forEach((assessment) => row.push(officialMap.get(assessment.official_id)?.full_name || "Unknown", positionLabel({ position: ratingPosition(assessment, data.assignments), position_title: assessment.rated_position_title || null }), assessment.evaluation_type === "basic_eval" ? "Basic Eval" : "Skills Eval", assessmentScore(assessment), assessment.include_in_averages === false ? "No" : "Yes", assessment.strengths || "", assessment.development_focus || "", assessment.additional_comments || "", assessment.coach_notes || ""));
    while (row.length < gameRatingHeadings.length) row.push("");
    gameRatingRows.push(row);
  });

  const officialsHeadings = ["Full Name", "Primary Email", "Secondary Email", "Phone", "Date of Birth", "Badge / Level", "USSF ID", "Account Status", "Group Roles", "Last Active", "Total Ratings", "Overall Average", "Ref Ratings", "Ref Average", "AR Ratings", "AR Average", "4th Ratings", "4th Average", "Other Ratings", "Other Average"];
  const eventOfficialIds = new Set([...data.assignments.map((assignment) => assignment.official_id), ...data.coachAssignments.map((coach) => coach.coach_official_id).filter((id): id is string => Boolean(id))]);
  const officialsRows: unknown[][] = [[`${event.name} — Event Officials`], [], officialsHeadings];
  data.officials.filter((official) => eventOfficialIds.has(official.id)).sort((a, b) => lastNameKey(a.full_name).localeCompare(lastNameKey(b.full_name), undefined, { sensitivity: "base" })).forEach((official) => {
    const stats = ratingStats(submittedRatings.filter((assessment) => assessment.official_id === official.id), data.assignments);
    officialsRows.push([official.full_name, official.email || "", official.secondary_email || "", official.phone || "", official.date_of_birth || "", official.badge_level || "", official.ussf_id || "", official.linked_user_id ? "Linked" : "Provisional", (official.pending_org_roles || [official.pending_org_role || "referee"]).join(", "), official.last_login_at || "", stats.total.count, stats.total.average, stats.referee.count, stats.referee.average, stats.ar.count, stats.ar.average, stats.fourth.count, stats.fourth.average, stats.other.count, stats.other.average]);
  });

  const checkInRows: unknown[][] = [[`${event.name} — Check-In Summary`], [], ["Date", "Official", "First Assignment Time", "First Assignment Field", "Check-In Status", "Check-In Time", "Check-In Method"]];
  dates.forEach((date) => {
    const dayGames = games.filter((game) => dateKey(game.starts_at, event.timezone) === date);
    const dayGameIds = new Set(dayGames.map((game) => game.id));
    const expected = new Set(data.assignments.filter((assignment) => dayGameIds.has(assignment.game_id)).map((assignment) => assignment.official_id));
    data.coachAssignments.forEach((coach) => { const applies = coach.full_schedule ? dayGames.length > 0 : Boolean(coach.game_id && dayGameIds.has(coach.game_id)); const official = data.officials.find((item) => item.id === coach.coach_official_id || item.linked_user_id === coach.coach_id); if (applies && official) expected.add(official.id); });
    [...expected].map((id) => officialMap.get(id)).filter((official): official is OfficialRecord => Boolean(official)).sort((a, b) => lastNameKey(a.full_name).localeCompare(lastNameKey(b.full_name))).forEach((official) => {
      const firstGame = dayGames.filter((game) => data.assignments.some((assignment) => assignment.game_id === game.id && assignment.official_id === official.id) || data.coachAssignments.some((coach) => (coach.coach_official_id === official.id || coach.coach_id === official.linked_user_id) && (coach.full_schedule || coach.game_id === game.id))).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
      const checkIn = data.checkIns.find((item) => item.official_id === official.id && item.event_date === date);
      const notExpected = data.attendanceOverrides.some((item) => item.official_id === official.id && item.event_date === date && !item.expected);
      checkInRows.push([dateLabel(dayGames[0]?.starts_at || `${date}T12:00:00`, event.timezone), official.full_name, firstGame ? timeLabel(firstGame.starts_at, event.timezone) : "", firstGame?.field_name || "", notExpected ? "Not Expected" : checkIn ? "Checked In" : "Not Checked In", checkIn ? timeLabel(checkIn.checked_in_at, event.timezone) : "", checkInMethod(checkIn?.method)]);
    });
  });

  return [
    { name: "Event Summary", rows: frontRows, widths: [24, 12, 12, 12, 22, 20], freezeRow: 4, autoFilterRow: 4 },
    ...scheduleSheets,
    { name: "Ratings - Full Games", rows: gameRatingRows, widths: gameRatingHeadings.map((heading) => /Comments|Areas|Notes/.test(heading) ? 30 : /Official|Team/.test(heading) ? 24 : 16), freezeRow: 9, autoFilterRow: 9 },
    { name: "Ratings - Individual", rows: individualRows, widths: individualHeadings.map((heading) => /Comments|Areas|Notes/.test(heading) ? 34 : /Official|Team/.test(heading) ? 24 : 16), freezeRow: 9, autoFilterRow: 9 },
    { name: "Officials", rows: officialsRows, widths: officialsHeadings.map((heading) => /Email|Roles/.test(heading) ? 28 : heading === "Full Name" ? 24 : 16), freezeRow: 3, autoFilterRow: 3 },
    { name: "Check-Ins", rows: checkInRows, widths: [22, 24, 22, 22, 18, 18, 22], freezeRow: 3, autoFilterRow: 3 },
  ];
}

export async function exportPostEventSummary(event: EventRecord, data: PostEventExportData) {
  await downloadExcelWorkbook(`${filenamePart(event.name)}-post-event-summary.xlsx`, buildPostEventSummarySheets(event, data));
}
