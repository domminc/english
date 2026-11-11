"""발음 음성 생성: audio.tsv 의 각 줄을 Piper(오픈소스 음성 합성)로 읽어 MP3 로 저장한다.

python3 scripts/make_audio.py audio.tsv out_dir voice.onnx
"""
import pathlib, subprocess, sys, wave
from piper import PiperVoice

tsv, out_dir, model = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3]
voice = PiperVoice.load(model)
count = 0
for line in open(tsv, encoding="utf-8"):
    key, _, text = line.rstrip("\n").partition("\t")
    if not key or not text:
        continue
    mp3 = out_dir / key
    mp3.parent.mkdir(parents=True, exist_ok=True)
    wav = mp3.with_suffix(".wav")
    with wave.open(str(wav), "wb") as f:
        voice.synthesize_wav(text, f)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-ac", "1", "-b:a", "48k", str(mp3)], check=True)
    wav.unlink()
    count += 1
print(f"음성 {count}개 생성")
