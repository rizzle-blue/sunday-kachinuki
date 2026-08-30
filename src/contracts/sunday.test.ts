import { describe, expect, test } from "bun:test";
import { sundayFastRegistrationRequestSchema, sundayHostConsoleSchema, sundayInviteRequestSchema, sundayResultSchema, sundayScoreEventRequestSchema } from "./sunday";

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

test("validates an individual result with Kendo waza breakdown", () => {
    const result = sundayResultSchema.parse({
      session: {
        sessionId: "83000000-0000-4000-8000-000000000001",
        name: "Sunday Kachinuki",
        startedAt: "2026-08-30T03:05:22.052Z",
        completedAt: "2026-08-30T04:11:22.046Z",
        durationMinutes: 66,
      },
      summary: {
        matchesPlayed: 3,
        formationCount: 2,
        teamWins: 2,
        teamLosses: 1,
        winRate: 66.7,
        boutsFought: 3,
        boutWins: 2,
        boutLosses: 0,
        boutDraws: 1,
        ipponScored: 5,
        ipponConceded: 2,
        hansoku: 0,
        pointsByWaza: { men: 3, kote: 1, do: 1, tsuki: 0 },
        excludedMatches: 2,
      },
      history: [{
        matchSequence: 1,
        teamLabel: "Indigo Tora",
        opponentTeamLabel: "Crimson Kitsune",
        teamResult: "win",
        position: "senpo",
        opponentName: "Demo Kenshi Two",
        boutResult: "win",
        ipponFor: 2,
        ipponAgainst: 1,
        hansoku: 0,
        pointsByWaza: { men: 2, kote: 0, do: 0, tsuki: 0 },
      }],
    });
    expect(result.summary.excludedMatches).toBe(2);
    expect(result.summary.pointsByWaza.tsuki).toBe(0);
  });
});
