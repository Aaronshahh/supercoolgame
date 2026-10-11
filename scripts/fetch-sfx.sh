#!/usr/bin/env bash
# Fetch the CC0 recordings behind the game's sound effects and sampled drums and render them as short
# mono MP3s in public/sfx/. Every source here is listed with its licence in docs/audio-credits.md;
# keep the two in step. Re-running is cheap: downloads are cached under node_modules/.cache/sfxraw.
#
#   scripts/fetch-sfx.sh              # everything
#   scripts/fetch-sfx.sh throw        # only outputs whose name starts with "throw"
#   VERIFY=1 scripts/fetch-sfx.sh     # also re-check every source's licence page / metadata for CC0
#
# Each clip is cut to one take (ss=/to= on the raw file, dur= from the first sound), trimmed of
# leading and trailing silence, peak-normalised to -1 dBFS, given a 3 ms fade-in and a short fade-out
# (fade=), and encoded at 96 kb/s. A download that fails is reported at the end and its clip skipped:
# the game synthesizes any event whose recording is missing. Needs curl and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."

FF=${FFMPEG:-ffmpeg}
command -v "$FF" >/dev/null 2>&1 || FF=/opt/homebrew/bin/ffmpeg
CACHE=node_modules/.cache/sfxraw
OUT=public/sfx
mkdir -p "$CACHE" "$OUT"
UA="Mozilla/5.0 (Boomerangeon asset fetch; see docs/audio-credits.md)"
ONLY=${1:-}
VERIFY=${VERIFY:-0}
FAILED=()
CC0='creativecommons.org/publicdomain/zero/1.0'

want() { [ -z "$ONLY" ] || [[ "$1" == "$ONLY"* ]]; }

get() { # get <cache name> <url>   (non-fatal: listed at the end, the clip is skipped)
  [ -s "$CACHE/$1" ] && return 0
  if ! curl -fsSL -A "$UA" -o "$CACHE/$1" "$2"; then
    rm -f "$CACHE/$1"
    FAILED+=("$1  <-  $2")
    echo "FAILED   $1" >&2
    return 1
  fi
}

# verify <cache name> <url> <what>: the page or metadata at <url> must mention the CC0 1.0 URL
verify() {
  [ "$VERIFY" = 1 ] || return 0
  if ! get "$1" "$2"; then return 0; fi
  if grep -q "$CC0" "$CACHE/$1"; then echo "CC0 ok   $3"; else
    FAILED+=("LICENCE  $3 does not show CC0 1.0 at $2")
    echo "LICENCE? $3" >&2
  fi
}

render() { # render <out> <in> [ss=s] [to=s] [dur=s] [fade=s]
  local out=$1 in=$2 ss= to= dur= fo=0.015 kv
  shift 2
  for kv in "$@"; do
    case $kv in
      ss=*) ss=${kv#ss=} ;; to=*) to=${kv#to=} ;; dur=*) dur=${kv#dur=} ;; fade=*) fo=${kv#fade=} ;;
      *) echo "bad render option '$kv' for $out" >&2; return 1 ;;
    esac
  done
  local cut=()
  [ -n "$ss" ] && cut+=(-ss "$ss")
  [ -n "$to" ] && cut+=(-to "$to")
  # drop leading silence, then (dur=) keep only the first seconds of sound, then drop trailing silence
  local pre="silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.003"
  [ -n "$dur" ] && pre="$pre,atrim=end=$dur"
  pre="$pre,areverse,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.02,areverse"
  local peak gain
  peak=$("$FF" -hide_banner -nostdin ${cut[@]+"${cut[@]}"} -i "$in" -af "$pre,volumedetect" -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB.*/\1/p' || true)
  if [ -z "$peak" ]; then
    FAILED+=("EMPTY    $out: nothing above -50 dB in the cut of $in")
    echo "EMPTY    $out" >&2
    return 0
  fi
  gain=$(awk -v p="$peak" 'BEGIN { printf "%.2f", -1.0 - p }')
  if ! "$FF" -hide_banner -nostdin -loglevel error -y ${cut[@]+"${cut[@]}"} -i "$in" \
    -af "$pre,volume=${gain}dB,afade=t=in:d=0.003,areverse,afade=t=in:d=$fo,areverse" \
    -ac 1 -ar 44100 -c:a libmp3lame -b:a 96k "$OUT/$out.mp3"; then
    rm -f "$OUT/$out.mp3"
    FAILED+=("RENDER   $out from $in")
    echo "RENDER   $out" >&2
    return 0
  fi
  local d
  d=$("$FF" -hide_banner -nostdin -i "$OUT/$out.mp3" -f null - 2>&1 | sed -n 's/.*time=\([0-9:.]*\).*/\1/p' | tail -1 || true)
  printf '%-20s %6s B  %s\n' "$out.mp3" "$(stat -f%z "$OUT/$out.mp3" 2>/dev/null || stat -c%s "$OUT/$out.mp3")" "${d#00:00:}"
}

# Freesound, CC0 (the anonymous "hq" preview MP3 of a sound whose page marks it CC0 1.0)
fs() { # fs <out> <sound id> <uploader id> [render options]
  want "$1" || return 0
  local id=$2 dir=${2:0:$((${#2} - 3))}
  verify "verify_fs$id.html" "https://freesound.org/s/$id/" "freesound $id ($1)"
  get "fs$id.mp3" "https://cdn.freesound.org/previews/$dir/${id}_$3-hq.mp3" || return 0
  render "$1" "$CACHE/fs$id.mp3" "${@:4}"
}

# The Designer's Choice (Nicholas A. Judy) UCS collections on archive.org, CC0 by the items' metadata
tdc() { # tdc <out> <collection> <URL-encoded path> [render options]
  want "$1" || return 0
  local item="Designers-Choice-Collection-$2"
  local name="tdc_$(printf '%s' "$3" | tr -c 'A-Za-z0-9' '_').wav"
  verify "verify_$item.json" "https://archive.org/metadata/$item" "archive.org $item ($1)"
  get "$name" "https://archive.org/download/$item/$3" || return 0
  render "$1" "$CACHE/$name" "${@:4}"
}

J='_Nicholas%20Judy_TDC.wav'
SNOW='Blue%20Snowball%20Microphone'
GLXY='Samsung%20Galaxy%20Smartphone'

# --- the boomerang -----------------------------------------------------------------------------
fs  throw1   529925 11751070                 # a real whip crack: the wrist snap of the release
fs  throw2   389590 6512973                  # a bullwhip swung without the crack
fs  throw3   536068 10912485                 # a bowstring released
fs  swing1   422513 3302499                  # bamboo staff through the air
fs  swing2   352719 6513636                  # a stick swung
fs  swing3   59988  71257                    # a stick swung
fs  catch1   164499 2320755                  # baseball into a leather glove
fs  catch2   816984 17552599                 # glove catch through a contact mic: the thud of the palm
tdc catch3   Cloth "CLOTH%2FIMPACT%2FCLOTHImpt-$SNOW%2C%20CU_Glove%20Slap$J" dur=0.6
fs  deflect1 326868 4077311                  # steel on steel (kitchen spatulas clashed)
fs  deflect2 275159 4745081                  # a short sword clash
fs  arm      442847 2237208                  # a gun cocked, two clicks: one take, the arming signature
fs  bounce1  319226 3443504                  # a rock on wood
fs  bounce2  443328 4827468                  # a hard small clack
fs  bounce3  217459 4056007                  # a metal ping
fs  bumper1  319785 3262745                  # a basketball bounce
fs  bumper2  505628 6512859                  # a tighter basketball bounce
fs  bumper3  683031 4257513                  # a fist on drywall
fs  shove1   629977 12715066                 # a clothed body hit
fs  shove2   276600 464940                   # a body hit
fs  shove3   842508 18255452                 # a full water bottle on a counter
fs  dash1    872226 19256798 to=0.6          # a person rolling on the floor in clothes
fs  dash2    494797 4682121                  # a jacket rustle
fs  dash3    496188 3910073                  # cloth dragged fast
fs  phantomPop1 523687 9795688               # a suction cup pulled off
fs  phantomPop2 840069 6339794               # a suction cup off glass

# --- deaths ------------------------------------------------------------------------------------
fs  slice1   35213  307822                   # a knife slash on foley flesh
fs  slice2   344404 4986214                  # a knife into a melon
fs  slice3   385966 4705955                  # a swede stabbed, with the whoosh
fs  burn1    637533 612689                   # a gas barbecue igniting
fs  burn2    539972 12029332                 # a fire burst
fs  fall1    742833 5287430 fade=0.3         # a metal tea strainer whooshed, slowed down: no landing
fs  fall2    523978 1187042 dur=1.2 fade=0.3 # a deep whoosh, faded out mid-fall
fs  squash1  176759 1303681 dur=0.7          # a foot on an egg
fs  squash2  483932 9961300                  # a lemon crushed
tdc squash3  Fight "FIGHT%2FIMPACT%2FFGHTImpt-$SNOW%2C%20CU_Groin%20Crunch$J" dur=0.8
fs  blast1   523089 11537497                 # an explosion, tight
fs  blast2   336011 4921277                  # a firework report
fs  blast3   840510 71257                    # a firework bang

# --- the room ----------------------------------------------------------------------------------
fs  crate1   66780  242154                   # a crate breaking
fs  crate2   667653 3271378                  # a wooden crate breaking
fs  crate3   500902 6714882                  # a wooden crate destroyed
fs  barrelLit1 423811 2549846                # a match struck
fs  barrelLit2 398448 3438463                # a match catching, no strike
fs  grass1   327894 4336114                  # a bush cut
fs  grass2   489940 10570192                 # leaves rustled fast
fs  ice1     262635 3175560                  # ice cracking, mic frozen inside the block
fs  ice2     422669 7844747                  # ice broken by hand
fs  ice3     624163 13582756                 # ice cracking
fs  steam1   234782 3501487                  # a steam hiss
fs  steam2   479296 2524442 dur=1.2          # a steam hiss
fs  spikes1  752070 71257                    # a trap springing shut
fs  spikes2  655341 11221455                 # a blade unsheathed
fs  spikes3  766480 11227086                 # a knife slash: the spike trap's shing
fs  vent1    547880 10034199 dur=1.2 fade=0.25 # a small blowtorch
fs  vent2    459884 6142149  dur=1.2 fade=0.25 # a flamethrower burst
fs  gate1    386174 1655965                  # a 750 kg chain pulley pulled
fs  gate2    405417 2402876                  # a chain pulled
fs  gate3    571419 10643288 dur=1.5         # a metal gate swung shut
fs  creak1   506665 4921277                  # a single wood creak
fs  creak2   572645 5149316                  # a wood floor creak
fs  creak3   164523 2104797                  # a floorboard creak
fs  chandelierFall1 540266 11242864          # a rope cut
fs  chandelierFall2 340534 4959511           # a metal chain dropping onto wood
fs  chandelierLand1 541601 7664885           # a chandelier shattering (theatre prop)
fs  chandelierLand2 408611 7673623           # the fall of a chandelier
tdc chandelierLand3 Glass "GLASS%2FBREAK%2FGLASBrk_Coca%20Cola%20Bottle%20Smash$J"
fs  crumble1 569510 3248005                  # stone impact, rubble, debris
fs  crumble2 758580 11537497                 # rubble
fs  crumble3 521956 311243 dur=1.5           # stone crumbling
fs  warp1    802453 5287430                  # a stick whoosh, reversed
fs  warp2    446010 7079899                  # a whoosh, reversed

# --- power-ups and players ---------------------------------------------------------------------
tdc pickupGlow  Bells "BELLS%2FMISC%2FBELLMisc-$SNOW%2C%20CU_Meditation%20Chime%2C%20Ring$J" dur=1.5 fade=0.5
fs  pickupLand1 630018 12715066 dur=0.6      # a single coin dropped
tdc pickupLand2 Metal "METAL%2FIMPACT%2FMETLImpt-${SNOW}_Metal%2C%20Clank%2C%20Thin$J"
tdc pickupTake1 Bells "BELLS%2FHANDBELL%2FBELLHand-$GLXY%2C%20CU_Desk%20Bell%2C%20Ring$J" dur=1.2 fade=0.3
fs  pickupTake2 580649 6952796               # a sherry glass tapped
tdc pickupLost  Musical "MUSICAL%2FPERCUSSION%2FMUSCPerc-$SNOW%2C%20CU_Hand%20Cymbal%2C%20Choke$J"
fs  pickupFizzle 237407 1502374 dur=1.0 fade=0.2 # a lit match dropped into water
fs  shieldPop1 415125 7047665                # a balloon popped
fs  shieldPop2 563197 9271584                # a balloon popped
fs  blink1   138477 758593                   # an air burst
fs  blink2   186928 545448                   # a burst
fs  spawnDrop 743004 5287430                 # a ukulele whooshed, slow
fs  spawnLand1 364690 2531187                # a human impact on the ground
fs  spawnLand2 584293 13171815               # a pillow into a wall
fs  spawnLand3 536766 1415754                # a thud
tdc ready    Musical "MUSICAL%2FPERCUSSION%2FMUSCPerc-CU_Big%20Timpani%20Impact$J" dur=2.0 fade=0.5
fs  win      385011 270868 dur=2.5 fade=0.6  # orchestral cymbals and bass drum, one hit

# --- the drums (src/audio/music.ts plays these for the kits; one-shots, round-robin) --------------
fs  kick1    673512 3130497                  # a clicky sub kick
fs  kick2    400707 1126957                  # a subby kick (~50 Hz); also the second 808
fs  kick3    581461 5790048                  # an acoustic kit kick
fs  kick808  208447 1137749                  # an 808 deep kick
fs  snare1   673516 3130497                  # a flat, fat snare
fs  snare2   581468 5790048 dur=0.8          # an acoustic kit snare
fs  snare3   860525 3661618                  # a punchy rock snare
fs  clap1    561119 12517458                 # a single dry clap
fs  clap2    493717 8419061                  # a 50-person clap
fs  hat1     674296 3130497                  # closed hi-hat
fs  hat2     811628 17413817                 # closed hi-hat
fs  ohat     317097 656142                   # open hi-hat (Gretsch kit)
fs  ride     493688 10655277                 # a crisp ride
fs  crash1   696211 2253220                  # a 16" extra-dry thin crash
fs  crash2   163449 2965712                  # an 18" B8 crash
fs  tom1     581467 5790048                  # a low tom
fs  tom2     221484 2825110                  # a 16" floor tom
fs  taiko1   509528 2771755 dur=1.5 fade=0.3 # an alfaia (rope-tuned goatskin bass drum)
fs  taiko2   511275 2771755 dur=1.5 fade=0.3 # an alfaia, combined hits
tdc taiko3   Musical "MUSICAL%2FPERCUSSION%2FMUSCPerc-$GLXY%2C%20CU_Drum%20Bang$J" dur=1.5 fade=0.3
fs  timp     573282 12517458 dur=2.0 fade=0.4 # a timpani (the "ready" timpani is the second take)
fs  orchHit  427803 2866779 dur=2.5 fade=0.5  # a cinematic hit with horns (the "win" hit is the second take)
fs  impact1  475005 2617886                  # a bass drop (Moog Sub 37)
fs  impact2  674303 3130497 dur=3.0 fade=0.5 # a sub drop
fs  anvil1   270589 3094998                  # an anvil struck
fs  anvil2   270588 3094998                  # an anvil struck
fs  clang1   842171 13307919                 # a plain metal clang
tdc clang2   Metal "METAL%2FIMPACT%2FMETLImpt-${SNOW}_Metal%2C%20Clang%2001$J" dur=1.2 fade=0.2
fs  rev1     674292 3130497                  # a crash cymbal reversed, low
fs  rev2     418724 7844747                  # a cymbal reversed

echo "done: $(ls "$OUT" | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1) in $OUT"
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "${#FAILED[@]} problem(s):" >&2
  printf '  %s\n' "${FAILED[@]}" >&2
  exit 1
fi
