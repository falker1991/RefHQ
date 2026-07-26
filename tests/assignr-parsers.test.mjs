import assert from "node:assert/strict";
import test from "node:test";
import { parseAssignrCsv, parseAssignrOfficialsCsv } from "../app/supabase-client.ts";

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

