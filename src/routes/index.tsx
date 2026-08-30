import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MenMark } from "@/components/men-mark";
import { ensureAnonymousSession, normalizeInviteCode, redeemInvite, registerProfile } from "@/lib/api";

declare global {
  interface Window {
    turnstile?: { render(element: HTMLElement, options: Record<string, unknown>): string; execute(widgetId: string): void; reset(widgetId: string): void };
  }
}

const DAN_OPTIONS = [
  ["under_1_dan", "Dưới 1 Dan"],
  ["1_dan", "1 Dan"],
  ["2_dan", "2 Dan"],
  ["3_dan", "3 Dan"],
  ["4_dan", "4 Dan"],
  ["5_dan", "5 Dan"],
  ["6_dan", "6 Dan"],
  ["7_dan", "7 Dan"],
  ["8_dan", "8 Dan"],
] as const;

type DanLevel = (typeof DAN_OPTIONS)[number][0];
type PendingEntrance =
  | Readonly<{ kind: "invite"; code: string }>
  | Readonly<{ kind: "register"; name: string; nickname: string; dojo: string; practiceYears: number; dan: DanLevel }>;

export const Route = createFileRoute("/")({ component: Entrance });

function plainText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll("đ", "d").replaceAll("Đ", "D").replace(/\s+/g, " ");
}

function Entrance() {
  const [mode, setMode] = useState<"invite" | "register">("invite");
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [pending, setPending] = useState<PendingEntrance>();
  const widgetRoot = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (!siteKey || !widgetRoot.current) return;
    const render = () => {
      if (!window.turnstile || !widgetRoot.current || widgetId.current) return;
      widgetId.current = window.turnstile.render(widgetRoot.current, {
        sitekey: siteKey,
        size: "invisible",
        execution: "execute",
        callback: (token: string) => setCaptchaToken(token),
        "error-callback": () => setError("Không thể xác minh thiết bị. Hãy thử lại."),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-sunday-turnstile="true"]');
    if (existing) { existing.addEventListener("load", render); render(); return () => existing.removeEventListener("load", render); }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.sundayTurnstile = "true";
    script.addEventListener("load", render);
    document.head.append(script);
    return () => script.removeEventListener("load", render);
  }, [siteKey]);

  useEffect(() => {
    if (!pending || (siteKey && !captchaToken)) return;
    void enter(pending, captchaToken);
  }, [captchaToken, pending, siteKey]);

  async function enter(action: PendingEntrance, token?: string) {
    setBusy(true);
    setError(null);
    try {
      await ensureAnonymousSession(token);
      if (action.kind === "invite") await redeemInvite(action.code);
      else {
        await registerProfile({
          name: action.name,
          nickname: action.nickname,
          dojo: action.dojo,
          practiceYears: action.practiceYears,
          dan: action.dan,
        });
      }
      window.location.assign("/profile");
    } catch {
      setBusy(false);
      setPending(undefined);
      setCaptchaToken(undefined);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setError(action.kind === "invite" ? "Invite code chưa đúng. Kiểm tra lại và thử lần nữa nhé." : "Chưa thể tạo Kenshi profile. Kiểm tra các thông tin và thử lại.");
    }
  }

  function queue(action: PendingEntrance) {
    setPending(action);
    setError(null);
    if (siteKey && !captchaToken) {
      if (widgetId.current) window.turnstile?.execute(widgetId.current);
      else setError("Đang chuẩn bị xác minh, thử lại sau vài giây.");
    }
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const code = normalizeInviteCode(String(new FormData(event.currentTarget).get("invite") ?? ""));
    if (!/^[a-z0-9]+_[a-z0-9]+$/.test(code)) { setError("Code gồm tên_họ, viết thường và không dấu."); return; }
    queue({ kind: "invite", code });
  }

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const name = plainText(data.get("name"));
    const nickname = plainText(data.get("nickname"));
    const dojo = plainText(data.get("dojo"));
    const practiceYears = Number(data.get("practiceYears"));
    const dan = String(data.get("dan"));
    if (name.length < 2 || nickname.length < 1 || dojo.length < 2 || !Number.isInteger(practiceYears) || practiceYears < 0 || practiceYears > 100 || !DAN_OPTIONS.some(([value]) => value === dan)) {
      setError("Điền đủ tên, nickname, dojo, Dan và số năm tập nhé.");
      return;
    }
    queue({ kind: "register", name, nickname, dojo, practiceYears, dan: dan as DanLevel });
  }

  function selectMode(nextMode: "invite" | "register") {
    if (busy) return;
    setMode(nextMode);
    setError(null);
  }

  return (
    <main className="hero shell">
      <div className="hero-grid">
        <section className="hero-intro">
          <MenMark className="hero-mark" />
          <p className="kicker">31 · 08 · 2026 / secret session</p>
          <h1>Sunday<br />Kachinuki</h1>
          <p className="hero-copy hero-haiku">Shinai meet at dawn<br />One breath crosses the white line<br />The next bout begins.</p>
        </section>
        <section className="panel entrance-panel">
          <div className="segmented" role="tablist" aria-label="Cách vào Sunday Kachinuki">
            <button type="button" role="tab" aria-selected={mode === "invite"} className={mode === "invite" ? "active" : ""} onClick={() => selectMode("invite")}>Invite code</button>
            <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => selectMode("register")}>Register</button>
          </div>
          {mode === "invite" ? (
            <form className="stack" onSubmit={submitInvite}>
              <div className="field"><label htmlFor="invite">Invite code</label><input className="input" id="invite" name="invite" placeholder="ten_ho · không dấu, viết thường" autoCapitalize="none" autoCorrect="off" spellCheck={false} required disabled={busy} /></div>
              <button className="button" type="submit" disabled={busy || !hydrated}>{busy ? "Đang mở cổng…" : "Reveal my card"}</button>
            </form>
          ) : (
            <form className="stack" onSubmit={submitRegistration}>
              <div className="register-grid">
                <div className="field register-wide"><label htmlFor="name">Họ và tên</label><input className="input" id="name" name="name" placeholder="e.g: Nguyen Thi Cam Tu" maxLength={120} required disabled={busy} /></div>
                <div className="field"><label htmlFor="nickname">Nickname</label><input className="input" id="nickname" name="nickname" placeholder="e.g: Tu" maxLength={40} required disabled={busy} /></div>
                <div className="field"><label htmlFor="dojo">Dojo</label><input className="input" id="dojo" name="dojo" placeholder="e.g: Shakaijin" maxLength={120} required disabled={busy} /></div>
                <div className="field"><label htmlFor="practiceYears">Số năm tập</label><input className="input" id="practiceYears" name="practiceYears" type="number" inputMode="numeric" min={0} max={100} step={1} placeholder="e.g: 2" required disabled={busy} /></div>
                <div className="field"><label htmlFor="dan">Dan</label><select className="select" id="dan" name="dan" defaultValue="under_1_dan" required disabled={busy}>{DAN_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              </div>
              <p className="form-note">Tên có dấu sẽ tự chuyển về không dấu để dễ quản lý đội hình.</p>
              <button className="button" type="submit" disabled={busy || !hydrated}>{busy ? "Đang tạo profile…" : "Create my Battle Card"}</button>
            </form>
          )}
          <div ref={widgetRoot} aria-hidden="true" />
          <div aria-live="polite">{error ? <p className="error">{error}</p> : null}</div>
        </section>
      </div>
    </main>
  );
}
