#!/usr/bin/env python3
"""Mixes the launch film's sound: one music bed plus the sound effects listed in cues.json, laid onto a silent picture.

    python3 promo/launch-film/audio/mix.py out/picture.mp4 out/satgas-launch.mp4 [--no-music] [--no-sfx] [--lufs -14]

cues.json:
    music:  {file, start, lufs, fade_in, fade_out, duck_db}   start = where in the track the film begins
    events: [{t, file, db, align, duck, pan, trim, fade, fade_in, note}]   t = film time in seconds
            align "peak" puts the sound's loudest moment on t, "end" its last moment, "start" its first sample.
            db is the level of the sound's own peak, in dBFS, before the master gain.
            duck true dips the music under the sound, so a hit lands in a hole.

The picture is copied untouched. Needs ffmpeg and numpy. A report of every placed sound goes to <out>.mix.txt.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
SR = 48000
args = sys.argv[1:]
picture, out = Path(args[0]), Path(args[1])


def opt(name, default):
    return args[args.index(name) + 1] if name in args else default


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def loudness(x):
    """Integrated loudness, loudness range and true peak of a stereo buffer, measured by ffmpeg's ebur128."""
    raw = np.clip(x, -1, 1).astype(np.float32).tobytes()
    cmd = ["ffmpeg", "-hide_banner", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "ebur128=peak=true", "-f", "null", "-"]
    err = subprocess.run(cmd, input=raw, capture_output=True).stderr.decode()
    summary = err[err.rfind("Summary:") :]
    grab = lambda pattern: float(re.search(pattern, summary).group(1))
    return grab(r"I:\s+(-?[\d.]+) LUFS"), grab(r"LRA:\s+([\d.]+) LU"), grab(r"Peak:\s+(-?[\d.]+) dBFS")


def gain(db):
    return 10 ** (db / 20)


duration = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(picture)], capture_output=True, text=True).stdout)
N = int(round(duration * SR))
plan = json.loads((HERE / "cues.json").read_text())
events = [] if "--no-sfx" in args else plan["events"]
report = []

# Music: the chosen window of the track, levelled to its target, faded at both ends.
music = np.zeros((N, 2))
if "--no-music" not in args:
    m = plan["music"]
    track = load(HERE / m["file"])
    a = int(m.get("start", 0) * SR)
    cut = track[a : a + N]
    music[: len(cut)] = cut
    music *= gain(m["lufs"] - loudness(music)[0])
    fade_in, fade_out = int(m.get("fade_in", 0.01) * SR), int(m.get("fade_out", 1.5) * SR)
    music[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    music[N - fade_out :] *= (np.linspace(1, 0, fade_out) ** 1.5)[:, None]
    # Ducking: a quick dip under each marked hit, a slower climb back.
    duck = np.zeros(N)
    depth = m.get("duck_db", -6)
    for e in events:
        if not e.get("duck"):
            continue
        scale = e["duck"] if isinstance(e["duck"], (int, float)) and not isinstance(e["duck"], bool) else 1.0
        i = int(e["t"] * SR)
        attack, hold, release = int(0.04 * SR), int(0.12 * SR), int(0.7 * SR)
        shape = np.concatenate([np.linspace(0, 1, attack), np.ones(hold), np.linspace(1, 0, release) ** 2]) * depth * scale
        start = max(0, i - attack)
        seg = shape[: N - start]
        duck[start : start + len(seg)] = np.minimum(duck[start : start + len(seg)], seg)
    music *= gain(duck)[:, None]
    report.append(f"music {m['file']} from {m.get('start', 0)}s at {m['lufs']} LUFS, duck {depth} dB")

# Effects: each one normalised to its own peak, then placed and levelled as the plan says.
fx = np.zeros((N, 2))
cache = {}
for e in events:
    if e["file"] not in cache:
        cache[e["file"]] = load(HERE / e["file"])
    s = cache[e["file"]]
    if "trim" in e:
        s = s[int(e["trim"][0] * SR) : int(e["trim"][1] * SR)]
    s = s.copy()
    if e.get("fade"):
        n = min(len(s), int(e["fade"] * SR))
        s[-n:] *= np.linspace(1, 0, n)[:, None]
    if e.get("fade_in"):
        n = min(len(s), int(e["fade_in"] * SR))
        s[:n] *= np.linspace(0, 1, n)[:, None]
    env = np.abs(s).max(axis=1)
    peak_at = int(np.argmax(env))
    s = s / max(env.max(), 1e-9) * gain(e["db"])
    pan = e.get("pan", 0)
    s = s * np.array([min(1, 1 - pan), min(1, 1 + pan)])
    align = e.get("align", "start")
    offset = {"peak": peak_at, "end": len(s), "start": 0}[align]
    i = int(e["t"] * SR) - offset
    a, b = max(0, i), min(N, i + len(s))
    if b > a:
        fx[a:b] += s[a - i : b - i]
    report.append(f"{e['t']:6.2f}s  {e['db']:+5.1f} dB  {align:5s}  {e['file']}  {e.get('note', '')}")

mix = music + fx
target = float(opt("--lufs", "-14"))
before = loudness(mix)
mix *= gain(target - before[0])
# A soft ceiling for the few peaks the level change pushes over; anything under it is left alone.
ceiling = gain(-1.2)
over = np.abs(mix) > ceiling * 0.8
mix[over] = np.sign(mix[over]) * ceiling * (0.8 + 0.2 * np.tanh((np.abs(mix[over]) / ceiling - 0.8) / 0.2))
after = loudness(mix)
report.insert(0, f"mix: {after[0]:.1f} LUFS, range {after[1]:.1f} LU, true peak {after[2]:.1f} dBFS ({len(events)} effects, master gain {target - before[0]:+.1f} dB)")

wav = out.with_suffix(".mix.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", str(wav)], input=mix.astype(np.float32).tobytes(), check=True)
cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(picture), "-i", str(wav), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", str(out)]
subprocess.run(cmd, check=True)
wav.unlink()
out.with_suffix(".mix.txt").write_text("\n".join(report) + "\n")
print(report[0])
