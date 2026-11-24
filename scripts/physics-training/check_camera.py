"""Test a camera hypothesis with held-out landmarks, never approve it by corner fit alone."""

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


def transform_points(points, matrix):
    return cv2.perspectiveTransform(np.asarray(points, dtype=np.float64).reshape(-1, 1, 2), matrix).reshape(-1, 2)


def camera_flow(input_path, start_frame, end_frame, width, height):
    cap = cv2.VideoCapture(str(input_path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    ok, first = cap.read()
    if not ok:
        raise ValueError("Cannot decode camera stability reference")
    gray = cv2.cvtColor(cv2.resize(first, (width, height)), cv2.COLOR_BGR2GRAY)
    mask = np.zeros(gray.shape, np.uint8)
    mask[30:220, 350:950] = 255  # Fixed sponsor sign, outside table and players.
    points = cv2.goodFeaturesToTrack(gray, maxCorners=150, qualityLevel=.03, minDistance=10, mask=mask)
    if points is None:
        return {"status": "no_reference_features"}
    measured = []
    for frame_index in range(start_frame + 1, end_frame + 1):
        ok, frame = cap.read()
        if not ok:
            raise ValueError("Camera stability interval could not be decoded fully")
        current = cv2.cvtColor(cv2.resize(frame, (width, height)), cv2.COLOR_BGR2GRAY)
        moved, status, _ = cv2.calcOpticalFlowPyrLK(gray, current, points, None)
        if moved is None or status is None:
            continue
        valid = status.ravel() == 1
        displacement = (moved - points).reshape(-1, 2)[valid]
        if len(displacement) >= 20:
            shift = np.median(displacement, axis=0)
            spread = np.linalg.norm(displacement - shift, axis=1)
            measured.append({"frame": frame_index, "features": len(displacement), "dx_px": float(shift[0]),
                             "dy_px": float(shift[1]), "median_residual_px": float(np.median(spread))})
    cap.release()
    shifts = [float(np.hypot(row["dx_px"], row["dy_px"])) for row in measured]
    return {"status": "measured" if measured else "insufficient_features", "reference_frame": start_frame,
            "reference_region_analysis_px": [350, 30, 950, 220], "measured_frames": len(measured),
            "median_shift_px": float(np.median(shifts)) if shifts else None,
            "p95_shift_px": float(np.percentile(shifts, 95)) if shifts else None,
            "maximum_shift_px": max(shifts) if shifts else None, "frames": measured,
            "limitation": "Checks this short fragment and static sign only; not full lens/camera calibration."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--observations", type=Path, required=True)
    parser.add_argument("--hypothesis", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if (args.out / "camera-report.json").exists():
        parser.error("Choose a new output version; previous reports are preserved")
    args.out.mkdir(parents=True, exist_ok=True)
    input_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
    validation = json.loads((args.observations.parent / "validation.json").read_text(encoding="utf-8"))
    if validation["input_sha256"] != input_hash:
        raise ValueError("Camera source media differs from the validated observations")
    hypothesis = json.loads(args.hypothesis.read_text(encoding="utf-8"))
    corners = np.array(hypothesis["boundary_corners_px"], np.float32)
    table_width = hypothesis["hypothesized_dimensions_m"]["width"]
    table_length = hypothesis["hypothesized_dimensions_m"]["length"]
    world_corners = np.array([[0, 0], [table_width, 0], [table_width, table_length], [0, table_length]], np.float32)
    matrix = cv2.getPerspectiveTransform(corners, world_corners)
    landmark_rows = []
    for landmark in hypothesis["held_out_landmarks"]:
        position = transform_points([landmark["image_px"]], matrix)[0]
        residual = float(np.linalg.norm(position - landmark["hypothesized_world_m"]))
        landmark_rows.append({**landmark, "conditional_world_m": position.tolist(), "residual_m": residual})
    with args.observations.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    image_points = [[float(row["x_px"]), float(row["y_px"])] for row in rows]
    positions = transform_points(image_points, matrix)
    rng = np.random.default_rng(20261124)
    estimates = []
    for _ in range(500):
        sample_corners = (corners + rng.normal(0, hypothesis["corner_jitter_sigma_px"], corners.shape)).astype(np.float32)
        sample_matrix = cv2.getPerspectiveTransform(sample_corners, world_corners)
        estimates.append(transform_points([image_points[0], image_points[-1]], sample_matrix))
    displacement_samples = np.array([np.linalg.norm(points[1] - points[0]) for points in estimates])
    with (args.out / "conditional-positions.csv").open("w", encoding="utf-8", newline="") as handle:
        fields = ["frame", "clip_pts_s", "source_time_estimate_s", "near_hold_group", "x_m_hypothesis", "z_m_hypothesis"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row, point in zip(rows, positions):
            writer.writerow({**{key: row[key] for key in fields[:4]}, "x_m_hypothesis": point[0], "z_m_hypothesis": point[1]})
    start_frame, end_frame = int(rows[0]["frame"]), int(rows[-1]["frame"])
    image_width, image_height = hypothesis["image_width"], hypothesis["image_height"]
    stability = camera_flow(args.input, start_frame, end_frame, image_width, image_height)
    cap = cv2.VideoCapture(str(args.input))
    cap.set(cv2.CAP_PROP_POS_FRAMES, hypothesis["reference_frame"])
    ok, reference = cap.read()
    cap.release()
    if not ok:
        raise ValueError("Camera reference frame missing")
    reference = cv2.resize(reference, (image_width, image_height))
    annotated = reference.copy()
    cv2.polylines(annotated, [corners.astype(np.int32)], True, (0, 220, 255), 2)
    cv2.polylines(annotated, [np.array(image_points, np.int32)], False, (0, 255, 0), 2)
    for index, point in enumerate(corners.astype(int)):
        cv2.putText(annotated, f"corner {index + 1}", tuple(point + [4, -10]), cv2.FONT_HERSHEY_SIMPLEX, .5, (0, 220, 255), 1)
    for landmark in hypothesis["held_out_landmarks"]:
        point = tuple(landmark["image_px"])
        cv2.circle(annotated, point, 7, (255, 0, 255), 2)
    cv2.putText(annotated, "HYPOTHESIS ONLY - METRIC CALIBRATION NOT APPROVED", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, .7, (0, 220, 255), 2)
    cv2.imwrite(str(args.out / "camera-diagnostic.jpg"), annotated)
    scale = 250
    rectified = cv2.warpPerspective(reference, np.diag([scale, scale, 1.]) @ matrix,
                                    (round(table_width * scale), round(table_length * scale)))
    cv2.polylines(rectified, [(positions * scale).astype(np.int32)], False, (0, 255, 0), 2)
    cv2.line(rectified, (0, round(table_length / 2 * scale)), (rectified.shape[1] - 1, round(table_length / 2 * scale)), (255, 0, 255), 1)
    cv2.imwrite(str(args.out / "rectified-hypothesis.jpg"), rectified)
    max_residual = max(row["residual_m"] for row in landmark_rows)
    report = {
        "status": "conditional_camera_hypothesis_evaluated_not_approved",
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "input_sha256": input_hash,
        "hypothesis": hypothesis, "homography_image_to_conditional_m": matrix.tolist(),
        "held_out_landmarks": landmark_rows,
        "maximum_landmark_residual_m": max_residual,
        "proposed_landmark_gate_passed": max_residual <= hypothesis["proposed_landmark_gate_m"],
        "camera_stability": {key: value for key, value in stability.items() if key != "frames"},
        "conditional_track_displacement_m": float(np.linalg.norm(positions[-1] - positions[0])),
        "corner_jitter_sensitivity": {
            "draws": 500, "random_seed": 20261124,
            "displacement_m_p05_p50_p95": np.percentile(displacement_samples, [5, 50, 95]).tolist(),
            "note": "Only chosen corner perturbations; NOT a confidence interval for true metric distance. Does not include unknown plane, distortion, table dimensions or timing."
        },
        "metric_calibration_approved": False, "physics_fit_approved": False,
        "reason": "Approximate boundary and held-out correspondences, uncorrected ball-center height and lens distortion; real-time cadence/phase unverified.",
        "game_parameters_changed": False
    }
    (args.out / "camera-flow.json").write_text(json.dumps(stability, indent=2), encoding="utf-8")
    (args.out / "camera-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
