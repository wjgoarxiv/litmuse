# Sound

Films have sound unless the user said otherwise. The treatment's `sound` object (`{ mode, plan, genre?,
palette?, events?, file? }`) plans it on both paths, the renderer muxes the track the plan names, and after
the encode it decodes the film's audio stream and gates it. The score and the generated bed are synthesized
by LitMuse's own code from the treatment: no sample library, model or package is downloaded for either, no
melody is borrowed, and the same treatment always produces the same bytes.

## Choosing a mode

| `sound.mode` | Track | Use it when |
| --- | --- | --- |
| `score` | A layered score built for this film: drums, bass, chords, lead, arrangement FX and the on-screen events as separate stems, mixed and mastered | The default under a bare `lit` and for every rich film, on either path |
| `generated` | One of the style's preset beds: a pad chord progression with a pulse and the accents the beats ask for | Minimal films only (`register: minimal`) |
| `supplied` | The user's file at `sound.file` (relative to the output folder), padded or trimmed to the film | The user handed over a track |
| `authored` | A WAV you wrote into the stage folder, named by `sound.file` | The plan needs sound the bed cannot make; the file must sit inside `<dir>/stage/` |
| `none` | No audio stream | The request asks for silence (무음, 소리 없이, silent, muted, no music …) or the `channel` plays muted by design |

A supplied or authored track is always muxed, whatever the state of the optional analysis tier below.
The reply calls the track "an original score generated for this film" (or "a generated music bed" for a
minimal film) in plain words and names a supplied track by its file name. Switching to `none` to get past a
failing check is a downgrade: the done-check records it and the reply has to admit it.

## The score

The score is produced like a house track from the film itself, so no two films share one.

- **Genre.** `house` (120–126 BPM, four-on-the-floor), `tech-house` (124–128, rolling bass), `deep-house`
  (118–122, pads, light swing) or `garage` (130–134, broken kick, heavy swing). The style picks one
  (swiss-signal house, terminalcore tech-house, tidal deep-house, paper garage); `sound.genre` names
  another when the film asks for it. Launch and hero films stay in house or tech-house.
- **Key, tempo, progression.** Seeded from the request, idea, turn, protagonist and beats: one of twelve
  keys, major or minor, a tempo inside the genre's band, one progression per mode, the last bar home.
- **Arrangement from the beats.** The shots before `story.beat` are intro and build; the drop lands on the
  turn, on a downbeat; with three or more shots after the turn the first is a break and the rest drop again;
  the last shot is the outro. Risers run into every change (strongest into the drop), an impact lands on it,
  a downlifter follows, and a reverse swell breathes into the other changes, with the kick out for the half
  bar before the drop and a snare roll into it.
- **Stems.** `kick`, `clap`, `hats`, `perc`, `bass` (sub and line), `chords` (stab and pad), `lead` (a motif
  off the key's pentatonic), `fx` (risers, impacts, downlifters, reverse swells) and `events`, each its own
  pattern in its own buffer.
- **Mix.** Per-stem gain and pan, a high-pass on everything but kick and bass, bass/chords/lead ducked under
  the kick (the sidechain depth is measured and reported in dB), reverb and tempo-delay sends, bus
  compression, then the shared master stage (−16 LUFS, peak under −2 dBFS).

Write `sound.plan` as the producer's brief (where the drop lands, where it breaks) and put the cue words
in the beats' `sound` fields. `motion.mjs sound` writes `sound/score.wav`, every stem and both returns under
`sound/stems/`, and `sound-cues.json` with genre, key, tempo, progression, sections, FX, stem levels,
sidechain depth, bus settings and every cue.

## Palettes (minimal films)

A minimal film's generated bed takes one of its style's beds exactly (the validator refuses anything
else); the first is the default and the other two let two films in one style differ:

| Style | Default bed | Alternatives |
| --- | --- | --- |
| `swiss-signal` | glass, A minor, 104 | pulse-synth, D minor, 112; soft-keys, C major, 96 |
| `tidal` | felt-strings, D major, 84 | glass, F# minor, 76; soft-keys, Bb major, 72 |
| `terminalcore` | pulse-synth, E minor, 120 | glass, B minor, 132; pulse-synth, A minor, 100 |
| `paper` | soft-keys, F major, 96 | felt-strings, G major, 88; glass, C major, 108 |

Pick the bed for the film's mood and pace: a slower or tenderer film the slower bed, a launch the
brighter one. `sound.palette` is:

```json
{ "timbre": "<timbre>", "key": "<pitch class>", "mode": "<major or minor>", "tempo": "<60-160>" }
```

`key` is any of the twelve pitch classes, written with sharps or flats (`C`, `C#`, `Db` … `B`). `mode`
picks the progression: major walks I–V–vi–IV, minor walks i–VI–III–VII, one chord per treatment beat (a long
beat is split into two-bar chords), and the last chord always returns home. `tempo` is beats per minute
and sets the pulse grid from t = 0. An invalid palette stops the render with exit 16 naming the exact field
(`sound.palette.timbre`, `sound.palette.tempo` …).

Choose the four values for this film. A reflective portrait and a fast product cut should not share a
palette, and two films in a row should not sound like siblings.

| Timbre | Feel | Pad | Pulse | Accent voice |
| --- | --- | --- | --- | --- |
| `soft-keys` | warm, close, unhurried | rounded electric-piano partials, light detune, low-passed at 2.6 kHz | a felt kick on every beat | a felt piano strike |
| `glass` | bright, airy, exact | bell-like odd partials with an octave shimmer, open to 7 kHz | a small tick each beat, a sub note each bar | inharmonic bell partials |
| `pulse-synth` | driving, graphic | a filtered saw pad | eighth-note bass on the chord root under a firm kick | a plucked saw, a noise snap, a pitched riser |
| `felt-strings` | slow, tender, wide | bowed-string partials with vibrato | a brushed noise pulse each beat | a soft felt strike |

As a starting point: intimate or reflective films lean on `soft-keys` or `felt-strings`, clean diagrams and
precise explainers on `glass`, and graphic fast-cut pieces on `pulse-synth`.

## Asking for accents

The bed adds an accent only where a beat's `sound` text asks for one. It reads three kinds of word:

- **hit**: hit, impact, cut, stab, accent, 타격, 히트, 컷, 강세. The hit lands on the cut nearest the beat's
  start when one lies within 0.5 s, else on the beat's start.
- **rise**: rise, riser, swell, build, build-up, lift, 상승, 고조, 빌드업. A filtered noise swell that ends on
  the beat's end (snapped to a cut within 0.5 s) and starts up to 1 s before it, never before the beat.
- **cadence**: cadence, resolve, resolution, close, closing, ending, final chord, 종지, 마무리, 해결. A struck
  tonic chord at 60 % of the beat, ringing to the beat's end, or to the film's end on the last beat.

A beat that names none of these gets pad and pulse only. The cut times come from the beats on the stage
path and from the brief's shots on the type path.

## Events

Cue words tie accents to cuts. Events tie sounds to what moves inside a shot: a latch clicks when the lid
opens, a card lands, a cursor types, a progress bar completes. A score or generated bed on the stage path
lists them in `sound.events`:

```json
"events": [{ "t": 6.42, "on": "the lid clicks open", "kind": "tap" }]
```

- `t`: the second the event happens on screen, read from the page's own timing, never guessed from the beat;
- `on`: what happens at that frame, as a viewer would see it;
- `kind`: `tap` (a short click with a pitched body), `hit` (the cut hit), `whoosh` (air ending on the event)
  or `chime` (two notes of the key: something completes).

At least two events, and at least half of them 0.1 s or more away from every cut, so the sound follows the
picture rather than only the edit. An event never snaps to a cut: it sounds at its own `t`.

`<dir>/sound-cues.json` records each cue with `kind`, `t` in seconds, `beatIndex`, `target` (the boundary or
cut it serves) and `delta` (`t - target`), alongside the timbre, key, tempo, loudness, peak, sample count
and the bed's SHA-256. Look question 6 ("does the sound follow the cuts?") is answered from this file: every
requested accent should sit on its target within one frame, and every beat whose text asked for an accent
should have one.

## Levels and length

- The bed is 48 kHz, 16-bit stereo, exactly `round(frameCount × 48000 / fps)` samples, so it matches the
  picture sample for sample.
- It is normalized to −16 LUFS integrated, measured in product code per ITU-R BS.1770-4 (K-weighting,
  400 ms blocks with 75 % overlap, the −70 LUFS absolute and −10 LU relative gates), through a
  deterministic soft limiter that keeps the sample peak at or under −2 dBFS.
- The pad sounds within the first quarter second; the bed never opens on silence.
- A supplied or authored track is converted to the film's exact length, with a 50 ms fade where it is
  trimmed or padded. The encode never uses `-shortest`, so audio can never cut the picture short.
- Audio is encoded as AAC at 256 kb/s.

## The sound gate

Whenever `mode` is not `none`, the renderer decodes the muxed stream and adds these rules to the gate:

| Rule | Passes when |
| --- | --- |
| `SOUND-STREAM` | an audio stream is present |
| `SOUND-DURATION` | its length is within ±0.1 s of the video |
| `SOUND-PEAK` | the sample peak is at or under −0.5 dBFS |
| `SOUND-HEAD` | no stretch below −50 dBFS RMS (50 ms windows) lasts longer than 1.5 s in the first 3 s |
| `SOUND-LOUDNESS` | reported; a generated bed outside −16 ± 2 LUFS warns |

A missing stream when sound was planned, or a silent head on a generated bed, is exit 20 `SOUND_INVALID`.
A silent head on a supplied or authored track only warns, since the user's music may open quietly. An
authored file outside the stage folder, or a track that cannot be read or converted, is also exit 20 with
the field named.

## Hearing it before the render

```bash
node "$SKILL_ROOT/scripts/motion.mjs" sound --out <dir>
```

This reads `<dir>/treatment.json` and writes the score (`<dir>/sound/score.wav` with its stems) or a
minimal film's bed (`<dir>/sound/bed.wav`), plus `<dir>/sound-cues.json`, so the track can be heard and its
cues checked before a render. For a supplied, authored or silent plan it only reports what the render will
do. The full render rebuilds the track at the film's exact frame count and cut times, so the muxed track
always matches the film sample for sample. Two builds from the same treatment give the same bytes.

## The optional analysis tier

On the type path a supplied track (or the brief's `audio` file) can drive shot timing through a beat grid
made by librosa. That tier lives in a separate venv that the user installs once, from a terminal outside
Muse:

```bash
node "$SKILL_ROOT/scripts/motion-runtime.mjs" install --audio
```

It needs Python 3.10 to 3.14, the range the pinned wheels cover. The newest `python3.X` in that range on PATH
is used, so a newer `python3` is passed over (`LITMUSE_MOTION_PYTHON` names one interpreter instead). It installs hash-pinned wheels
into the LitMuse motion cache. Without it, or when analysis finds fewer than two beats, the render warns
and times shots by reading time (Tier 1); the track itself is still muxed. A render never installs the tier.
