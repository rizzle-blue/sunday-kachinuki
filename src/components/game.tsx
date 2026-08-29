import type { SundayMatch } from "@/contracts/sunday";
import type { CSSProperties } from "react";

export function TeamCard({ team }: Readonly<{ team: SundayMatch["akaTeam"] }>) {
  return <section className="panel team-card" style={{ "--team-accent": team.accent } as CSSProperties}><p className="kicker">Your Team-3</p><h2>{team.label}</h2><ul className="team-members">{team.members.map((member) => <li key={member.profileId}><span>{member.name}</span><strong>{member.position}</strong></li>)}</ul></section>;
}

export function MatchBoard({ match }: Readonly<{ match: SundayMatch }>) {
  return <section className="panel match-board"><p className="kicker">One court · {match.state}</p><div className="score-head"><div><strong>{match.akaTeam.label}</strong><span className="pill">Aka</span></div><span className="versus">VS</span><div><strong>{match.shiroTeam.label}</strong><span className="pill">Shiro</span></div></div><div className="bout-list">{match.bouts.map((bout) => <div className={`bout-row ${bout.state === "in_progress" ? "current" : ""}`} key={bout.boutId}><div><strong>{bout.aka.name}</strong><div className="score">{bout.aka.ippon}</div><small className="muted">H {bout.aka.hansoku}</small></div><span className="versus">{bout.position}<br />{bout.state}</span><div className="right"><strong>{bout.shiro.name}</strong><div className="score">{bout.shiro.ippon}</div><small className="muted">H {bout.shiro.hansoku}</small></div></div>)}</div></section>;
}
