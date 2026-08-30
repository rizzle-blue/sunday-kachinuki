import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SundayHostConsole, SundayMatch } from "@/contracts/sunday";
import { createFileRoute } from "@tanstack/react-router";
import { MatchBoard } from "@/components/game";
import { createDaihyo, finalizeBout, getHostConsole, hostSignIn, kickReady, recordEvent, startBout, startSession, stopSession, undoEvent } from "@/lib/api";

export const Route = createFileRoute("/host")({ component: HostPage });

function HostPage() {
  const [consoleState, setConsoleState] = useState<SundayHostConsole>();
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const [confirmKick, setConfirmKick] = useState<string>();

  const load = useCallback(async () => {
    try { setConsoleState(await getHostConsole()); setNeedsLogin(false); }
    catch { setNeedsLogin(true); }
  }, []);

  useEffect(() => { void load(); const timer=window.setInterval(() => void load(),2000); return () => window.clearInterval(timer); }, [load]);

  async function mutate(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true); setFeedback(undefined);
    try { await action(); await load(); setFeedback(success); }
    catch { setFeedback("Lệnh chưa được nhận. Trạng thái đã được làm mới; hãy kiểm tra trước khi thử lại."); await load(); }
    finally { setBusy(false); }
  }

  if (needsLogin) return <HostLogin onSuccess={load} />;
  if (!consoleState) return <main className="page shell"><p className="muted">Đang mở court console…</p></main>;
  const match = consoleState.currentMatch;
  const bout = match?.bouts.find((item) => item.state === "in_progress") ?? match?.bouts.find((item) => item.state === "queued");
  return <main className="page shell"><header><p className="kicker">Host · recorder · one court</p><h1 className="page-title">Court console</h1><div className="status-strip"><span className={`pill ${consoleState.session.state === "live" ? "live" : ""}`}>{consoleState.session.state}</span><span className="pill">{consoleState.session.readyCount} Ready</span><span className="pill">{consoleState.waitingCount} waiting</span></div><div aria-live="polite">{feedback ? <p className="muted">{feedback}</p> : null}</div></header><div className="host-layout"><div className="stack">{match ? <><MatchBoard match={match} />{bout ? <CourtPad match={match} bout={bout} busy={busy} mutate={mutate} /> : null}{match.state === "tiebreak" && !match.bouts.some((item) => item.position === "daihyo") ? <Daihyo match={match} busy={busy} mutate={mutate} /> : null}</> : <section className="panel"><h2>Chưa có current match</h2><p className="muted">Khi đủ sáu người, bắt đầu formation. Nếu session đã completed, court sẽ giữ trạng thái cuối.</p></section>}</div><aside className="stack host-sidebar"><section className="panel"><p className="kicker">Ready list</p><h2>Kenshi chưa vào đội</h2>{consoleState.readyEntries.length > 0 ? <ul className="ready-list">{consoleState.readyEntries.map((entry) => <li key={entry.profileId}><div><strong>{entry.nickname}</strong><span>{entry.name} · {entry.dojo}</span><small>{entry.state}</small></div>{confirmKick === entry.profileId ? <div className="ready-actions"><button className="button danger compact" disabled={busy} onClick={() => void mutate(() => kickReady(entry.profileId,entry.version),`${entry.nickname} đã rời Ready list.`).then(() => setConfirmKick(undefined))}>Confirm kick</button><button className="button secondary compact" disabled={busy} onClick={() => setConfirmKick(undefined)}>Cancel</button></div> : <button className="button danger compact" disabled={busy} onClick={() => setConfirmKick(entry.profileId)}>Kick</button>}</li>)}</ul> : <p className="muted">Không có Kenshi nào đang Ready hoặc waiting.</p>}</section><section className="panel"><p className="kicker">Session controls</p><h2>60-minute soft limit</h2><p className="muted">End after current không hủy match đang diễn ra. Sunday không có recovery hoặc reopen.</p><div className="stack">{consoleState.session.state === "lobby" ? <button className="button" disabled={busy || consoleState.session.readyCount < 6} onClick={() => void mutate(startSession,"Formation đã được tạo.")}>Start formation</button> : null}{["live","stopping"].includes(consoleState.session.state) ? <button className="button danger" disabled={busy || consoleState.session.state === "stopping"} onClick={() => void mutate(stopSession,"Session sẽ đóng sau current match.")}>End after current</button> : null}</div></section></aside></div></main>;
}

function HostLogin({ onSuccess }: Readonly<{ onSuccess: () => Promise<void> }>) {
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if(busy)return; setBusy(true);setError(undefined);const form=new FormData(event.currentTarget);try{await hostSignIn(String(form.get("email")??""),String(form.get("password")??""));await onSuccess();}catch{setError("Host credential không hợp lệ.");setBusy(false);} }
  return <main className="hero shell"><section className="panel" style={{ width:"min(100%,30rem)",margin:"auto" }}><p className="kicker">Restricted court access</p><h1 className="page-title">Host sign in</h1><form className="stack" onSubmit={submit}><div className="field"><label htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" autoComplete="username" required /></div><div className="field"><label htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" required /></div><button className="button" disabled={busy}>{busy?"Đang vào court…":"Open court console"}</button>{error?<p className="error" aria-live="polite">{error}</p>:null}</form></section></main>;
}

function CourtPad({ match,bout,busy,mutate }: Readonly<{ match:SundayMatch; bout:SundayMatch["bouts"][number]; busy:boolean; mutate:(action:()=>Promise<void>,success:string)=>Promise<void> }>) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  const remaining=useMemo(()=>bout.startedAt?Math.max(0,120-Math.floor((now-Date.parse(bout.startedAt))/1000)):120,[bout.startedAt,now]);
  const canStart=Date.parse(match.plannedStart)<=now||bout.position==="daihyo";
  const canFinalize=bout.state==="in_progress"&&(remaining===0||bout.aka.ippon>=2||bout.shiro.ippon>=2||bout.position==="daihyo"&&(bout.aka.ippon!==bout.shiro.ippon));
  return <section className="panel"><p className="kicker">{bout.position} · {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,"0")}</p><div className="court-controls"><SidePad side="aka" name={bout.aka.name} bout={bout} busy={busy} mutate={mutate}/><SidePad side="shiro" name={bout.shiro.name} bout={bout} busy={busy} mutate={mutate}/></div><div className="operator-actions">{bout.state==="queued"?<button className="button" disabled={busy||!canStart} onClick={()=>void mutate(()=>startBout(bout.boutId,bout.version),"Bout đã bắt đầu.")}>{canStart?"Start bout":"Rest window…"}</button>:<><button className="button secondary" disabled={busy} onClick={()=>void mutate(()=>undoEvent(bout.boutId,bout.version),"Đã undo event cuối.")}>Undo last</button><button className="button" disabled={busy||!canFinalize} onClick={()=>void mutate(()=>finalizeBout(bout.boutId,bout.version),"Bout đã finalize.")}>Finalize bout</button></>}</div></section>;
}

function SidePad({side,name,bout,busy,mutate}:Readonly<{side:"aka"|"shiro";name:string;bout:SundayMatch["bouts"][number];busy:boolean;mutate:(action:()=>Promise<void>,success:string)=>Promise<void>}>) {
  const enabled=bout.state==="in_progress"&&!busy;
  return <div className={`side-pad ${side}`}><h3>{name}</h3><div className="score-buttons">{(["men","kote","do","tsuki"] as const).map(waza=><button className="score-button" disabled={!enabled} key={waza} onClick={()=>void mutate(()=>recordEvent({boutId:bout.boutId,expectedVersion:bout.version,kind:"point",side,waza}),`${waza.toUpperCase()} · ${name}`)}>{waza.toUpperCase()}</button>)}<button className="score-button hansoku" disabled={!enabled} onClick={()=>void mutate(()=>recordEvent({boutId:bout.boutId,expectedVersion:bout.version,kind:"hansoku",side,waza:null}),`Hansoku · ${name}`)}>HANSOKU</button></div></div>;
}

function Daihyo({match,busy,mutate}:Readonly<{match:SundayMatch;busy:boolean;mutate:(action:()=>Promise<void>,success:string)=>Promise<void>}>) {
  const [aka,setAka]=useState(match.akaTeam.members[0]!.profileId); const [shiro,setShiro]=useState(match.shiroTeam.members[0]!.profileId);
  return <section className="panel"><p className="kicker">TeamMatch tied</p><h2>Chọn đại diện daihyo</h2><div className="stack"><select className="select" value={aka} onChange={event=>setAka(event.target.value)}>{match.akaTeam.members.map(member=><option key={member.profileId} value={member.profileId}>{member.name}</option>)}</select><select className="select" value={shiro} onChange={event=>setShiro(event.target.value)}>{match.shiroTeam.members.map(member=><option key={member.profileId} value={member.profileId}>{member.name}</option>)}</select><button className="button" disabled={busy} onClick={()=>void mutate(()=>createDaihyo(match.matchId,aka,shiro),"Daihyo bout đã sẵn sàng.")}>Create sudden-death bout</button></div></section>;
}
