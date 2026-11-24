"""Stress-test frozen two-view geometry; never select a model using held-out errors."""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import time

from calibrate_crossview import cv2, np, pose_candidates, transform


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fit_pair(config, end_corners, overhead_corners, end_points, overhead_points, fit_indices):
    """Only fit references enter selection, even when other points are available."""
    if not fit_indices or len(set(fit_indices)) != len(fit_indices):
        raise ValueError("Fit indices must be nonempty and unique")
    end_poses = pose_candidates(end_corners, config)
    overhead_poses = pose_candidates(overhead_corners, config)
    end_xy = np.array([transform(end_points, pose["inverse_ball_plane"]) for pose in end_poses])
    overhead_xy = np.array([transform(overhead_points, pose["inverse_ball_plane"]) for pose in overhead_poses])
    delta = end_xy[:, None, fit_indices, :] - overhead_xy[None, :, fit_indices, :]
    training_rms = np.sqrt(np.mean(np.sum(delta ** 2, axis=-1), axis=-1))
    penalty = config["joint_corner_penalty_m_per_px"] * (
        np.array([pose["corner_rms_px"] for pose in end_poses])[:, None]
        + np.array([pose["corner_rms_px"] for pose in overhead_poses])[None, :])
    scores = training_rms + penalty
    end_index, overhead_index = np.unravel_index(np.argmin(scores), scores.shape)
    selected = (end_poses[end_index], overhead_poses[overhead_index])
    return {"selected": selected, "training_rms_m": float(training_rms[end_index, overhead_index]),
            "training_score_m": float(scores[end_index, overhead_index]),
            "residuals_m": np.linalg.norm(end_xy[end_index] - overhead_xy[overhead_index], axis=1),
            "end_poses": end_poses, "overhead_poses": overhead_poses, "scores": scores}


def distribution(values):
    numbers = np.asarray(values, np.float64)
    if not numbers.size:
        return None
    if not np.isfinite(numbers).all():
        raise ValueError("Non-finite diagnostic values cannot be summarized")
    return {"count": len(numbers), "minimum": float(np.min(numbers)), "p05": float(np.percentile(numbers, 5)),
            "median": float(np.median(numbers)), "p95": float(np.percentile(numbers, 95)), "maximum": float(np.max(numbers))}


def near_best_displacements(fit, config, track_points):
    # Count each eligible end-view pose once, not once per compatible overhead
    # focal grid point. This is a solution envelope, not a posterior probability.
    scores = fit["scores"]
    eligible = np.any(scores <= float(scores.min()) + config["near_best_training_margin_m"], axis=1)
    values = []
    for pose, keep in zip(fit["end_poses"], eligible):
        if keep:
            endpoints = transform(track_points, pose["inverse_ball_plane"])
            values.append(float(np.linalg.norm(endpoints[1] - endpoints[0])))
    return {"unique_end_view_poses": len(values), "minimum_m_hypothesis": min(values),
            "maximum_m_hypothesis": max(values),
            "interpretation": "Endpoint chord under fit-compatible camera hypotheses; not distance travelled, speed or a confidence interval."}


def run_trials(config, labels, fit_indices, held_indices, track_points, plan):
    end_corners = np.asarray(config["end_boundary_corners_px"], np.float64)
    overhead_corners = np.asarray(config["overhead_boundary_corners_px"], np.float64)
    end_points = np.asarray([label["end_center_px"] for label in labels], np.float64)
    overhead_points = np.asarray([label["overhead_center_px"] for label in labels], np.float64)
    rng = np.random.default_rng(plan["random_seed"])
    rows, summaries = [], []
    for scenario in plan["scenarios"]:
        case_rows = []
        for trial in range(plan["trials_per_scenario"]):
            row = {"scenario": scenario["name"], "trial": trial, "accepted_pose_pair": False, "failure": ""}
            # Independent Gaussian pixel jitter is a stress-test assumption;
            # it does not assert a measured annotation-noise distribution.
            trial_end = end_corners + rng.normal(0, scenario["corner_sigma_px"], end_corners.shape)
            trial_over = overhead_corners + rng.normal(0, scenario["corner_sigma_px"], overhead_corners.shape)
            point_end = end_points + rng.normal(0, scenario["center_sigma_px"], end_points.shape)
            point_over = overhead_points + rng.normal(0, scenario["center_sigma_px"], overhead_points.shape)
            try:
                fit = fit_pair(config, trial_end, trial_over, point_end, point_over, fit_indices)
            except (ValueError, cv2.error, np.linalg.LinAlgError) as error:
                row["failure"] = type(error).__name__ + ": " + str(error).splitlines()[0]
            else:
                end_pose, over_pose = fit["selected"]
                endpoints = transform(track_points, end_pose["inverse_ball_plane"])
                held_max = float(np.max(fit["residuals_m"][held_indices]))
                row.update({"accepted_pose_pair": True, "training_rms_m": fit["training_rms_m"],
                            "held_out_max_residual_m": held_max,
                            "diagnostic_gate_passed": held_max <= config["proposed_crossview_gate_m"],
                            "end_focal_px": end_pose["focal_px"], "overhead_focal_px": over_pose["focal_px"],
                            "focal_boundary_hit": any(pose["grid_index"] in (0, config["focal_grid_px"]["steps"] - 1) for pose in fit["selected"]),
                            "endpoint_chord_m_hypothesis": float(np.linalg.norm(endpoints[1] - endpoints[0]))})
            rows.append(row)
            case_rows.append(row)
        valid = [row for row in case_rows if row["accepted_pose_pair"]]
        summaries.append({**scenario, "attempted": len(case_rows), "pose_pairs_available": len(valid),
                          "no_pose_pair": len(case_rows) - len(valid),
                          "diagnostic_gate_pass_count": sum(row["diagnostic_gate_passed"] for row in valid),
                          "focal_boundary_hit_count": sum(row["focal_boundary_hit"] for row in valid),
                          "held_out_max_residual_m": distribution([row["held_out_max_residual_m"] for row in valid]),
                          "endpoint_chord_m_hypothesis": distribution([row["endpoint_chord_m_hypothesis"] for row in valid])})
        print(json.dumps({"scenario": scenario["name"], "valid": len(valid), "trials": len(case_rows)}), flush=True)
    return rows, summaries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--references", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--observations", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if (args.out / "sensitivity-report.json").exists() or (args.out / "trials.csv").exists():
        parser.error("Use a new output version; existing measurements are immutable")
    started = time.perf_counter()
    config_path = args.references / "geometry-config.json"
    labels_path = args.references / "visual-labels.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    reference = json.loads(labels_path.read_text(encoding="utf-8"))
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    media_hash = sha256(args.input)
    validation_path = args.observations.parent / "validation.json"
    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    if any(item != media_hash for item in (reference["pilot_002_input_sha256"], baseline["input_sha256"], validation["input_sha256"])):
        raise ValueError("Source differs from frozen reference, baseline or observation provenance")
    if baseline["config"] != config:
        raise ValueError("Baseline configuration changed; do not audit a different hypothesis silently")
    if not 1 <= plan["trials_per_scenario"] <= 1000 or not plan["scenarios"]:
        raise ValueError("A bounded positive trial count and scenarios are required")
    names = [scenario["name"] for scenario in plan["scenarios"]]
    if len(set(names)) != len(names) or any(scenario[key] < 0 for scenario in plan["scenarios"] for key in ("corner_sigma_px", "center_sigma_px")):
        raise ValueError("Scenario names must be unique and jitter scales nonnegative")
    labels = reference["crossview_stationary_ball_correspondences"]
    fit_names, held_names = set(config["training_ball_names"]), set(config["held_out_ball_names"])
    if not fit_names or not held_names or fit_names & held_names or fit_names | held_names != {label["name"] for label in labels}:
        raise ValueError("Fit and held-out roles must be nonempty, disjoint and cover the labels")
    fit_indices = [index for index, label in enumerate(labels) if label["name"] in fit_names]
    held_indices = [index for index, label in enumerate(labels) if label["name"] in held_names]
    with args.observations.open(encoding="utf-8", newline="") as handle:
        observations = list(csv.DictReader(handle))
    times = np.array([float(row["clip_pts_s"]) for row in observations])
    if len(times) < 2 or not np.all(np.diff(times) > 0):
        raise ValueError("Observation timestamps must be strictly increasing")
    track_points = [[float(row["x_px"]), float(row["y_px"])] for row in (observations[0], observations[-1])]
    fit = fit_pair(config, config["end_boundary_corners_px"], config["overhead_boundary_corners_px"],
                   [label["end_center_px"] for label in labels], [label["overhead_center_px"] for label in labels], fit_indices)
    if not np.isclose(fit["training_score_m"], baseline["training_score_m"], rtol=0, atol=1e-10):
        raise ValueError("Frozen baseline score was not reproduced")
    rows, summaries = run_trials(config, labels, fit_indices, held_indices, track_points, plan)
    result = {
        "status": "frozen_geometry_sensitivity_audited_conditional_only",
        "source_id": reference["source_id"], "input_sha256": media_hash,
        "provenance_sha256": {"script": sha256(Path(__file__)), "camera_implementation": sha256(Path(__file__).with_name("calibrate_crossview.py")),
                              "plan": sha256(args.plan), "geometry_config": sha256(config_path), "visual_labels": sha256(labels_path),
                              "baseline_report": sha256(args.baseline), "observations": sha256(args.observations), "validation_report": sha256(validation_path)},
        "tool_versions": {"opencv": cv2.__version__, "numpy": np.__version__},
        "plan": plan, "baseline_reproduced": True,
        "baseline_held_out_max_residual_m": float(max(fit["residuals_m"][held_indices])),
        "frozen_crossview_gate_m": config["proposed_crossview_gate_m"],
        "near_best_fit_endpoint_chord": near_best_displacements(fit, config, track_points),
        "track_scope": {"frames": [int(observations[0]["frame"]), int(observations[-1]["frame"])],
                        "observations": len(observations), "elapsed_original_pts_s": float(times[-1] - times[0]),
                        "near_hold_groups": len({row["near_hold_group"] for row in observations}), "timestamps_resampled": False},
        "scenarios": summaries, "wall_seconds": time.perf_counter() - started,
        "metric_calibration_approved": False, "physics_fit_approved": False, "game_parameters_changed": False,
        "limitations": [
            "Gaussian jitter scales are declared stress assumptions, not measured error distributions; percentiles are not confidence intervals.",
            "Sampled pass counts are diagnostic outcomes, not a probability of calibration accuracy or approval.",
            "Trials without a valid camera pair are retained and counted; summaries of residuals condition on surviving pose pairs.",
            "Held-out points do not affect fit selection. They have now informed model diagnosis; future improvements require fresh validation points.",
            "Dimensions, radius, boundary plane, principal point, distortion and timing remain conditional or unverified.",
            "The endpoint chord varies only camera geometry; tracking errors and path curvature are not included, and no speed or friction is estimated.",
        ],
    }
    args.out.mkdir(parents=True, exist_ok=True)
    fields = ["scenario", "trial", "accepted_pose_pair", "failure", "training_rms_m", "held_out_max_residual_m", "diagnostic_gate_passed",
              "end_focal_px", "overhead_focal_px", "focal_boundary_hit", "endpoint_chord_m_hypothesis"]
    with (args.out / "trials.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    (args.out / "sensitivity-report.json").write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({"status": result["status"], "scenarios": summaries, "wall_seconds": result["wall_seconds"]}, indent=2))


if __name__ == "__main__":
    main()
