import type { TuningField } from "../type";

export type TuningPanelProps = {
  onClose: () => void;
};

export type TuningRowProps = {
  field: TuningField;
  value: number;
  defaultValue: number;
  changed: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
};

export type CopyState = "done" | "failed" | null;
