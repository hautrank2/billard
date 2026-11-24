"""Align repeated moving content without converting repeat timestamps into physical time."""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".training-tools"))
import cv2
import numpy as np


def correlation(first, second):
    first, second = np.asarray(first, np.float64).ravel(), np.asarray(second, np.float64).ravel()
    denominator = np.linalg.norm(first) * np.linalg.norm(second)
    return float(np.dot(first, second) / denominator) if denominator > 1e-10 else None


def align_content(reference, repeated, reference_start, repeated_start, offsets, fit_indices):
    # Removing each region's temporal median reduces the advantage of matching
    # static cloth. Offset selection sees only the declared fit frame indices.
    first = reference.astype(np.float32) - np.median(reference, axis=0)
    second = repeated.astype(np.float32) - np.median(repeated, axis=0)
    scores = []
    for offset in offsets:
        target_indices = reference_start + np.asarray(fit_indices) + offset - repeated_start
        if target_indices.min() < 0 or target_indices.max() >= len(second):
            continue
        value = correlation(first[fit_indices], second[target_indices])
        if value is not None:
            scores.append({"offset_frames": offset, "fit_temporal_correlation": value})
    if not scores:
        raise ValueError("No alignment with valid bounds and nonzero temporal content")
    scores.sort(key=lambda row: (-row["fit_temporal_correlation"], row["offset_frames"]))
    return scores, first, second


def read_region(path, start, stop, plan):
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    rows = []
    x0, y0, x1, y1 = plan["region_xyxy_analysis_px"]
    for _ in range(start, stop + 1):
        ok, frame = cap.read()
        if not ok:
            raise ValueError("Missing decoded frame in repeated-content interval")
        gray = cv2.cvtColor(cv2.resize(frame, tuple(plan["analysis_size"])), cv2.COLOR_BGR2GRAY)
        rows.append(cv2.resize(gray[y0:y1, x0:x1], tuple(plan["descriptor_size"]), interpolation=cv2.INTER_AREA))
    cap.release()
    return np.asarray(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if (args.out / "repeat-report.json").exists() or (args.out / "frame-pairs.csv").exists():
        parser.error("Choose a new output version; preserve existing evidence")
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    source_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
    if source_hash != plan["input_sha256"]:
        raise ValueError("Input differs from the frozen source")
    start, stop = plan["reference_frames_inclusive"]
    repeat_start, repeat_stop = plan["repeat_search_frames_inclusive"]
    first = read_region(args.input, start, stop, plan)
    second = read_region(args.input, repeat_start, repeat_stop, plan)
    fit_indices = np.arange(0, len(first), 2)
    check_indices = np.arange(1, len(first), 2)
    low, high = plan["offset_search_inclusive"]
    scores, moving_first, moving_second = align_content(first, second, start, repeat_start, range(low, high + 1), fit_indices)
    best = scores[0]
    offset = best["offset_frames"]
    target_indices = start + check_indices + offset - repeat_start
    ordered = correlation(moving_first[check_indices], moving_second[target_indices])
    reversed_score = correlation(moving_first[check_indices], moving_second[target_indices[::-1]])
    rng = np.random.default_rng(plan["random_seed"])
    shuffled = [correlation(moving_first[check_indices], moving_second[rng.permutation(target_indices)]) for _ in range(plan["shuffle_controls"])]
    shuffled = [value for value in shuffled if value is not None]
    if ordered is None or reversed_score is None or len(shuffled) != plan["shuffle_controls"]:
        raise ValueError("Content has insufficient temporal energy for the declared controls")
    # Conservative grouping is a leakage precaution, not proof of editorial
    # replay, original camera FPS, absolute timestamps or real-time playback.
    supported = ordered >= plan["minimum_check_correlation"] and ordered - max(shuffled + [reversed_score]) >= plan["minimum_control_margin"]
    pairs = []
    for index in range(len(first)):
        target = start + index + offset - repeat_start
        pairs.append({"reference_frame": start + index, "repeat_frame": repeat_start + target,
                      "role": "offset_fit" if index % 2 == 0 else "order_check",
                      "mean_absolute_gray_difference": float(np.mean(np.abs(first[index].astype(float) - second[target].astype(float)))),
                      "same_shot_group_id": plan["same_shot_group_id"] if supported else "unresolved"})
    result = {
        "status": "ordered_repeated_content_supported" if supported else "repeat_alignment_inconclusive",
        "input_sha256": source_hash, "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "plan_sha256": hashlib.sha256(args.plan.read_bytes()).hexdigest(), "plan": plan,
        "tool_versions": {"opencv": cv2.__version__, "numpy": np.__version__},
        "best_alignment": best, "top_offset_candidates": scores[:7],
        "order_check": {"frames": len(check_indices), "ordered_correlation": ordered, "reversed_correlation": reversed_score,
                        "shuffled_max_correlation": max(shuffled), "shuffled_median_correlation": float(np.median(shuffled)),
                        "grouping_rule_passed": supported},
        "matched_frame_count": len(pairs),
        "paired_reference_frames_inclusive": [pairs[0]["reference_frame"], pairs[-1]["reference_frame"]],
        "paired_repeat_frames_inclusive": [pairs[0]["repeat_frame"], pairs[-1]["repeat_frame"]],
        "grouping_recommendation": "Keep both occurrences, overlapping pilot-001 material and the intervening views in the same shot group; never split them across training and validation." if supported else "Retain conservative suspected-repeat grouping until reviewed.",
        "metric_calibration_approved": False, "physics_fit_approved": False, "game_parameters_changed": False,
        "limitations": ["Checks cached decoded content only; does not prove editorial replay, wall-clock speed, original FPS or absolute source time.",
                        "Alternating frames check temporal order, not independent-shot or external validation; nearby frames are correlated.",
                        "The moving ROI was declared using previous visual inspection; this is a targeted duplicate audit, not blind whole-video discovery.",
                        "Original timestamps and held frames are preserved; frame-pair offset is not elapsed physical shot time."]}
    args.out.mkdir(parents=True, exist_ok=True)
    with (args.out / "frame-pairs.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(pairs[0]))
        writer.writeheader()
        writer.writerows(pairs)
    cap = cv2.VideoCapture(str(args.input))
    tiles = []
    x0, y0, x1, y1 = plan["region_xyxy_analysis_px"]
    for source_frame in plan["visual_reference_frames"]:
        row = []
        for frame_index in (source_frame, source_frame + offset):
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ok, image = cap.read()
            if not ok:
                raise ValueError("Missing alignment visual reference")
            image = cv2.resize(image, tuple(plan["analysis_size"]))
            cv2.rectangle(image, (x0, y0), (x1, y1), (0, 255, 255), 2)
            cv2.putText(image, f"CACHED CLIP FRAME {frame_index} - content comparison only", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 255, 255), 2)
            row.append(cv2.resize(image, (640, 360)))
        tiles.append(np.hstack(row))
    cap.release()
    cv2.imwrite(str(args.out / "repeat-reference.jpg"), np.vstack(tiles))
    (args.out / "repeat-report.json").write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({key: result[key] for key in ("status", "best_alignment", "order_check", "matched_frame_count", "paired_repeat_frames_inclusive")}, indent=2))


if __name__ == "__main__":
    main()
