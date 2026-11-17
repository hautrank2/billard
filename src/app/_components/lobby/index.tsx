"use client";

import { Bot, Coins, Crosshair, Target, Trophy, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

import { BilliardGame } from "../../billiard/_components/billiard-game";
import { TABLE_PRESETS } from "../../billiard/_components/billiard-game/config";
import { RULES } from "../../billiard/_components/billiard-game/rules";
import type { GameRule, TableId } from "../../billiard/_components/billiard-game/type";
import { useLobby } from "./hook";

const gameRules: GameRule[] = ["eight", "nine", "ten"];
const tableIds: TableId[] = ["mr-sung", "predator"];

export const Lobby = () => {
  const { view, name, setName, options, setOptions, busy, error, open, seconds, onBack,
    manage, send, play, computer, resume } = useLobby();
  const player = view?.player;
  const match = view?.match;
  const resumable = match && !match.result;
  const queue = view?.queued;

  if (open && match) {
    return <BilliardGame key={match.id} match={match} loadout={player?.loadout} matchBusy={busy}
      matchError={error} turnSeconds={seconds} onBack={onBack} onMatchAction={manage} onShot={play} onComputer={computer} />;
  }

  return (
    <main className="billiard-lobby mx-auto max-w-5xl space-y-8 px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-black tracking-[0.13em] sm:text-4xl">BLACK <span className="font-light text-primary">/</span> NINE</h1>
        {player && <div className="flex gap-5 text-sm">
          <span className="flex items-center gap-2"><Coins className="size-4 text-primary" aria-hidden="true" />{player.coins} xu</span>
          <span className="flex items-center gap-2"><Trophy className="size-4 text-primary" aria-hidden="true" />{player.points} điểm</span>
        </div>}
      </header>
      {!view && !error && <p role="status" className="text-sm text-muted-foreground">Đang tải sảnh…</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive/50 p-3 text-sm text-destructive">{error}</p>}
      <div className="grid items-start gap-5 md:grid-cols-[1.25fr_1fr]">
        <section className="billiard-lobby-play space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="play-heading">
          <h2 id="play-heading" className="text-xl font-semibold">Chơi billiard</h2>
          <div className="space-y-2" role="group" aria-label="Luật chơi">
            <p className="text-sm font-medium">Luật chơi</p>
            <div className="grid grid-cols-3 gap-2">
              {gameRules.map((rule) => <Button key={rule} variant={rule === options.rule ? "secondary" : "outline"} aria-pressed={rule === options.rule}
                disabled={Boolean(queue || resumable)} onClick={() => setOptions({ ...options, rule })}>{RULES[rule].label}</Button>)}
            </div>
          </div>
          <div className="space-y-2" role="group" aria-label="Loại bàn">
            <p className="text-sm font-medium">Loại bàn</p>
            <div className="grid grid-cols-2 gap-2">
              {tableIds.map((table) => <Button key={table} variant={options.table === table ? "secondary" : "outline"}
                aria-pressed={options.table === table} disabled={Boolean(queue || resumable)}
                onClick={() => setOptions({ ...options, table })}>{TABLE_PRESETS[table].name}</Button>)}
            </div>
          </div>
          {resumable ? (
            <Button className="w-full" onClick={resume}><Target />Tiếp tục trận với {match.opponent}</Button>
          ) : queue ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 p-3">
              <p role="status" className="text-sm text-primary">Đang tìm đối thủ · {RULES[queue.rule].label} · {TABLE_PRESETS[queue.table].name}</p>
              <Button variant="outline" disabled={busy} onClick={() => send({ type: "leave" })}>Hủy tìm</Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button disabled={!player || busy} onClick={() => send({ type: "queue", ...options }, true)}><Users />Tìm đối thủ</Button>
              <Button variant="outline" disabled={!player || busy} onClick={() => send({ type: "practice", ...options }, true)}><Bot />Chơi với máy</Button>
            </div>
          )}
          <Button variant="ghost" asChild className="w-full"><Link href="/billiard"><Crosshair />Chơi tự do và bài tập</Link></Button>
          <p className="text-xs text-muted-foreground">Thắng ván online hợp lệ được 30 xu và 10 điểm.</p>
        </section>
        <div className="space-y-5">
          <section className="billiard-profile rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="profile-heading">
            <h2 id="profile-heading" className="text-lg font-semibold">Hồ sơ</h2>
            <form className="mt-3 space-y-2" onSubmit={(event) => {
              event.preventDefault();
              void send({ type: "profile", name });
            }}>
              <label className="text-sm font-medium" htmlFor="player-name">Tên hiển thị</label>
              <div className="flex gap-2">
                <Input id="player-name" value={name} onChange={(event) => setName(event.currentTarget.value)} minLength={2} maxLength={24} required />
                <Button variant="outline" type="submit" disabled={!view || busy || name.trim().length < 2 || name.trim() === player?.name}>
                  {player ? "Lưu" : "Tạo hồ sơ"}
                </Button>
              </div>
              {!player && <p className="text-xs text-muted-foreground">Tạo hồ sơ để ghép trận, nhận xu và chọn gậy. Hồ sơ được lưu trên trình duyệt này.</p>}
            </form>
          </section>
          {player && <section className="billiard-shop rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="cues-heading">
            <h2 id="cues-heading" className="text-lg font-semibold">Gậy billiard</h2>
            <ul className="mt-2 divide-y divide-border">
              {view.cues.map((cue) => {
                const equipped = player.loadout[cue.type] === cue.id;
                return <li key={cue.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm">{cue.name}</span>
                  {equipped ? <span className="text-xs text-muted-foreground">Đang dùng</span> :
                    <Button size="sm" variant="outline" disabled={busy || (!cue.owned && player.coins < cue.price)}
                      onClick={() => send({ type: "cue", id: cue.id, action: cue.owned ? "equip" : "buy" })}>
                      {cue.owned ? "Trang bị" : `${cue.price} xu`}
                    </Button>}
                </li>;
              })}
            </ul>
          </section>}
        </div>
      </div>
      {player && <section className="billiard-history rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-lg font-semibold">Lịch sử trận đấu</h2>
        {view.history.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Chưa có trận hoàn tất.</p> :
          <ul className="mt-2 divide-y divide-border">
            {view.history.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="break-words">{item.opponent} · {RULES[item.rule].label}</span>
              <span className={item.won ? "shrink-0 text-primary" : "shrink-0 text-muted-foreground"}>{item.won ? "Thắng" : "Thua"}</span>
            </li>)}
          </ul>}
      </section>}
    </main>
  );
};
