import assert from "node:assert/strict";
import test from "node:test";
import { createOfficialsExportCsv, isOperationalGame, normalizePosition, parseAssignrCsv, parseAssignrOfficialsCsv, positionAliasKey, zonedLocalDateTimeToIso } from "../app/supabase-client.ts";

test("parses an actual Assignr games export layout", () => {
  const csv = [
    "Game ID,Date,Start Time,Venue,Sub-Venue,Age Group,League,Home Team,Away Team,Assignr Database ID,Position 1,Official 1,Position 2,Official 2",
    '1049552,2026-06-30,8:00 AM,Morningside Farm,Field #11,U14,ECNL RL Girls,East Meadow,FC DELCO,27781620,Referee,"Chamberlain, Jessica",Asst. Referee,"Moreth, Maximilian"',
  ].join("\n");
  const rows = parseAssignrCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].external_id, "27781620");
  assert.equal(rows[0].start_time, "08:00:00");
  assert.equal(rows[0].official_name, "Jessica Chamberlain");
  assert.equal(rows[1].position, "Asst. Referee");
  assert.equal(rows[0].official_email, null);
  assert.equal(rows[0].age_group, "U14");
});

test("preserves Assignr assignment role categories", () => {
  assert.equal(normalizePosition("Referee"), "referee");
  assert.equal(normalizePosition("Asst. Referee"), "assistant_referee");
  assert.equal(normalizePosition("4th Official"), "fourth_official");
  assert.equal(normalizePosition("Ref Coord"), "referee_coach");
  assert.equal(normalizePosition("Referee Coach"), "referee_coach");
  assert.equal(normalizePosition("Site Coord"), "site_coordinator");
  assert.equal(normalizePosition("Site Supervisor"), "site_supervisor");
  assert.equal(normalizePosition("Standby"), "standby");
});

test("matches position aliases without case or spacing differences", () => {
  assert.equal(positionAliasKey("  Asst.   Referee "), "asst. referee");
});

test("classifies non-match operational records", () => {
  assert.equal(isOperationalGame({ field: "REF HQ PDA RC", home_team: "Ref Coach", away_team: "Ref Coach", game_type: "Ref Coach" }), true);
  assert.equal(isOperationalGame({ field: "Field 3", home_team: "Home FC", away_team: "Away FC", game_type: "League" }), false);
});

test("interprets imported wall times in the event timezone", () => {
  assert.equal(zonedLocalDateTimeToIso("2026-06-30", "08:00:00", "America/New_York"), "2026-06-30T12:00:00.000Z");
  assert.equal(zonedLocalDateTimeToIso("2026-01-30", "08:00:00", "America/New_York"), "2026-01-30T13:00:00.000Z");
});

test("parses an actual Assignr users export layout", () => {
  const csv = [
    "Last Name,First Name,Grade/Badge Level,Mobile Phone,Primary Email,Secondary Email,Is an Official?,USSF Referee Certification,Assignr Database ID",
    "Official,Olivia,Regional,(555) 555-0100,olivia@example.com,guardian@example.com,YES,Referee,2171650",
  ].join("\n");
  const rows = parseAssignrOfficialsCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].full_name, "Olivia Official");
  assert.equal(rows[0].primary_email, "olivia@example.com");
  assert.equal(rows[0].source_official_id, "2171650");
});

test("round trips exported Law18Ref official details with stable record IDs", () => {
  const csv = createOfficialsExportCsv([{
    id: "official-123",
    organization_id: "group-1",
    full_name: "Alex Example",
    email: null,
    secondary_email: "guardian@example.com",
    phone: "555-0100",
    date_of_birth: "2010-05-01",
    badge_level: "Grassroots",
    ussf_id: "USSF-42",
    external_check_in_other: "CHECK-42",
    source_official_id: "assignr-9",
    identity_status: "provisional",
    pending_org_roles: ["referee"],
  }]);
  const rows = parseAssignrOfficialsCsv(csv.replace(",,guardian@example.com", ",alex@example.com,guardian@example.com"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].law18ref_official_id, "official-123");
  assert.equal(rows[0].primary_email, "alex@example.com");
  assert.equal(rows[0].source_official_id, "assignr-9");
  assert.equal(rows[0].date_of_birth, "2010-05-01");
});
