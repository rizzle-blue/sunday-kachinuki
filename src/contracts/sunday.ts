import { KENSHI_DAN_LEVELS, SUNDAY_WAZA } from "../domain/sunday";
import { z } from "zod";

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(120);

export const sundayCardSchema = z.object({
  codename: text,
  aura: text,
  luckyWaza: z.enum(SUNDAY_WAZA),
  rarity: z.enum(["uncommon", "rare", "epic", "legendary"]),
  serial: z.number().int().min(1000).max(9999),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
}).strict();

export const sundayProfileSchema = z.object({
  profileId: uuid,
  dojo: text,
  name: text,
  nickname: z.string().trim().min(1).max(40),
  dan: z.enum(KENSHI_DAN_LEVELS),
  practiceYears: z.number().int().min(0).max(100),
  card: sundayCardSchema,
}).strict();

export const sundayInviteRequestSchema = z.object({ code: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+_[a-z0-9]+$/) }).strict();
export const sundayFastRegistrationRequestSchema = z.object({
  name: text,
  nickname: z.string().trim().min(1).max(40),
  dojo: text,
  practiceYears: z.number().int().min(0).max(100),
  dan: z.enum(KENSHI_DAN_LEVELS),
}).strict();

export const sundaySessionSchema = z.object({
  sessionId: uuid,
  state: z.enum(["lobby", "live", "stopping", "completed"]),
  readyCount: z.number().int().nonnegative(),
  targetEndsAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const sundayLobbyCardSchema = z.object({
  profileId: uuid,
  dojo: text,
  name: text,
  nickname: z.string().trim().min(1).max(40),
  card: sundayCardSchema,
}).strict();

export const sundayLobbySchema = z.object({
  session: sundaySessionSchema,
  me: z.object({ profileId: uuid, ready: z.boolean(), state: z.enum(["ready", "waiting", "assigned", "playing"]), tier: z.enum(["unranked", "upper", "lower"]) }).strict(),
  cards: z.array(sundayLobbyCardSchema),
}).strict();

const sundayMemberSchema = z.object({ profileId: uuid, name: text, position: z.enum(["senpo", "chuken", "taisho"]) }).strict();
export const sundayTeamSchema = z.object({ teamId: uuid, label: text, accent: z.string().regex(/^#[0-9a-f]{6}$/i), members: z.array(sundayMemberSchema).length(3) }).strict();

const sundayBoutSchema = z.object({
  boutId: uuid,
  version: z.number().int().positive(),
  position: z.enum(["senpo", "chuken", "taisho", "daihyo"]),
  state: z.enum(["queued", "in_progress", "final"]),
  aka: z.object({ profileId: uuid, name: text, ippon: z.number().int().nonnegative(), hansoku: z.number().int().nonnegative() }).strict(),
  shiro: z.object({ profileId: uuid, name: text, ippon: z.number().int().nonnegative(), hansoku: z.number().int().nonnegative() }).strict(),
  startedAt: z.string().datetime({ offset: true }).nullable(),
  finalizedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const sundayMatchSchema = z.object({
  matchId: uuid,
  state: z.enum(["queued", "in_progress", "tiebreak", "final"]),
  plannedStart: z.string().datetime({ offset: true }),
  akaTeam: sundayTeamSchema,
  shiroTeam: sundayTeamSchema,
  bouts: z.array(sundayBoutSchema).min(3).max(4),
}).strict();

export const sundayGameStateSchema = z.object({
  session: sundaySessionSchema,
  me: z.object({ profileId: uuid, state: z.enum(["ready", "waiting", "assigned", "playing"]), tier: z.enum(["unranked", "upper", "lower"]), wins: z.number().int().nonnegative(), losses: z.number().int().nonnegative() }).strict(),
  team: sundayTeamSchema.nullable(),
  currentMatch: sundayMatchSchema.nullable(),
}).strict();

const sundayResultWazaSchema = z.object({
  men: z.number().int().nonnegative(),
  kote: z.number().int().nonnegative(),
  do: z.number().int().nonnegative(),
  tsuki: z.number().int().nonnegative(),
}).strict();

export const sundayResultSchema = z.object({
  session: z.object({
    sessionId: uuid,
    name: text,
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().nonnegative(),
  }).strict(),
  summary: z.object({
    matchesPlayed: z.number().int().nonnegative(),
    formationCount: z.number().int().nonnegative(),
    teamWins: z.number().int().nonnegative(),
    teamLosses: z.number().int().nonnegative(),
    winRate: z.number().min(0).max(100),
    boutsFought: z.number().int().nonnegative(),
    boutWins: z.number().int().nonnegative(),
    boutLosses: z.number().int().nonnegative(),
    boutDraws: z.number().int().nonnegative(),
    ipponScored: z.number().int().nonnegative(),
    ipponConceded: z.number().int().nonnegative(),
    hansoku: z.number().int().nonnegative(),
    pointsByWaza: sundayResultWazaSchema,
    excludedMatches: z.number().int().nonnegative(),
  }).strict(),
  history: z.array(z.object({
    matchSequence: z.number().int().positive(),
    teamLabel: text,
    opponentTeamLabel: text,
    teamResult: z.enum(["win", "loss"]),
    position: z.enum(["senpo", "chuken", "taisho", "daihyo"]),
    opponentName: text,
    boutResult: z.enum(["win", "loss", "draw"]),
    ipponFor: z.number().int().nonnegative(),
    ipponAgainst: z.number().int().nonnegative(),
    hansoku: z.number().int().nonnegative(),
    pointsByWaza: sundayResultWazaSchema,
  }).strict()),
}).strict();

export const sundayHostConsoleSchema = z.object({
  session: sundaySessionSchema,
  waitingCount: z.number().int().nonnegative(),
  readyEntries: z.array(z.object({
    profileId: uuid,
    name: text,
    nickname: z.string().trim().min(1).max(40),
    dojo: text,
    state: z.enum(["ready", "waiting"]),
    version: z.number().int().positive(),
  }).strict()),
  currentMatch: sundayMatchSchema.nullable(),
}).strict();

export const sundayReadyRequestSchema = z.object({ ready: z.boolean(), idempotencyKey: uuid }).strict();
export const sundayHostCommandSchema = z.object({ idempotencyKey: uuid }).strict();
export const sundayBoutCommandSchema = z.object({ boutId: uuid, expectedVersion: z.number().int().positive(), idempotencyKey: uuid }).strict();
export const sundayScoreEventRequestSchema = sundayBoutCommandSchema.extend({
  kind: z.enum(["point", "hansoku"]),
  side: z.enum(["aka", "shiro"]),
  waza: z.enum(SUNDAY_WAZA).nullable(),
}).strict().superRefine((event, context) => {
  if ((event.kind === "point") !== (event.waza !== null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["waza"], message: "Waza is required only for points." });
});
export const sundayDaihyoRequestSchema = z.object({ matchId: uuid, akaProfileId: uuid, shiroProfileId: uuid, idempotencyKey: uuid }).strict();

export type SundayCard = z.infer<typeof sundayCardSchema>;
export type SundayProfile = z.infer<typeof sundayProfileSchema>;
export type SundayFastRegistrationRequest = z.infer<typeof sundayFastRegistrationRequestSchema>;
export type SundayLobby = z.infer<typeof sundayLobbySchema>;
export type SundayGameState = z.infer<typeof sundayGameStateSchema>;
export type SundayResult = z.infer<typeof sundayResultSchema>;
export type SundayHostConsole = z.infer<typeof sundayHostConsoleSchema>;
export type SundayMatch = z.infer<typeof sundayMatchSchema>;
