import type { CSSProperties } from "react";

import { cn } from "~/lib/utils";

import type { BallChipProps } from "./type";

// Colours come from the --billiard-ball-N variables of the chosen set;
// 9–15 draw as stripes between the set's caps.
export const BallChip = ({ number, pocketed = false, offTable = false, className }: BallChipProps) => (
  <span
    data-ball={number}
    data-stripe={number >= 9 || undefined}
    aria-label={`Bi ${number}${offTable ? " đã văng khỏi bàn" : pocketed ? " đã vào lỗ" : ""}`}
    className={cn(
      "billiard-ball flex size-4 shrink-0 items-center justify-center rounded-full sm:size-5",
      (pocketed || offTable) && "opacity-20 grayscale",
      className,
    )}
    style={{ "--ball-color": `var(--billiard-ball-${number})` } as CSSProperties}
  >
    <span className="flex size-2.5 items-center justify-center rounded-full bg-[var(--billiard-ivory)] text-[6px] font-black tracking-tighter text-background sm:size-3 sm:text-[7px]">
      {number}
    </span>
  </span>
);
