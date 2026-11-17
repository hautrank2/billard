import { RotateCcw, Shuffle } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { BallChip } from "./ball-chip";
import { DRILL_NEXT_KEY, DRILL_RETRY_KEY } from "./constants";
import { DRILLS } from "./drills";
import { RULES } from "./rules";
import type { GameSnapshot, RackPanelProps } from "./type";

const groupTitle = (game: GameSnapshot) => {
  if (game.breaking) return "Khai cuộc";
  if (!game.group) return "Bàn mở";
  if (game.legal.length === 1 && game.legal[0] === 8) return "Bi 8";
  return game.group === "solids" ? "Bi trơn" : "Bi sọc";
};

export const RackPanel = ({ game, disabled, onRetry, onNext }: RackPanelProps) => {
  const drill = game.drill;
  if (drill) {
    const spec = DRILLS[drill.id];
    return (
      <section
        className="billiard-drill-panel flex flex-col gap-1.5 border-t border-border pt-3"
        aria-label="Bài luyện tập"
        data-drill-id={drill.id}
      >
        <div className="flex items-center justify-between gap-1">
          <h2 className="text-[10px] font-semibold sm:text-xs">{spec.name}</h2>
          <BallChip number={drill.target} />
        </div>
        <p className="billiard-drill-score text-[9px] leading-relaxed text-muted-foreground">
          Vị trí {drill.variant + 1}/{spec.layouts.length}
          <br />
          Đạt {drill.made}/{drill.attempts}
        </p>
        {drill.result && (
          <p
            className={cn(
              "billiard-drill-result text-[9px] leading-snug sm:text-[10px]",
              drill.result.success ? "text-primary" : "text-muted-foreground",
            )}
          >
            {drill.result.success ? "Đạt" : "Chưa đạt"}: {drill.result.note}
          </p>
        )}
        <Button
          size="sm"
          variant={drill.result ? "default" : "outline"}
          className="h-7 justify-start gap-1 px-1.5 text-[9px] sm:text-[11px]"
          onClick={onRetry}
          disabled={disabled}
          aria-keyshortcuts={DRILL_RETRY_KEY}
        >
          <kbd className="rounded border border-current/30 px-1 font-mono text-[9px]">{DRILL_RETRY_KEY}</kbd>
          <RotateCcw className="hidden size-3 sm:block" />
          Thử lại
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 justify-start gap-1 px-1.5 text-[9px] sm:text-[11px]"
          onClick={onNext}
          disabled={disabled}
          aria-keyshortcuts={DRILL_NEXT_KEY}
        >
          <kbd className="rounded border border-border px-1 font-mono text-[9px] text-primary">{DRILL_NEXT_KEY}</kbd>
          <Shuffle className="hidden size-3 sm:block" />
          Vị trí khác
        </Button>
      </section>
    );
  }

  const eight = game.options.mode === "eight";
  const money = game.options.mode === "drill" ? 9 : RULES[game.options.mode].money;
  const title = eight ? groupTitle(game) : `Bi ${game.target}`;
  return (
    <section className="billiard-target border-t border-border pt-3" aria-label="Bi mục tiêu">
      <div className="flex items-center justify-between gap-1">
        <h2 className="text-[10px] font-semibold sm:text-xs">{title}</h2>
        {!eight && game.target > 0 && <BallChip number={game.target} />}
      </div>
      <div className="billiard-ball-tray mt-2 grid grid-cols-3 justify-items-center gap-1 sm:grid-cols-5">
        {game.ballIds.map((id) => (
          <BallChip
            key={id}
            number={id}
            pocketed={game.pocketed.includes(id)}
            offTable={game.offTable.includes(id)}
            // In 8-ball the balls the next stroke may hit first stand out.
            className={cn(
              eight && !game.breaking && !game.legal.includes(id) &&
                !game.pocketed.includes(id) && !game.offTable.includes(id) && "opacity-45",
            )}
          />
        ))}
      </div>
      <p className="billiard-stats mt-2 text-[9px] leading-relaxed text-muted-foreground">
        Cú: {game.shots} · Lỗi: {game.fouls}
        <br />
        Vào lỗ: {game.pocketed.length}/{game.ballIds.length}
        {!eight && (
          <>
            <br />
            Bi chốt: {money}
          </>
        )}
      </p>
    </section>
  );
};
