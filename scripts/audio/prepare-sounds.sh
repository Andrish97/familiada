#!/usr/bin/env bash
# Przygotowanie wbudowanych dźwięków (decyzja właściciela 2026-10-29):
# - cisza na początku ucięta (zostaje 10 ms),
# - cisza na końcu ucięta do 150 ms wybrzmienia + 80 ms wygaszenia,
# - głośność wyrównana: EBU R128, -16 LUFS, szczyt -1,5 dBTP (dwa przebiegi),
# - MP3 192 kb/s, 44,1 kHz, stereo.
# Użycie: scripts/audio/prepare-sounds.sh [katalog=web/assets/audio]
# Uruchomienie drugi raz niczego istotnie nie zmienia (cisza już ucięta,
# głośność już na poziomie).
set -euo pipefail
DIR="${1:-web/assets/audio}"
TARGET_I=-16; TARGET_TP=-1.5; TARGET_LRA=11
TRIM="silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
for f in "$DIR"/*/*.mp3; do
  name="$(basename "$(dirname "$f")")/$(basename "$f")"
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$f" -af "$TRIM" -ar 44100 -ac 2 "$TMP/trim.wav"
  dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/trim.wav")"
  fade_start="$(awk -v d="$dur" 'BEGIN { s = d - 0.08; if (s < 0) s = 0; printf "%.3f", s }')"
  stats="$(ffmpeg -nostdin -hide_banner -i "$TMP/trim.wav" -af "loudnorm=I=$TARGET_I:TP=$TARGET_TP:LRA=$TARGET_LRA:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')"
  get() { printf '%s' "$stats" | sed -n "s/.*\"$1\" : \"\([^\"]*\)\".*/\1/p"; }
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$TMP/trim.wav" \
    -af "loudnorm=I=$TARGET_I:TP=$TARGET_TP:LRA=$TARGET_LRA:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,afade=t=out:st=$fade_start:d=0.08" \
    -ar 44100 -ac 2 -c:a libmp3lame -b:a 192k -map_metadata -1 "$TMP/out.mp3"
  mv "$TMP/out.mp3" "$f"
  printf '%-32s %6.2f s  (było wejście %s LUFS)\n' "$name" "$dur" "$(get input_i)"
done
