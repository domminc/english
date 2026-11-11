#!/usr/bin/env bash
# 발음 음성을 만들어 R2 에 올린다. 단어 목록이 지난번과 같으면 아무것도 하지 않는다.
# 필요한 것: DATABASE_URL, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, python3, ffmpeg
set -euo pipefail
BUCKET=haru-english-media
VOICE=en_US-ljspeech-medium   # 공개 도메인 LJ Speech 데이터로 만든 음성
WORK=$(mktemp -d)

node scripts/audio-list.mjs > "$WORK/audio.tsv"
SHA=$( (echo "$VOICE"; cat "$WORK/audio.tsv") | sha256sum | cut -c1-16)
MARK="audio/v1/_manifest-$SHA.txt"
if "$PWD/node_modules/.bin/wrangler" r2 object get "$BUCKET/$MARK" --remote --file "$WORK/mark" >/dev/null 2>&1; then
  echo "발음 음성이 이미 최신입니다."
  exit 0
fi

pip install --quiet piper-tts
(cd "$WORK" && python3 -m piper.download_voices "$VOICE" >/dev/null)
python3 scripts/make_audio.py "$WORK/audio.tsv" "$WORK/out" "$WORK/$VOICE.onnx"

WRANGLER="$PWD/node_modules/.bin/wrangler"
export WRANGLER BUCKET
(cd "$WORK/out" && find audio -name '*.mp3' -print0 | xargs -0 -P 6 -I{} sh -c \
  '"$WRANGLER" r2 object put "$BUCKET/$1" --remote --file "$1" --content-type audio/mpeg >/dev/null 2>&1 || { echo "올리기 실패: $1"; exit 255; }' _ {})
wc -l < "$WORK/audio.tsv" > "$WORK/mark"
"$WRANGLER" r2 object put "$BUCKET/$MARK" --remote --file "$WORK/mark" --content-type text/plain >/dev/null
echo "발음 음성 $(cat "$WORK/mark")개를 R2 에 올렸습니다."
