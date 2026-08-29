import { useEffect, useState } from "react";
import type { SundayGameState, SundayLobby } from "@/contracts/sunday";
import { createFileRoute } from "@tanstack/react-router";
import { BattleCard } from "@/components/battle-card";
import { MatchBoard, TeamCard } from "@/components/game";
import { getGame, getLobby } from "@/lib/api";

export const Route = createFileRoute("/lobby")({ component: LobbyPage });

function LobbyPage() {
  const [lobby, setLobby] = useState<SundayLobby>();
  const [game, setGame] = useState<SundayGameState>();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [nextLobby, nextGame] = await Promise.all([getLobby(), getGame()]);
        if (active) { setLobby(nextLobby); setGame(nextGame); setOffline(false); }
      } catch { if (active) setOffline(true); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (!lobby || !game) return <main className="page shell"><p className="muted">Đang tập hợp lobby…</p></main>;
  const completed = lobby.session.state === "completed";
  return <main className="page shell"><header><p className="kicker">Sunday lobby</p><h1 className="page-title">{completed ? "Hết vòng, còn dư âm." : lobby.session.state === "lobby" ? "Đợi hiệu lệnh từ host." : "Kachinuki đang chạy."}</h1><div className="status-strip"><span className={`pill ${lobby.session.state === "live" ? "live" : ""}`}>{lobby.session.state}</span><span className="pill">{lobby.session.readyCount} Ready</span><span className={`pill ${game.me.tier}`}>{game.me.tier}</span><span className="pill">{game.me.wins}W · {game.me.losses}L</span>{offline ? <span className="pill lower" aria-live="polite">Mất kết nối · đang thử lại</span> : null}</div></header>{completed ? <section className="panel"><h2>Sunday summary</h2><p className="muted">Bạn đã đi qua {game.me.wins + game.me.losses} TeamMatch: {game.me.wins} thắng và {game.me.losses} thua. Card vẫn là của bạn—khoe tiếp thôi.</p></section> : <div className="lobby-layout"><div className="stack">{game.team ? <TeamCard team={game.team} /> : <section className="panel"><h2>Free-agent pool</h2><p className="muted">Bạn đang chờ lượt formation tiếp theo. Không cần refresh.</p></section>}{game.currentMatch ? <MatchBoard match={game.currentMatch} /> : <section className="panel"><h2>Chưa có match hiện tại</h2><p className="muted">Host sẽ bắt đầu khi có ít nhất sáu Kenshi Ready.</p></section>}</div><aside className="panel"><p className="kicker">Ready card wall</p><h2>{lobby.cards.length} Kenshi revealed</h2><p className="muted">Dan và năm tập của người khác được giữ riêng.</p></aside></div>}<section><p className="kicker" style={{ marginTop: "2.5rem" }}>Card wall</p><div className="card-grid">{lobby.cards.map((profile) => <BattleCard compact key={profile.profileId} name={profile.name} nickname={profile.nickname} dojo={profile.dojo} card={profile.card} />)}</div></section></main>;
}
