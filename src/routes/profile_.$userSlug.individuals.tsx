import { useEffect, useState } from "react";
import type { SundayProfile, SundayResult } from "@/contracts/sunday";
import { BattleCard } from "@/components/battle-card";
import { sundayProfileSlug } from "@/domain/sunday";
import { getProfile, getResult } from "@/lib/api";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/profile_/$userSlug/individuals")({ component: ResultsPage });

const WAZA_LABELS = { men: "Men", kote: "Kote", do: "Dō", tsuki: "Tsuki" } as const;

function resultTitle(result: SundayResult): string {
  const { boutsFought, boutWins, ipponScored, teamWins, teamLosses } = result.summary;
  if (boutsFought > 0 && boutWins === boutsFought) return "Mushin Run";
  if (ipponScored >= 5) return "Ippon Storm";
  if (teamWins > teamLosses) return "Iron Zanshin";
  return "Sunday Survivor";
}

function MetricInfo({ label, children }: Readonly<{ label: string; children: string }>) {
  return <details className="metric-info"><summary aria-label={`Giải thích ${label}`}>i</summary><p>{children}</p></details>;
}

function ResultsPage() {
  const { userSlug } = Route.useParams();
  const [profile, setProfile] = useState<SundayProfile>();
  const [result, setResult] = useState<SundayResult>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    void getProfile()
      .then((nextProfile) => {
        if (!active) return;
        const canonicalSlug = sundayProfileSlug(nextProfile.name);
        if (userSlug !== canonicalSlug) {
          window.location.replace(`/profile/${encodeURIComponent(canonicalSlug)}/individuals`);
          return;
        }
        setProfile(nextProfile);
        return getResult();
      })
      .then((nextResult) => {
        if (active && nextResult) setResult(nextResult);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => { active = false; };
  }, [userSlug]);

  if (unavailable) {
    return <main className="page shell"><section className="panel result-empty"><p className="kicker">Sunday record</p><h1 className="page-title">Kết quả chưa mở.</h1><p className="muted">Hãy đăng nhập bằng invite code của bạn. Kết quả sẽ xuất hiện sau khi session hoàn tất.</p><Link className="button" to="/">Về cổng vào</Link></section></main>;
  }

  if (!profile || !result) return <main className="page shell"><p className="muted">Đang khắc Sunday record…</p></main>;

  const waza = result.summary.pointsByWaza;
  const maxWaza = Math.max(1, waza.men, waza.kote, waza.do, waza.tsuki);
  const completedAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.session.completedAt));

  return <main className="page shell result-page">
    <header className="result-heading">
      <div><p className="kicker">Individual achievement</p><h1 className="page-title">{profile.nickname}</h1><p className="result-subtitle">{resultTitle(result)} · {profile.card.codename}</p></div>
      <Link className="button secondary compact" to="/profile">← Battle Card</Link>
    </header>

    <div className="result-hero">
      <BattleCard name={profile.name} nickname={profile.nickname} dojo={profile.dojo} card={profile.card} />
      <section className="panel result-scorecard">
        <div className="result-seal"><span>Sunday Kachinuki season</span><strong>{resultTitle(result)}</strong><small>{result.session.name}</small></div>
        <div className="result-stats" aria-label="Thống kê cá nhân">
          <div><span>Played matches</span><strong>{result.summary.matchesPlayed}</strong><small>match hợp lệ</small></div>
          <div><div className="metric-label">Formations <MetricInfo label="Formations">Số Team-3 roster khác nhau mà bạn đã thi đấu trong các match hợp lệ.</MetricInfo></div><strong>{result.summary.formationCount}</strong><small>Team-3 roster</small></div>
          <div><div className="metric-label">Win–Loss <MetricInfo label="Win–Loss">Kết quả của cả đội trong TeamMatch, không phải kết quả bout cá nhân.</MetricInfo></div><strong>{result.summary.teamWins}–{result.summary.teamLosses}</strong><small>team record</small></div>
          <div><div className="metric-label">Win rate <MetricInfo label="Win rate">Số TeamMatch thắng chia cho tổng TeamMatch hợp lệ đã chơi.</MetricInfo></div><strong>{result.summary.winRate}%</strong><small>trên match hợp lệ</small></div>
          <div><div className="metric-label">Ippon <MetricInfo label="Ippon">Tổng ippon chính thức của bạn. Điểm được thưởng từ hansoku của đối thủ có thể làm tổng này lớn hơn tổng waza.</MetricInfo></div><strong>{result.summary.ipponScored}</strong><small>để lọt {result.summary.ipponConceded}</small></div>
          <div><div className="metric-label">Bout record <MetricInfo label="Bout record">Thắng–thua–hòa của riêng bạn trong từng senpo, chuken, taisho hoặc daihyo bout.</MetricInfo></div><strong>{result.summary.boutWins}–{result.summary.boutLosses}–{result.summary.boutDraws}</strong><small>W–L–D</small></div>
        </div>
        <div className="result-meta"><span>{result.summary.boutsFought} bout</span><span>{result.summary.hansoku} hansoku</span><span>{result.session.durationMinutes} phút</span><span>Hoàn tất {completedAt}</span></div>
      </section>
    </div>

    <div className="result-content">
      <section className="panel waza-panel">
        <p className="kicker">Ippon signature</p><h2>Đường kiếm của bạn</h2>
        <div className="waza-bars">
          {Object.entries(waza).map(([key, value]) => <div className="waza-row" key={key}>
            <div><strong>{WAZA_LABELS[key as keyof typeof WAZA_LABELS]}</strong><span>{value}</span></div>
            <div className="waza-track" aria-label={`${WAZA_LABELS[key as keyof typeof WAZA_LABELS]}: ${value}`}><span style={{ width: `${(value / maxWaza) * 100}%` }} /></div>
          </div>)}
        </div>
        <p className="form-note">Ippon do hansoku của đối thủ vẫn được tính vào tổng điểm, nhưng không gán cho một waza.</p>
      </section>

      <section className="history-section">
        <p className="kicker">Bout by bout</p><h2>Lịch sử đối đầu</h2>
        <div className="result-history">
          {result.history.map((bout, index) => <article className={`panel result-bout result-${bout.boutResult}`} key={`${bout.matchSequence}-${bout.position}-${index}`}>
            <header><div><span>Match #{bout.matchSequence} · {bout.position}</span><strong>{bout.teamLabel}</strong></div><span className={`result-badge ${bout.boutResult}`}>{bout.boutResult}</span></header>
            <div className="result-versus"><div><small>{profile.nickname}</small><strong>{bout.ipponFor}</strong></div><span>vs</span><div className="right"><small>{bout.opponentName}</small><strong>{bout.ipponAgainst}</strong></div></div>
            <footer><span>Team {bout.teamResult}</span><span>vs {bout.opponentTeamLabel}</span></footer>
          </article>)}
        </div>
      </section>
    </div>
  </main>;
}
