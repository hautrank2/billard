"""Compare planar and ball-height-aware two-view hypotheses using disjoint ball references."""

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


def transform(points, matrix):
    return cv2.perspectiveTransform(np.array(points, np.float64).reshape(-1, 1, 2), matrix).reshape(-1, 2)


def plane_matrix(intrinsic, rotation, translation, plane_height):
    return intrinsic @ np.column_stack([rotation[:, 0], rotation[:, 1], translation.ravel() + rotation[:, 2] * plane_height])


def pose_candidates(corners, config):
    w, length = config["table_width_m_hypothesis"], config["table_length_m_hypothesis"]
    world = np.array([[0, 0, 0], [w, 0, 0], [w, length, 0], [0, length, 0]], np.float64)
    image = np.array(corners, np.float64)
    width, height = config["analysis_size"]
    grid = config["focal_grid_px"]
    output = []
    for index, focal in enumerate(np.geomspace(grid["min"], grid["max"], grid["steps"])):
        intrinsic = np.array([[focal, 0, width / 2], [0, focal, height / 2], [0, 0, 1]], np.float64)
        ok, rotation_vector, translation = cv2.solvePnP(world, image, intrinsic, np.zeros(5), flags=cv2.SOLVEPNP_ITERATIVE)
        if not ok:
            continue
        rotation = cv2.Rodrigues(rotation_vector)[0]
        projected = cv2.projectPoints(world, rotation_vector, translation, intrinsic, np.zeros(5))[0].reshape(-1, 2)
        rms = float(np.sqrt(np.mean(np.sum((projected - image) ** 2, axis=1))))
        if rms > config["maximum_corner_rms_px"]:
            continue
        camera_center = (-rotation.T @ translation).ravel()
        # The sign follows the camera side of the plane; arbitrary table-axis
        # handedness must not put a ball underneath the cloth.
        ball_height = np.sign(camera_center[2]) * config["ball_radius_m_hypothesis"]
        matrix = plane_matrix(intrinsic, rotation, translation, ball_height)
        output.append({"focal_px": float(focal), "corner_rms_px": rms, "camera_center": camera_center.tolist(),
                       "ball_plane_height": float(ball_height), "inverse_ball_plane": np.linalg.inv(matrix),
                       "grid_index": index})
    if not output:
        raise ValueError("No camera pose passed the corner reprojection constraint")
    return output


def stability_checks(input_path, labels, config):
    cap = cv2.VideoCapture(str(input_path))
    results = []
    for view in ("end", "overhead"):
        frames = config[f"{view}_stability_frames"]
        cache = {}
        for index in frames:
            cap.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, frame = cap.read()
            if not ok:
                raise ValueError("Missing stationary-ball reference frame")
            cache[index] = cv2.cvtColor(cv2.resize(frame, tuple(config["analysis_size"])), cv2.COLOR_BGR2GRAY)
        reference_frame = 300 if view == "end" else 510
        for label in labels:
            x, y = map(round, label[f"{view}_center_px"])
            reference = cache[reference_frame][y - 13:y + 14, x - 13:x + 14]
            rows = []
            for index in frames:
                search = cache[index][y - 19:y + 20, x - 19:x + 20]
                response = cv2.matchTemplate(search, reference, cv2.TM_CCOEFF_NORMED)
                _, score, _, point = cv2.minMaxLoc(response)
                rows.append({"frame": index, "score": score, "shift_px": [point[0] - 6, point[1] - 6]})
            accepted = [row for row in rows if row["score"] >= .9]
            results.append({"view": view, "name": label["name"], "frames": rows,
                            "high_similarity_samples": len(accepted),
                            "max_shift_px_in_high_similarity_samples": max(float(np.hypot(*row["shift_px"])) for row in accepted) if accepted else None,
                            "stationary_support": len(accepted) >= 4 and all(np.hypot(*row["shift_px"]) <= 1 for row in accepted)})
    cap.release()
    return results


def serial_pose(pose):
    return {key: value.tolist() if isinstance(value, np.ndarray) else value for key, value in pose.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--references", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if (args.out / "crossview-report.json").exists():
        parser.error("Use a new version directory")
    args.out.mkdir(parents=True, exist_ok=True)
    config = json.loads((args.references / "geometry-config.json").read_text())
    reference = json.loads((args.references / "visual-labels.json").read_text())
    input_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
    if input_hash != reference["pilot_002_input_sha256"]:
        raise ValueError("Source differs from manually inspected references")
    labels = reference["crossview_stationary_ball_correspondences"]
    train_names, held_names = set(config["training_ball_names"]), set(config["held_out_ball_names"])
    if train_names & held_names or train_names | held_names != {label["name"] for label in labels}:
        raise ValueError("Training and held-out correspondence sets must be disjoint and cover the labelled balls")
    train_indices = [index for index, label in enumerate(labels) if label["name"] in train_names]
    held_indices = [index for index, label in enumerate(labels) if label["name"] in held_names]
    end_points = [label["end_center_px"] for label in labels]
    over_points = [label["overhead_center_px"] for label in labels]
    end_poses = pose_candidates(config["end_boundary_corners_px"], config)
    over_poses = pose_candidates(config["overhead_boundary_corners_px"], config)
    candidates = []
    for end_index, end in enumerate(end_poses):
        end_world = transform(end_points, end["inverse_ball_plane"])
        for over_index, over in enumerate(over_poses):
            over_world = transform(over_points, over["inverse_ball_plane"])
            errors = np.linalg.norm(end_world - over_world, axis=1)
            training_rms = float(np.sqrt(np.mean(errors[train_indices] ** 2)))
            score = training_rms + config["joint_corner_penalty_m_per_px"] * (end["corner_rms_px"] + over["corner_rms_px"])
            candidates.append((score, end_index, over_index, training_rms))
    candidates.sort()
    best_score, end_index, over_index, training_rms = candidates[0]
    end, over = end_poses[end_index], over_poses[over_index]
    end_world, over_world = transform(end_points, end["inverse_ball_plane"]), transform(over_points, over["inverse_ball_plane"])
    w, length = config["table_width_m_hypothesis"], config["table_length_m_hypothesis"]
    world_corners = np.array([[0, 0], [w, 0], [w, length], [0, length]], np.float32)
    floor_end = cv2.getPerspectiveTransform(np.array(config["end_boundary_corners_px"], np.float32), world_corners)
    floor_over = cv2.getPerspectiveTransform(np.array(config["overhead_boundary_corners_px"], np.float32), world_corners)
    baseline_errors = np.linalg.norm(transform(end_points, floor_end) - transform(over_points, floor_over), axis=1)
    errors = np.linalg.norm(end_world - over_world, axis=1)
    comparisons = [{"name": label["name"], "role": "fit" if index in train_indices else "held_out",
                    "planar_crossview_residual_m": float(baseline_errors[index]), "height_aware_crossview_residual_m": float(errors[index]),
                    "end_conditional_xy_m": end_world[index].tolist(), "overhead_conditional_xy_m": over_world[index].tolist()}
                   for index, label in enumerate(labels)]
    near_best = [row for row in candidates if row[0] <= best_score + config["near_best_training_margin_m"]]
    near_end_focals = [end_poses[row[1]]["focal_px"] for row in near_best]
    near_over_focals = [over_poses[row[2]]["focal_px"] for row in near_best]
    stationary = stability_checks(args.input, labels, config)
    cap = cv2.VideoCapture(str(args.input))
    tiles = []
    for view, index in (("end", 300), ("overhead", 510)):
        cap.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = cap.read()
        if not ok:
            raise ValueError("Missing diagnostic frame")
        frame = cv2.resize(frame, tuple(config["analysis_size"]))
        for label in labels:
            color = (0, 220, 255) if label["name"] in train_names else (255, 0, 255)
            point = tuple(label[f"{view}_center_px"])
            cv2.circle(frame, point, 14, color, 2)
            cv2.putText(frame, "FIT" if label["name"] in train_names else "CHECK", (point[0] + 15, point[1]), cv2.FONT_HERSHEY_SIMPLEX, .5, color, 1)
        cv2.putText(frame, "CONDITIONAL TWO-VIEW CHECK - NO VERIFIED METRIC SCALE", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 220, 255), 2)
        tiles.append(cv2.resize(frame, (960, 540)))
    cap.release()
    cv2.imwrite(str(args.out / "crossview-diagnostic.jpg"), np.vstack(tiles))
    result = {
        "status": "height_aware_crossview_model_evaluated_conditional_only", "input_sha256": input_hash,
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "config": config, "end_pose_hypothesis": serial_pose(end), "overhead_pose_hypothesis": serial_pose(over),
        "training_score_m": best_score, "training_rms_m": training_rms, "comparison": comparisons,
        "held_out_planar_max_residual_m": float(max(baseline_errors[held_indices])),
        "held_out_height_aware_max_residual_m": float(max(errors[held_indices])),
        "proposed_crossview_gate_passed": bool(max(errors[held_indices]) <= config["proposed_crossview_gate_m"]),
        "near_best_training_focal_ranges_px": {"end": [min(near_end_focals), max(near_end_focals)],
                                               "overhead": [min(near_over_focals), max(near_over_focals)],
                                               "candidate_pairs": len(near_best)},
        "focal_search_boundary_hit": end["grid_index"] in (0, config["focal_grid_px"]["steps"] - 1) or over["grid_index"] in (0, config["focal_grid_px"]["steps"] - 1),
        "stationary_reference_checks": stationary,
        "metric_calibration_approved": False, "physics_fit_approved": False, "game_parameters_changed": False,
        "limitations": config["limitations"] + ["Focal-grid selection uses two ball references; passing two other balls is a small conditional cross-view test, not external accuracy validation."]
    }
    (args.out / "crossview-report.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key not in ("config", "end_pose_hypothesis", "overhead_pose_hypothesis", "stationary_reference_checks")}, indent=2))


if __name__ == "__main__":
    main()
