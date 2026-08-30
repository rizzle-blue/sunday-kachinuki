import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MatchBoard } from "@/components/game";
import type { SundayScoreEvent, SundaySide, SundayWaza } from "@/domain/sunday";
import {
  SIMULATION_KENSHI,
  createSimulationDaihyo,
  createSundaySimulation,
  finalizeSimulationBout,
  formSundaySimulation,
  recordSimulationEvent,
  startSimulationBout,
  undoSimulationEvent,
  type SundaySimulation,
} from "@/domain/sunday-simulator";

export const Route = createFileRoute("/simulate")({ component: SimulatePage });

function SimulatePage() {
  const [simulation, setSimulation] = useState(createSundaySimulation);
  const [feedback, setFeedback] = useState("10 Kenshi đã Ready. Bấm Form Team-3 để bắt đầu.");
  const match = simulation.currentMatch;
  const bout = match?.bouts.find((item) => item.state === "in_progress") ?? match?.bouts.find((item) => item.state === "queued");

  function apply(update: (state: SundaySimulation) => SundaySimulation, message: string) {
    setSimulation((state) => update(state));
    setFeedback(message);
  }

  function reset() {
    setSimulation(createSundaySimulation());
    setFeedback("Simulator đã reset. 10 Kenshi vẫn được prefill ở trạng thái Ready.");
  }

  return (
    <main className="page shell">
      <header>
        <p className="kicker">Host sandbox · zero database writes</p>
        <h1 className="page-title">Sunday simulator</h1>
        <p className="muted simulator-lead">Formation và Kendo-lite scoring chạy ngay trong browser. Refresh trang sẽ reset toàn bộ dữ liệu mô phỏng.</p>
        <div className="status-strip">
          <span className={`pill ${simulation.phase === "live" ? "live" : ""}`}>{simulation.phase}</span>
          <span className="pill">10 Ready</span>
          <span className="pill">{simulation.teams.length} teams</span>
          <span className="pill">{simulation.waiting.length} waiting</span>
        </div>
        <p className="simulator-feedback" aria-live="polite">{feedback}</p>
      </header>

      <div className="host-layout">
        <div className="stack">
          {!match ? (
            <section className="panel simulator-start">
              <p className="kicker">Formation preview</p>
              <h2>10 Ready → 3 Team-3 + 1 waiting</h2>
              <p className="muted">Seed cố định giúp kết quả formation lặp lại được. Hai đội đầu vào court, đội còn lại xếp queue.</p>
              <button className="button" onClick={() => apply(formSundaySimulation, "Đã tạo 3 Team-3. Team Tora và Team Tsuki vào current match.")}>Form Team-3</button>
            </section>
          ) : (
            <>
              <MatchBoard match={match} />
              {bout ? (
                <SimulationCourt
                  simulation={simulation}
                  bout={bout}
                  apply={apply}
                />
              ) : null}
              {match.state === "tiebreak" && !match.bouts.some((item) => item.position === "daihyo") ? (
                <SimulationDaihyo simulation={simulation} apply={apply} />
              ) : null}
              {match.state === "final" && simulation.winner ? (
                <section className="panel simulator-result">
                  <p className="kicker">TeamMatch final</p>
                  <h2>{simulation.winner === "aka" ? match.akaTeam.label : match.shiroTeam.label} thắng</h2>
                  <p className="muted">Formation và scoring loop đã hoàn tất mà không ghi dữ liệu vào Sunday Supabase.</p>
                  <button className="button secondary" onClick={reset}>Reset simulator</button>
                </section>
              ) : null}
            </>
          )}
        </div>

        <aside className="stack host-sidebar">
          <section className="panel">
            <p className="kicker">Prefilled roster</p>
            <h2>10 Kenshi</h2>
            <ol className="sim-roster">
              {SIMULATION_KENSHI.map((kenshi) => <li key={kenshi.profileId}><span>{kenshi.name}</span><strong>Ready</strong></li>)}
            </ol>
          </section>
          {simulation.teams.length > 0 ? (
            <section className="panel">
              <p className="kicker">Formation result</p>
              <div className="sim-team-list">
                {simulation.teams.map((team, index) => (
                  <div className="sim-team" key={team.teamId}>
                    <h3>{team.label}</h3>
                    <p>{team.members.map((member) => member.name.replace(" · Demo", "")).join(" · ")}</p>
                    <span className="pill">{index < 2 ? "current court" : "queued"}</span>
                  </div>
                ))}
                <div className="sim-team waiting">
                  <h3>Waiting</h3>
                  <p>{simulation.waiting.map((kenshi) => kenshi.name.replace(" · Demo", "")).join(" · ")}</p>
                </div>
              </div>
              <button className="button secondary" onClick={reset}>Reset all</button>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function SimulationCourt({ simulation, bout, apply }: Readonly<{
  simulation: SundaySimulation;
  bout: NonNullable<SundaySimulation["currentMatch"]>["bouts"][number];
  apply: (update: (state: SundaySimulation) => SundaySimulation, message: string) => void;
}>) {
  const started = bout.state === "in_progress";
  const eventCount = simulation.events[bout.boutId]?.length ?? 0;
  const target = bout.position === "daihyo" ? 1 : 2;
  const terminal = bout.aka.ippon >= target || bout.shiro.ippon >= target;
  const canFinalize = started && (bout.position !== "daihyo" || bout.aka.ippon !== bout.shiro.ippon);
  return (
    <section className="panel">
      <p className="kicker">{bout.position} · {started ? "scoring" : "ready"}</p>
      <div className="court-controls">
        <SimulationSide side="aka" name={bout.aka.name} enabled={started && !terminal} apply={apply} />
        <SimulationSide side="shiro" name={bout.shiro.name} enabled={started && !terminal} apply={apply} />
      </div>
      <div className="operator-actions">
        {!started ? (
          <button className="button" onClick={() => apply(startSimulationBout, `${bout.position} đã bắt đầu.`)}>Start bout</button>
        ) : (
          <>
            <button className="button secondary" disabled={eventCount === 0} onClick={() => apply(undoSimulationEvent, "Đã undo event cuối.")}>Undo last</button>
            <button className="button" disabled={!canFinalize} onClick={() => apply(finalizeSimulationBout, `${bout.position} đã finalize. ${bout.position === "daihyo" ? "TeamMatch đã có kết quả." : "Mở bout tiếp theo nếu còn."}`)}>End timer · Finalize</button>
          </>
        )}
      </div>
      <p className="form-note">{eventCount} event(s). Hai hansoku của một phía tự cộng một ippon cho đối thủ. Bout thường first-to-two; daihyo first-ippon.</p>
    </section>
  );
}

function SimulationSide({ side, name, enabled, apply }: Readonly<{
  side: SundaySide;
  name: string;
  enabled: boolean;
  apply: (update: (state: SundaySimulation) => SundaySimulation, message: string) => void;
}>) {
  function point(waza: SundayWaza) {
    const event: SundayScoreEvent = { kind: "point", side, waza };
    apply((state) => recordSimulationEvent(state, event), `${waza.toUpperCase()} · ${name}`);
  }

  return (
    <div className={`side-pad ${side}`}>
      <h3>{name}</h3>
      <div className="score-buttons">
        {(["men", "kote", "do", "tsuki"] as const).map((waza) => <button className="score-button" disabled={!enabled} key={waza} onClick={() => point(waza)}>{waza === "do" ? "DŌ" : waza.toUpperCase()}</button>)}
        <button className="score-button hansoku" disabled={!enabled} onClick={() => apply((state) => recordSimulationEvent(state, { kind: "hansoku", side }), `Hansoku · ${name}`)}>HANSOKU</button>
      </div>
    </div>
  );
}

function SimulationDaihyo({ simulation, apply }: Readonly<{
  simulation: SundaySimulation;
  apply: (update: (state: SundaySimulation) => SundaySimulation, message: string) => void;
}>) {
  const match = simulation.currentMatch!;
  const [aka, setAka] = useState(match.akaTeam.members[0]!.profileId);
  const [shiro, setShiro] = useState(match.shiroTeam.members[0]!.profileId);
  return (
    <section className="panel">
      <p className="kicker">TeamMatch tied</p>
      <h2>Chọn đại diện daihyo</h2>
      <div className="stack">
        <select className="select" aria-label="Aka daihyo" value={aka} onChange={(event) => setAka(event.target.value)}>{match.akaTeam.members.map((member) => <option key={member.profileId} value={member.profileId}>{member.name}</option>)}</select>
        <select className="select" aria-label="Shiro daihyo" value={shiro} onChange={(event) => setShiro(event.target.value)}>{match.shiroTeam.members.map((member) => <option key={member.profileId} value={member.profileId}>{member.name}</option>)}</select>
        <button className="button" onClick={() => apply((state) => createSimulationDaihyo(state, aka, shiro), "Daihyo sudden-death đã sẵn sàng.")}>Create daihyo</button>
      </div>
    </section>
  );
}
