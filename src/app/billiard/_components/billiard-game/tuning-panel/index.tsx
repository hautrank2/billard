"use client";

import { Check, Copy, RotateCcw, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

import { DEFAULT_TUNING, TUNING_GROUPS } from "../physics-tuning";
import { useTuningPanel } from "./hook";
import type { TuningPanelProps, TuningRowProps } from "./type";

const TuningRow = ({
  field,
  value,
  defaultValue,
  changed,
  onChange,
  onReset,
}: TuningRowProps) => {
  const inputId = `billiard-tuning-${field.key}`;
  const hintId = `${inputId}-hint`;
  return (
    <div data-tuning-key={field.key} className="billiard-tuning-row grid gap-1">
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={inputId}
          className="min-w-0 flex-1 truncate text-[11px] font-medium"
        >
          {field.label}
        </label>
        {changed && (
          <Button
            variant="ghost"
            size="icon"
            className="size-5 text-primary"
            onClick={onReset}
            aria-label={`Đưa ${field.label} về mặc định`}
            title="Về mặc định"
          >
            <RotateCcw className="size-3" />
          </Button>
        )}
        {/* Remounted on each value so typing is committed on blur or Enter. */}
        <Input
          key={value}
          id={inputId}
          type="number"
          inputMode="decimal"
          defaultValue={value}
          min={field.min}
          max={field.max}
          step={field.step}
          aria-describedby={hintId}
          className="h-6 w-[4.5rem] px-1.5 text-right font-mono text-[11px] md:text-[11px]"
          onBlur={(event) => {
            const typed = event.currentTarget.valueAsNumber;
            if (Number.isFinite(typed)) onChange(typed);
            event.currentTarget.value = String(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span className="w-8 shrink-0 text-[9px] text-muted-foreground">
          {field.unit}
        </span>
      </div>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        aria-label={field.label}
        aria-describedby={hintId}
        className="billiard-tuning-slider h-4 w-full cursor-pointer accent-primary"
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        // Hand Space back to the table after a mouse drag on the slider.
        onPointerUp={(event) => event.currentTarget.blur()}
      />
      <p id={hintId} className="text-[9px] leading-snug text-muted-foreground">
        {field.hint} Mặc định {defaultValue}.
      </p>
    </div>
  );
};

export const TuningPanel = ({ onClose }: TuningPanelProps) => {
  const {
    values,
    text,
    copied,
    isChanged,
    changedCount,
    change,
    reset,
    resetAll,
    copy,
  } = useTuningPanel();

  return (
    <section
      className="billiard-tuning absolute left-3 top-14 z-20 flex max-h-[calc(100%-4.5rem)] w-[min(20rem,calc(100%-1.5rem))] flex-col rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur-sm"
      aria-labelledby="billiard-tuning-title"
    >
      <header className="billiard-tuning-header flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 id="billiard-tuning-title" className="text-xs font-semibold">
            Chỉnh vật lý
          </h2>
          <p className="text-[9px] text-muted-foreground">
            Áp dụng ngay, lưu trên trình duyệt này
            {changedCount > 0 && ` · đã đổi ${changedCount}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
          aria-label="Đóng bảng chỉnh vật lý"
        >
          <X className="size-3.5" />
        </Button>
      </header>

      <div className="billiard-tuning-body min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-3">
        {TUNING_GROUPS.map((group) => (
          <fieldset
            key={group.id}
            data-tuning-group={group.id}
            className="billiard-tuning-group space-y-3"
          >
            <legend className="mb-2 text-[10px] font-semibold tracking-wider text-primary uppercase">
              {group.title}
            </legend>
            {group.fields.map((field) => (
              <TuningRow
                key={field.key}
                field={field}
                value={values[field.key]}
                defaultValue={DEFAULT_TUNING[field.key]}
                changed={isChanged(field.key)}
                onChange={(value) => change(field.key, value)}
                onReset={() => reset(field.key)}
              />
            ))}
          </fieldset>
        ))}
        <details className="billiard-tuning-json" open={copied === "failed" || undefined}>
          <summary className="cursor-pointer text-[10px] text-muted-foreground">
            Xem chỉ số dạng JSON
          </summary>
          <textarea
            readOnly
            value={text}
            rows={10}
            aria-label="Chỉ số vật lý dạng JSON"
            className="mt-2 w-full resize-none rounded-md border border-border bg-transparent p-2 font-mono text-[10px]"
            onFocus={(event) => event.currentTarget.select()}
          />
        </details>
      </div>

      <footer className="billiard-tuning-footer flex shrink-0 gap-1.5 border-t border-border px-3 py-2">
        <Button size="sm" className="h-7 flex-1 gap-1 text-[11px]" onClick={copy}>
          {copied === "done" ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied === "done"
            ? "Đã chép"
            : copied === "failed" ? "Không chép được, xem JSON" : "Chép chỉ số"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-[11px]"
          onClick={resetAll}
          disabled={changedCount === 0}
        >
          <RotateCcw className="size-3" />
          Mặc định
        </Button>
      </footer>
    </section>
  );
};
