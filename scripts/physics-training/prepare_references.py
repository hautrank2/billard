"""Export detector-free reference images for visual annotation and cross-view checks."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".training-tools"))
import cv2
import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(args.input))
    frames = [129, 139, 149, 159, 169, 179, 189, 199, 209]
    tiles = []
    for index in frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = cap.read()
        if not ok:
            raise ValueError("Missing reference frame")
        frame = cv2.resize(frame, (1280, 720))
        cv2.imwrite(str(args.out / f"blind-frame-{index:04}.jpg"), frame)
        crop = cv2.resize(frame[330:411, 500:901], (802, 162))
        # Coordinate grid only: no detector center, radius, trajectory or crop recentering.
        for x in range(500, 901, 10):
            px = (x - 500) * 2
            cv2.line(crop, (px, 20), (px, 161), (70, 100, 100), 1)
            if x % 50 == 0:
                cv2.putText(crop, str(x), (max(0, px - 12), 15), cv2.FONT_HERSHEY_SIMPLEX, .38, (255, 255, 255), 1)
        for y in (350, 375, 400):
            py = (y - 330) * 2
            cv2.line(crop, (0, py), (801, py), (70, 100, 100), 1)
            cv2.putText(crop, str(y), (2, py - 3), cv2.FONT_HERSHEY_SIMPLEX, .35, (255, 255, 255), 1)
        title = np.zeros((28, 802, 3), np.uint8)
        cv2.putText(title, f"BLIND frame {index} | coordinates at 1280x720 | visible silhouette center, not highlight", (5, 19),
                    cv2.FONT_HERSHEY_SIMPLEX, .43, (255, 255, 255), 1)
        tiles.append(np.vstack([title, crop]))
    for index in range(3):
        cv2.imwrite(str(args.out / f"blind-sheet-{index + 1}.jpg"), np.vstack(tiles[index * 3:index * 3 + 3]))
    for index in (300, 450, 510, 570, 600):
        cap.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = cap.read()
        if not ok:
            raise ValueError("Missing cross-view reference frame")
        cv2.imwrite(str(args.out / f"frame-{index:04}.jpg"), cv2.resize(frame, (1280, 720)))
    cap.release()
    (args.out / "reference-provenance.json").write_text(json.dumps({
        "input_sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "blind_annotation_frames": frames, "analysis_size": [1280, 720],
        "method": "Fixed raw image crop and coordinate grid only. No algorithm outputs overlaid.",
        "limitation": "Agent visual labels are approximate and from the same source, not external expert ground truth."
    }, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
