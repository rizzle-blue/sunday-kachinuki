import type { SundayCard } from "@/contracts/sunday";
import type { CSSProperties } from "react";

export function BattleCard({ name, nickname, dojo, card, compact = false }: Readonly<{ name: string; nickname?: string; dojo: string; card: SundayCard; compact?: boolean }>) {
  return (
    <article className={`battle-card rarity-${card.rarity} ${compact ? "compact" : ""}`} style={{ "--card-accent": card.accent } as CSSProperties}>
      <div className="card-shine" aria-hidden="true" />
      <header><span>SK-{card.serial}</span><strong>{card.rarity}</strong></header>
      <div className="card-mon"><span>勝</span></div>
      <div className="card-copy">
        <p className="eyebrow">{dojo} · {card.aura} aura</p>
        <h2>{nickname ?? name}</h2>
        <p className="codename">{name} · {card.codename}</p>
      </div>
      <footer><span>Lucky waza</span><strong>{card.luckyWaza.toUpperCase()}</strong></footer>
    </article>
  );
}
