# Geometry sensitivity and ordered repeat audit

## Status

2026-11-24 (Asia/Bangkok): continued autonomously on the existing Sanchez-Ruiz vs Corteza video, reusing cached source media. Completed 640 frozen-plan camera/annotation stress trials and a targeted repeated-content alignment. No new downloads, dependency installations, paid model calls or game-physics changes.

The frozen baseline still fails the 0.03 m cross-view gate. Sensitivity outcomes are diagnostic; favorable perturbed cases do not qualify the camera. Ordered moving content supports conservatively grouping both cached clips as the same shot, rather than treating the later occurrence as independent validation.

Latest artifacts:

- `pilot-002/geometry-sensitivity-001/plan.json`, `trials.csv`, `sensitivity-report.json`.
- `pilot-002/repeat-audit-001/plan.json`, `frame-pairs.csv`, `repeat-report.json`, `repeat-reference.jpg`.
- Source-level `shot-groups.json`: machine-readable grouping for any future dataset split.

## Geometry sensitivity

Preserved the existing two fit balls, two check balls, dimensions/radius hypotheses, focal grid, corner reprojection gate and 3 cm cross-view gate. Reproduced the original baseline training score to 1e-10 before running trials. Selected every camera pair using fit points and corner penalties only; check-point errors never choose a pair.

The plan was written before running the experiment. Seed 20261124; 128 trials per scenario. Independent Gaussian x/y pixel jitter is an assumed stress model, not an empirically measured annotation distribution. The 2.5 px center scale uses the previous approximate visual-label uncertainty as a diagnostic scale; it does not turn that bound into a measured Gaussian standard deviation.

| Assumed jitter | Camera pair available / attempted | No valid pair | Check residual median | Check residual P05–P95 | Diagnostic cases <=3 cm |
| --- | ---: | ---: | ---: | ---: | ---: |
| Corners: 1 px | 111/128 | 17 | 3.51 cm | 2.34–4.63 cm | 28 |
| Corners: 2 px | 62/128 | 66 | 3.85 cm | 2.23–5.43 cm | 17 |
| Corners: 4 px | 16/128 | 112 | 2.59 cm | 1.51–6.75 cm | 9 |
| Centers: 2.5 px | 128/128 | 0 | 4.70 cm | 1.98–7.88 cm | 18 |
| Corners: 2 px + centers: 2.5 px | 47/128 | 81 | 4.61 cm | 2.23–10.42 cm | 8 |

Residual summaries condition on trials where both views have a pose meeting the original corner gate. Rejections are retained in `trials.csv`. In particular, the apparently smaller median with 4 px corner noise is conditioned on just 16/128 surviving trials; it is not an improvement. These percentiles are neither measurement confidence intervals nor probabilities that the calibration is correct.

Under the unchanged baseline's near-best fit solutions, two distinct end-view poses give endpoint chords of 0.79522–0.79679 m for frames 123–217. This is a conditional chord under assumed scale, excluding tracking uncertainty and path curvature. It is not a measured travel distance, velocity or friction estimate. Preserved all 95 original observations, 63 near-hold groups and the original 1.566667 s PTS span; no time resampling.

Decision: the reference geometry remains sensitive enough that a small m/pixel fit or a favorable jitter draw cannot justify promoting physical coefficients. Preserve the failed baseline decision and obtain fresh geometry evidence, rather than optimizing corners against these check balls.

## Ordered repeated content

Compared a fixed cue-ball-motion region `[500,330,901,411]` at 1280x720, downsampled to 160x32 grayscale. Subtracted each comparison window's temporal median to reduce static-cloth similarity. This shared preprocessing uses both full windows; the alternating-frame order check is not an independent statistical validation set.

Searched constant offsets 914–982 using even-indexed frames from pilot-002 frames 60–217. Checked odd-indexed frames against the selected alignment, reverse order and 64 seeded random orderings. The plan fixed a minimum check correlation of 0.9 and a minimum margin of 0.2 over controls before execution.

- Best offset: **960 frames**, matching frames **60–217 to 1020–1177**, 158 pairs total.
- Fit-frame temporal correlation: **0.88744**. Neighbor offsets 961/959 score 0.73401/0.68855.
- Order-check correlation: **0.90284** on 79 alternating frames.
- Reverse-order control: **0.01030**. Maximum of 64 shuffled-order controls: **0.09598**.
- Visually inspected aligned frames 129/1089, 169/1129 and 209/1169 in `repeat-reference.jpg`: the cue-ball/player motions agree; broadcast countdown overlays differ. This reinforces why overlay clocks and repeated scene content must not be combined into a physical timeline.

Decision: ordered repeated moving content is supported for this targeted interval. Group both occurrences, overlapping pilot-001 footage and intervening camera cuts together for dataset splitting. `shot-groups.json` conservatively groups the entirety of both cached clips; only the stated 158 pairs were directly matched. Keep all original frames and PTS. Do not interpret the 960-frame offset as the duration of a physical shot or proof of normal-speed editorial replay.

## Reproduction and validation

From the repository root:

```powershell
python scripts/physics-training/audit_geometry_sensitivity.py --input artifacts/physics-training/JD9sXxrFhdA/pilot-002/media/source.mp4 --references artifacts/physics-training/JD9sXxrFhdA/pilot-002/crossview-001 --baseline artifacts/physics-training/JD9sXxrFhdA/pilot-002/geometry-001/crossview-report.json --observations artifacts/physics-training/JD9sXxrFhdA/pilot-002/validation-002/observations.csv --plan artifacts/physics-training/JD9sXxrFhdA/pilot-002/geometry-sensitivity-001/plan.json --out artifacts/physics-training/JD9sXxrFhdA/pilot-002/geometry-sensitivity-001
python scripts/physics-training/audit_repeated_content.py --input artifacts/physics-training/JD9sXxrFhdA/pilot-002/media/source.mp4 --plan artifacts/physics-training/JD9sXxrFhdA/pilot-002/repeat-audit-001/plan.json --out artifacts/physics-training/JD9sXxrFhdA/pilot-002/repeat-audit-001
python scripts/physics-training/test_pipeline.py
python -m py_compile scripts/physics-training/audit_geometry_sensitivity.py scripts/physics-training/audit_repeated_content.py scripts/physics-training/test_pipeline.py
git diff --check
```

The output directories already contain results. Reuse them or select new version directories. Both tools reject overwriting completed measurements. Reports record source, plan and implementation hashes. The geometry audit additionally hashes its frozen config, labels, baseline and observation provenance. The source media hash matches the previous reports.

Regression checks cover held-out-coordinate isolation in model selection, unique-pose chord envelopes, rejected-trial accounting, non-finite summary rejection, synthetic moving-content alignment, static-region rejection and out-of-range offsets. Synthetic tests establish tool behavior, not video measurement accuracy. No application code changed in this follow-up, so Next.js/MongoDB checks are not relevant to these Python tools.

## Next useful work

1. Use `shot-groups.json` in any future train/validation/test builder. These clips provide one correlated shot group, not several independent shots.
2. A fresh shot with stable overhead moving-ball footage would provide more useful evidence than another model fit against these four known balls. Inspect a short new interval before acquiring it; retain bounded, video-only downloads and source provenance.
3. Determine a consistent physical boundary plane or obtain independent equipment/camera constraints. A fixed absolute calibration target or surveyed dimensions would address scale; simply adding focal freedom will not.
4. New geometric choices informed by the current check residuals need fresh check points or an independent shot. Do not reuse the same two balls as evidence of an unbiased improvement.

No user input is required to read or reproduce these completed audits. Friction, restitution, spin and power-curve changes remain unsupported by the current data.
