"""Export one selected track fragment for manual identity and continuity QA."""

import argparse
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".training-tools"))

import cv2
import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--analysis", type=Path, required=True)
    parser.add_argument("--track-id", type=int, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    report = json.loads((args.analysis / "report.json").read_text(encoding="utf-8"))
    with (args.analysis / "tracks.csv").open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames
        rows = [row for row in reader if int(row["track_id"]) == args.track_id]
    if len(rows) < 5 or len({row["scene_id"] for row in rows}) != 1:
        raise ValueError("Select a single-scene track with at least five observations")
    if any(int(b["frame"]) - int(a["frame"]) != 1 for a, b in zip(rows, rows[1:])):
        raise ValueError("Track contains missing frames; export fragments separately")
    args.out.mkdir(parents=True, exist_ok=True)
    with (args.out / "selected-track.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    width, height = report["analysis_width"], report["analysis_height"]
    xs, ys = [float(row["x_px"]) for row in rows], [float(row["y_px"]) for row in rows]
    left, right = max(0, int(min(xs)) - 45), min(width, int(max(xs)) + 45)
    top, bottom = max(0, int(min(ys)) - 60), min(height, int(max(ys)) + 60)
    samples = [rows[index] for index in np.linspace(0, len(rows) - 1, 5).astype(int)]
    cap = cv2.VideoCapture(str(args.input))
    tiles = []
    for row in samples:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(row["frame"]))
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError("Cannot decode selected review frame")
        frame = cv2.resize(frame, (width, height))
        crop = frame[top:bottom, left:right].copy()
        cv2.circle(crop, (round(float(row["x_px"])) - left, round(float(row["y_px"])) - top),
                   round(float(row["radius_px"])) + 3, (0, 255, 255), 1)
        crop = cv2.resize(crop, (800, round(crop.shape[0] * 800 / crop.shape[1])))
        label = f"frame {row['frame']} | clip {row['clip_pts_s']}s | source ~{row['source_time_estimate_s']}s"
        cv2.putText(crop, label, (8, 20), cv2.FONT_HERSHEY_SIMPLEX, .5, (255, 255, 255), 1)
        tiles.append(crop)
    cap.release()
    cv2.imwrite(str(args.out / "review-samples.jpg"), np.vstack(tiles))
    summary = {
        "status": "selected_fragment_pending_manual_review",
        "track_id": args.track_id, "input_sha256": report["input_sha256"],
        "analysis": str(args.analysis), "observations": len(rows),
        "start_frame": int(rows[0]["frame"]), "end_frame": int(rows[-1]["frame"]),
        "duration_s": float(rows[-1]["clip_pts_s"]) - float(rows[0]["clip_pts_s"]),
        "source_start_estimate_s": float(rows[0]["source_time_estimate_s"]),
        "source_end_estimate_s": float(rows[-1]["source_time_estimate_s"]),
        "review_sample_frames": [int(row["frame"]) for row in samples],
        "coordinate_system": f"image pixels, {width}x{height}; origin top-left; y increases downward",
        "metric_calibration": False,
        "warning": "A selected fragment is not an independently labelled accuracy benchmark or a whole-shot reconstruction."
    }
    (args.out / "selection.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
