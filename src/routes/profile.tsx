import { useEffect, useState } from "react";
import type { SundayProfile } from "@/contracts/sunday";
import { createFileRoute } from "@tanstack/react-router";
import { BattleCard } from "@/components/battle-card";
import { getProfile, setReady } from "@/lib/api";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  const [profile, setProfile] = useState<SundayProfile>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { void getProfile().then(setProfile).catch(() => window.location.assign("/")); }, []);

  async function ready() {
    if (busy) return;
    setBusy(true); setError(undefined);
    try { await setReady(true); window.location.assign("/lobby"); }
    catch { setBusy(false); setError("Chưa thể vào lobby. Hãy kiểm tra mạng và thử lại."); }
  }

  if (!profile) return <main className="page shell"><p className="muted">Đang reveal Battle Card…</p></main>;
  return <main className="page shell"><div className="profile-grid"><BattleCard name={profile.name} dojo={profile.dojo} card={profile.card} /><section className="panel profile-copy"><p className="kicker">Kenshi unlocked</p><h1 className="page-title">{profile.card.codename}</h1><p className="muted">Card này được tạo riêng cho phiên Sunday Kachinuki và không dựa trên cấp Dan.</p><dl><div><dt>Họ tên</dt><dd>{profile.name}</dd></div><div><dt>Dojo</dt><dd>{profile.dojo}</dd></div><div><dt>Dan</dt><dd>{profile.dan.replace("under_1_dan", "Dưới 1 Dan").replace("_dan", " Dan")}</dd></div><div><dt>Năm tập</dt><dd>{profile.practiceYears}</dd></div><div><dt>Lucky waza</dt><dd>{profile.card.luckyWaza.toUpperCase()}</dd></div></dl>{error ? <p className="error" aria-live="polite">{error}</p> : null}</section></div><div className="sticky-actions"><button className="button" disabled={busy} onClick={() => void ready()}>{busy ? "Đang vào lobby…" : "Ready · Join the lobby"}</button></div></main>;
}
