# AnimForge Demo 01 — The Little Robot & The Lost Star

A complete 38-second 3D-styled animated short film produced in the **AnimForgeLab** workspace using Remotion, React, TypeScript, SVG skeletal character rigging, and synchronized stereo sound design.

---

## Film Overview

- **Title:** The Little Robot & The Lost Star
- **Genre:** Fantasy, Adventure, Emotional
- **Duration:** 38.0 seconds (1,140 frames @ 30 fps)
- **Aspect Ratio:** 9:16 (Vertical format for Instagram Reels / YouTube Shorts)
- **Resolution:** 1080 × 1920 (FHD Vertical)
- **Render Output:** [`output/lost-star-final.mp4`](output/lost-star-final.mp4) (H.264 + AAC Stereo, 7.5 MB)
- **Preview Stills:**
  - Scene 1 (Forest Walk): [`output/preview-scene1.png`](output/preview-scene1.png)
  - Scene 3 (Saving the Star): [`output/preview-scene3.png`](output/preview-scene3.png)
  - Scene 6 (Galaxy Resolution): [`output/preview-scene6.png`](output/preview-scene6.png)

---

## Narrative & Scene Breakdown

| Scene | Duration | Frames | Story Beat | Camera & Sound Design |
| :--- | :--- | :--- | :--- | :--- |
| **Scene 1: The Magical Forest** | 0s–5s | 0–150 | A cute green robot wanders through an ancient glowing forest. | Parallax tracking shot; gentle nocturnal breeze, crickets, metallic footsteps. |
| **Scene 2: The Falling Star** | 5s–10s | 150–300 | A blazing star streaks diagonally across the sky and impacts the moss. | Fast camera follow; ethereal falling whoosh followed by crystalline impact chime. |
| **Scene 3: Saving the Star** | 10s–16s | 300–480 | Robot kneels and tenderly scoops up the weakly glowing star. | Medium close-up zoom; warm golden reflection on visor, gentle chime heartbeat. |
| **Scene 4: The Mountain Journey** | 16s–24s | 480–720 | Robot scales a steep 45° mountain cliff against fierce howling gale. | Handheld camera shake, blowing wind dust; robot wobbles and hugs the star to protect it. |
| **Scene 5: Returning the Star** | 24s–31s | 720–930 | At the mountain summit, robot crouches and casts the star skyward. | Vertical crane follow; wind fades, deep bass crescendo into soaring launch whoosh. |
| **Scene 6: Magical Ending** | 31s–38s | 930–1140 | Star detonates into a radiant galaxy of constellations; robot smiles. | Pull-back reveal; triumphant orchestral swell, shimmering starlight, 2s final frame hold. |

**Final Message:**
> *"Sometimes, even the smallest hands can bring back the biggest light."*

---

## Character Rig Architecture (`src/characters/Robot.tsx`)

The green robot is built as a single, fully reusable component maintaining consistent visual proportions across all six scenes:
- **Materials:** Soft green metallic shaders (`metalGreenMain`, `metalGreenDark`, `metalHighlight`) with specular highlights and drop shadows.
- **Pivots & Hierarchy:**
  - `Neck pivot (170, 180)`: Tilts $\pm 55^\circ$ for looking up, down, or surprised.
  - `Left shoulder (100, 215)` & `Right shoulder (240, 215)`: Full $360^\circ$ rotation for walking, cradling the star, or throwing skyward.
  - `Left hip (130, 290)` & `Right hip (210, 290)`: Natural pendulum stride rotation with magnetic boot thrusters.
  - `Antenna base (170, 65)`: Bouncy antenna with a glowing orb tip.
- **Facial Rigging:**
  - Dynamic eye states: `normal`, `blink`, `wide` (surprised), `concerned`, and `happy`.
  - Dynamic mouth states: `neutral`, `o` (gasp), `concerned`, `smile`, and `happy_beam`.
  - Chest Core: Pulsing cyan/emerald reactor with energy ring rivets.

---

## Project Structure

```text
AnimForgeLab/projects/demo-animation/
├── public/
│   └── audio/                  # 7 synthesized stereo WAV sound files
│       ├── music.wav           # Master 38.5s emotional orchestral score
│       ├── forest.wav          # Nocturnal woodland ambience
│       ├── star_whoosh.wav     # Falling star whoosh
│       ├── star_pickup.wav     # Ethereal glass chime
│       ├── mountain_wind.wav   # Gusting mountain wind
│       ├── star_launch.wav     # Energetic upward launch sweep
│       └── galaxy_sparkle.wav  # Shimmering constellation chimes
│
├── src/
│   ├── characters/
│   │   └── Robot.tsx           # Reusable parametric robot rig with pivots
│   ├── effects/
│   │   ├── StarAsset.tsx       # Glowing star with volumetric corona & trail
│   │   └── ParticleField.tsx   # Fireflies, wind particles, and cosmic stars
│   ├── scenes/
│   │   ├── Scene1Forest.tsx        # Scene 1: Night forest walk
│   │   ├── Scene2FallingStar.tsx   # Scene 2: Falling star & reaction
│   │   ├── Scene3SavingStar.tsx    # Scene 3: Kneeling & cradling star
│   │   ├── Scene4MountainClimb.tsx # Scene 4: Gale struggle on cliff
│   │   ├── Scene5ReturningStar.tsx # Scene 5: Summit throw into sky
│   │   └── Scene6MagicalEnding.tsx # Scene 6: Galaxy reveal & quote
│   ├── compositions/
│   │   └── MainMovie.tsx       # Master composition with sequenced audio
│   ├── Root.tsx                # Remotion root registering all compositions
│   └── index.ts                # Remotion entrypoint
│
├── storyboard.json             # Complete JSON storyboard metadata
├── package.json
├── tsconfig.json
├── README.md
└── output/
    ├── lost-star-final.mp4     # Finished 1080x1920 MP4 video (38s)
    ├── preview-scene1.png      # Still frame 75
    ├── preview-scene3.png      # Still frame 390
    └── preview-scene6.png      # Still frame 1050
```

---

## How to Run & Render

### 1. Launch Remotion Studio (Interactive Scrubbing)
```bash
cd AnimForgeLab/projects/demo-animation
npm start
```
Opens Remotion Studio in your browser to inspect every frame, timeline track, and audio sync.

### 2. Render Final MP4 Video
```bash
cd AnimForgeLab/projects/demo-animation
npm run build
```
Renders all 1,140 frames to `output/lost-star-final.mp4`.

### 3. Extract High-Resolution Preview Still
```bash
npm run still
```
Extracts a frame still to `output/preview.png`.
