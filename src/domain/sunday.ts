export const SUNDAY_TEAM_SIZE = 3 as const;
export const SUNDAY_BOUT_SECONDS = 120 as const;
export const SUNDAY_REST_SECONDS = 120 as const;
export const KENSHI_DAN_LEVELS = ["under_1_dan", "1_dan", "2_dan", "3_dan", "4_dan", "5_dan", "6_dan", "7_dan", "8_dan"] as const;
export const SUNDAY_WAZA = ["men", "kote", "do", "tsuki"] as const;
export type SundayWaza = (typeof SUNDAY_WAZA)[number];
export type SundaySide = "aka" | "shiro";

export function sundayProfileSlug(name: string): string {
  const parts = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "D")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const familyName = parts[0];
  const givenName = parts.at(-1);
  if (!familyName || !givenName) return "kenshi";
  return familyName === givenName ? familyName : `${givenName}_${familyName}`;
}

export type SundayBattleCard = Readonly<{
  codename: string;
  aura: string;
  luckyWaza: SundayWaza;
  rarity: "uncommon" | "rare" | "epic" | "legendary";
  serial: number;
  accent: string;
}>;

const CARD_TITLES = ["Silent Thunder", "Red Comet", "Moon Cutter", "Dojo Phantom", "Sunday Ronin", "Golden Zanshin", "Storm Senpai", "Hidden Taisho"] as const;
const CARD_AURAS = ["Ember", "Indigo", "Jade", "Moonlight", "Sakura", "Thunder"] as const;
const CARD_ACCENTS = ["#e4572e", "#315c8a", "#2a9d73", "#8c5e9e", "#c83e78", "#d49b2f"] as const;

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function sundayBattleCard(profileId: string): SundayBattleCard {
  const seed = hash(profileId);
  const random = seededRandom(seed);
  const rarityRoll = random();
  return {
    codename: CARD_TITLES[Math.floor(random() * CARD_TITLES.length)]!,
    aura: CARD_AURAS[Math.floor(random() * CARD_AURAS.length)]!,
    luckyWaza: SUNDAY_WAZA[Math.floor(random() * SUNDAY_WAZA.length)]!,
    rarity: rarityRoll < 0.06 ? "legendary" : rarityRoll < 0.22 ? "epic" : rarityRoll < 0.52 ? "rare" : "uncommon",
    serial: (seed % 9000) + 1000,
    accent: CARD_ACCENTS[Math.floor(random() * CARD_ACCENTS.length)]!,
  };
}

function shuffled(values: readonly string[], seed: number): string[] {
  const result = [...values];
  const random = seededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export type SundayFormation = Readonly<{
  allowed: boolean;
  teams: readonly Readonly<{ index: number; members: readonly string[] }>[];
  waiting: readonly string[];
  blocker: "minimum_six_ready" | null;
}>;

export function proposeSundayFormation(eligible: readonly string[], seed: number): SundayFormation {
  const unique = [...new Set(eligible)];
  if (unique.length < 6) return { allowed: false, teams: [], waiting: unique, blocker: "minimum_six_ready" };
  const ordered = shuffled(unique, seed);
  const fullCount = Math.floor(ordered.length / SUNDAY_TEAM_SIZE) * SUNDAY_TEAM_SIZE;
  const playing = ordered.slice(0, fullCount);
  return {
    allowed: true,
    teams: Array.from({ length: fullCount / SUNDAY_TEAM_SIZE }, (_, index) => ({
      index,
      members: playing.slice(index * SUNDAY_TEAM_SIZE, (index + 1) * SUNDAY_TEAM_SIZE),
    })),
    waiting: ordered.slice(fullCount),
    blocker: null,
  };
}

export type SundayQueuedTeam = Readonly<{
  teamId: string;
  queuedAt: number;
  availableAt: number;
}>;

export type SundayCourtPlan = Readonly<{
  akaTeamId: string;
  shiroTeamId: string;
  plannedStart: number;
}>;

export function selectSundayCourtMatch(
  queuedTeams: readonly SundayQueuedTeam[],
  now: number,
  targetEnd: number,
): SundayCourtPlan | null {
  if (targetEnd - now < 5 * 60 * 1000 || queuedTeams.length < 2) return null;
  const [aka, shiro] = [...queuedTeams].sort((left, right) =>
    left.queuedAt - right.queuedAt || left.teamId.localeCompare(right.teamId),
  );
  if (!aka || !shiro) return null;
  return {
    akaTeamId: aka.teamId,
    shiroTeamId: shiro.teamId,
    plannedStart: Math.max(now, aka.availableAt, shiro.availableAt),
  };
}

export function sundaySurvivorPolicy(
  headcount: number,
  waitingCountAfterLoss: number,
): Readonly<{ fullReshuffle: boolean; formChallenger: boolean }> {
  if (headcount === 6) return { fullReshuffle: true, formChallenger: false };
  return {
    fullReshuffle: false,
    formChallenger: waitingCountAfterLoss > SUNDAY_TEAM_SIZE || waitingCountAfterLoss >= 6,
  };
}

export type SundayScoreEvent = Readonly<{
  kind: "point" | "hansoku";
  side: SundaySide;
  waza?: SundayWaza;
}>;

export type SundayScore = Readonly<{
  akaIppon: number;
  shiroIppon: number;
  akaHansoku: number;
  shiroHansoku: number;
}>;

export const EMPTY_SUNDAY_SCORE: SundayScore = { akaIppon: 0, shiroIppon: 0, akaHansoku: 0, shiroHansoku: 0 };

export function reduceSundayScore(events: readonly SundayScoreEvent[]): SundayScore {
  return events.reduce<SundayScore>((score, event) => {
    if (event.kind === "point") {
      return { ...score, [event.side === "aka" ? "akaIppon" : "shiroIppon"]: (event.side === "aka" ? score.akaIppon : score.shiroIppon) + 1 };
    }
    if (event.side === "aka") {
      const count = score.akaHansoku + 1;
      return { ...score, akaHansoku: count, shiroIppon: score.shiroIppon + (count % 2 === 0 ? 1 : 0) };
    }
    const count = score.shiroHansoku + 1;
    return { ...score, shiroHansoku: count, akaIppon: score.akaIppon + (count % 2 === 0 ? 1 : 0) };
  }, EMPTY_SUNDAY_SCORE);
}

export function sundayBoutWinner(score: SundayScore): SundaySide | null {
  return score.akaIppon === score.shiroIppon ? null : score.akaIppon > score.shiroIppon ? "aka" : "shiro";
}

export function sundayTeamWinner(bouts: readonly Readonly<{ akaIppon: number; shiroIppon: number }>[]): SundaySide | null {
  const wins = bouts.reduce<{ aka: number; shiro: number; akaIppon: number; shiroIppon: number }>((result, bout) => ({
    aka: result.aka + (bout.akaIppon > bout.shiroIppon ? 1 : 0),
    shiro: result.shiro + (bout.shiroIppon > bout.akaIppon ? 1 : 0),
    akaIppon: result.akaIppon + bout.akaIppon,
    shiroIppon: result.shiroIppon + bout.shiroIppon,
  }), { aka: 0, shiro: 0, akaIppon: 0, shiroIppon: 0 });
  if (wins.aka !== wins.shiro) return wins.aka > wins.shiro ? "aka" : "shiro";
  if (wins.akaIppon !== wins.shiroIppon) return wins.akaIppon > wins.shiroIppon ? "aka" : "shiro";
  return null;
}
