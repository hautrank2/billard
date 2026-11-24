"""Small regression checks; synthetic fixtures do not measure real tracking accuracy."""

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("analyze", Path(__file__).with_name("analyze.py"))
analyze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analyze)
cv2, np = analyze.cv2, analyze.np


def load_module(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


validation = load_module("validate_fragment")
camera = load_module("check_camera")
references = load_module("audit_references")
crossview = load_module("calibrate_crossview")
sensitivity = load_module("audit_geometry_sensitivity")
repeats = load_module("audit_repeated_content")


def detection(x, y):
    return {"x": x, "y": y, "radius": 8, "color": np.array([10., 120., 180.])}


class PipelineTests(unittest.TestCase):
    def test_non_table_scene_is_rejected(self):
        frame = np.zeros((400, 600, 3), np.uint8)
        mask, polygon, _ = analyze.table_mask(frame)
        self.assertIsNone(mask)
        self.assertIsNone(polygon)

    def test_white_ball_detected_and_long_cue_shape_rejected(self):
        frame = np.zeros((400, 600, 3), np.uint8)
        cv2.rectangle(frame, (80, 60), (520, 340), (200, 140, 20), -1)
        cv2.circle(frame, (300, 200), 8, (240, 240, 240), -1)
        cv2.rectangle(frame, (150, 100), (220, 104), (230, 230, 230), -1)
        mask, _, hsv = analyze.table_mask(frame)
        balls = analyze.detect_balls(hsv, mask)
        self.assertEqual(len(balls), 1)
        self.assertAlmostEqual(balls[0]["x"], 300, delta=1)
        self.assertAlmostEqual(balls[0]["y"], 200, delta=1)

    def test_continuous_nearby_motion_keeps_short_lived_id(self):
        active = {}
        _, next_id = analyze.assign_tracks(active, [detection(100, 100)], 0, 1)
        matches, next_id = analyze.assign_tracks(active, [detection(103, 101)], 1, next_id)
        self.assertEqual(matches, [(1, 0)])
        self.assertEqual(len(active[1]), 2)
        self.assertEqual(next_id, 2)

    def test_missing_frame_never_gets_filled_with_invented_motion(self):
        active = {}
        _, next_id = analyze.assign_tracks(active, [detection(100, 100)], 0, 1)
        matches, _ = analyze.assign_tracks(active, [detection(102, 100)], 2, next_id)
        self.assertEqual(matches, [(2, 0)])
        self.assertEqual(len(active[1]), 1)

    def test_large_jump_is_not_associated(self):
        active = {}
        _, next_id = analyze.assign_tracks(active, [detection(100, 100)], 0, 1)
        matches, _ = analyze.assign_tracks(active, [detection(500, 300)], 1, next_id)
        self.assertEqual(matches, [(2, 0)])

    def test_hold_grouping_preserves_a_record_for_every_frame(self):
        groups = validation.grouped_frames([.02, .8, .03, .9], .2)
        self.assertEqual(groups, [0, 0, 1, 1, 2])
        self.assertEqual(len(groups), 5)

    def test_hough_center_check_rejects_a_featureless_patch(self):
        frame = np.zeros((100, 100, 3), np.uint8)
        self.assertIsNone(validation.compare_centers(frame, 50, 50, 12))

    def test_hough_center_check_matches_an_isolated_synthetic_circle(self):
        frame = np.zeros((100, 100, 3), np.uint8)
        frame[:] = (200, 140, 20)
        cv2.circle(frame, (50, 50), 12, (240, 240, 240), -1)
        result = validation.compare_centers(frame, 50, 50, 12)
        self.assertIsNotNone(result)
        self.assertLess(result[3], 2)

    def test_perspective_mapping_preserves_orientation_and_internal_points(self):
        world = np.array([[0, 0], [1.27, 0], [1.27, 2.54], [0, 2.54]], np.float32)
        image = np.array([[150, 50], [350, 50], [450, 350], [50, 350]], np.float32)
        forward = cv2.getPerspectiveTransform(world, image)
        reverse = cv2.getPerspectiveTransform(image, world)
        internal = np.array([[.1, .2], [.7, 1.27], [1.1, 2.2]])
        recovered = camera.transform_points(camera.transform_points(internal, forward), reverse)
        np.testing.assert_allclose(recovered, internal, atol=1e-6)

    def test_clock_quantization_keeps_real_time_feasible(self):
        interval = references.feasible_clock_rates([0, 2, 4, 6], [20, 18, 16, 14])
        self.assertIsNotNone(interval)
        self.assertLessEqual(interval[0], 1)
        self.assertGreaterEqual(interval[1], 1)
        self.assertGreater(interval[0], .5)

    def test_clock_reset_cannot_be_used_as_a_continuous_countdown(self):
        self.assertIsNone(references.feasible_clock_rates([0, 2, 4], [10, 8, 30]))

    def test_ball_height_projection_recovers_the_center_plane(self):
        intrinsic = np.array([[600., 0, 640], [0, 600, 360], [0, 0, 1]])
        rotation = np.eye(3)
        translation = np.array([0., 0, 5])
        # Camera is on negative plane-normal side; a raised ball has negative z.
        raised = crossview.plane_matrix(intrinsic, rotation, translation, -.1)
        floor = crossview.plane_matrix(intrinsic, rotation, translation, 0)
        physical = np.array([[.3, .7], [1., 1.5]])
        image = crossview.transform(physical, raised)
        corrected = crossview.transform(image, np.linalg.inv(raised))
        naive = crossview.transform(image, np.linalg.inv(floor))
        np.testing.assert_allclose(corrected, physical, atol=1e-8)
        self.assertGreater(np.linalg.norm(naive - physical), .01)

    def test_camera_pair_selection_cannot_use_held_out_coordinates(self):
        config = {"table_width_m_hypothesis": 1.27, "table_length_m_hypothesis": 2.54,
                  "ball_radius_m_hypothesis": .0286, "analysis_size": [1280, 720],
                  "focal_grid_px": {"min": 600, "max": 1200, "steps": 3},
                  "maximum_corner_rms_px": .001, "joint_corner_penalty_m_per_px": .002}
        corners = [[640, 360], [792.4, 360], [792.4, 664.8], [640, 664.8]]
        points = [[670, 390], [710, 440], [740, 480]]
        original = sensitivity.fit_pair(config, corners, corners, points, points, [0, 1])
        changed = sensitivity.fit_pair(config, corners, corners, points, points[:2] + [[10, 700]], [0, 1])
        self.assertEqual(original["training_score_m"], changed["training_score_m"])
        self.assertEqual([pose["focal_px"] for pose in original["selected"]],
                         [pose["focal_px"] for pose in changed["selected"]])
        self.assertGreater(changed["residuals_m"][2], original["residuals_m"][2] + .1)

    def test_near_best_chord_counts_each_end_pose_once(self):
        fit = {"scores": np.zeros((2, 3)), "end_poses": [
            {"inverse_ball_plane": np.eye(3)}, {"inverse_ball_plane": np.diag([2., 2., 1.])}]}
        result = sensitivity.near_best_displacements(fit, {"near_best_training_margin_m": .005}, [[0, 0], [1, 0]])
        self.assertEqual(result["unique_end_view_poses"], 2)
        self.assertEqual(result["minimum_m_hypothesis"], 1)
        self.assertEqual(result["maximum_m_hypothesis"], 2)

    def test_sensitivity_retains_failed_pose_trials_in_denominator(self):
        config = {"end_boundary_corners_px": [[0, 0]] * 4, "overhead_boundary_corners_px": [[0, 0]] * 4}
        labels = [{"end_center_px": [1, 2], "overhead_center_px": [3, 4]}]
        plan = {"random_seed": 1, "trials_per_scenario": 3,
                "scenarios": [{"name": "synthetic_failure", "corner_sigma_px": 1, "center_sigma_px": 0}]}
        with patch.object(sensitivity, "pose_candidates", side_effect=ValueError("No synthetic pose")):
            rows, summary = sensitivity.run_trials(config, labels, [0], [0], [[0, 0], [1, 1]], plan)
        self.assertEqual(len(rows), 3)
        self.assertEqual(summary[0]["no_pose_pair"], 3)
        self.assertEqual(summary[0]["pose_pairs_available"], 0)
        self.assertIsNone(summary[0]["held_out_max_residual_m"])
        self.assertTrue(all(row["failure"] for row in rows))

    def test_sensitivity_summary_rejects_nonfinite_results(self):
        with self.assertRaises(ValueError):
            sensitivity.distribution([1, np.nan])

    def test_repeated_motion_alignment_recovers_offset_despite_static_background(self):
        rng = np.random.default_rng(7)
        first = rng.normal(size=(20, 8, 10)).astype(np.float32)
        second = rng.normal(size=(26, 8, 10)).astype(np.float32)
        second[3:23] = first
        scores, _, _ = repeats.align_content(first + 100, second + 180, 100, 106, range(6, 13), np.arange(0, 20, 2))
        self.assertEqual(scores[0]["offset_frames"], 9)
        self.assertGreater(scores[0]["fit_temporal_correlation"], .9)
        self.assertGreater(scores[0]["fit_temporal_correlation"] - scores[1]["fit_temporal_correlation"], .5)

    def test_static_cloth_cannot_prove_repeated_motion(self):
        with self.assertRaises(ValueError):
            repeats.align_content(np.ones((20, 8, 10)), np.ones((26, 8, 10)), 100, 106, range(6, 13), np.arange(0, 20, 2))

    def test_out_of_bounds_repeat_offsets_are_rejected(self):
        rng = np.random.default_rng(9)
        with self.assertRaises(ValueError):
            repeats.align_content(rng.normal(size=(20, 8, 10)), rng.normal(size=(26, 8, 10)), 100, 106, [500], np.arange(0, 20, 2))


if __name__ == "__main__":
    unittest.main()
