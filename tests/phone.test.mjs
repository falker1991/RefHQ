import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhoneNumber, phoneCallHref } from "../app/phone.ts";

test("normalizes common North American phone formats", () => {
  for (const input of ["2155550100", "215-555-0100", "(215) 555-0100", "+1 215 555 0100"]) {
    assert.equal(normalizePhoneNumber(input), "(215) 555-0100");
    assert.equal(phoneCallHref(input), "tel:+12155550100");
  }
});

test("preserves phone values that cannot safely use the ten-digit format", () => {
  assert.equal(normalizePhoneNumber("555-0100"), "555-0100");
  assert.equal(normalizePhoneNumber("+44 20 7946 0958"), "+44 20 7946 0958");
});
