"""Download one bounded YouTube interval; never persist signed media URLs."""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".training-tools"))

import imageio_ffmpeg
import yt_dlp
from yt_dlp.utils import download_range_func


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--duration", type=float, default=30)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.start < 0 or not 0 < args.duration <= 60:
        parser.error("Pilot downloads must be between 0 and 60 seconds, with a nonnegative start.")
    args.out.mkdir(parents=True, exist_ok=True)
    media = args.out / "media"
    media.mkdir(exist_ok=True)
    log = args.out / "acquisition.log"
    report_path = args.out / "acquisition.json"
    if report_path.exists():
        cached = json.loads(report_path.read_text(encoding="utf-8"))
        if (cached.get("status", "").startswith("downloaded") and
                cached.get("source_url") == args.url and
                cached.get("requested_start_seconds") == args.start and
                cached.get("requested_end_seconds") == args.start + args.duration and
                cached.get("local_files") and
                all((args.out / name).is_file() for name in cached["local_files"])):
            print("Using cached section; no network acquisition performed.")
            print(json.dumps(cached, indent=2, ensure_ascii=False))
            return 0

    class Logger:
        def debug(self, message):
            if not message.startswith("[debug]"):
                self.write(message)

        def warning(self, message):
            self.write("WARNING: " + message)

        def error(self, message):
            self.write("ERROR: " + message)

        def write(self, message):
            message = re.sub(r"https?://[^\s]+", "[URL redacted]", message)
            with log.open("a", encoding="utf-8") as handle:
                handle.write(message + "\n")
            print(message, flush=True)

    report = {
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source_url": args.url,
        "requested_start_seconds": args.start,
        "requested_end_seconds": args.start + args.duration,
        "maximum_height": args.height,
        "yt_dlp_version": yt_dlp.version.__version__,
        "ffmpeg_version": imageio_ffmpeg.get_ffmpeg_version(),
        "status": "started",
    }

    def save():
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    save()
    # yt-dlp discovers FFmpeg by its canonical filename, unlike imageio's
    # versioned Windows executable. Keep this copy inside the ignored tools dir.
    ffmpeg = ROOT / ".training-tools" / "bin" / "ffmpeg.exe"
    ffmpeg.parent.mkdir(exist_ok=True)
    if not ffmpeg.exists():
        shutil.copyfile(imageio_ffmpeg.get_ffmpeg_exe(), ffmpeg)
    # Partial-download capability checks instantiate a processor without the
    # YoutubeDL options, so they also need executable discovery on PATH.
    os.environ["PATH"] = str(ffmpeg.parent) + os.pathsep + os.environ.get("PATH", "")
    options = {
        "noplaylist": True,
        "format": f"bv[height<={args.height}]/b[height<={args.height}]",
        "outtmpl": str(media / "source.%(ext)s"),
        "download_ranges": download_range_func(None, [(args.start, args.start + args.duration)]),
        "force_keyframes_at_cuts": True,
        "ffmpeg_location": str(ffmpeg),
        "js_runtimes": {"node": {"path": shutil.which("node")}},
        "socket_timeout": 20,
        "retries": 1,
        "fragment_retries": 1,
        "extractor_retries": 1,
        "logger": Logger(),
        "noprogress": True,
        "overwrites": False,
        "external_downloader_args": {"ffmpeg": ["-loglevel", "error", "-nostats"]},
    }
    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(args.url, download=True)
        if info is None:
            raise RuntimeError("Extractor returned no video information")
        report.update({key: info.get(key) for key in (
            "id", "title", "channel", "duration", "width", "height", "fps", "format_id", "vcodec"
        )})
        report["local_files"] = [str(path.relative_to(args.out)) for path in media.iterdir()
                                 if path.suffix in (".mp4", ".webm", ".mkv")]
        if not report["local_files"]:
            raise RuntimeError("No completed media file found")
        report["status"] = "downloaded_pending_decode_validation"
        report["timing_note"] = "Source offset is requested, not independently verified; validate decoded duration/timestamps."
    except Exception as error:
        report["status"] = "failed"
        report["error"] = re.sub(r"https?://[^\s]+", "[URL redacted]", str(error))
        save()
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 1
    save()
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
