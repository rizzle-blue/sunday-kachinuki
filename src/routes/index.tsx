import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession, getProfile, normalizeInviteCode, redeemInvite } from "@/lib/api";

declare global {
  interface Window {
    turnstile?: { render(element: HTMLElement, options: Record<string, unknown>): string; execute(widgetId: string): void; reset(widgetId: string): void };
  }
}

export const Route = createFileRoute("/")({ component: Entrance });

function Entrance() {
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [pendingCode, setPendingCode] = useState<string>();
  const widgetRoot = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    void getProfile().then(() => window.location.assign("/profile")).catch(() => undefined);
  }, []);

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
    if (!pendingCode || (siteKey && !captchaToken)) return;
    void enter(pendingCode, captchaToken);
  }, [captchaToken, pendingCode, siteKey]);

  async function enter(code: string, token?: string) {
    setBusy(true);
    setError(null);
    try {
      await ensureAnonymousSession(token);
      await redeemInvite(code);
      window.location.assign("/profile");
    } catch {
      setBusy(false);
      setPendingCode(undefined);
      setCaptchaToken(undefined);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setError("Invite code chưa đúng. Kiểm tra lại và thử lần nữa nhé.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const code = normalizeInviteCode(String(new FormData(event.currentTarget).get("invite") ?? ""));
    if (!/^[a-z0-9]+_[a-z0-9]+$/.test(code)) { setError("Code có dạng given_family."); return; }
    setPendingCode(code);
    if (siteKey && !captchaToken) { if (widgetId.current) window.turnstile?.execute(widgetId.current); else setError("Đang chuẩn bị xác minh, thử lại sau vài giây."); }
  }

  return <main className="hero shell"><div className="hero-grid"><section><p className="kicker">31 · 08 · 2026 / secret session</p><h1>Sunday<br />Kachinuki</h1><p className="hero-copy">Một giờ. Một court. Đội thắng sống tiếp, đội thua trở lại vòng xoay. Trước tiên—hãy mở lá bài Kenshi của bạn.</p></section><section className="panel"><form className="stack" onSubmit={submit}><div className="field"><label htmlFor="invite">Invite code</label><input className="input" id="invite" name="invite" placeholder="given_family" autoCapitalize="none" autoCorrect="off" spellCheck={false} required disabled={busy} /></div><div ref={widgetRoot} aria-hidden="true" /><button className="button" type="submit" disabled={busy || !hydrated}>{busy ? "Đang mở cổng…" : "Reveal my card"}</button><div aria-live="polite">{error ? <p className="error">{error}</p> : null}</div></form></section></div></main>;
}
