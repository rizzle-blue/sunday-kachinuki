import { describe, expect, test } from "bun:test";
import { sundayInviteRequestSchema, sundayScoreEventRequestSchema } from "./sunday";

describe("Sunday Kachinuki contracts", () => {
  test("accepts a normalized reusable invite code", () => {
    expect(sundayInviteRequestSchema.parse({ code: "one_demo" })).toEqual({ code: "one_demo" });
    expect(sundayInviteRequestSchema.safeParse({ code: "One Demo" }).success).toBe(false);
  });

  test("requires waza only for an ippon point", () => {
    const base = { boutId: "91000000-0000-4000-8000-000000000001", expectedVersion: 1, idempotencyKey: "92000000-0000-4000-8000-000000000001", side: "aka" as const };
    expect(sundayScoreEventRequestSchema.safeParse({ ...base, kind: "point", waza: "men" }).success).toBe(true);
    expect(sundayScoreEventRequestSchema.safeParse({ ...base, kind: "point", waza: null }).success).toBe(false);
    expect(sundayScoreEventRequestSchema.safeParse({ ...base, kind: "hansoku", waza: "kote" }).success).toBe(false);
  });
});
