# Physics calibration campaign

Entry point for the next agent. Read `runs/JD9sXxrFhdA-2026-11-24.md` before continuing.

Then read the latest follow-up, `runs/JD9sXxrFhdA-validation-2026-11-24.md`. It records cadence/center checks and the rejected camera hypothesis, with exact commands and next experiments. Latest detailed reports are `pilot-002/validation-002/validation.json` and `pilot-002/camera-002/camera-report.json`.

The cross-view stage is `runs/JD9sXxrFhdA-crossview-2026-11-24.md`: detector-free visual labels, shot-clock timing, overlap alignment and a ball-height-aware overhead/end-view comparison.

Read the newest stage last: `runs/JD9sXxrFhdA-sensitivity-repeat-2026-11-24.md`. It records 640 frozen-plan geometry stress trials, ordered repeated-motion alignment of 158 frame pairs, and conservative same-shot grouping. Latest reports are `pilot-002/geometry-sensitivity-001/sensitivity-report.json` and `pilot-002/repeat-audit-001/repeat-report.json`; `shot-groups.json` must guide future dataset splits. The metric gate still fails; no physics coefficients changed.

## Scope

Use short, selected intervals from real pool broadcasts to validate video tracking, then estimate physical parameters only from qualified measurements. The current task is a tracking pilot, not a completed calibration or a trained gameplay agent.

Keep game defaults unchanged until real trajectories pass camera, timing, tracking, and held-out validation checks. Do not infer cue power percentages, hidden spin, or unobserved collisions from a broadcast.

## Persistence

- `docs/physics-training/runs/`: human-readable handoff and experiment history.
- `scripts/physics-training/`: reproducible local processing tools.
- `artifacts/physics-training/`: machine-readable measurements and visual QA.
- `media/` inside an artifact run and `.training-tools/`: local, git-ignored source media and dependencies.

Record source interval, actual decoded FPS/resolution/frame count, tool versions, rejection reasons, commands, output paths, and limitations. Never write signed media URLs, cookies, credentials, or authentication headers to reports.

## Reproduce the pilot

Run from the repository root in PowerShell. Python 3.13 and Node.js are available. Dependencies are isolated from the Next.js application. Network access may require the environment's normal approval flow.

```powershell
python -m pip install --target .training-tools -r scripts/physics-training/requirements.txt
python scripts/physics-training/acquire.py --url https://www.youtube.com/watch?v=JD9sXxrFhdA --start 1340 --duration 30 --out artifacts/physics-training/JD9sXxrFhdA/pilot-001
python scripts/physics-training/acquire.py --url https://www.youtube.com/watch?v=JD9sXxrFhdA --start 1366 --duration 20 --out artifacts/physics-training/JD9sXxrFhdA/pilot-002
```

Acquisition reuses matching completed local clips. It downloads video only, limits each request to 60 seconds, and re-encodes accurate section cuts with the bundled FFmpeg binary. It uses no browser cookies. Original source format metadata and decoded output format are different; check the reports rather than inferring one from the other.

```powershell
python scripts/physics-training/analyze.py --input artifacts/physics-training/JD9sXxrFhdA/pilot-001/media/source.mp4 --out artifacts/physics-training/JD9sXxrFhdA/pilot-001/analysis-v1 --source-start 1340
python scripts/physics-training/analyze.py --input artifacts/physics-training/JD9sXxrFhdA/pilot-001/media/source.mp4 --out artifacts/physics-training/JD9sXxrFhdA/pilot-001/analysis-v2 --source-start 1340 --roi artifacts/physics-training/JD9sXxrFhdA/pilot-001/table-roi.json
python scripts/physics-training/analyze.py --input artifacts/physics-training/JD9sXxrFhdA/pilot-002/media/source.mp4 --out artifacts/physics-training/JD9sXxrFhdA/pilot-002/analysis-v1 --source-start 1366
python scripts/physics-training/review_track.py --input artifacts/physics-training/JD9sXxrFhdA/pilot-002/media/source.mp4 --analysis artifacts/physics-training/JD9sXxrFhdA/pilot-002/analysis-v1 --track-id 60 --out artifacts/physics-training/JD9sXxrFhdA/pilot-002/curated-cue-fragment
python scripts/physics-training/test_pipeline.py
```

Completed analysis directories are immutable to the analyzer: reuse reports, or choose a new version directory for another run. `analyze.py` refuses inputs longer than 60 seconds. Blue-cloth segmentation, scene heuristics, and conservative short-lived associations are baseline tools, not a pretrained detector or a calibrated tracker. Nominal video FPS does not establish effective motion sampling rate or absence of replay.

## Outputs and handoff

- `artifacts/physics-training/JD9sXxrFhdA/quality-review.json`: final QA decisions, accepted scope, suspect repeats, next steps.
- `pilot-*/acquisition.json` and `acquisition.log`: sanitized provenance and acquisition history.
- `analysis-v*/report.json`: actual decode/processing stats and limitations.
- `analysis-v*/tracks.csv`: provisional pixel observations, never inferred gap fills.
- `analysis-v*/frames.json`: per-frame table gate, scene segments, cut candidates.
- `analysis-v*/tracking-preview.mp4`: local visual QA; ignored by Git and reproducible from source clips.
- `analysis-v*/contact-sheet.jpg`: sample observations, committed alongside reports if desired.
- `pilot-002/curated-cue-fragment/`: selected 95-frame cue-ball track and five-frame visual review.

No physical coefficients have been fitted. The selected fragment is approved only as a tracking demonstration and seed for manual annotation. The general detector still has false positives; timestamp cadence, duplicate/replay grouping, camera calibration and independent labels remain required before a physics fit.

The follow-up tools `validate_fragment.py` and `check_camera.py` audit existing cached observations. They verify source hashes and preserve versioned outputs. `near_hold_group` preserves every original timestamp; it is not a new evenly sampled time axis. `conditional-positions.csv` contains metres only under the explicit, unapproved camera hypothesis. Never feed it into a game-parameter optimizer as verified metric data.
