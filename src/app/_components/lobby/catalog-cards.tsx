import { Layers, LockKeyhole } from "lucide-react";

import { CUE_CATALOG, CUE_TYPE_LABELS } from "~/app/billiard/_components/billiard-game/cues";
import type { PlayerProfile, ShopCue } from "~/app/billiard/_components/billiard-game/match-types";
import { RULES } from "~/app/billiard/_components/billiard-game/rules";
import { Button } from "~/components/ui/button";

import type { HallTable } from "./hall-types";

export const CueCards = ({ cues, player, busy, onCue }: {
  cues: readonly ShopCue[]; player: PlayerProfile; busy: boolean;
  onCue: (id: string, action: "buy" | "equip") => void;
}) => <div className="hall-catalog-grid">
  {cues.map((cue) => {
    const model = CUE_CATALOG.find(({ id }) => id === cue.id);
    if (!model) return null;
    const equipped = player.loadout[cue.type] === cue.id;
    return <article className="hall-cue-card" key={cue.id}>
      <div className="hall-cue-art">
        <span>{CUE_TYPE_LABELS[cue.type]}</span>
        <svg viewBox="0 0 440 105" role="img" aria-label={`Hình gậy ${cue.name}`}>
          <defs>
            <linearGradient id={`shaft-${cue.id}`} x2="0" y2="1"><stop stopColor="#f4dfb0"/><stop offset=".5" stopColor="#b39a70"/><stop offset="1" stopColor="#f2d9a9"/></linearGradient>
            <linearGradient id={`butt-${cue.id}`} x2="0" y2="1"><stop stopColor={model.color}/><stop offset=".45" stopColor={model.color}/><stop offset=".6" stopColor="#202b31"/><stop offset="1" stopColor={model.color}/></linearGradient>
          </defs>
          <g transform="translate(20 70) rotate(-5)">
            <path d="M4 0 L248 -4 L248 4 Z" fill={`url(#shaft-${cue.id})`}/>
            <path d="M248 -4 L392 -8 L392 8 L248 4Z" fill={`url(#butt-${cue.id})`}/>
            <path d="M282 -5 L345 -6.5 L345 6.5 L282 5Z" fill={cue.id.includes("standard") ? model.color : "#26373c"}/>
            <path d="M249 -4V4 M256 -4V4 M351 -7V7 M377 -8V8" stroke="#d9bc77" strokeWidth="3"/>
            <path d="M394 -8V8" stroke="#172329" strokeWidth="7"/>
            <path d="M4 -1.7V1.7" stroke="#7fbfc5" strokeWidth="5"/>
          </g>
        </svg>
      </div>
      <div className="hall-card-body">
        <h3>{cue.name}</h3>
        <dl className="hall-cue-specs">
          <div><dt>Chiều dài</dt><dd>{Math.round(model.length * 100)} cm</dd></div>
          <div><dt>Khối lượng</dt><dd>{model.massGrams} g</dd></div>
          <div><dt>Đường kính đầu</dt><dd>{(model.tipRadius * 2000).toFixed(1)} mm</dd></div>
          <div><dt>Hệ số tốc độ</dt><dd>×{model.speedScale.toFixed(2)}</dd></div>
          <div><dt>Độ lệch đầu tối đa</dt><dd>{Math.round(model.maxTipOffset * 100)}% R bi</dd></div>
          <div><dt>Góc nâng</dt><dd>{model.minElevation}–{model.maxElevation}°</dd></div>
        </dl>
        <div className="hall-card-footer">
          <span className="lobby-gold">{cue.owned ? "Đã sở hữu" : `${cue.price.toLocaleString("vi-VN")} xu`}</span>
          <Button className={equipped ? "lobby-secondary" : "lobby-primary"} size="sm"
            disabled={busy || equipped || (!cue.owned && (!player.registered || player.coins < cue.price))}
            onClick={() => onCue(cue.id, cue.owned ? "equip" : "buy")}>
            {equipped ? "Đang dùng" : cue.owned ? "Trang bị" : !player.registered ? "Cần Gmail" : player.coins < cue.price ? "Chưa đủ xu" : "Mua gậy"}
          </Button>
        </div>
      </div>
    </article>;
  })}
</div>;

export const TableCards = ({ tables, ownId, busy, resumable, onJoin }: {
  tables: readonly HallTable[]; ownId?: string; busy: boolean; resumable: boolean; onJoin: (table: HallTable) => void;
}) => tables.length === 0 ? <div className="hall-tables-empty" role="status">
  <Layers size={32} aria-hidden="true" />
  <h3>Chưa có bàn nào được tạo</h3>
  <p>Tạo bàn đầu tiên để mời người chơi khác, hoặc vào Luyện tập để làm quen.</p>
</div> : <div className="hall-catalog-grid hall-tables-grid">
  {[...tables].sort((a, b) => a.slot - b.slot).map((table) => {
    const slot = table.slot;
    return <article className="hall-table-card" key={table.id}>
      <div className={`hall-table-art${table.playing ? " is-playing" : " is-waiting"}`}>
        <span>BÀN {String(slot).padStart(2, "0")}</span>
        <svg viewBox="0 0 240 120" role="img" aria-label={`Bàn ${slot}`}>
          <rect x="25" y="13" width="190" height="94" rx="12" fill="#664a35" stroke="#b69c63" strokeWidth="3"/>
          <rect x="34" y="22" width="172" height="76" rx="6" fill="currentColor"/>
          {[34, 120, 206].flatMap((x) => [22, 98].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#0c191c"/>))}
          <circle cx="75" cy="58" r="4" fill="#fff1d3"/><circle cx="158" cy="58" r="4" fill="#eac05f"/>
          <circle cx="166" cy="53" r="4" fill="#5294b0"/><circle cx="166" cy="63" r="4" fill="#b65847"/>
        </svg>
      </div>
      <div className="hall-card-body">
        <div className="hall-table-heading"><h3>{table.host}</h3>{table.locked && <LockKeyhole size={16} aria-label="Có mật khẩu"/>}</div>
        <p>{`${RULES[table.rule].label} · ${table.playing ? "2/2 người · Đang đấu" : "1/2 người · Chờ đối thủ"}`}</p>
        <Button className="lobby-secondary" variant="outline" size="sm" disabled={busy || !ownId || table.hostId === ownId || table.playing || resumable}
          onClick={() => onJoin(table)}>{table.hostId === ownId ? "Bàn của bạn" : table.playing ? "Đang thi đấu" : "Vào bàn"}</Button>
      </div>
    </article>;
  })}
</div>;
