# YouTube tracking pilot: JD9sXxrFhdA

## Status

2026-11-24 (Asia/Bangkok): **bounded tracking pilot completed; physics calibration NOT approved**. Two source intervals were acquired and decoded, three baseline analyses were run, visual QA was performed, and one short cue-ball fragment was selected for annotation. Read `artifacts/physics-training/JD9sXxrFhdA/quality-review.json` for the final machine-readable verdict. No game coefficients changed.

Latest follow-up: [cadence, center and camera validation](JD9sXxrFhdA-validation-2026-11-24.md). Read it before continuing: near-held content was measured, detector disagreement quantified, short-term camera stability checked, and a metric camera hypothesis rejected against held-out landmarks. Latest artifacts: `pilot-002/validation-002/` and `pilot-002/camera-002/`.

Newer follow-up: [detector-free labels, clock/overlap timing and overhead geometry](JD9sXxrFhdA-crossview-2026-11-24.md). Read this last. It scores nine visual center references, checks the countdown and exact cached-clip overlap, and reduces conditional cross-view discrepancy using ball height. Latest reports: `pilot-002/reference-audit-001/` and `pilot-002/geometry-001/`. The 3cm geometric gate still fails; no game parameters changed.

## Authorization and objective

User supplied https://www.youtube.com/watch?v=JD9sXxrFhdA and requested processing plus persistent logs readable by another agent. Work locally, start with a short segment, minimize AI video processing, and preserve existing game changes. No external paid API calls or model training are required for this pilot.

## Source and prior reconnaissance

- Visible title: SANCHEZ-RUIZ vs CORTEZA, Round 1, ARAMITH MEN'S OPEN, BALI 2026 PRO BILLIARD SERIES.
- Channel: Pro Billiard TV.
- Player duration previously observed: 6668.721 seconds (about 1:51:09).
- Approximate manual samples: 00:11:07 player close-up; 00:22:31 full table from an end; 00:55:34 low side view; 01:28:55 full table from an end.
- These were sparse browser observations, not a frame-by-frame analysis. They do not establish how much of the full video is usable.
- Initial candidate: 00:22:20–00:22:50. The pipeline must detect cuts and reject unsuitable frames rather than assuming this entire interval is usable.

## Environment

- Workspace: D:\web\vibe\billard.
- Python 3.13 available, NumPy and Pillow installed.
- At start, OpenCV, yt-dlp, imageio-ffmpeg, and SciPy unavailable; FFmpeg/ffprobe not on PATH.
- Install analysis dependencies locally into ignored `.training-tools/`; do not modify application dependencies.

## Acceptance gate

Tracking outputs are provisional until visually inspected. A table mask is not metric camera calibration. Pixel tracks are not measurements in metres. Do not tune friction or restitution until full-table geometry, timestamps, ball identities, camera stability, occlusions and event visibility are checked.

## Execution log

1. Inspected repository and tool availability. No prior tracking/calibration pipeline found. Existing uncommitted game/UI edits left intact.
2. Initial pip request failed on sandbox DNS. Authorized network execution installed dependencies into `.training-tools/`. Exact versions are recorded in `scripts/physics-training/requirements.txt`.
3. Acquisition initially failed because yt-dlp's partial-download capability check did not inherit the FFmpeg option. Copied imageio's binary to the canonical local `bin/ffmpeg.exe` and prepended that directory to process-local PATH. No global PATH change.
4. Downloaded 00:22:20–00:22:50 (30 seconds), video only. Output is 10,556,416 bytes, 1920x1080, 60 fps, 1800 decoded frames, monotonic presentation timestamps. Source requested format was AV1; FFmpeg re-encoded the section to H.264 for accurate section cuts. A Windows console Unicode error happened after report/media were saved; stdout UTF-8 handling is now fixed. The saved media was reused instead of downloaded again.
5. Ran `analysis-v1`: 43.992 seconds processing, table detected on 1793/1800 frames, 764 short-lived track fragments, 19,477 detection rows, 41 fragments lasting at least one second, 7 of those spanning more than 20 pixels. **These are workload/continuity counts, not accuracy.** No cut candidates found, but table masking failed briefly at frames 74–80, creating new track segments.
6. Visually inspected v1 contact sheet and original frames 180 and 1770. Table outline included some cushion area; false positives included rail details and cue fragments. This baseline does NOT pass the physics-fit gate. Most of the interval is pre-shot positioning. Movement is visible near the end; full follow-through requires another interval.
7. Created `pilot-001/table-roi.json` from manually inspected frame 180 (analysis coordinates 1280x720), limiting detections to approximate cloth interior. Started `analysis-v2` on the SAME local media, no new download.
8. Started a second bounded acquisition, 00:22:46–00:23:06 (20 seconds), to include the full end-of-pilot-001 shot and follow-through. The two source intervals overlap by four seconds and must never be split between calibration and validation sets.
9. Finished pilot-001 `analysis-v2`: 71.998 seconds wall time (not a controlled performance benchmark), table gate accepted 1741/1800 frames, 660 track fragments, 11,729 observations, 19 fragments >=1 second and 3 spanning >20 px. V2 visually reduces cushion clutter but still picks up hands/cue and fragments ball IDs. It is an experiment, not an established accuracy improvement.
10. Finished pilot-002 acquisition: 7,631,158 bytes, 20 seconds, 1200 decoded frames, 1920x1080 at nominal 60 fps, increasing PTS. Total downloaded media is 18,187,574 bytes for 50 seconds including overlap (46 unique requested source seconds). No full-match download or paid model API was used. Codex account credit consumption was not measured; agent orchestration/image inspection still consumes account resources.
11. Finished pilot-002 `analysis-v1`: 34.785 seconds processing, 835/1200 frames passed the table gate, 341 fragments, 7,631 observations, 34 fragments >=1 second and 6 spanning >20 px. Cut candidates: frame 428 (~00:22:53.133, end view to overhead), frame 609 (~00:22:56.150, overhead to wide venue view). Frames 609–973 inclusive were excluded by the table-size gate. Table became usable to the baseline again at frame 974 (~00:23:02.233). These times use the requested source offset and are estimates.
12. Inspected the second contact sheet and original frames. Repeated-looking stroke sequences occur before/after the wide view. Full-frame mean absolute BGR difference at 1280x720: frames 60/1020 = 3.518, 120/1080 = 3.117, 180/1140 = 3.037 (scale 0–255). **Suspected replay/repeated footage, not confirmed.** Do not claim playback speed or independence from this similarity. Source timing and shot grouping need checking.
13. Exported pilot-002 track 60, frames 123–217 inclusive, as `curated-cue-fragment/selected-track.csv`: 95 observations over 1.566667 seconds, estimated source 00:22:48.050–00:22:49.617. Visually inspected samples 123, 146, 170, 193, 217; outlines match the moving white cue ball. This is approval for a tracking demonstration/annotation seed only, not all-frame ground truth or a whole-shot reconstruction.
14. Coordinate QA on that fragment: no negative x steps, 32 zero x steps among 94 consecutive pairs, maximum x step 12.722 px, maximum absolute y step 1.379 px. The irregular step pattern needs effective-frame-cadence/duplicate-frame and contour-jitter analysis before estimating velocity or acceleration. Nominal 60 fps and increasing PTS alone are insufficient.
15. Saved final `quality-review.json`, reproducible commands in the campaign README, pinned tool dependencies, local previews, CSV observations and sample sheets. Added a cache guard so rerunning an acquired section performs no download; completed analysis reports require a new version directory. Analyzer refuses clips over 60 seconds.

## Validation

- `python scripts/physics-training/test_pipeline.py`: five checks passed (reject no-table scene, discriminate a synthetic white ball from a long cue shape, maintain nearby continuous identity, do not bridge missing frames, reject large position jumps). Synthetic tests are regression checks, not real-world accuracy evaluation.
- `python -m py_compile scripts/physics-training/acquire.py scripts/physics-training/analyze.py scripts/physics-training/review_track.py`: passed.
- Ran `acquire.py` again for pilot-002 without network escalation: reused cached report/media successfully, no network acquisition.
- `git diff --check`: passed.
- Visual QA: both pilot contact sheets, ROI comparison, selected raw frames and five enlarged cue-ball samples inspected.
- No application runtime changes in this campaign; full Next.js/MongoDB suite was not rerun for these isolated Python tools.

## Outputs to read first

1. `artifacts/physics-training/JD9sXxrFhdA/quality-review.json` — approval scope, rejection reasons, replay suspicion and next steps.
2. `artifacts/physics-training/JD9sXxrFhdA/pilot-002/curated-cue-fragment/review-samples.jpg` and `selected-track.csv` — the useful short pixel-track example.
3. `artifacts/physics-training/JD9sXxrFhdA/pilot-002/analysis-v1/contact-sheet.jpg` — camera changes and wide-view rejection.
4. Each `analysis-v*/report.json`, `frames.json`, `tracks.csv` and `track-summary.json` — raw provisional measurements.
5. Each `acquisition.json` and sanitized append-only `acquisition.log` — acquisition provenance, including earlier failed attempts.

Media and preview MP4 files are git-ignored and local. Reports, sample images and CSV remain reviewable in the workspace. The source SHA-256 in each report identifies its input. Initial reports do not contain the analysis source-code hash; preserve scripts and these logs together when handing off.

## Next agent

Read the final status and command history below before rerunning anything. Reuse local media and cached output when present; avoid downloading the entire match. No physical parameters have been approved for use in the game.

Follow exact commands in `docs/physics-training/README.md`. Start by independently annotating the selected 95-frame fragment and checking frame cadence/replays, then calibrate the camera per segment. Do not expand to whole-match tracking yet. Do not interpret detector counts/table-gate coverage as precision, recall, accuracy, or number of real balls. Do not fit `rollingFriction`, restitution or other game parameters from the current uncalibrated pixel tracks.
