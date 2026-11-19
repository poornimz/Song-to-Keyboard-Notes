# Song to Keyboard Notes

An interactive, browser-based **Audio-to-Piano-MIDI Studio** built with React, TypeScript, Tailwind CSS, Express, and Google's open-source **`@magenta/music`** (`OnsetsAndFrames`) running locally in your browser via **TensorFlow.js** — with zero external AI or LLM API calls.

Upload a song, paste a direct audio file link, or use the built-in piano test clips to inspect the **229-bin log-Mel spectrogram**, transcribe melodies and chords into **88-key piano MIDI notes**, filter out faint overtone ghost notes, and play along on a **61-key virtual piano keyboard**.

---

## Multi-Song Testing & Featured Analysis

This project was tested across **multiple real-world songs and piano BGMs**—including Tamil film scores, contemporary solo piano pieces, and classical etudes—to validate onset accuracy, chord grouping, and play-along synchronization across different tempos and frequency registers.

### Featured Case Study: *Nee Paartha Vizhigal* (Tamil Song BGM)

Among the tested tracks, the piano BGM from ***Nee Paartha Vizhigal*** transcribed exceptionally well because its musical profile aligns closely with the strengths of Magenta's `OnsetsAndFrames` neural network:

- **Tone & Timbre:** Bright, expressive acoustic piano timbre with minimal percussion or vocal bleed. Clean hammer transients produce sharp onset peaks in the 229-bin Mel spectrogram, while gentle harmonic decay avoids muddying adjacent notes.
- **High-Register Melody Focus:** The emotional lead motif sits predominantly in the **upper-middle to high register (`C5`–`C6`)**, standing well above the left-hand harmonic foundation. That vertical pitch separation makes it effortless for the CNN+RNN heads to distinguish the right-hand melody from left-hand chords.
- **Tempo & Phrasing:** Slow-to-moderate ballad tempo (~`68–76 BPM` with expressive rubato spacing) leaves generous time between individual melodic notes and chord changes, allowing the `55 ms` chord-grouping pass in `In [3]` to cleanly isolate harmonies and single-note phrasing.
- **Velocity & Overtone Control:** Because the piece uses soft sustain pedal resonance, lowering or raising the **Minimum Key Velocity** slider (`30–45`) cleanly removes faint sympathetic string overtones while preserving every intentional melody and bass note.

### Other Tested & Ideal Songs

| Track / Song | Style & Register | Why It Transcribes Well |
| :--- | :--- | :--- |
| ***Nee Paartha Vizhigal*** (Tamil Song BGM) | Emotional high-register solo piano | Crisp upper-octave lead notes, slow expressive tempo, and clean sustain produce accurate right-hand melodies and harmonic voicings. |
| ***Munbe Vaa*** (Tamil Piano BGM / Cover) | Warm melodic ballad | Steady phrasing and distinct chord transitions separate bass root notes cleanly from the vocal-line melody. |
| ***Enna Solla Pogirai*** (Piano Instrumental) | Expressive lyrical solo piano | Open chord voicings and clear rhythmic spacing map accurately to `C2–C7` keyboard steps. |
| ***River Flows in You*** (Yiruma) | Contemporary solo piano | Classic arpeggiated left-hand patterns and bright right-hand motifs showcase 55 ms chord grouping and piano roll dynamics. |
| ***Nuvole Bianche*** (Ludovico Einaudi) | Minimalist neoclassical piano | Clean repetitive harmonic patterns ideal for testing `1m` / `2m` analysis windows and `0.75x` practice playback. |
| ***First Step — Interstellar*** (Hans Zimmer Piano Cover) | Cinematic arpeggio & ostinato | Repeated rhythmic motifs highlight real-time key illumination and `Layered A+B` ear comparison. |
| ***Für Elise*** (Beethoven) | Classical piano etude | Well-defined staccato and legato passages demonstrate onset/offset precision across registers. |

*(Tip: For full-length songs or vocals-heavy mixes, select the piano-solo intro or BGM bridge using the **Clip Start Offset** slider and a `25s`–`2m` **Analysis Window**, or upload an isolated piano cover `.mp3`/`.wav`.)*

---

## The 61-Key Virtual Keyboard (`C2–C7` · 5 Octave Parts)

While `OnsetsAndFrames` predicts across the full 88-key grand piano range (`A0` MIDI 21 – `C8` MIDI 108), the interactive play-along keyboard and piano roll in `In [3]` and `In [4]` are modeled on a standard **61-key synthesizer/arranger keyboard (`C2` MIDI 36 to `C7` MIDI 96)**—comprising **36 white keys + 25 black keys** organized into **5 functional octave parts**:

1. **Part 1 — Octave 2 (`C2`–`B2`, MIDI 36–47):** Deep bass root notes and left-hand octave anchors.
2. **Part 2 — Octave 3 (`C3`–`B3`, MIDI 48–59):** Left-hand chord voicings, fifths, and flowing broken-chord arpeggios.
3. **Part 3 — Octave 4 (`C4`–`B4`, MIDI 60–71):** Middle-C core harmony zone where inner accompaniment and warm mid-register melodies meet.
4. **Part 4 — Octave 5 (`C5`–`B5`, MIDI 72–83):** Primary vocal-lead and right-hand melody register (the sweet spot for *Nee Paartha Vizhigal*'s emotional piano theme).
5. **Part 5 — Octave 6 + Top `C7` (`C6`–`C7`, MIDI 84–96):** High-register emotional peaks, octave-doubled climaxes, and upper harmonic sparkle.

Every key is clickable for instant auditioning and illuminates in real time during playback via a custom **Web Audio API polyphonic piano synthesizer** (triangle fundamental + 2nd/3rd harmonic sine oscillators, velocity-scaled low-pass filter, and ADSR envelope).

---

## Notebook Pipeline (`In [1]` – `In [4]`)

1. **`In [1]` — Load Pretrained Onsets & Frames Model**
   - Loads `OnsetsAndFrames` (`onsets_frames_uni`) directly into TensorFlow.js (`WebGL` / `CPU`) on demand or automatically when transcription starts.
   - Displays the TypeScript loader snippet, active backend, load latency (`ms`), 229 Mel-bin input spec (`16 kHz` mono), and 88-key MIDI pitch range (`A0` 21 – `C8` 108).

2. **`In [2]` — Load Song Audio, Slice Clip & Render Mel Spectrogram**
   - **Upload Song File:** Drag-and-drop or select `.mp3`, `.wav`, `.m4a`, or `.ogg` decoded locally via `AudioContext.decodeAudioData`.
   - **Direct Audio URL:** Fetched through a secure Express proxy (`POST /api/fetch-audio`) with `http`/`https` validation, SSRF IP blocking, a `25 MB` file cap, and clear rejection messages for HTML pages or DRM streams.
   - **Built-In Piano Clips:** Four offline-rendered `AudioBuffer` clips (*C Major Chord Progression*, *A Minor Arpeggio Etude*, *Emotional High-Register Ballad*, and *Cinematic D Minor Waltz*) synthesized via `OfflineAudioContext`.
   - **Slicing & Visualization:** Adjust **Clip Start Offset**, choose an **Analysis Window** (`6s`, `10s`, `15s`, `25s`, `1m`, `2m`), preview audio, and inspect the exact **229-bin Mel spectrogram** rendered by Magenta's `preprocessAudio`.

3. **`In [3]` — Transcribe Audio to Keyboard Notes & Piano Roll**
   - Runs `transcribeFromMelSpec` on the active audio window and reports inference latency in `ms`.
   - Filter overtone ghost notes in real time with the **Minimum Key Velocity** slider (`10`–`90`).
   - Inspect notes on an interactive **`C2–C7` Piano Roll** canvas with hover tooltips, click-to-seek, and a tabbed **Notes Timeline** (grouping simultaneous notes within `55 ms` into readable chords like `C4 + E4 + G4`) alongside raw **`INoteSequence` JSON**.

4. **`In [4]` — Interactive Play-Along Virtual Keyboard & Export**
   - Clickable **61-key virtual piano (`C2`–`C7`)** powered by a zero-latency Web Audio API polyphonic piano synthesizer (triangle + harmonic sine oscillators, velocity-scaled low-pass filter, and ADSR envelope) and lookahead scheduler.
   - Compare accuracy by ear with the **Audio Monitor** switch (`Piano Notes`, `Original Clip`, `Layered A+B`), adjust **Practice Speed** (`0.50x`–`1.25x`), and toggle **Loop**.
   - Export results with **Copy Note List** or **Export MIDI** (`.mid` via `@magenta/music/esm/core/midi_io`).

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, HTML5 Canvas, Web Audio API
- **ML / Audio:** `@magenta/music` (`OnsetsAndFrames`, `preprocessAudio`, `sequenceProtoToMidi`), `@tensorflow/tfjs`
- **Backend:** Express (`server.ts`) with SSRF-protected `/api/fetch-audio` proxy and Vite dev middleware

---

## Running Locally in VS Code

### Prerequisites
- **Node.js 22+** (or Node.js 20+ for `npm run dev`)

### Setup & Development
```bash
npm install
npm run dev
```
Open **http://localhost:3000** in your browser.

### Production Build
```bash
npm run build
NODE_ENV=production npm start
```
*(On Windows PowerShell: `$env:NODE_ENV="production"; npm start`)*

### Typechecking
```bash
npm run lint
```
