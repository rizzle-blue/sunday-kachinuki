import type { SundayMatch } from "../contracts/sunday";
import {
  proposeSundayFormation,
  reduceSundayScore,
  sundayTeamWinner,
  type SundayScoreEvent,
  type SundaySide,
} from "./sunday";

const POSITIONS = ["senpo", "chuken", "taisho"] as const;
const TEAM_META = [
  { label: "Team Tora", accent: "#c1272d" },
  { label: "Team Tsuki", accent: "#2e4057" },
  { label: "Team Kumo", accent: "#3f6c51" },
] as const;

export const SIMULATION_KENSHI = [
  { profileId: "92000000-0000-4000-8000-000000000001", name: "Aki · Demo", dojo: "Shakaijin" },
  { profileId: "92000000-0000-4000-8000-000000000002", name: "Bao · Demo", dojo: "Shakaijin" },
  { profileId: "92000000-0000-4000-8000-000000000003", name: "Chi · Demo", dojo: "Shakaijin" },
  { profileId: "92000000-0000-4000-8000-000000000004", name: "Dai · Demo", dojo: "Shakaijin" },
  { profileId: "92000000-0000-4000-8000-000000000005", name: "Emi · Demo", dojo: "Shakaijin" },
  { profileId: "92000000-0000-4000-8000-000000000006", name: "Fumi · Demo", dojo: "Shakaijin" },
  { profileId: "92000000-0000-4000-8000-000000000007", name: "Gia · Demo", dojo: "Shakaijin" },
  { profileId: "92000000-0000-4000-8000-000000000008", name: "Hana · Demo", dojo: "Shakaijin" },
  { profileId: "92000000-0000-4000-8000-000000000009", name: "Kai · Demo", dojo: "Shakaijin" },
  { profileId: "92000000-0000-4000-8000-000000000010", name: "Linh · Demo", dojo: "Shakaijin" },
] as const;

type SimulationTeam = SundayMatch["akaTeam"];

export type SundaySimulation = Readonly<{
  phase: "lobby" | "live" | "completed";
  teams: readonly SimulationTeam[];
  waiting: readonly (typeof SIMULATION_KENSHI)[number][];
  queuedTeamIds: readonly string[];
  currentMatch: SundayMatch | null;
  events: Readonly<Record<string, readonly SundayScoreEvent[]>>;
  winner: SundaySide | null;
}>;

export function createSundaySimulation(): SundaySimulation {
  return {
    phase: "lobby",
    teams: [],
    waiting: [],
    queuedTeamIds: [],
    currentMatch: null,
    events: {},
    winner: null,
  };
}

function simulationTeam(index: number, memberIds: readonly string[]): SimulationTeam {
  const meta = TEAM_META[index]!;
  return {
    teamId: `93000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    label: meta.label,
    accent: meta.accent,
    members: memberIds.map((profileId, memberIndex) => {
      const kenshi = SIMULATION_KENSHI.find((item) => item.profileId === profileId)!;
      return { profileId, name: kenshi.name, position: POSITIONS[memberIndex]! };
    }),
  };
}

function simulationMatch(akaTeam: SimulationTeam, shiroTeam: SimulationTeam): SundayMatch {
  return {
    matchId: "94000000-0000-4000-8000-000000000001",
    state: "queued",
    plannedStart: new Date().toISOString(),
    akaTeam,
    shiroTeam,
    bouts: POSITIONS.map((position, index) => ({
      boutId: `95000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      version: 1,
      position,
      state: "queued" as const,
      aka: { ...akaTeam.members[index]!, ippon: 0, hansoku: 0 },
      shiro: { ...shiroTeam.members[index]!, ippon: 0, hansoku: 0 },
      startedAt: null,
      finalizedAt: null,
    })),
  };
}

export function formSundaySimulation(state: SundaySimulation, seed = 8312026): SundaySimulation {
  if (state.phase !== "lobby") return state;
  const formation = proposeSundayFormation(SIMULATION_KENSHI.map((item) => item.profileId), seed);
  if (!formation.allowed) return state;
  const teams = formation.teams.map((team) => simulationTeam(team.index, team.members));
  return {
    ...state,
    phase: "live",
    teams,
    waiting: formation.waiting.map((profileId) => SIMULATION_KENSHI.find((item) => item.profileId === profileId)!),
    queuedTeamIds: teams.slice(2).map((team) => team.teamId),
    currentMatch: simulationMatch(teams[0]!, teams[1]!),
  };
}

function activeBout(match: SundayMatch) {
  return match.bouts.find((bout) => bout.state === "in_progress");
}

function updateBout(match: SundayMatch, boutId: string, update: (bout: SundayMatch["bouts"][number]) => SundayMatch["bouts"][number]): SundayMatch {
  return { ...match, bouts: match.bouts.map((bout) => bout.boutId === boutId ? update(bout) : bout) };
}

export function startSimulationBout(state: SundaySimulation, startedAt = new Date().toISOString()): SundaySimulation {
  const match = state.currentMatch;
  if (!match || activeBout(match)) return state;
  const bout = match.bouts.find((item) => item.state === "queued");
  if (!bout) return state;
  return {
    ...state,
    currentMatch: {
      ...updateBout(match, bout.boutId, (item) => ({ ...item, state: "in_progress", startedAt, version: item.version + 1 })),
      state: match.state === "queued" ? "in_progress" : match.state,
    },
  };
}

export function recordSimulationEvent(state: SundaySimulation, event: SundayScoreEvent): SundaySimulation {
  const match = state.currentMatch;
  const bout = match ? activeBout(match) : undefined;
  if (!match || !bout) return state;
  const previousEvents = state.events[bout.boutId] ?? [];
  const previousScore = reduceSundayScore(previousEvents);
  const target = bout.position === "daihyo" ? 1 : 2;
  if (previousScore.akaIppon >= target || previousScore.shiroIppon >= target) return state;
  const nextEvents = [...previousEvents, event];
  const score = reduceSundayScore(nextEvents);
  return {
    ...state,
    events: { ...state.events, [bout.boutId]: nextEvents },
    currentMatch: updateBout(match, bout.boutId, (item) => ({
      ...item,
      version: item.version + 1,
      aka: { ...item.aka, ippon: score.akaIppon, hansoku: score.akaHansoku },
      shiro: { ...item.shiro, ippon: score.shiroIppon, hansoku: score.shiroHansoku },
    })),
  };
}

export function undoSimulationEvent(state: SundaySimulation): SundaySimulation {
  const match = state.currentMatch;
  const bout = match ? activeBout(match) : undefined;
  if (!match || !bout) return state;
  const previousEvents = state.events[bout.boutId] ?? [];
  if (previousEvents.length === 0) return state;
  const nextEvents = previousEvents.slice(0, -1);
  const score = reduceSundayScore(nextEvents);
  return {
    ...state,
    events: { ...state.events, [bout.boutId]: nextEvents },
    currentMatch: updateBout(match, bout.boutId, (item) => ({
      ...item,
      version: item.version + 1,
      aka: { ...item.aka, ippon: score.akaIppon, hansoku: score.akaHansoku },
      shiro: { ...item.shiro, ippon: score.shiroIppon, hansoku: score.shiroHansoku },
    })),
  };
}

export function finalizeSimulationBout(state: SundaySimulation, finalizedAt = new Date().toISOString()): SundaySimulation {
  const match = state.currentMatch;
  const bout = match ? activeBout(match) : undefined;
  if (!match || !bout || bout.position === "daihyo" && bout.aka.ippon === bout.shiro.ippon) return state;
  const finalizedMatch = updateBout(match, bout.boutId, (item) => ({ ...item, state: "final", finalizedAt, version: item.version + 1 }));
  const regularBouts = finalizedMatch.bouts.filter((item) => item.position !== "daihyo");
  const regularComplete = regularBouts.every((item) => item.state === "final");
  if (!regularComplete) return { ...state, currentMatch: finalizedMatch };
  if (bout.position === "daihyo") {
    return { ...state, phase: "completed", winner: bout.aka.ippon > bout.shiro.ippon ? "aka" : "shiro", currentMatch: { ...finalizedMatch, state: "final" } };
  }
  const winner = sundayTeamWinner(regularBouts.map((item) => ({ akaIppon: item.aka.ippon, shiroIppon: item.shiro.ippon })));
  return winner
    ? { ...state, phase: "completed", winner, currentMatch: { ...finalizedMatch, state: "final" } }
    : { ...state, currentMatch: { ...finalizedMatch, state: "tiebreak" } };
}

export function createSimulationDaihyo(state: SundaySimulation, akaProfileId: string, shiroProfileId: string): SundaySimulation {
  const match = state.currentMatch;
  const aka = match?.akaTeam.members.find((member) => member.profileId === akaProfileId);
  const shiro = match?.shiroTeam.members.find((member) => member.profileId === shiroProfileId);
  if (!match || match.state !== "tiebreak" || !aka || !shiro || match.bouts.some((bout) => bout.position === "daihyo")) return state;
  return {
    ...state,
    currentMatch: {
      ...match,
      bouts: [...match.bouts, {
        boutId: "95000000-0000-4000-8000-000000000004",
        version: 1,
        position: "daihyo",
        state: "queued",
        aka: { ...aka, ippon: 0, hansoku: 0 },
        shiro: { ...shiro, ippon: 0, hansoku: 0 },
        startedAt: null,
        finalizedAt: null,
      }],
    },
  };
}
