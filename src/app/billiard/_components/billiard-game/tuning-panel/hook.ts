import { useEffect, useState } from "react";

import {
  applyTuning,
  clampTuning,
  clearSavedTuning,
  DEFAULT_TUNING,
  formatTuning,
  readTuning,
  saveTuning,
  TUNING_FIELDS,
} from "../physics-tuning";
import type { TuningKey, TuningValues } from "../type";
import type { CopyState } from "./type";

export const useTuningPanel = () => {
  const [values, setValues] = useState<TuningValues>(readTuning);
  const [copied, setCopied] = useState<CopyState>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const commit = (next: TuningValues) => {
    applyTuning(next);
    saveTuning(next);
    setValues(next);
  };
  const isChanged = (key: TuningKey) => values[key] !== DEFAULT_TUNING[key];
  const text = formatTuning(values);

  return {
    values,
    text,
    copied,
    isChanged,
    changedCount: TUNING_FIELDS.filter((field) => isChanged(field.key)).length,
    change: (key: TuningKey, value: number) => {
      commit({ ...values, [key]: clampTuning(key, value) });
    },
    reset: (key: TuningKey) => {
      commit({ ...values, [key]: DEFAULT_TUNING[key] });
    },
    resetAll: () => {
      applyTuning(DEFAULT_TUNING);
      clearSavedTuning();
      setValues(readTuning());
    },
    copy: async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied("done");
      } catch {
        // Clipboard can be blocked; the JSON box stays available to copy.
        setCopied("failed");
      }
    },
  };
};
