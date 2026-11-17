"use client";

import {
  ArrowLeft, Check, CircleCheck, CircleX, Crosshair, Eye, HelpCircle, Layers3, Maximize,
  Minimize, Plus, RotateCcw, ScanLine, SlidersHorizontal, SwitchCamera, Trophy,
  Volume2, VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger,
} from "~/components/ui/dialog";
import "~/styles/billiard.css";

import { TABLE_PRESETS } from "./config";
import {
  CUE_PLACEMENT_KEY,
  DRILL_NEXT_KEY,
  DRILL_RETRY_KEY,
  ELEVATION_DOWN_KEY,
  ELEVATION_UP_KEY,
  JUMP_TOGGLE_KEY,
  PUSH_OUT_KEY,
} from "./constants";
import { ControlsIllustration } from "./controls-illustration";
import { CueControls } from "./cue-controls";
import { DRILLS } from "./drills";
import { GameSetup } from "./game-setup";
import { useBilliardGame } from "./hook";
import { RackPanel } from "./rack-panel";
import { RULES } from "./rules";
import { SpinControl } from "./spin-control";
import { TuningPanel } from "./tuning-panel";
import type { BilliardGameProps } from "./type";

const VIEWS = [
  { id: "aim", key: "1", name: "Ngắm", hint: "Kéo ngang để ngắm", icon: Crosshair },
  { id: "overhead", key: "2", name: "Từ trên", hint: "Kéo thả xoay từ trên", icon: Layers3 },
  { id: "spectator", key: "3", name: "Quan sát", hint: "Giữ chuột trái để quay", icon: Eye },
] as const;

export const BilliardGame = (props: BilliardGameProps) => {
  const { match, onBack, onMatchAction, onComputer, matchBusy, matchError, turnSeconds } = props;
  const [confirmResign, setConfirmResign] = useState(false);
  const {
    containerRef, game, controls, error, ready, preparingShot, help, screen, isFullscreen,
    setHelp, openSetup, cancelSetup, toggleFullscreen, setView,
    spinLabel, spinPointer, spinKey, onPointerDown,
    onPointerMove, onPointerUp, cancelDrag, confirmPosition,
    cancelPlacement, beginPlacement, toggleGuide, shotInput,
    draftOptions, setDraftOptions, applyOptions, muted, toggleSound, resetCamera, resetBalls,
    tuning, toggleTuning, closeTuning, autoOverhead, toggleAutoOverhead,
    cueMode, elevation, activeCue, toggleJump, setElevation, togglePushOut,
    retryDrill, nextDrill, myTurn, shotPower, setShotPower, fire,
  } = useBilliardGame(props);
  const locked = preparingShot || game.moving || !ready || Boolean(error) || shotInput.armed;
  const controlsLocked = locked || !myTurn || Boolean(matchBusy);
  const preset = TABLE_PRESETS[game.options.tableId];
  const view = VIEWS.find((item) => item.id === controls.view) ?? VIEWS[0];
  const drill = game.drill;
  const modeLabel = game.options.mode === "drill"
    ? `LUYỆN TẬP · ${DRILLS[game.options.drill].name.toUpperCase()}`
    : `${RULES[game.options.mode].label} · ${match?.kind === "online" ? "ONLINE" : "TẬP LUYỆN"}`;
  const matchResult = match?.result && !game.moving ? match.result : null;
  const resultTitle = matchResult?.winner === match?.seat ? "Thắng ván" : "Thua ván";
  const strokeNote = [
    activeCue.type === "jump" && `Nhảy ${Math.round(elevation)}°`,
    activeCue.type === "break" && "Gậy phá",
    game.pushOut === "declared" && "Đánh an toàn",
  ].filter(Boolean).join(" · ");

  return (
    <Dialog open={help} onOpenChange={setHelp}>
      <div
        lang="vi"
        data-table={game.options.tableId}
        data-screen={screen}
        data-fullscreen={isFullscreen && screen === "play"}
        style={{
          ...Object.fromEntries(preset.balls.map((color, index) => [`--billiard-ball-${index}`, color])),
          "--billiard-ivory": preset.balls[0],
          "--billiard-stripe-cap": preset.stripeCap,
        } as CSSProperties}
        className="billiard-game flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground selection:bg-primary/30"
      >
        {(!isFullscreen || screen === "setup") && (
          <header className="billiard-header flex h-11 shrink-0 items-center justify-between border-b border-border px-3 sm:px-4">
            <div className="flex items-center gap-3">
              {onBack
                ? <Button variant="ghost" size="icon" onClick={onBack} className="size-7" aria-label="Về sảnh"><ArrowLeft /></Button>
                : <Link href="/" aria-label="Về sảnh" className="rounded-full border border-border p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"><ArrowLeft className="size-3.5" /></Link>}
              <h1 className="text-xs font-black tracking-[0.16em] sm:text-sm">BLACK <span className="font-light text-primary">/</span> NINE<span className="text-primary">.</span></h1>
            </div>
            <p className="billiard-mode-label text-[9px] tracking-wider text-muted-foreground">{modeLabel}</p>
          </header>
        )}

        {screen === "setup" ? (
          <main className="billiard-setup-body min-h-0 flex-1 overflow-y-auto">
            <GameSetup options={draftOptions} disabled={false} onChange={setDraftOptions} onApply={applyOptions} onCancel={cancelSetup} />
          </main>
        ) : (
          <main className="billiard-main flex min-h-0 flex-1 overflow-hidden">
            <section className="billiard-table-panel relative min-w-0 flex-1 overflow-hidden" aria-label="Bàn chơi">
              <div
                ref={containerRef}
                tabIndex={0}
                aria-label={`Vùng điều khiển bàn. 1 Ngắm, 2 Từ trên, 3 Quan sát. Ở góc Ngắm, A và D xoay hướng bắn, W và S chỉnh góc nhìn lên và xuống. Giữ Shift và rê chuột để chỉnh điểm chạm. ${JUMP_TOGGLE_KEY} đổi gậy nhảy, ${ELEVATION_DOWN_KEY} hạ và ${ELEVATION_UP_KEY} nâng góc cơ. ${PUSH_OUT_KEY} đánh an toàn sau cú phá 9 hoặc 10 bi. ${CUE_PLACEMENT_KEY} đặt lại bi cái trước cú phá hoặc sau lỗi. Khi luyện tập, ${DRILL_RETRY_KEY} thử lại, ${DRILL_NEXT_KEY} sang vị trí khác. Giữ Space kéo thả để đánh. Khi đặt bi, click hoặc kéo bi cái rồi nhấn Space để chốt.`}
                className={`billiard-viewport absolute inset-0 touch-none active:cursor-grabbing focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${game.ballInHand ? "cursor-crosshair" : "cursor-grab"}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={cancelDrag}
              />
              <div className={`billiard-table-hud pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg px-2 py-1.5 backdrop-blur-sm ${game.ballInHand ? "bg-background/90" : "bg-background/65"}`}>
                <p className="text-[9px] tracking-wider text-muted-foreground uppercase">{preset.name}</p>
                <p className="mt-0.5 text-[11px] font-medium">{game.ballInHand && myTurn ? "Đặt bi cái" : `${view.key} · ${view.name}`}</p>
                {game.ballInHand && myTurn && (
                  <section className="billiard-placement-controls mt-1.5" aria-label="Đặt bi cái">
                    <p className="max-w-52 text-[10px] leading-snug text-muted-foreground" role="status">{game.message}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" className="pointer-events-auto h-8 gap-1 px-2 text-[11px]" onClick={confirmPosition} disabled={controlsLocked} aria-label="Chốt vị trí bi cái" aria-keyshortcuts="Space">
                        <Check className="size-3" aria-hidden="true" />
                        Chốt <kbd className="rounded border border-current/30 px-1 font-mono text-[9px]">Space</kbd>
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="pointer-events-auto h-8 gap-1 px-2 text-[11px]" onClick={cancelPlacement} disabled={controlsLocked} aria-label="Thoát đặt bi" aria-keyshortcuts="Escape" onKeyDown={(event) => {
                        if (event.code === "Space") event.stopPropagation();
                      }}>
                        Thoát <kbd className="rounded border border-current/30 px-1 font-mono text-[9px]">Esc</kbd>
                      </Button>
                    </div>
                  </section>
                )}
                {strokeNote && !game.ballInHand && (
                  <p className="billiard-stroke-note text-[10px] text-primary">{strokeNote}</p>
                )}
              </div>
              {tuning && <TuningPanel onClose={closeTuning} />}
              {shotInput.armed && (
                <div className="billiard-pull-meter pointer-events-none absolute bottom-4 left-1/2 z-20 w-[min(240px,80%)] -translate-x-1/2 rounded-lg border border-primary/40 bg-background/95 p-2.5 shadow-lg">
                  <div className="mb-1.5 flex justify-between gap-2 text-[10px]">
                    <span className="text-primary">{shotInput.pull ? "Thả chuột để đánh" : "Giữ Space · kéo xuống"}</span>
                    <span className="font-mono">{shotInput.power}%</span>
                  </div>
                  <div role="meter" aria-label="Lực kéo chuột" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shotInput.power} className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${shotInput.power}%` }} />
                  </div>
                  <p className="mt-1.5 text-[9px] text-muted-foreground">Đẩy lên về 0 · Nhả Space để hủy</p>
                </div>
              )}
              {(!ready || error) && (
                <div className="billiard-loading absolute inset-0 z-30 flex items-center justify-center bg-background/90 p-8 text-center text-xs text-muted-foreground" role="status">{error || "Đang chuẩn bị bàn chơi…"}</div>
              )}
              {matchResult && (
                <div className="billiard-result absolute inset-0 z-30 grid place-items-center bg-background/75 p-5 text-center backdrop-blur-sm">
                  <div>
                    <h2 className="text-2xl font-semibold">{resultTitle}</h2>
                    <p className="my-3 text-xs text-muted-foreground">
                      {matchResult.reason === "rack" ? game.message
                        : matchResult.reason === "timeout" ? "Hết thời gian đánh." : "Trận đấu kết thúc do bỏ cuộc."}
                    </p>
                    <Button onClick={onBack}>Về sảnh</Button>
                  </div>
                </div>
              )}
              {!match && game.won && (
                <div className="billiard-win absolute inset-0 z-20 flex items-center justify-center bg-background/65 p-5 backdrop-blur-sm">
                  <div className="max-w-xs text-center">
                    <Trophy className="mx-auto mb-3 size-10 text-primary" />
                    <h2 className="text-2xl font-semibold">Đẹp cơ!</h2>
                    <p className="my-3 text-xs text-muted-foreground">{game.shots} cú đánh · {game.fouls} lỗi</p>
                    <Button onClick={openSetup} size="sm"><Plus />Mở bàn mới</Button>
                  </div>
                </div>
              )}
              {!match && game.lost && (
                <div className="billiard-lost absolute inset-0 z-20 flex items-center justify-center bg-background/65 p-5 backdrop-blur-sm">
                  <div className="max-w-xs text-center">
                    <CircleX className="mx-auto mb-3 size-10 text-muted-foreground" />
                    <h2 className="text-2xl font-semibold">Thua ván</h2>
                    <p className="my-3 text-xs text-muted-foreground">{game.message}</p>
                    <div className="flex justify-center gap-2">
                      <Button onClick={resetBalls} size="sm" variant="outline"><RotateCcw />Xếp lại</Button>
                      <Button onClick={openSetup} size="sm"><Plus />Mở bàn mới</Button>
                    </div>
                  </div>
                </div>
              )}
              {drill?.result && (
                <div
                  className="billiard-drill-banner pointer-events-none absolute right-3 top-3 z-10 flex w-[min(300px,calc(100%-9.5rem))] items-start gap-2 rounded-lg border border-border bg-background/90 px-3 py-2 shadow-lg backdrop-blur-sm"
                  role="status"
                >
                  {drill.result.success
                    ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    : <CircleX className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <p className="text-[11px] leading-snug">
                    <strong>{drill.result.success ? "Đạt" : "Chưa đạt"}:</strong> {drill.result.note}
                    <span className="block text-[10px] text-muted-foreground">
                      {DRILL_RETRY_KEY} thử lại · {DRILL_NEXT_KEY} vị trí khác
                    </span>
                  </p>
                </div>
              )}
              <div className="billiard-corner-controls absolute bottom-2 right-2 z-10 flex items-end gap-1.5 sm:bottom-3 sm:right-3">
                <Button variant="outline" size="sm" className="h-7 gap-1 bg-background/85 px-2 text-[10px]" onClick={resetCamera} disabled={preparingShot} aria-label="Đặt lại góc nhìn" title="Đặt lại góc"><RotateCcw className="size-3" /><span className="hidden sm:inline">Đặt lại góc</span></Button>
                {!game.ballInHand && <SpinControl cue={activeCue} spin={controls.spin} label={spinLabel} disabled={controlsLocked} onPointer={spinPointer} onKey={spinKey} />}
              </div>
              {!game.ballInHand && <p className="billiard-table-hint pointer-events-none absolute bottom-3 left-3 hidden text-[9px] text-muted-foreground sm:block">Space + kéo xuống để đánh · Cuộn để thu/phóng</p>}
            </section>

            <aside className="billiard-sidebar flex w-[88px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-card p-2 sm:w-48 sm:gap-4 sm:p-3 lg:w-52" aria-label="Điều khiển bàn chơi">
              <div className="billiard-sidebar-actions flex flex-col gap-1.5">
                {match ? (
                  <section aria-label="Trạng thái trận đấu" className="space-y-1.5 text-[10px] sm:text-xs">
                    <p className="break-words text-muted-foreground">Đối thủ: {match.opponent}</p>
                    <p role="status" className="font-semibold text-primary">{matchResult ? resultTitle : game.moving ? "Bi đang lăn" : myTurn ? "Lượt của bạn" : "Lượt đối thủ"}</p>
                    {turnSeconds != null && <p className="font-mono text-muted-foreground">{turnSeconds}s</p>}
                    {turnSeconds === 0 && !match.result && <Button size="sm" variant="outline" className="h-auto w-full whitespace-normal px-1 text-[10px]" disabled={matchBusy} onClick={() => onMatchAction?.("timeout")}>Xử lý hết giờ</Button>}
                    {match.canPass && myTurn && <Button size="sm" variant="outline" className="h-7 w-full px-1 text-[10px]" disabled={controlsLocked} onClick={() => onMatchAction?.("pass")}>Trả lượt</Button>}
                    {matchError && <p role="alert" className="break-words text-destructive">{matchError}</p>}
                    {matchError && match.kind === "ai" && !myTurn && !match.result && <Button size="sm" className="h-7 w-full px-1 text-[10px]" onClick={onComputer}>Thử tiếp</Button>}
                    {!match.result && (confirmResign ? (
                      <div className="grid gap-1 rounded-md border border-border p-1.5" role="group" aria-label="Xác nhận bỏ cuộc">
                        <Button size="sm" variant="destructive" className="h-auto whitespace-normal px-1 text-[10px]" disabled={matchBusy || game.moving} onClick={() => {
                          setConfirmResign(false);
                          void onMatchAction?.("resign");
                        }}>Xác nhận bỏ cuộc</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-1 text-[10px]" onClick={() => setConfirmResign(false)}>Hủy</Button>
                      </div>
                    ) : <Button size="sm" variant="ghost" className="h-7 w-full px-1 text-[10px]" disabled={matchBusy || game.moving} onClick={() => setConfirmResign(true)}>Bỏ cuộc</Button>)}
                    {onBack && <Button size="sm" variant="ghost" className="h-7 w-full px-1 text-[10px]" onClick={onBack}>Về sảnh</Button>}
                  </section>
                ) : <>
                  <Button size="sm" className="h-8 gap-1 px-1 text-[10px] sm:text-xs" onClick={openSetup} disabled={preparingShot || game.moving || shotInput.armed}><Plus className="hidden size-3.5 sm:block" />Mở bàn mới</Button>
                  <Button size="sm" className="h-7 gap-1 px-1 text-[10px] sm:text-xs" onClick={resetBalls} disabled={locked} title={drill ? "Bày lại vị trí bài luyện" : "Xếp lại toàn bộ bi, giữ loại bàn và cách xếp"}><RotateCcw className="hidden size-3 sm:block" />Đặt lại bi</Button>
                </>}
                <div className="grid gap-1 rounded-md border border-border p-1.5">
                  <label className="text-[10px] font-medium" htmlFor="shot-power">Lực {shotPower}%</label>
                  <input id="shot-power" className="w-full min-w-0 accent-primary" type="range" min="1" max="100" value={shotPower} disabled={controlsLocked || game.over || game.ballInHand} onChange={(event) => setShotPower(Number(event.currentTarget.value))} />
                  <Button size="sm" className="h-7 px-1 text-[10px]" onClick={fire} disabled={controlsLocked || game.over || game.ballInHand}>Đánh</Button>
                </div>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_28px]">
                  <DialogTrigger asChild><Button variant="outline" size="sm" className="h-7 flex-1 gap-1 px-1 text-[9px] sm:text-[11px]" title="Hướng dẫn"><HelpCircle className="size-3" /><span>Hướng dẫn</span></Button></DialogTrigger>
                  <Button variant="outline" size="icon" className="h-7 w-full shrink-0 gap-1 sm:size-7" onClick={toggleFullscreen} aria-label={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"} title={isFullscreen ? "Hiện header" : "Toàn màn hình · ẩn header"}>{isFullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}<span className="text-[9px] sm:hidden">Màn hình</span></Button>
                </div>
                {!match && <Button
                  variant={tuning ? "secondary" : "outline"}
                  size="sm"
                  className="billiard-tuning-toggle h-7 gap-1 px-1 text-[9px] sm:text-[11px]"
                  onClick={toggleTuning}
                  aria-pressed={tuning}
                  title="Chỉnh lực, ma sát, độ nảy và chép chỉ số"
                >
                  <SlidersHorizontal className="size-3" />
                  Chỉnh vật lý
                </Button>}
              </div>
              <section className="billiard-view-controls flex flex-col gap-1" aria-label="Đổi góc nhìn">
                {VIEWS.map(({ id, key, name, hint, icon: Icon }) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={controls.view === id ? "secondary" : "ghost"}
                    className="h-auto min-h-9 w-full justify-start gap-1 px-1.5 py-2 text-[10px] sm:gap-2 sm:text-xs"
                    onClick={() => setView(id)}
                    disabled={preparingShot}
                    aria-pressed={controls.view === id}
                    aria-keyshortcuts={key}
                    title={`${key} · ${name}: ${hint}`}
                  >
                    <span className="rounded border border-border px-1 font-mono text-[9px] text-primary">{key}</span>
                    <span className="min-w-0 text-left"><span className="flex items-center gap-1"><Icon className="hidden size-3 sm:block" />{name}</span><span className="mt-0.5 hidden whitespace-normal text-[9px] font-normal text-muted-foreground sm:block">{hint}</span></span>
                  </Button>
                ))}
                {!match && <Button
                  variant={autoOverhead ? "secondary" : "outline"}
                  size="sm"
                  className="billiard-auto-overhead-toggle mt-1 h-auto min-h-7 w-full justify-start gap-1 whitespace-normal px-1.5 py-1 text-left text-[9px] sm:text-[11px]"
                  onClick={toggleAutoOverhead}
                  aria-pressed={autoOverhead}
                  title="Khi đánh ở góc 1, tự chuyển sang góc 2 nếu dự đoán bi sẽ ra khỏi khung nhìn"
                >
                  <SwitchCamera className="hidden size-3 shrink-0 sm:block" />
                  <span>Tự sang góc 2: {autoOverhead ? "Bật" : "Tắt"}</span>
                </Button>}
                <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                  {controls.view === "aim"
                    ? <>A / D xoay hướng bắn<br />W / S nhìn lên / xuống<br />Shift + rê chuột chỉnh điểm chạm<br />←↑↓→ di chuyển camera</>
                    : <>WASD / ←↑↓→: camera</>}
                  <br />Cuộn: thu/phóng
                </p>
              </section>
              <CueControls
                cue={activeCue}
                cueMode={cueMode}
                elevation={elevation}
                breaking={game.breaking}
                disabled={controlsLocked || game.over || game.ballInHand}
                pushOut={game.pushOut}
                onToggleJump={toggleJump}
                onElevation={setElevation}
                onTogglePushOut={togglePushOut}
              />
              <RackPanel
                game={game}
                disabled={preparingShot || game.moving || shotInput.armed}
                onRetry={retryDrill}
                onNext={nextDrill}
              />
              {!drill && !game.ballInHand && <section className="billiard-placement-controls flex flex-col gap-1.5 border-t border-border pt-3" aria-label="Đặt bi cái">
                <Button variant={game.cueInHand ? "default" : "outline"} size="sm" className="h-auto min-h-8 gap-1 whitespace-normal px-1 py-1.5 text-[10px]" onClick={beginPlacement} disabled={controlsLocked || !game.cueInHand} aria-keyshortcuts={CUE_PLACEMENT_KEY} title={game.cueInHand ? `${CUE_PLACEMENT_KEY} · Đặt lại bi cái` : "Chỉ được đặt lại bi cái sau một cú đánh lỗi"}><kbd className="rounded border border-current/30 px-1 font-mono text-[9px]">{CUE_PLACEMENT_KEY}</kbd><span>Đặt lại bi cái</span></Button>
              </section>}
              <div className="billiard-extra-controls flex justify-center gap-1 sm:justify-start">
                <Button variant="outline" size="icon" className="size-7" onClick={toggleSound} aria-label={muted ? "Bật âm thanh" : "Tắt âm thanh"} aria-pressed={!muted} title="Âm thanh">{muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}</Button>
                <Button variant="outline" size="icon" className="size-7" onClick={toggleGuide} aria-label={controls.guide ? "Tắt đường ngắm" : "Bật đường ngắm"} aria-pressed={controls.guide} title="Đường ngắm"><ScanLine className="size-3.5" /></Button>
              </div>
              {!game.ballInHand && <p className="billiard-status mt-auto text-[9px] leading-relaxed text-muted-foreground sm:text-[10px]" role="status">{game.message}</p>}
            </aside>
          </main>
        )}
      </div>
      <DialogContent className="billiard-game max-h-[85dvh] overflow-y-auto bg-card p-5 sm:max-w-xl 2xl:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Hướng dẫn chơi</DialogTitle>
          <DialogDescription>Ba góc nhìn; luật 8, 9, 10 bi và bài luyện tập. Bấm 1, 2 hoặc 3 để đổi góc nhìn.</DialogDescription>
        </DialogHeader>
        <div className="billiard-help space-y-4 text-sm leading-relaxed text-muted-foreground">
          <ControlsIllustration />
          <div className="grid gap-2">
            <p><strong className="text-foreground">1 · Ngắm.</strong> Nhấn A hoặc D để xoay hướng bắn sang trái hoặc phải. Có thể kéo ngang để ngắm, hoặc giữ Shift cùng A hoặc D để chỉnh hướng từng bước nhỏ. Nhấn W để nhìn lên và S để nhìn xuống. Giữ Shift và rê chuột để dời điểm chạm trên bi cái.</p>
            <p><strong className="text-foreground">2 · Từ trên:</strong> kéo thả để xoay góc nhìn từ trên quanh bàn.</p>
            <p><strong className="text-foreground">3 · Quan sát:</strong> giữ chuột trái và kéo để quay quanh bàn.</p>
          </div>
          <p><strong className="text-foreground">Đánh bi:</strong> giữ Space, nhấn chuột trên bàn và kéo xuống để lên lực. Đẩy lên để giảm về 0. Thả chuột khi vẫn giữ Space để đánh; 0% sẽ không đánh. Nhả Space trước hoặc nhấn Esc để hủy.</p>
          <p><strong className="text-foreground">Đặt bi.</strong> Ván mới bắt đầu ở góc nhìn từ trên để đặt bi cái trong bếp. Sau một cú lỗi, bàn cũng tự chuyển sang đặt bi. Click vị trí trống hoặc kéo bi cái, rồi nhấn Space hoặc Chốt. Thoát đặt bi khôi phục vị trí cũ. Nhấn {CUE_PLACEMENT_KEY} hoặc Đặt lại bi cái để đặt lại trước cú đánh kế tiếp. Nút Đặt lại bi xếp lại cả bộ và mở ván mới.</p>
          <p><strong className="text-foreground">Camera:</strong> cuộn chuột để phóng to/thu nhỏ ở cả ba chế độ; phím mũi tên để di chuyển (ở góc 2 và 3 dùng được cả WASD). Bật nút Tự sang góc 2 ở cột bên phải (mặc định tắt) thì khi đánh ở góc 1, đường bi được dự đoán trước; nếu bi cái hoặc bi mục tiêu sắp ra khỏi khung nhìn, camera chuyển xong sang góc 2 rồi bi mới được đánh. Lựa chọn được nhớ cho lần sau. Đặt lại góc khôi phục camera. Toàn màn hình ẩn header; Esc hiện lại.</p>
          <p><strong className="text-foreground">Gậy.</strong> Cú phá dùng gậy phá. Các cú sau dùng gậy lướt. Nhấn {JUMP_TOGGLE_KEY} để đổi sang gậy nhảy, {ELEVATION_DOWN_KEY} để hạ và {ELEVATION_UP_KEY} để nâng góc cơ. Giữ Shift để chỉnh từng 0,25°. Khi nâng cơ, camera dốc hơn và đường ngắm ngắn lại. Bi có thể bay qua băng và văng khỏi bàn. Sau cú nhảy, gậy tự về gậy lướt.</p>
          <p><strong className="text-foreground">Luật:</strong> 9 bi và 10 bi chạm bi nhỏ nhất trước; vào bi chốt hợp lệ để thắng. Không có gọi lỗ, nên bi 10 chỉ thắng khi nó đã là bi nhỏ nhất; vào bi 10 lúc phá hoặc sớm hơn thì bi được đặt lại ở điểm đích. 8 bi: bàn mở sau cú phá; bi vào hợp lệ đầu tiên chọn nhóm trơn (1–7) hoặc sọc (9–15); hết nhóm mới được đánh bi 8. Vào bi 8 sớm hoặc phạm lỗi khi vào bi 8 là thua ván.</p>
          <p><strong className="text-foreground">Đánh an toàn ({PUSH_OUT_KEY}).</strong> Ở 9 bi và 10 bi, cú đầu tiên sau cú phá được đánh an toàn (push-out). Có thể bỏ qua bi nhỏ nhất và băng. Bi cái rơi lỗ hoặc bi văng khỏi bàn vẫn là lỗi. Bi chốt vào sẽ được đặt lại.</p>
          <p><strong className="text-foreground">Luyện tập:</strong> ăn băng, đá băng, nhảy bi, cắt mỏng và về vị trí. Mỗi bài có ba vị trí; mỗi lần thử là một cú đánh. {DRILL_RETRY_KEY} bày lại vị trí, {DRILL_NEXT_KEY} sang vị trí khác; điểm Đạt / số lần thử được giữ trong lúc luyện.</p>
          <p><strong className="text-foreground">Điểm chạm:</strong> chọn trực tiếp trên bi cái ở góc dưới. Khi ô này có focus, dùng phím mũi tên để chỉnh hoặc Home để về tâm. Phím <kbd>`</kbd> cũng trả về tâm. 12 giờ: cu-lê; 6 giờ: trô; 3/9 giờ: ép-phê. Sau mỗi cú đánh điểm chạm tự về tâm.</p>
          <p className="text-xs">Sau va chạm cần có bi vào lỗ hoặc chạm băng. Ba ô bếp bằng nhau dành cho bi cái khi phá. Đây là chế độ tập luyện một người với vật lý ép-phê mô phỏng; không có lượt đối thủ, gọi lỗ và lỗi ba lần liên tiếp.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
