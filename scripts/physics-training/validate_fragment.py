"""Audit decoded cadence and cross-check ball centers without fitting game physics."""

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".training-tools"))

import cv2
import numpy as np


def compare_centers(frame, x, y, radius):
    """Edge-based circle check on native pixels, seeded by a coarse location."""
    x0, y0 = round(x), round(y)
    margin = round(radius * 2.3)
    left, top = max(0, x0 - margin), max(0, y0 - margin)
    patch = frame[top:y0 + margin + 1, left:x0 + margin + 1]
    circles = cv2.HoughCircles(cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY), cv2.HOUGH_GRADIENT,
                              dp=1, minDist=15, param1=80, param2=15,
                              minRadius=max(2, round(radius * .65)), maxRadius=round(radius * 1.3))
    if circles is None:
        return None
    options = [(math.hypot(float(c[0]) + left - x, float(c[1]) + top - y), c) for c in circles[0]]
    distance, circle = min(options, key=lambda item: item[0])
    if distance > radius * .65:
        return None
    return float(circle[0]) + left, float(circle[1]) + top, float(circle[2]), distance


def grouped_frames(differences, threshold):
    groups, current = [0], 0
    for difference in differences:
        if difference > threshold:
            current += 1
        groups.append(current)
    return groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--selection", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    if (args.out / "validation.json").exists():
        parser.error("Choose a new validation version; existing results are preserved")
    args.out.mkdir(parents=True, exist_ok=True)
    with (args.selection / "selected-track.csv").open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        original_fields = reader.fieldnames
        rows = list(reader)
    if len(rows) < 2 or any(int(b["frame"]) - int(a["frame"]) != 1 for a, b in zip(rows, rows[1:])):
        raise ValueError("A consecutive multi-frame selection is required")
    provenance = json.loads((args.selection / "selection.json").read_text(encoding="utf-8"))
    input_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
    if input_hash != provenance["input_sha256"]:
        raise ValueError("Media hash differs from the selected track's source")
    analysis_path = Path(provenance["analysis"])
    if not analysis_path.is_absolute():
        analysis_path = ROOT / analysis_path
    analysis = json.loads((analysis_path / "report.json").read_text(encoding="utf-8"))
    if (analysis["analysis_width"], analysis["analysis_height"]) != (1280, 720):
        raise ValueError("This fixed-ROI pilot expects 1280x720 analysis coordinates")
    cap = cv2.VideoCapture(str(args.input))
    fps = float(cap.get(cv2.CAP_PROP_FPS))
    scale = cap.get(cv2.CAP_PROP_FRAME_WIDTH) / 1280
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(rows[0]["frame"]))
    differences, hashes, checked, records, previous = [], [], [], [], None
    # Fixed, independently specified image ROI, not a recentered ball patch.
    roi = [500, 330, 900, 415]
    left, top, right, bottom = [round(value * scale) for value in roi]
    for row in rows:
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError("Selection ends beyond decoded video")
        hashes.append(hashlib.sha256(frame.tobytes()).hexdigest())
        patch = frame[top:bottom, left:right]
        difference = float(np.mean(cv2.absdiff(patch, previous))) if previous is not None else None
        if difference is not None:
            differences.append(difference)
        previous = patch.copy()
        x, y, radius = (float(row[key]) * scale for key in ("x_px", "y_px", "radius_px"))
        result = compare_centers(frame, x, y, radius)
        record = dict(row)
        record.update({"fixed_roi_mad": difference, "edge_x_px": None, "edge_y_px": None,
                       "edge_radius_px": None, "center_difference_px": None})
        if result:
            edge_x, edge_y, edge_radius, delta = (value / scale for value in result)
            record.update({"edge_x_px": edge_x, "edge_y_px": edge_y,
                           "edge_radius_px": edge_radius, "center_difference_px": delta})
            checked.append(delta)
        records.append(record)
    cap.release()
    groups = grouped_frames(differences, .2)
    for record, group in zip(records, groups):
        record["near_hold_group"] = group
    fields = original_fields + ["fixed_roi_mad", "edge_x_px", "edge_y_px", "edge_radius_px", "center_difference_px", "near_hold_group"]
    with (args.out / "observations.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)
    dx = [float(b["x_px"]) - float(a["x_px"]) for a, b in zip(rows, rows[1:])]
    coincident_holds = sum(abs(step) < .001 and difference <= .2 for step, difference in zip(dx, differences))
    result = {
        "status": "cadence_and_center_consistency_audited_not_ground_truth",
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "input_sha256": input_hash,
        "selection": str(args.selection), "decoded_fps": fps, "observations": len(rows),
        "frames": [int(rows[0]["frame"]), int(rows[-1]["frame"])],
        "duration_s": float(rows[-1]["clip_pts_s"]) - float(rows[0]["clip_pts_s"]),
        "cadence": {
            "fixed_roi_analysis_pixels": roi, "mad_units": "mean absolute BGR channel difference, 0..255, native resolution",
            "exact_unique_full_frame_hashes": len(set(hashes)),
            "near_hold_threshold": .2, "near_hold_pairs": sum(value <= .2 for value in differences),
            "zero_dx_pairs_also_near_holds": coincident_holds,
            "content_groups_at_threshold": max(groups) + 1,
            "threshold_sensitivity": {str(threshold): sum(value <= threshold for value in differences)
                                      for threshold in (.05, .1, .2, .3)},
            "mad_percentiles": dict(zip(["p0", "p25", "p50", "p75", "p100"],
                                         np.percentile(differences, [0, 25, 50, 75, 100]).tolist())),
            "interpretation": "Near-held decoded content is consistent with repeated source images plus encoding noise; origin and effective real-time FPS are unverified.",
            "rule": "Preserve original PTS and hold groups; do not compress time or assume every frame is a fresh observation."
        },
        "edge_circle_cross_check": {
            "method": "Hough gradient circles on native pixels; search location/radius seeded by baseline, not independent labels",
            "found_frames": len(checked), "missing_frames": len(rows) - len(checked),
            "center_difference_analysis_px_median": float(np.median(checked)) if checked else None,
            "center_difference_analysis_px_p95": float(np.percentile(checked, 95)) if checked else None,
            "center_difference_analysis_px_max": max(checked) if checked else None,
            "note": "Agreement supports center consistency only; neither detector is ground truth and both can share errors."
        },
        "physics_fit_approved": False,
        "limitations": ["No independent all-frame annotations", "No verified real-time cadence or replay speed",
                        "No approved metric camera model", "Spin and sliding/rolling phase unobserved"]
    }
    (args.out / "validation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
