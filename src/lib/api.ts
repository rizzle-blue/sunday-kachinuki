import {
  sundayFastRegistrationRequestSchema,
  sundayGameStateSchema,
  sundayHostConsoleSchema,
  sundayLobbySchema,
  sundayProfileSchema,
  type SundayGameState,
  type SundayFastRegistrationRequest,
  type SundayHostConsole,
  type SundayLobby,
  type SundayProfile,
} from "@/contracts/sunday";
import { sundayBattleCard } from "@/domain/sunday";
import { z } from "zod";
import { getSundayHostSupabase, getSundaySupabase } from "./supabase";

const rawProfileSchema = sundayProfileSchema.omit({ card: true });
const rawLobbySchema = z.object({
  session: sundayLobbySchema.shape.session,
  me: sundayLobbySchema.shape.me,
  cards: z.array(sundayLobbySchema.shape.cards.element.omit({ card: true })),
}).strict();

export class SundayApiError extends Error {
  constructor(readonly code: string, message = "Sunday request failed") { super(message); }
}

async function rpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await getSundaySupabase().rpc(name, args);
  if (error) throw new SundayApiError(error.code ?? "unknown");
  return data;
}

async function hostRpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await getSundayHostSupabase().rpc(name, args);
  if (error) throw new SundayApiError(error.code ?? "unknown");
  return data;
}

function card(profileId: string) {
  return sundayBattleCard(profileId);
}

export function normalizeInviteCode(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll("đ", "d").replaceAll("Đ", "D").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export async function redeemInvite(code: string): Promise<SundayProfile> {
  const profile = rawProfileSchema.parse(await rpc("redeem_sunday_invite", { p_code: normalizeInviteCode(code) }));
  return sundayProfileSchema.parse({ ...profile, card: card(profile.profileId) });
}

export async function registerProfile(input: SundayFastRegistrationRequest): Promise<SundayProfile> {
  const registration = sundayFastRegistrationRequestSchema.parse(input);
  const profile = rawProfileSchema.parse(await rpc("register_sunday_profile", {
    p_name: registration.name,
    p_nickname: registration.nickname,
    p_dojo: registration.dojo,
    p_practice_years: registration.practiceYears,
    p_dan: registration.dan,
  }));
  return sundayProfileSchema.parse({ ...profile, card: card(profile.profileId) });
}

export async function getProfile(): Promise<SundayProfile> {
  const profile = rawProfileSchema.parse(await rpc("get_my_sunday_profile"));
  return sundayProfileSchema.parse({ ...profile, card: card(profile.profileId) });
}

export async function setReady(ready: boolean): Promise<void> {
  await rpc("set_sunday_ready", { p_ready: ready, p_idempotency_key: crypto.randomUUID() });
}

export async function getLobby(): Promise<SundayLobby> {
  const lobby = rawLobbySchema.parse(await rpc("get_sunday_lobby"));
  return sundayLobbySchema.parse({ ...lobby, cards: lobby.cards.map((profile) => ({ ...profile, card: card(profile.profileId) })) });
}

export async function getGame(): Promise<SundayGameState> {
  return sundayGameStateSchema.parse(await rpc("get_sunday_game"));
}

export async function getHostConsole(): Promise<SundayHostConsole> {
  return sundayHostConsoleSchema.parse(await hostRpc("get_sunday_host_console"));
}

export async function startSession(): Promise<void> { await hostRpc("start_sunday_session", { p_idempotency_key: crypto.randomUUID() }); }
export async function stopSession(): Promise<void> { await hostRpc("stop_sunday_session", { p_idempotency_key: crypto.randomUUID() }); }
export async function kickReady(profileId: string, expectedVersion: number): Promise<void> { await hostRpc("kick_sunday_ready", { p_profile: profileId, p_expected_version: expectedVersion, p_idempotency_key: crypto.randomUUID() }); }
export async function startBout(boutId: string, expectedVersion: number): Promise<void> { await hostRpc("start_sunday_bout", { p_bout: boutId, p_expected_version: expectedVersion, p_idempotency_key: crypto.randomUUID() }); }
export async function recordEvent(input: Readonly<{ boutId: string; expectedVersion: number; kind: "point" | "hansoku"; side: "aka" | "shiro"; waza: "men" | "kote" | "do" | "tsuki" | null }>): Promise<void> {
  await hostRpc("record_sunday_event", { p_bout: input.boutId, p_expected_version: input.expectedVersion, p_idempotency_key: crypto.randomUUID(), p_kind: input.kind, p_side: input.side, p_waza: input.waza });
}
export async function undoEvent(boutId: string, expectedVersion: number): Promise<void> { await hostRpc("undo_sunday_event", { p_bout: boutId, p_expected_version: expectedVersion, p_idempotency_key: crypto.randomUUID() }); }
export async function finalizeBout(boutId: string, expectedVersion: number): Promise<void> { await hostRpc("finalize_sunday_bout", { p_bout: boutId, p_expected_version: expectedVersion, p_idempotency_key: crypto.randomUUID() }); }
export async function createDaihyo(matchId: string, akaProfileId: string, shiroProfileId: string): Promise<void> { await hostRpc("create_sunday_daihyo", { p_match: matchId, p_aka_profile: akaProfileId, p_shiro_profile: shiroProfileId, p_idempotency_key: crypto.randomUUID() }); }

export async function ensureAnonymousSession(captchaToken?: string): Promise<void> {
  const client = getSundaySupabase();
  const { data } = await client.auth.getSession();
  if (data.session) return;
  const { error } = await client.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
  if (error) throw new SundayApiError(error.code ?? "auth_failed", error.message);
}

export async function signOut(): Promise<void> {
  const { error } = await getSundaySupabase().auth.signOut({ scope: "local" });
  if (error) throw new SundayApiError(error.code ?? "auth_failed", error.message);
}

export async function hostSignIn(email: string, password: string): Promise<void> {
  const { error } = await getSundayHostSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new SundayApiError(error.code ?? "auth_failed", error.message);
}
