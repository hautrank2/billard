# Raw reference labels, timing and two-view geometry

## Status and scope

2026-11-24 (Asia/Bangkok): completed all three authorized follow-up checks on cached video: cue-ball center references, timing evidence, and improved camera geometry using the overhead interval. **No game physics coefficients were modified.** No new video download, package installation or external paid model call was needed.

Latest artifacts under `artifacts/physics-training/JD9sXxrFhdA/pilot-002/`:

- `crossview-001/`: detector-free image references, approximate visual labels and the fixed geometric fit/check split.
- `reference-audit-001/reference-audit.json`: center-reference scores, shot-clock timing, cached-clip overlap alignment.
- `geometry-001/crossview-report.json`: two-view calibration hypothesis, stationary checks, selected poses, held-out residuals and limitations.

Read earlier pilot/validation logs for acquisition history. These results advance the measurement pipeline; they do not constitute a trained policy, a verified physical calibration or approved parameter tuning.

## Center-reference check

1. Exported raw frames 129, 139, 149, 159, 169, 179, 189, 199, 209 from pilot-002 at 1280x720. Used fixed crops with a coordinate grid; no detector center, radius, trajectory or recentered crop was displayed.
2. Visually estimated centers of the visible spherical body, excluding the lower cast shadow. Recorded labels in `crossview-001/visual-labels.json` before looking up algorithm coordinates for these frames. Estimated label uncertainty: **2.5 px**. These are same-agent approximate visual labels, not independent expert ground truth. Earlier generic tracking imagery had been seen, so this is detector-free reference annotation, not a double-blind evaluation.
3. Compared unchanged color tracking and the earlier Hough check against the frozen labels:

| Method | Samples | Median difference | Maximum difference |
| --- | ---: | ---: | ---: |
| Color segmentation | 9 | 1.1338 px | 2.0996 px |
| Edge/Hough circles | 9 | 2.3333 px | 2.7131 px |

Decision: color tracking agrees with these nine visual samples within the stated label uncertainty. Keep the original centers; do not apply an arbitrary 2.8 px correction based on the previous detector disagreement. This does not establish all-frame accuracy or superiority on a held-out dataset. Preserve failure/occlusion flags and source timestamps; do not invent missing samples. Earlier general tracking still has many false positives outside this curated fragment.

## Timing check

### Shot-clock reference

Visually read the countdown from pilot-001 at clip times 0, 2, 4, 6, 8, 10, 12, 14 seconds: **19, 18, 16, 14, 12, 9, 8, 6**. The image evidence is `crossview-001/shot-clock-reference.jpg`. No OCR result is being treated as fact.

The linear countdown slope is -0.97619 displayed seconds per video second. With a conservative +/-1-second allowance per displayed value, feasible countdown rates in the tested range are **0.875–1.0714 clock seconds per video second**. This supports approximately real-time playback for this pre-shot block. It does not prove exact wall-clock timing, 60 new motion samples per second, or normal speed for later replays. Do not rescale motion time by the fitted -0.97619 slope; the coarse display is too imprecise for that.

To reproduce the timer reference sheet, read pilot-001 frames `[0,120,240,360,480,600,720,840]`, resize each to 1280x720, crop `[y590:662,x0:70]`, resize each crop to 140x144, label frame/time and concatenate horizontally. `audit_references.py` records the frozen visual counts explicitly.

### Cached-clip alignment

Compared moving-player/cloth descriptors in the overlap, searching first-clip start frames 1440–1740 against pilot-002's first frames. Best match: **pilot-001 frame 1560**, exactly the expected 26 seconds x 60 fps offset. Compared 180 frames. Mean absolute grayscale descriptor difference: 0.9571; adjacent candidate offsets 1559/1561 scored 1.5542/1.5679. The near-best range with +0.2 difference allowance contains only frame 1560.

This validates relative alignment between the cached clips at the tested interval. It is not an independently verified absolute YouTube timestamp. Existing requested source-time estimates remain labelled as estimates.

The earlier finding remains: 32/94 adjacent cue-fragment pairs are near-held content. Those frames are not necessarily new independent measurements, even though PTS increase. Preserve original PTS and near-hold group IDs. Do not delete holds and give the remaining rows a constant 1/60-second or inferred 1/40-second step.

## Camera and overhead check

### Correspondences and split

Inspected raw frames 300 (end view), 450, 510, 570 and 600 (overhead). Visually matched four stationary objects by color/stripe/layout, without asserting official ball numbers:

| Reference name | End-view center | Overhead center | Role fixed before focal search |
| --- | --- | --- | --- |
| Brown/orange solid | (543,352) | (713,228) | Fit |
| Near yellow/white stripe | (608,517) | (291,293) | Fit |
| Far blue/white stripe | (681,324) | (809,353) | Held out |
| Dark ball near left rail | (430,416) | (529,143) | Held out |

Checked local image-template stability on six frames per view. Every reference had at least five high-similarity samples in the end view and all six in the overhead view, with zero detected integer-pixel shift among accepted samples. This supports stationary references at these sampled times, not exact subpixel immobility or infallible identity.

### Model and results

- Preserved size hypotheses 1.27m x 2.54m and radius 0.0286m. These are standard-pool assumptions, not new physical measurements of this table/ball set.
- Used approximate four cloth-boundary points per camera, a pinhole model, square pixels, centered principal point and zero distortion. Swept focal lengths from 600 to 6000 px, keeping poses with corner reprojection RMS <=1 px.
- Unlike a cloth-plane homography, back-projected ball centers onto a parallel plane at one radius toward the camera. The plane sign follows the camera side, so coordinate handedness cannot place the sphere below the cloth.
- Chose the camera pair using ONLY the two fit balls plus a small fixed corner-reprojection penalty. The two held-out balls were not used to choose focal length, radius, corners, penalties or gate.
- On those same held-out correspondences, maximum cross-view disagreement decreased from **0.07379m (naive planar)** to **0.03493m (height-aware)**. Individual height-aware held-out discrepancies are 0.03493m and 0.02320m. This is a like-for-like conditional cross-view consistency comparison, not absolute external measurement error.
- The proposed 0.03m gate is **still not passed**. It was not relaxed after seeing the result.
- Training RMS: 0.02519m. End-view selected focal: 2761.0 px. Overhead selected focal: 6000 px, hitting the search bound. Near-best training solutions span overhead focal lengths from 777.2 to 6000 px. This is strong evidence that the overhead focal/height is poorly identified under the assumptions.
- The resulting overhead camera-height hypothesis is about 19m from the plane. Do not treat that as measured venue geometry; it illustrates the ambiguous pinhole pose/scale hypothesis. Table dimensions, exact boundary/height plane, crop/principal point and lens distortion remain unverified.

Decision: keep this as an improved geometric experiment. **Metric calibration, friction/restitution fitting, and game parameter changes remain unapproved.** Do not claim that all three measurement problems are fully solved just because these checks were executed.

## Reproduction

From the repository root, with existing local dependencies:

```powershell
python scripts/physics-training/prepare_references.py --input artifacts/physics-training/JD9sXxrFhdA/pilot-002/media/source.mp4 --out artifacts/physics-training/JD9sXxrFhdA/pilot-002/crossview-001
python scripts/physics-training/audit_references.py --pilot-root artifacts/physics-training/JD9sXxrFhdA --out artifacts/physics-training/JD9sXxrFhdA/pilot-002/reference-audit-001
python scripts/physics-training/calibrate_crossview.py --input artifacts/physics-training/JD9sXxrFhdA/pilot-002/media/source.mp4 --references artifacts/physics-training/JD9sXxrFhdA/pilot-002/crossview-001 --out artifacts/physics-training/JD9sXxrFhdA/pilot-002/geometry-001
python scripts/physics-training/test_pipeline.py
```

Audit/calibration outputs already exist. Reuse reports or choose new version directories. Raw-reference preparation regenerates deterministic image exports and provenance but does not replace the frozen visual-label/config files. Source media is ignored by Git; reference images and reports remain in the workspace. The two new reports include source/code hashes; the reference audit also hashes the frozen labels.

## Next agent and user inputs

Validation completed: 12 regression tests passed; Python compilation and `git diff --check` passed. New checks cover coarse-clock quantization/reset handling and the raised ball-center projection plane. Source/script hashes and generated report consistency were verified. Camera correspondence and blind-reference images were visually inspected. No application code changed; the Next.js/MongoDB suites were not rerun for these isolated tools.

Do not repeat downloads or tweak game defaults. The next useful experiment is to refine the physical boundary/center-plane correspondences or obtain independent camera/equipment constraints, rather than adding more focal freedom against the two held-out balls. Preserve the current held-out set; new model choices informed by its results require fresh validation points or separate shots.

No additional user input was required to execute these checks. Verified equipment dimensions or an original higher-quality video could reduce uncertainty if available, but do not ask the user for camera intrinsics they are unlikely to possess. Another useful YouTube candidate would emphasize stable overhead views with visible free rolling motion rather than more of the same ambiguous end view. No calibrated coefficient or production detector update has been promoted.
