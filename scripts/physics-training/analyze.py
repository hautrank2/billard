"""Provisional pixel tracking and scene QA, not metric physics calibration."""

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".training-tools"))

import cv2
import numpy as np


def table_mask(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    # This baseline is specific to blue/cyan cloth. Do not use for arbitrary tables.
    cloth = cv2.inRange(hsv, (80, 90, 55), (115, 255, 255))
    merged = cv2.morphologyEx(cloth, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    contours, _ = cv2.findContours(merged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, None, hsv
    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < frame.shape[0] * frame.shape[1] * .07:
        return None, None, hsv
    hull = cv2.convexHull(contour)
    polygon = cv2.approxPolyDP(hull, .02 * cv2.arcLength(hull, True), True)
    mask = np.zeros(cloth.shape, np.uint8)
    cv2.fillConvexPoly(mask, hull, 255)
    # Rail-adjacent balls are intentionally excluded in this initial baseline.
    mask = cv2.erode(mask, np.ones((15, 15), np.uint8))
    return mask, polygon, hsv


def detect_balls(hsv, mask):
    cloth = cv2.inRange(hsv, (80, 90, 55), (115, 255, 255))
    foreground = cv2.bitwise_and(cv2.bitwise_not(cloth), mask)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(foreground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    detections = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if not 10 <= area <= 650:
            continue
        perimeter = cv2.arcLength(contour, True)
        x, y, width, height = cv2.boundingRect(contour)
        circularity = 4 * math.pi * area / max(perimeter ** 2, 1)
        if not .55 <= width / height <= 1.8 or circularity < .45:
            continue
        (cx, cy), radius = cv2.minEnclosingCircle(contour)
        if not 2 <= radius <= 18:
            continue
        color = np.median(hsv[y:y + height, x:x + width].reshape(-1, 3), axis=0)
        detections.append({"x": float(cx), "y": float(cy), "radius": float(radius), "color": color})
    return detections


def assign_tracks(active, detections, frame_index, next_id):
    """Short-lived IDs only; no association across missing detections or cuts."""
    candidates = []
    for track_id, track in active.items():
        last = track[-1]
        if last["frame"] != frame_index - 1:
            continue
        vx = last["x"] - track[-2]["x"] if len(track) > 1 else 0
        vy = last["y"] - track[-2]["y"] if len(track) > 1 else 0
        for index, detection in enumerate(detections):
            distance = math.hypot(detection["x"] - last["x"] - vx, detection["y"] - last["y"] - vy)
            hue_difference = abs(float(detection["color"][0] - last["color"][0]))
            hue_difference = min(hue_difference, 180 - hue_difference)
            saturation_difference = abs(float(detection["color"][1] - last["color"][1]))
            if distance <= max(14, last["radius"] * 5) and saturation_difference < 120:
                candidates.append((distance + hue_difference * .2 + saturation_difference * .03, track_id, index))
    used_tracks, used_detections, matches = set(), set(), []
    for _, track_id, index in sorted(candidates):
        if track_id not in used_tracks and index not in used_detections:
            matches.append((track_id, index))
            used_tracks.add(track_id)
            used_detections.add(index)
    for index in range(len(detections)):
        if index not in used_detections:
            matches.append((next_id, index))
            next_id += 1
    for track_id, index in matches:
        detection = {**detections[index], "frame": frame_index, "track_id": track_id}
        active.setdefault(track_id, []).append(detection)
    return matches, next_id


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source-start", type=float, default=0)
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--roi", type=Path, help="Optional manually reviewed cloth polygon for this camera only")
    args = parser.parse_args()
    if (args.out / "report.json").exists():
        parser.error("This analysis already has a report; choose a new version directory.")
    args.out.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    capture = cv2.VideoCapture(str(args.input))
    if not capture.isOpened():
        raise RuntimeError(f"Cannot decode {args.input}")
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    source_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    expected_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if fps <= 0 or expected_frames <= 0 or source_width <= 0 or source_height <= 0:
        raise RuntimeError("Missing video dimensions, frame count or FPS")
    if expected_frames / fps > 60.1:
        raise ValueError("This pilot is limited to 60-second clips; do not process a full match here")
    width = min(args.width, source_width)
    height = round(source_height * width / source_width)
    roi = json.loads(args.roi.read_text(encoding="utf-8")) if args.roi else None
    fixed_mask, fixed_polygon = None, None
    if roi:
        if roi["width"] != width or roi["height"] != height:
            raise ValueError("ROI dimensions must match analysis dimensions")
        fixed_polygon = np.array(roi["points"], np.int32).reshape(-1, 1, 2)
        fixed_mask = np.zeros((height, width), np.uint8)
        cv2.fillConvexPoly(fixed_mask, fixed_polygon, 255)
        fixed_mask = cv2.erode(fixed_mask, np.ones((9, 9), np.uint8))
    writer = cv2.VideoWriter(str(args.out / "tracking-preview.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError("Cannot create tracking preview")
    active, completed, next_id = {}, [], 1
    scene_id, last_mask, last_small, last_has_table = 0, None, None, False
    table_frames, cut_frames, frame_index, rows = 0, [], 0, 0
    samples, scene_rows, timestamps, movement_rows = [], [], [], []
    sample_interval = max(1, round(fps * 3))
    with (args.out / "tracks.csv").open("w", newline="", encoding="utf-8") as handle:
        csv_writer = csv.writer(handle)
        csv_writer.writerow(["frame", "clip_pts_s", "source_time_estimate_s", "scene_id", "track_id", "x_px", "y_px", "radius_px"])
        while True:
            ok, original = capture.read()
            if not ok:
                break
            frame = cv2.resize(original, (width, height), interpolation=cv2.INTER_AREA)
            pts = capture.get(cv2.CAP_PROP_POS_MSEC) / 1000
            timestamps.append(pts)
            mask, polygon, hsv = table_mask(frame)
            if fixed_mask is not None and mask is not None:
                coverage = np.count_nonzero(cv2.bitwise_and(mask, fixed_mask)) / np.count_nonzero(fixed_mask)
                # A different view or severe occlusion invalidates this ROI.
                if coverage < .8:
                    mask, polygon = None, None
                else:
                    mask, polygon = cv2.bitwise_and(mask, fixed_mask), fixed_polygon
            small = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (160, 90))
            difference = float(np.mean(cv2.absdiff(small, last_small))) if last_small is not None else 0
            overlap = 1.0
            if mask is not None and last_mask is not None:
                union = np.count_nonzero(cv2.bitwise_or(mask, last_mask))
                overlap = np.count_nonzero(cv2.bitwise_and(mask, last_mask)) / max(1, union)
            cut = frame_index > 0 and (difference > 32 or (difference > 12 and overlap < .65))
            boundary = cut or (mask is not None) != last_has_table
            if boundary:
                completed.extend(active.values())
                active = {}
                scene_id += 1
            if cut:
                cut_frames.append(frame_index)
            detections = detect_balls(hsv, mask) if mask is not None else []
            matched, next_id = assign_tracks(active, detections, frame_index, next_id)
            visible_ids = set()
            moving = 0
            for track_id, _ in matched:
                track = active[track_id]
                detection = track[-1]
                visible_ids.add(track_id)
                x, y = round(detection["x"]), round(detection["y"])
                csv_writer.writerow([frame_index, round(pts, 6), round(args.source_start + pts, 6), scene_id,
                                     track_id, round(detection["x"], 3), round(detection["y"], 3), round(detection["radius"], 3)])
                rows += 1
                color = (0, 255, 255)
                if len(track) >= 7:
                    displacement = math.hypot(detection["x"] - track[-7]["x"], detection["y"] - track[-7]["y"])
                    if displacement > 3:
                        moving += 1
                        color = (0, 80, 255)
                cv2.circle(frame, (x, y), round(detection["radius"]) + 2, color, 1)
                cv2.putText(frame, str(track_id), (x + 8, y), cv2.FONT_HERSHEY_SIMPLEX, .4, color, 1)
                points = np.array([(round(item["x"]), round(item["y"])) for item in track[-45:]], np.int32)
                if len(points) > 1:
                    cv2.polylines(frame, [points], False, color, 1)
            for track_id in list(active):
                if track_id not in visible_ids:
                    completed.append(active.pop(track_id))
            if mask is not None:
                table_frames += 1
                cv2.polylines(frame, [polygon], True, (0, 255, 0), 2)
            label = f"clip {pts:.2f}s | source ~{args.source_start + pts:.2f}s | scene {scene_id} | detections {len(detections)}"
            cv2.putText(frame, label, (15, 25), cv2.FONT_HERSHEY_SIMPLEX, .52, (255, 255, 255), 1)
            cv2.putText(frame, "PROVISIONAL PIXEL TRACKS - NOT METRIC CALIBRATION", (15, height - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, .5, (0, 220, 255), 1)
            writer.write(frame)
            if frame_index % sample_interval == 0:
                samples.append(cv2.resize(frame, (480, 270)))
            scene_rows.append({"frame": frame_index, "clip_pts_s": round(pts, 6), "scene_id": scene_id,
                               "table_detected": mask is not None, "global_difference": round(difference, 3),
                               "table_mask_overlap": round(overlap, 3), "detections": len(detections), "cut_candidate": cut})
            movement_rows.append({"frame": frame_index, "moving_tracks": moving, "scene_id": scene_id})
            last_mask, last_small, last_has_table = mask, small, mask is not None
            frame_index += 1
    capture.release()
    writer.release()
    completed.extend(active.values())
    if not frame_index:
        raise RuntimeError("Video decoded zero frames")
    sheet = np.zeros((math.ceil(len(samples) / 3) * 270, 1440, 3), np.uint8)
    for index, sample in enumerate(samples):
        row, col = divmod(index, 3)
        sheet[row * 270:(row + 1) * 270, col * 480:(col + 1) * 480] = sample
    cv2.imwrite(str(args.out / "contact-sheet.jpg"), sheet)
    (args.out / "frames.json").write_text(json.dumps(scene_rows, indent=2), encoding="utf-8")
    (args.out / "motion.json").write_text(json.dumps(movement_rows, indent=2), encoding="utf-8")
    summaries = []
    for track in completed:
        if not track:
            continue
        xs, ys = [item["x"] for item in track], [item["y"] for item in track]
        summaries.append({"track_id": track[0]["track_id"], "start_frame": track[0]["frame"], "end_frame": track[-1]["frame"],
                          "observations": len(track), "duration_s": (len(track) - 1) / fps,
                          "extent_px": round(math.hypot(max(xs) - min(xs), max(ys) - min(ys)), 3)})
    (args.out / "track-summary.json").write_text(json.dumps(summaries, indent=2), encoding="utf-8")
    report = {
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "provisional_requires_visual_review",
        "input_sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "input": str(args.input), "decoded_width": source_width, "decoded_height": source_height,
        "analysis_width": width, "analysis_height": height, "fps": fps,
        "manual_roi": str(args.roi) if args.roi else None,
        "declared_frame_count": expected_frames, "decoded_frames": frame_index, "duration_s": frame_index / fps,
        "first_pts_s": timestamps[0], "last_pts_s": timestamps[-1],
        "timestamps_strictly_increasing": all(b > a for a, b in zip(timestamps, timestamps[1:])),
        "median_pts_step_s": statistics.median(b - a for a, b in zip(timestamps, timestamps[1:])),
        "source_start_estimate_s": args.source_start, "table_frames": table_frames,
        "table_frame_fraction": table_frames / frame_index, "scene_cut_candidates": cut_frames,
        "track_count": len(summaries), "detection_rows": rows,
        "tracks_at_least_one_second": sum(item["duration_s"] >= 1 for item in summaries),
        "tracks_moving_over_20px_and_one_second": sum(item["duration_s"] >= 1 and item["extent_px"] > 20 for item in summaries),
        "elapsed_processing_seconds": round(time.perf_counter() - started, 3),
        "versions": {"opencv": cv2.__version__, "numpy": np.__version__, "python": sys.version.split()[0]},
        "limitations": [
            "No labelled ground truth: counts and continuity are NOT accuracy or identity validation.",
            "Blue-cloth-specific color segmentation; similar-colored balls, occlusion, cue tips, shadows can cause errors.",
            "No ball-number/cue-ball classifier and no collision labels; IDs can swap during close encounters.",
            "No bridging across missed detections/camera cuts; track fragments deliberately remain separate.",
            "Table mask is not a calibrated cloth boundary; green outline is visualization only.",
            "No homography, lens/parallax correction, metric dimensions or spin estimation.",
            "Re-encoded clip timestamps do not establish original acquisition FPS, real-time replay rate, or exact source offset.",
            "Near-rail detections excluded; cannot use this baseline to fit cushion restitution.",
            "All game physics coefficients remain unchanged."
        ],
    }
    (args.out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
