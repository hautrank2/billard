import { cueTipOffset } from "./cues";
import type { SpinControlProps } from "./type";

export const SpinControl = ({ cue, spin, label, disabled, onPointer, onKey }: SpinControlProps) => {
  const offset = cueTipOffset(cue, spin);
  return (
    <section className="billiard-spin w-28 rounded-xl border border-border bg-background/90 p-1.5 shadow-lg backdrop-blur-sm sm:w-32 sm:p-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[9px] font-semibold">Điểm chạm bi cái</h2>
        <span className="font-mono text-[9px] text-primary">{label}</span>
      </div>
      <div className="relative mx-auto my-3 size-[92px] sm:size-[108px]">
        <span
          className="absolute -top-2 left-1/2 -translate-x-1/2 font-mono text-[10px] text-muted-foreground"
        >12</span>
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground"
        >3</span>
        <span
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 font-mono text-[10px] text-muted-foreground"
        >6</span>
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground"
        >9</span>
        <div
          role="group"
          tabIndex={disabled ? -1 : 0}
          aria-label={`Điểm chạm: ${label}. Chọn bằng chuột, dùng phím mũi tên để chỉnh, Home hoặc phím dấu huyền về tâm.`}
          aria-disabled={disabled}
          className="billiard-spin-ball absolute inset-[12px] touch-none cursor-crosshair rounded-full outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onKeyDown={onKey}
        >
          <span
            className="pointer-events-none absolute rounded-full border border-background/25"
            style={{ inset: `${(1 - cue.maxTipOffset) * 50}%` }}
          />
          <span
            className="pointer-events-none absolute left-1/2 top-[8%] h-[84%] border-l border-dashed border-background/20"
          />
          <span
            className="pointer-events-none absolute left-[8%] top-1/2 w-[84%] border-t border-dashed border-background/20"
          />
          <span
            className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-background bg-primary shadow-md"
            style={{ left: `${(offset.x + 1) * 50}%`, top: `${(1 - offset.y) * 50}%` }}
          />
        </div>
      </div>
    </section>
  );
};
