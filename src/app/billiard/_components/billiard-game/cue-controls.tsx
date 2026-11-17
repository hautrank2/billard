import { Minus, Plus, Rocket, ShieldCheck } from "lucide-react";
import { useId } from "react";

import { Button } from "~/components/ui/button";

import { ELEVATION_DOWN_KEY, ELEVATION_STEP, ELEVATION_UP_KEY, JUMP_TOGGLE_KEY, PUSH_OUT_KEY, RAIL_HEIGHT } from "./constants";
import { CUE_TYPE_LABELS } from "./cues";
import type { CueControlsProps } from "./type";

export const CueControls = ({
  cue,
  cueMode,
  elevation,
  breaking,
  disabled,
  pushOut,
  onToggleJump,
  onElevation,
  onTogglePushOut,
}: CueControlsProps) => {
  const elevationId = useId();
  const jumping = cue.type === "jump";

  return (
    <section
      className="billiard-cue-controls flex flex-col gap-1.5 border-t border-border pt-3"
      aria-label="Gậy đang dùng"
    >
      <div className="flex items-baseline justify-between gap-1">
        <h2 className="truncate text-[10px] font-semibold sm:text-xs">{cue.name}</h2>
        <span className="shrink-0 rounded border border-border px-1 text-[9px] text-primary">
          {CUE_TYPE_LABELS[cue.type]}
        </span>
      </div>
      <Button
        variant={cueMode === "jump" ? "secondary" : "outline"}
        size="sm"
        className="billiard-jump-toggle h-auto min-h-7 justify-start gap-1 whitespace-normal px-1.5 py-1 text-left text-[9px] sm:text-[11px]"
        onClick={onToggleJump}
        disabled={disabled || breaking}
        aria-pressed={cueMode === "jump"}
        aria-keyshortcuts={JUMP_TOGGLE_KEY}
        title={breaking ? "Cú phá luôn dùng gậy phá" : `${JUMP_TOGGLE_KEY} · Đổi giữa gậy lướt và gậy nhảy`}
      >
        <kbd className="rounded border border-border px-1 font-mono text-[9px] text-primary">
          {JUMP_TOGGLE_KEY}
        </kbd>
        <Rocket className="hidden size-3 shrink-0 sm:block" />
        <span>{cueMode === "jump" ? "Gậy nhảy: Bật" : "Gậy nhảy: Tắt"}</span>
      </Button>
      {jumping && (
        <div className="billiard-elevation flex flex-col gap-1">
          <label htmlFor={elevationId} className="flex justify-between text-[9px] sm:text-[10px]">
            <span>Góc nâng</span>
            <span className="font-mono text-primary">{elevation.toFixed(elevation % 1 ? 2 : 0)}°</span>
          </label>
          <div className="billiard-elevation-adjustment grid grid-cols-2 items-center gap-1 sm:flex sm:gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-full gap-0.5 sm:w-9 sm:gap-1"
              disabled={disabled || elevation <= cue.minElevation}
              aria-label="Hạ góc cơ"
              aria-keyshortcuts={ELEVATION_DOWN_KEY}
              title={`Hạ góc cơ (${ELEVATION_DOWN_KEY})`}
              onKeyDown={(event) => {
                if (event.code === "Space") event.stopPropagation();
              }}
              onClick={(event) => {
                if (event.detail > 0) event.currentTarget.blur();
                onElevation(elevation - ELEVATION_STEP);
              }}
            >
              <Minus className="size-2.5 sm:size-3" aria-hidden="true" />
              <kbd className="font-mono text-[10px] text-primary">{ELEVATION_DOWN_KEY}</kbd>
            </Button>
            <input
              id={elevationId}
              type="range"
              min={cue.minElevation}
              max={cue.maxElevation}
              step={0.25}
              value={elevation}
              disabled={disabled}
              aria-keyshortcuts={`${ELEVATION_DOWN_KEY} ${ELEVATION_UP_KEY}`}
              className="col-span-2 row-start-1 h-4 w-full min-w-0 flex-1 cursor-pointer accent-primary"
              onChange={(event) => onElevation(event.currentTarget.valueAsNumber)}
              // Hand Space back to the table after a mouse drag on the slider.
              onPointerUp={(event) => event.currentTarget.blur()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-full gap-0.5 sm:w-9 sm:gap-1"
              disabled={disabled || elevation >= cue.maxElevation}
              aria-label="Nâng góc cơ"
              aria-keyshortcuts={ELEVATION_UP_KEY}
              title={`Nâng góc cơ (${ELEVATION_UP_KEY})`}
              onKeyDown={(event) => {
                if (event.code === "Space") event.stopPropagation();
              }}
              onClick={(event) => {
                if (event.detail > 0) event.currentTarget.blur();
                onElevation(elevation + ELEVATION_STEP);
              }}
            >
              <Plus className="size-2.5 sm:size-3" aria-hidden="true" />
              <kbd className="font-mono text-[10px] text-primary">{ELEVATION_UP_KEY}</kbd>
            </Button>
          </div>
          <p className="text-[9px] leading-snug text-muted-foreground">
            Giữ Shift khi nhấn phím để chỉnh từng 0,25°. Mặt băng cao {(RAIL_HEIGHT * 100).toLocaleString("vi-VN")} cm so với nỉ. Bi có thể bay qua băng và văng khỏi bàn.
          </p>
        </div>
      )}
      {pushOut !== "none" && (
        <Button
          variant={pushOut === "declared" ? "secondary" : "outline"}
          size="sm"
          className="billiard-push-out-toggle h-auto min-h-7 justify-start gap-1 whitespace-normal px-1.5 py-1 text-left text-[9px] sm:text-[11px]"
          onClick={onTogglePushOut}
          disabled={disabled}
          aria-pressed={pushOut === "declared"}
          aria-keyshortcuts={PUSH_OUT_KEY}
          title="Chỉ cú đầu tiên sau cú phá: không cần chạm bi nhỏ nhất hay chạm băng"
        >
          <kbd className="rounded border border-border px-1 font-mono text-[9px] text-primary">
            {PUSH_OUT_KEY}
          </kbd>
          <ShieldCheck className="hidden size-3 shrink-0 sm:block" />
          <span>{pushOut === "declared" ? "Đánh an toàn: Bật" : "Đánh an toàn"}</span>
        </Button>
      )}
    </section>
  );
};
