import { ArrowLeft, Check, Play } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";

import { TABLE_PRESETS } from "./config";
import { DRILL_IDS, DRILLS } from "./drills";
import { RULES } from "./rules";
import type { GameMode, GameSetupProps } from "./type";

const MODES: { id: GameMode; name: string; hint: string }[] = [
  { id: "eight", name: RULES.eight.name, hint: "15 bi · trơn / sọc" },
  { id: "nine", name: RULES.nine.name, hint: "Bi nhỏ nhất trước" },
  { id: "ten", name: RULES.ten.name, hint: "Bi 10 phải là bi cuối" },
  { id: "drill", name: "Luyện tập", hint: "Ăn băng, nhảy bi…" },
];

const isDrillId = (value: string) => DRILL_IDS.find((id) => id === value);

export const GameSetup = ({ options, disabled, onChange, onApply, onCancel }: GameSetupProps) => (
  <section className="billiard-setup-screen mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:py-12" aria-labelledby="billiard-setup-title">
    <div>
      <p className="text-[10px] tracking-[0.24em] text-primary uppercase">Một bàn mới</p>
      <h2 id="billiard-setup-title" className="mt-2 text-3xl font-semibold">Chọn bàn của bạn.</h2>
      <p className="mt-2 text-sm text-muted-foreground">Chọn mẫu bàn, chế độ chơi và cách xếp bi, rồi nhấn Chơi.</p>
    </div>
    <div className="billiard-mode-choices grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Chế độ chơi">
      {MODES.map((mode) => (
        <Button
          key={mode.id}
          variant="outline"
          className={cn(
            "h-auto flex-col items-start gap-0.5 whitespace-normal rounded-xl p-3 text-left",
            options.mode === mode.id && "border-primary bg-primary/5",
          )}
          aria-pressed={options.mode === mode.id}
          disabled={disabled}
          onClick={() => onChange({ ...options, mode: mode.id })}
        >
          <span className="flex w-full items-center justify-between text-sm font-semibold">
            {mode.name}
            {options.mode === mode.id && <Check className="size-3.5 text-primary" />}
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">{mode.hint}</span>
        </Button>
      ))}
    </div>
    <div className="billiard-table-choices grid grid-cols-2 gap-3" role="group" aria-label="Loại bàn">
      {Object.values(TABLE_PRESETS).map((preset) => (
        <Button
          key={preset.id}
          variant="outline"
          className={cn("relative h-auto flex-col items-stretch gap-3 whitespace-normal rounded-2xl border p-3 text-left sm:p-5", options.tableId === preset.id && "border-primary bg-primary/5")}
          aria-pressed={options.tableId === preset.id}
          disabled={disabled}
          onClick={() => onChange({ ...options, tableId: preset.id })}
        >
          <svg viewBox="0 0 180 310" className="mx-auto size-40 max-w-full sm:size-52" aria-hidden="true">
            <rect x="8" y="8" width="164" height="294" rx="10" fill={preset.body} stroke={preset.trim} strokeWidth="2" />
            <rect x="25" y="25" width="130" height="260" rx="5" fill={preset.cloth} stroke={preset.cushion} strokeWidth="7" />
            {[[26, 26], [154, 26], [26, 155], [154, 155], [26, 284], [154, 284]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="7" fill="var(--background)" />)}
            <path d="M25 220H155 M68 220V285 M112 220V285" fill="none" stroke="var(--background)" strokeOpacity="0.3" />
            <path d="M84 90H96 M90 84V96" stroke="var(--foreground)" strokeOpacity="0.6" />
          </svg>
          <span className="flex items-center justify-between text-base font-semibold">{preset.name}{options.tableId === preset.id && <Check className="size-4 text-primary" />}</span>
          <span className="text-xs leading-relaxed text-muted-foreground">290 × {Math.round(preset.outerWidth * 100)} cm · 9 feet</span>
        </Button>
      ))}
    </div>
    {options.mode === "drill" ? (
      <div className="billiard-drill-choice">
        <label htmlFor="billiard-drill-select" className="mb-2 block text-xs font-semibold">Bài luyện tập</label>
        <Select
          value={options.drill}
          disabled={disabled}
          onValueChange={(value) => {
            const drill = isDrillId(value);
            if (drill) onChange({ ...options, drill });
          }}
        >
          <SelectTrigger id="billiard-drill-select" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DRILL_IDS.map((id) => (
              <SelectItem key={id} value={id}>{DRILLS[id].name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {DRILLS[options.drill].goal} Mỗi bài có {DRILLS[options.drill].layouts.length} vị trí; mỗi lần thử là một cú đánh, R để thử lại, N để sang vị trí khác.
        </p>
      </div>
    ) : (
      <div className="billiard-rack-choice">
        <label htmlFor="billiard-rack-select" className="mb-2 block text-xs font-semibold">Cách xếp bi</label>
        <Select
          value={options.rackHeight}
          disabled={disabled}
          onValueChange={(value) => {
            if (value === "high" || value === "low") onChange({ ...options, rackHeight: value });
          }}
        >
          <SelectTrigger id="billiard-rack-select" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="high">Cao · bi {RULES[options.mode].money} (giữa cụm) tại dấu +</SelectItem>
            <SelectItem value="low">Thấp · bi 1 tại dấu +</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Lòng bàn 254 × 127 cm. Bàn có hai lỗ giữa và bốn lỗ góc với lòng lỗ loe rộng hơn. Nhấn Chơi để bắt đầu lại bàn.</p>
      </div>
    )}
    <div className="flex items-center justify-between gap-3">
      <Button variant="ghost" onClick={onCancel}><ArrowLeft />Quay lại bàn</Button>
      <Button className="h-11 min-w-32 font-semibold" onClick={onApply} disabled={disabled}><Play />Chơi</Button>
    </div>
  </section>
);
