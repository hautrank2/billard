# Follow-up validation: cadence, centers and camera

## Result

2026-11-24 (Asia/Bangkok): follow-up audit completed locally. **Metric calibration and game-physics fitting remain unapproved.** No additional media downloads, external paid model calls, dependency installs or game coefficient changes were made in this stage.

Read this file after `JD9sXxrFhdA-2026-11-24.md`. Latest reproducible artifacts are `pilot-002/validation-002/` and `pilot-002/camera-002/` under `artifacts/physics-training/JD9sXxrFhdA/`.

## Inputs and provenance

- Media: `pilot-002/media/source.mp4`, SHA-256 `90cb0c00f87f446cfa0a7ddb84daf48d699d96e94918adee334244696d7f1696`.
- Selection: `pilot-002/curated-cue-fragment/selected-track.csv`, track 60, frames 123–217, 95 observations over 1.566667 seconds.
- Analysis coordinates: 1280x720. Native video: 1920x1080, nominal 60 fps.
- Requested source times remain approximate: 00:22:48.050–00:22:49.617. The original acquisition re-encoded the section; decoded PTS are not independent proof of original real-time cadence.
- New validation scripts check source hashes against upstream metadata and record their own source SHA-256. They preserve completed reports; use a new version directory to rerun.

## What was done

1. Compared decoded consecutive images in a fixed image ROI around the motion, independent of recentering the detection patch. Computed exact full-frame hashes and near-hold sensitivity at multiple thresholds. Preserved all original PTS; did not squeeze time, fill gaps or fabricate missing motion.
2. Cross-checked color-segmentation centers with gradient-based Hough circles at native resolution. The search window/radius is seeded by the existing track. This is another algorithm, **not independent labels or ground truth**.
3. Measured camera displacement on a static sponsor-sign region outside the table/player area using optical flow from the first selected frame to every subsequent selected frame.
4. Built a conditional planar homography from four visually annotated cloth-boundary corners. Kept two side-pocket landmarks OUT of the fit for a consistency check. Produced diagnostic overlays, a rectified hypothesis image and conditional coordinates.
5. Perturbed the four corners by 3 px Gaussian noise, 500 samples with fixed seed 20261124, to assess corner sensitivity only. Did not treat this narrow sensitivity as total physical uncertainty.
6. Saved stage-001 reports first. Added source-hash and coordinate-frame guards, then ran the same bounded validation into stage-002. Measurements reproduced. Stage-002 is the handoff version; stage-001 artifacts preserve the earlier experiment and manual camera reference grid/hypothesis.

## Cadence findings

- All 95 full-frame hashes differ; the frames are not byte-identical copies.
- 32 of 94 adjacent pairs have fixed-ROI mean absolute BGR difference <=0.2 on the 0..255 scale.
- All 32 of those pairs also have zero x displacement in the tracked cue-ball center. This is evidence of held/near-repeated motion content, with encoding noise; it is not proof of its origin.
- Near-hold pairs at thresholds 0.05 / 0.1 / 0.2 / 0.3: **26 / 31 / 32 / 32**. At 0.2 the sequence forms 63 provisional content groups.
- Do not report this as a verified 40 fps recording or as 63 independent ground-truth positions. Motion content, broadcast conversions, replay speed, missing source frames and contour quantization still need separation.
- `validation-002/observations.csv` retains 95 rows and original PTS, adds near-hold group IDs, image differences and edge-detector observations. Use actual timestamps and interval uncertainty in later fitting, never a constant time step after dropping held frames.

## Center consistency findings

- Hough circle check found a nearby candidate on **86/95 frames**; 9 have no accepted edge-circle observation.
- Color vs edge-center difference at analysis resolution: median **2.789 px**, p95 **3.972 px**, maximum **4.365 px**.
- These numbers measure disagreement between two detectors. They are NOT localization error against truth. Circle edges, shadows, partial ball contours, blur and seeding can create shared or different biases.
- Prior visual review of five samples establishes plausible identity only. Independent manual centers/visibility labels on a fresh sample, followed by denser labels if needed, are still required before claiming accuracy or tuning a detector against these data.

## Camera findings

- Static sign optical flow measured all 94 subsequent frames: median global shift **0.0292 px**, p95 **0.0368 px**, maximum **0.0370 px** relative to frame 123. This supports camera stability for this 1.57-second fragment and this reference region only.
- Metric size hypothesis: 1.27m x 2.54m, the standard 9ft playing-surface size supported by [Predator's APEX 9ft documentation](https://int.predatorcues.com/pages/predator-apex-9ft-professional-table). Exact equipment in this video remains unverified. Dimensions happen to match the game's `TABLE`, which alone is not evidence about the video.
- Approximate boundary corners at 1280x720: `[459,267]`, `[868,267]`, `[957,550]`, `[383,550]`. These are visible cloth-boundary estimates, not surveyed cushion-nose or ball-center-plane points.
- Held-out pocket-gap points: `[424,377]` and `[912,377]`, hypothesized at left/right half-length. Conditional residuals: **0.0737m and 0.0765m**, failing the proposed 0.03m pilot gate. The landmarks and gate are approximate engineering choices, not certified measurement standards.
- Conditional endpoint displacement: **0.8069m**. Corner-perturbation p05/p50/p95: **0.7971 / 0.8072 / 0.8174m**. These are hypothesis outputs, NOT approved real-world distance or confidence bounds. They omit boundary-plane error, ball-center elevation/parallax, lens distortion, size uncertainty and timing uncertainty.
- The rectified image visibly stretches spherical balls. Planar rectification does not turn their 3D silhouettes into physical plan-view discs. Do not estimate metric ball radii or spin from that rectified image.
- A four-corner fit has no independent accuracy test at its fitted corners. The held-out landmark mismatch is the reason not to approve this homography for physics fitting.

## Commands

From the workspace root, using already-installed local dependencies:

```powershell
python scripts/physics-training/validate_fragment.py --input artifacts/physics-training/JD9sXxrFhdA/pilot-002/media/source.mp4 --selection artifacts/physics-training/JD9sXxrFhdA/pilot-002/curated-cue-fragment --out artifacts/physics-training/JD9sXxrFhdA/pilot-002/validation-002
python scripts/physics-training/check_camera.py --input artifacts/physics-training/JD9sXxrFhdA/pilot-002/media/source.mp4 --observations artifacts/physics-training/JD9sXxrFhdA/pilot-002/validation-002/observations.csv --hypothesis artifacts/physics-training/JD9sXxrFhdA/pilot-002/validation-001/camera-hypothesis.json --out artifacts/physics-training/JD9sXxrFhdA/pilot-002/camera-002
python scripts/physics-training/test_pipeline.py
python -m py_compile scripts/physics-training/validate_fragment.py scripts/physics-training/check_camera.py
```

Those output directories now exist, so reuse their reports or choose `validation-003` / `camera-003` for a new experiment. Do not overwrite the current evidence.

## Validation and remaining work

- Nine regression tests passed, including hold grouping, featureless/clean-circle edge checks, and a synthetic perspective round trip. Synthetic checks validate behavior of the tools, not real-video accuracy.
- Python compilation checks passed. Diagnostic camera/rectified images inspected.
- No new application changes; no Next.js build or MongoDB tests were necessary for this isolated Python follow-up.
- Next concrete experiment: independently annotate cue-ball centers/visibility on raw image samples; distinguish silhouette/edge/color biases. Check the original source cadence and replay status. Improve camera geometry using points with known physical correspondences and consistent height/plane, then test on additional held-out landmarks or a separate camera view. Do not turn held-out landmarks into fit points and reuse them as validation.
- Reuse the existing overhead interval (pilot-002 frames 428–608) if a cross-view geometric check is developed; do not assume stationary or matching balls without explicit correspondence labels. There is no need to download more video merely to repeat current failed checks.
- No friction, restitution, spin or power-curve estimate has been promoted. A rolling/sliding phase and spin are not identified by this track alone.
