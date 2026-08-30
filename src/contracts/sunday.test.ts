import { describe, expect, test } from "bun:test";
import { sundayFastRegistrationRequestSchema, sundayHostConsoleSchema, sundayInviteRequestSchema, sundayScoreEventRequestSchema } from "./sunday";

describe("Sunday Kachinuki contracts", () => {
  test("accepts a normalized reusable invite code", () => {
    expect(sundayInviteRequestSchema.parse({ code: "one_demo" })).toEqual({ code: "one_demo" });
    expect(sundayInviteRequestSchema.safeParse({ code: "One Demo" }).success).toBe(false);
  });

  test("validates the minimal fast-registration profile", () => {
    expect(sundayFastRegistrationRequestSchema.parse({
      name: "Nguyen Thi Cam Tu",
      nickname: "Tu",
      dojo: "Shakaijin",
      practiceYears: 1,
      dan: "under_1_dan",
    })).toEqual({
      name: "Nguyen Thi Cam Tu",
      nickname: "Tu",
      dojo: "Shakaijin",
      practiceYears: 1,
      dan: "under_1_dan",
    });
    expect(sundayFastRegistrationRequestSchema.safeParse({ name: "Tu", nickname: "", dojo: "Shakaijin", practiceYears: -1, dan: "9_dan" }).success).toBe(false);
  });

  test("requires waza only for an ippon point", () => {
    const base = { boutId: "91000000-0000-4000-8000-000000000001", expectedVersion: 1, idempotencyKey: "92000000-0000-4000-8000-000000000001", side: "aka" as const };
    expect(sundayScoreEventRequestSchema.safeParse({ ...base, kind: "point", waza: "men" }).success).toBe(true);
    expect(sundayScoreEventRequestSchema.safeParse({ ...base, kind: "point", waza: null }).success).toBe(false);
    expect(sundayScoreEventRequestSchema.safeParse({ ...base, kind: "hansoku", waza: "kote" }).success).toBe(false);
  });

  test("host console validates kickable Ready entries with versions", () => {
    const readyEntry = {
      profileId: "91000000-0000-4000-8000-000000000001",
      name: "Demo Kenshi One",
      nickname: "One",
      dojo: "Demo Dojo",
      state: "ready",
      version: 2,
    };
    const result = sundayHostConsoleSchema.shape.readyEntries.safeParse([readyEntry]);
    expect(result.success).toBe(true);
    expect(sundayHostConsoleSchema.shape.readyEntries.safeParse([{ ...readyEntry, state: "playing" }]).success).toBe(false);
  });
});
