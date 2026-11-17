import {
  PHYSICS_CONFIG,
  PHYSICS_DEFAULTS,
  SHOT_DRAG_PIXELS_PER_PERCENT,
  SHOT_INPUT_CONFIG,
} from "./constants";
import type { TuningGroup, TuningKey, TuningValues } from "./type";

// Bumped whenever the shipped defaults change, so an old full snapshot in
// someone's browser cannot pin values that were later retuned.
const STORAGE_KEY = "billiard-physics-tuning-v3";

// Ranges stay inside physically sensible bounds: sliding and rolling
// friction never reach zero, otherwise a ball could slide forever.
export const TUNING_GROUPS: TuningGroup[] = [
  {
    id: "shot",
    title: "Lực cơ",
    fields: [
      {
        key: "maximumShotSpeed",
        label: "Tốc độ ở 100% lực",
        hint: "Tốc độ bi cái khi đánh tâm, kéo hết lực.",
        unit: "m/s",
        min: 1,
        max: 10,
        step: 0.1,
      },
      {
        key: "minimumShotSpeed",
        label: "Tốc độ nhỏ nhất",
        hint: "Cú chạm nhẹ nhất, gần 0% lực.",
        unit: "m/s",
        min: 0.02,
        max: 2,
        step: 0.01,
      },
      {
        key: "powerCurve",
        label: "Độ cong thanh lực",
        hint: "1 là tuyến tính; lớn hơn thì vùng lực thấp và vừa nhẹ hơn.",
        unit: "",
        min: 1,
        max: 3,
        step: 0.05,
      },
      {
        key: "lowPowerLift",
        label: "Nâng lực vùng thấp",
        hint: "Thêm tốc độ cho khoảng 0–50%, hết tác dụng trước 70%; 0% và 100% giữ nguyên. 0 là chỉ dùng độ cong.",
        unit: "",
        // Above 1.5 the bar could dip with a steep curve; the test checks it.
        min: 0,
        max: 1.5,
        step: 0.05,
      },
      {
        key: "dragPixelsPerPercent",
        label: "Độ nhạy kéo",
        hint: "Số pixel kéo chuột để tăng 1% lực.",
        unit: "px",
        min: 1,
        max: 8,
        step: 0.1,
      },
    ],
  },
  {
    id: "cloth",
    title: "Mặt nỉ",
    fields: [
      {
        key: "slidingFriction",
        label: "Ma sát trượt",
        hint: "Bi trượt bao lâu trước khi lăn; ảnh hưởng mạnh tới kéo và đẩy.",
        unit: "μ",
        min: 0.05,
        max: 0.4,
        step: 0.005,
      },
      {
        key: "rollingFriction",
        label: "Ma sát lăn",
        hint: "Bi lăn chậm dần nhanh hay chậm; tăng để bi dừng sớm hơn.",
        // Real cloth is about 0.005–0.02; the wide top leaves room to experiment.
        unit: "μ",
        min: 0.003,
        max: 0.5,
        step: 0.0005,
      },
      {
        key: "spinningFriction",
        label: "Ma sát xoáy ngang",
        hint: "Ép-phê tắt dần nhanh hay chậm.",
        unit: "μ",
        min: 0,
        max: 0.08,
        step: 0.001,
      },
      {
        key: "tableRestitution",
        label: "Độ nảy mặt bàn",
        hint: "Phần tốc độ dọc bi giữ lại khi đập xuống bàn: cú nhảy bật cao hay thấp, bi rơi nảy mấy lần.",
        unit: "",
        min: 0.2,
        max: 0.8,
        step: 0.01,
      },
    ],
  },
  {
    id: "ball",
    title: "Bi chạm bi",
    fields: [
      {
        key: "ballRestitution",
        label: "Độ nảy bi",
        hint: "1 là va chạm không mất năng lượng.",
        unit: "",
        min: 0.8,
        max: 1,
        step: 0.005,
      },
      {
        key: "ballFrictionMin",
        label: "Ma sát bi tối thiểu",
        hint: "Ma sát khi hai bi trượt nhanh qua nhau.",
        unit: "μ",
        min: 0,
        max: 0.05,
        step: 0.0005,
      },
      {
        key: "ballFrictionRange",
        label: "Ma sát bi thêm khi chậm",
        hint: "Phần cộng thêm lúc trượt chậm; tăng thì bi ném (throw) nhiều hơn.",
        unit: "μ",
        min: 0,
        max: 0.25,
        step: 0.002,
      },
      {
        key: "ballFrictionDecay",
        label: "Tốc độ giảm ma sát bi",
        hint: "Ma sát bi giảm nhanh thế nào khi tốc độ trượt tăng.",
        unit: "s/m",
        min: 0,
        max: 3,
        step: 0.02,
      },
    ],
  },
  {
    id: "cushion",
    title: "Băng",
    fields: [
      {
        key: "cushionRestitution",
        label: "Độ nảy băng",
        hint: "Độ nảy khi bi chạm băng rất chậm.",
        unit: "",
        min: 0.6,
        max: 1,
        step: 0.005,
      },
      {
        key: "cushionRestitutionLoss",
        label: "Mất nảy theo tốc độ",
        hint: "Độ nảy giảm thêm cho mỗi m/s bi lao vào băng.",
        unit: "/ m/s",
        min: 0,
        max: 0.15,
        step: 0.002,
      },
      {
        key: "cushionRestitutionMin",
        label: "Độ nảy băng tối thiểu",
        hint: "Giới hạn dưới khi đánh rất mạnh vào băng.",
        unit: "",
        min: 0.4,
        max: 1,
        step: 0.005,
      },
      {
        key: "cushionFriction",
        label: "Ma sát băng",
        hint: "Băng ăn xoáy và ép-phê đổi góc bật nhiều hay ít.",
        unit: "μ",
        min: 0,
        max: 0.4,
        step: 0.005,
      },
      {
        key: "cushionHeightRatio",
        label: "Chiều cao mũi băng",
        hint: "Tỉ lệ so với đường kính bi; cao hơn thì ăn xoáy lăn nhiều hơn.",
        unit: "× D",
        min: 0.55,
        max: 0.7,
        step: 0.0025,
      },
    ],
  },
];

export const TUNING_FIELDS = TUNING_GROUPS.flatMap((group) => group.fields);

// The spread also carries untuned settings; pickTuning keeps only the fields.
export const DEFAULT_TUNING: TuningValues = {
  ...PHYSICS_DEFAULTS,
  dragPixelsPerPercent: SHOT_DRAG_PIXELS_PER_PERCENT,
};

export const readTuning = (): TuningValues => ({
  ...PHYSICS_CONFIG,
  dragPixelsPerPercent: SHOT_INPUT_CONFIG.dragPixelsPerPercent,
});

const pickTuning = (values: TuningValues) => {
  const picked: Partial<TuningValues> = {};
  for (const field of TUNING_FIELDS) picked[field.key] = values[field.key];
  return picked;
};

export const clampTuning = (key: TuningKey, value: number) => {
  const field = TUNING_FIELDS.find((item) => item.key === key);
  if (!field || !Number.isFinite(value)) return DEFAULT_TUNING[key];
  return Math.min(field.max, Math.max(field.min, value));
};

// Writes straight into the live configuration the engine reads each step.
export const applyTuning = (values: Partial<TuningValues>) => {
  for (const field of TUNING_FIELDS) {
    const value = values[field.key];
    if (value === undefined) continue;
    const safe = clampTuning(field.key, value);
    if (field.key === "dragPixelsPerPercent") SHOT_INPUT_CONFIG.dragPixelsPerPercent = safe;
    else PHYSICS_CONFIG[field.key] = safe;
  }
};

// Browser storage is a per-viewer convenience: it may be missing or blocked.
// Only values that differ from the defaults are stored, so untouched fields
// follow the defaults when they are retuned.
export const saveTuning = (values: TuningValues) => {
  const changed: Partial<TuningValues> = {};
  for (const field of TUNING_FIELDS) {
    if (values[field.key] !== DEFAULT_TUNING[field.key]) changed[field.key] = values[field.key];
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(changed));
  } catch {
    // Tuning still applies for this visit without storage.
  }
};

export const clearSavedTuning = () => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was stored.
  }
};

export const loadSavedTuning = () => {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return;
    const values: Partial<TuningValues> = {};
    for (const field of TUNING_FIELDS) {
      const value: unknown = Reflect.get(saved, field.key);
      if (typeof value === "number") values[field.key] = value;
    }
    applyTuning(values);
  } catch {
    // Unreadable storage falls back to the defaults.
  }
};

export const formatTuning = (values: TuningValues) =>
  JSON.stringify(pickTuning(values), null, 2);
