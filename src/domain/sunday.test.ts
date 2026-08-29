import { describe, expect, test } from "bun:test";
import { proposeSundayFormation, reduceSundayScore, selectSundayCourtMatch, sundayBattleCard, sundaySurvivorPolicy, sundayTeamWinner } from "./sunday";

describe("Sunday Kachinuki domain", () => {
  test("forms only complete Team-3 rosters for six through ten Kenshi", () => {
    for (let count = 6; count <= 10; count += 1) {
      const result = proposeSundayFormation(Array.from({ length: count }, (_, index) => `p${index}`), 31);
      expect(result.allowed).toBe(true);
      expect(result.teams.every((team) => team.members.length === 3)).toBe(true);
      expect(new Set([...result.teams.flatMap((team) => team.members), ...result.waiting]).size).toBe(count);
      expect(result.waiting).toHaveLength(count % 3);
    }
  });

  test("blocks fewer than six and stays deterministic", () => {
    expect(proposeSundayFormation(["a", "b", "c", "d", "e"], 1).blocker).toBe("minimum_six_ready");
    const input = Array.from({ length: 8 }, (_, index) => `p${index}`);
    expect(proposeSundayFormation(input, 42)).toEqual(proposeSundayFormation(input, 42));
    expect(proposeSundayFormation(input, 42)).not.toEqual(proposeSundayFormation(input, 43));
  });

  test("builds deterministic cards without using rank or experience", () => {
    expect(sundayBattleCard("profile-1")).toEqual(sundayBattleCard("profile-1"));
    expect(sundayBattleCard("profile-1")).not.toEqual(sundayBattleCard("profile-2"));
  });

  test("every second hansoku awards one ippon to the opponent", () => {
    expect(reduceSundayScore([
      { kind: "hansoku", side: "aka" },
      { kind: "hansoku", side: "aka" },
      { kind: "point", side: "aka", waza: "men" },
    ])).toEqual({ akaIppon: 1, shiroIppon: 1, akaHansoku: 2, shiroHansoku: 0 });
  });

  test("team winner uses bout wins then total ippon and otherwise requires daihyo", () => {
    expect(sundayTeamWinner([{ akaIppon: 2, shiroIppon: 0 }, { akaIppon: 0, shiroIppon: 1 }, { akaIppon: 1, shiroIppon: 1 }])).toBe("aka");
    expect(sundayTeamWinner([{ akaIppon: 1, shiroIppon: 0 }, { akaIppon: 0, shiroIppon: 1 }, { akaIppon: 0, shiroIppon: 0 }])).toBeNull();
  });

  test("exact six reshuffles while a bench or late arrival unlocks a challenger", () => {
    expect(sundaySurvivorPolicy(6, 3)).toEqual({ fullReshuffle: true, formChallenger: false });
    expect(sundaySurvivorPolicy(7, 3)).toEqual({ fullReshuffle: false, formChallenger: false });
    expect(sundaySurvivorPolicy(7, 4)).toEqual({ fullReshuffle: false, formChallenger: true });
    expect(sundaySurvivorPolicy(10, 6)).toEqual({ fullReshuffle: false, formChallenger: true });
  });

  test("one-court FIFO is deterministic and honors rest plus the five-minute cutoff", () => {
    const now = Date.parse("2026-08-31T08:00:00Z");
    const teams = [
      { teamId: "team-b", queuedAt: now - 2_000, availableAt: now + 120_000 },
      { teamId: "team-a", queuedAt: now - 2_000, availableAt: now },
      { teamId: "team-c", queuedAt: now - 1_000, availableAt: now },
    ];
    expect(selectSundayCourtMatch(teams, now, now + 10 * 60_000)).toEqual({
      akaTeamId: "team-a",
      shiroTeamId: "team-b",
      plannedStart: now + 120_000,
    });
    expect(selectSundayCourtMatch(teams, now, now + 4 * 60_000)).toBeNull();
    expect(selectSundayCourtMatch(teams.slice(0, 1), now, now + 10 * 60_000)).toBeNull();
  });
});
