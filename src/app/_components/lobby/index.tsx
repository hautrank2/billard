"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight, Coins, Crosshair, Layers, LockKeyhole, MessageCircle, Plus, Send, Target, Trophy, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

import { BilliardGame } from "../../billiard/_components/billiard-game";
import { RULES } from "../../billiard/_components/billiard-game/rules";
import type { GameRule } from "../../billiard/_components/billiard-game/type";
import type { HallMessage, HallTable } from "./hall-types";
import { useLobby } from "./hook";
import { LobbyScene } from "./lobby-scene";
import "./lobby.css";

type Panel = "create" | "tables" | "cues" | "history" | "chat";
const gameRules: GameRule[] = ["eight", "nine", "ten"];
const clock = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });
const tableNumber = (slot: number) => String(slot).padStart(2, "0");

function RoomChat({ messages, ownId, busy, visible, onSend, onClose }: {
  messages: readonly HallMessage[]; ownId?: string; busy: boolean; visible: boolean;
  onSend: (text: string) => Promise<boolean>; onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const history = useRef<HTMLDivElement>(null);
  const lastMessage = messages.at(-1)?.id;
  const follow = useRef(true);
  useEffect(() => {
    if (history.current && follow.current) history.current.scrollTop = history.current.scrollHeight;
  }, [lastMessage, visible]);

  return (
    <section className={`hall-glass hall-chat${visible ? " chat-open" : ""}`} aria-labelledby="chat-heading">
      <div className="hall-panel-heading">
        <MessageCircle size={18} aria-hidden="true" />
        <h2 id="chat-heading">Chat chung</h2>
        <button className="hall-close chat-close" type="button" aria-label="Đóng chat" onClick={onClose}><X size={19} /></button>
      </div>
      <div ref={history} className="hall-chat-log" role="log" aria-label="Tin nhắn trong sảnh" onScroll={(event) => {
        const log = event.currentTarget;
        follow.current = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      }}>
        {messages.length === 0 && <p className="hall-muted">Chưa có tin nhắn. Gửi lời chào cho cả sảnh.</p>}
        {messages.map((message) => <div className="hall-message" key={message.id}>
          <time dateTime={new Date(message.sentAt).toISOString()}>{clock.format(message.sentAt)}</time>
          <p><strong className={message.playerId === ownId ? "lobby-gold" : ""}>{message.name}</strong> {message.text}</p>
        </div>)}
      </div>
      <form className="hall-inline-form" onSubmit={async (event) => {
        event.preventDefault();
        const text = draft.trim();
        if (!text || busy) return;
        if (await onSend(text)) {
          setDraft((current) => current === draft ? "" : current);
          follow.current = true;
          if (history.current) history.current.scrollTop = history.current.scrollHeight;
        }
      }}>
        <Input aria-label="Tin nhắn" placeholder="Nhắn cho mọi người…" value={draft} maxLength={240}
          onChange={(event) => setDraft(event.currentTarget.value)} />
        <Button className="lobby-primary" size="icon" type="submit" aria-label="Gửi tin nhắn" disabled={busy || !draft.trim()}>
          <Send aria-hidden="true" />
        </Button>
      </form>
    </section>
  );
}

const panelTitle = {
  create: "Tạo bàn 1v1",
  tables: "Bàn thi đấu",
  cues: "Gậy billiard",
  history: "Lịch sử trận đấu",
  chat: "Chat chung",
};

export const Lobby = () => {
  const router = useRouter();
  const { view, options, setOptions, busy, error, open, seconds, onBack, manage, send, play, computer, resume } = useLobby();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [overhead, setOverhead] = useState(false);
  const [password, setPassword] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [listPage, setListPage] = useState(0);
  const player = view?.player;
  const match = view?.match;
  const hall = view?.hall;
  const tables = hall?.tables ?? [];
  const people = hall?.people ?? [];
  const ownTable = tables.find(({ hostId, playing }) => !playing && hostId === player?.id);
  const resumable = match && !match.result;
  const selected = tables.find((table) => table.id === selectedTable && !table.playing);
  const rows = panel === "tables" ? tables.length : panel === "cues" ? view?.cues.length ?? 0 : view?.history.length ?? 0;
  const maxPage = Math.max(0, Math.ceil(rows / 3) - 1);
  const currentPage = Math.min(listPage, maxPage);
  const first = currentPage * 3;

  useEffect(() => {
    if (view && !player?.gender) router.replace("/login");
  }, [view, player?.gender, router]);

  const showPanel = (next: Panel | null) => {
    setPanel(next);
    setSelectedTable(null);
    setPassword("");
    setListPage(0);
  };

  const join = async (table: HallTable, key?: string) => {
    if (await send({ type: "table-join", id: table.id, password: key }, true)) showPanel(null);
  };

  if (open && match) {
    return <BilliardGame key={match.id} match={match} loadout={player?.loadout} matchBusy={busy}
      matchError={error} turnSeconds={seconds} onBack={onBack} onMatchAction={manage} onShot={play} onComputer={computer} />;
  }

  return (
    <main className="black-nine billiard-lobby" onKeyDown={(event) => {
      if (event.key === "Escape" && panel) showPanel(null);
    }}>
      <LobbyScene people={people} tables={tables} selfId={player?.id} overhead={overhead} />
      <header className="hall-header">
        <div className="lobby-wordmark"><span className="lobby-mark" aria-hidden="true">9</span> BLACK<span className="lobby-gold"> / </span>NINE</div>
        <nav className="hall-glass hall-nav" aria-label="Điều hướng">
          <Link href="/billiard">Luyện tập <ArrowUpRight size={14} aria-hidden="true" /></Link>
          <button type="button" aria-pressed={panel === "cues"} onClick={() => showPanel(panel === "cues" ? null : "cues")}>Gậy</button>
          <button type="button" aria-pressed={panel === "history"} onClick={() => showPanel(panel === "history" ? null : "history")}>Lịch sử</button>
        </nav>
        {player && <div className="hall-glass hall-wallet">
          <Link href="/login" title="Cập nhật hồ sơ">{player.name}</Link>
          <span><Coins size={15} aria-hidden="true" />{player.coins} xu</span>
          <span><Trophy size={15} aria-hidden="true" />{player.points} điểm</span>
        </div>}
      </header>

      <div className="hall-title">
        <h1>Sảnh chờ</h1>
        <p aria-label={`${people.length} người trong sảnh`}><Users size={15} aria-hidden="true" /> {people.length} trong sảnh</p>
      </div>
      <button className="hall-glass hall-camera" type="button" aria-pressed={overhead} onClick={() => setOverhead(!overhead)}>
        <Layers size={16} aria-hidden="true" /> {overhead ? "Góc 3D" : "Nhìn từ trên"}
      </button>

      <div className="hall-dock">
        <RoomChat messages={hall?.messages ?? []} ownId={player?.id} busy={busy || !player} visible={panel === "chat"}
          onClose={() => showPanel(null)} onSend={async (text) => Boolean(await send({ type: "chat", text }))} />
        <div className={`hall-side${panel === "chat" ? " chat-selected" : ""}`}>
          {!view && !error && <p className="hall-glass hall-feedback" role="status">Đang kết nối sảnh…</p>}
          {error && <p className="hall-glass hall-feedback lobby-error" role="alert">{error}</p>}

          {panel && panel !== "chat" && <section className="hall-glass hall-popup" aria-labelledby="hall-popup-title">
            <div className="hall-panel-heading">
              <Target size={18} aria-hidden="true" />
              <h2 id="hall-popup-title">{panelTitle[panel]}</h2>
              <button className="hall-close" type="button" aria-label="Đóng bảng" onClick={() => showPanel(null)}><X size={19} /></button>
            </div>

            {panel === "create" && <form className="hall-create" onSubmit={async (event) => {
              event.preventDefault();
              if (await send({ type: "table-open", ...options, password: password || undefined })) showPanel(null);
            }}>
              <fieldset>
                <legend>Luật chơi</legend>
                <div className="hall-rules">
                  {gameRules.map((rule) => <label key={rule}>
                    <input type="radio" name="rule" checked={rule === options.rule} onChange={() => setOptions({ rule })} />{RULES[rule].label}
                  </label>)}
                </div>
              </fieldset>
              <label htmlFor="create-password">Mật khẩu bàn <span>Không bắt buộc</span></label>
              <Input id="create-password" type="password" maxLength={64} value={password} autoComplete="new-password"
                placeholder="Để trống nếu mở cho mọi người" onChange={(event) => setPassword(event.currentTarget.value)} />
              <Button className="lobby-primary w-full" disabled={busy || !player} type="submit"><Plus /> Tạo bàn</Button>
            </form>}

            {panel === "tables" && <>
              {tables.length === 0 && <p className="hall-empty">Chưa có bàn. Tạo bàn để mời đối thủ.</p>}
              <ul className="hall-list">
                {tables.slice(first, first + 3).map((table) => (
                  <li key={table.id}>
                    <span className="hall-table-number">{tableNumber(table.slot)}</span>
                    <div className="hall-row-copy">
                      <strong>{table.host}</strong>
                      <span>{RULES[table.rule].label} · {table.playing ? "Đang đấu" : "1/2 người"}</span>
                    </div>
                    {table.locked && <LockKeyhole size={15} aria-label="Có mật khẩu" />}
                    {table.id === ownTable?.id ? <span className="lobby-gold">Bàn của bạn</span> :
                      <Button className="lobby-secondary" variant="outline" size="sm" disabled={busy || Boolean(resumable) || table.playing}
                        onClick={() => {
                          if (!table.locked) void join(table);
                          else {
                            setSelectedTable(table.id);
                            setPassword("");
                          }
                        }}>Vào bàn</Button>}
                  </li>
                ))}
              </ul>
              {selectedTable && (selected ? <form className="hall-inline-form hall-table-key" onSubmit={(event) => {
                event.preventDefault();
                if (password) void join(selected, password);
              }}>
                <Input autoFocus aria-label={`Mật khẩu bàn ${tableNumber(selected.slot)}`} type="password" value={password} maxLength={64}
                  autoComplete="off" placeholder={`Mật khẩu bàn ${tableNumber(selected.slot)}`}
                  onChange={(event) => setPassword(event.currentTarget.value)} required />
                <Button className="lobby-primary" disabled={busy || !password} type="submit">Vào</Button>
              </form> : <p className="hall-empty">Bàn đã đóng hoặc đã đủ người.</p>)}
            </>}

            {player && panel === "cues" && <ul className="hall-list">
              {view.cues.slice(first, first + 3).map((cue) => (
                <li key={cue.id}>
                  <span className="hall-row-copy">{cue.name}</span>
                  {player.loadout[cue.type] === cue.id ? <span className="lobby-gold">Đang dùng</span> :
                    <Button className="lobby-secondary" size="sm" variant="outline" disabled={busy || (!cue.owned && player.coins < cue.price)}
                      onClick={() => send({ type: "cue", id: cue.id, action: cue.owned ? "equip" : "buy" })}>
                      {cue.owned ? "Trang bị" : `${cue.price} xu`}
                    </Button>}
                </li>
              ))}
            </ul>}
            {panel === "history" && <>
              {!rows && <p className="hall-empty">Chưa có trận hoàn tất.</p>}
              <ul className="hall-list">
                {view?.history.slice(first, first + 3).map((item) => (
                  <li key={item.id}><span className="hall-row-copy">{item.opponent} · {RULES[item.rule].label}</span>
                    <span className={item.won ? "lobby-gold" : "hall-muted"}>{item.won ? "Thắng" : "Thua"}</span>
                  </li>
                ))}
              </ul>
            </>}

            {maxPage > 0 && <div className="hall-pages">
              <button type="button" disabled={!currentPage} onClick={() => setListPage(currentPage - 1)} aria-label="Trang trước"><ChevronLeft size={17} /></button>
              <span>{currentPage + 1} / {maxPage + 1}</span>
              <button type="button" disabled={currentPage === maxPage} onClick={() => setListPage(currentPage + 1)} aria-label="Trang sau"><ChevronRight size={17} /></button>
            </div>}
          </section>}

          <div className="hall-glass hall-controls">
            {resumable ? <Button className="lobby-primary hall-status" onClick={resume}><Crosshair /> Tiếp tục trận</Button> :
              ownTable ? <div className="hall-status hall-own">
                <p><span></span>Bàn {tableNumber(ownTable.slot)} đang chờ</p>
                <Button className="lobby-secondary" variant="outline" size="sm" disabled={busy} onClick={() => send({ type: "table-close" })}>Đóng bàn</Button>
              </div> : null}
            <Button className="lobby-primary" aria-pressed={panel === "create"} disabled={busy || !player || Boolean(ownTable || resumable)}
              onClick={() => showPanel(panel === "create" ? null : "create")}><Plus /> Tạo bàn 1v1</Button>
            <Button className="lobby-secondary" variant="outline" aria-pressed={panel === "tables"}
              onClick={() => showPanel(panel === "tables" ? null : "tables")}><Layers /> Xem bàn</Button>
            <Button className="lobby-secondary hall-chat-toggle" variant="outline" aria-pressed={panel === "chat"}
              onClick={() => showPanel(panel === "chat" ? null : "chat")}><MessageCircle /><span>Chat</span></Button>
          </div>
        </div>
      </div>
    </main>
  );
};
