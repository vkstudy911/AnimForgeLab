import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Scene1Forest } from '../scenes/Scene1Forest';
import { Scene2FallingStar } from '../scenes/Scene2FallingStar';
import { Scene3SavingStar } from '../scenes/Scene3SavingStar';
import { Scene4MountainClimb } from '../scenes/Scene4MountainClimb';
import { Scene5ReturningStar } from '../scenes/Scene5ReturningStar';
import { Scene6MagicalEnding } from '../scenes/Scene6MagicalEnding';

export const MainMovie: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>

      {/* ---------------- AUDIO TRACKS ---------------- */}
      {/* 1. Master Emotional Music Score (Full movie 38s) */}
      <Audio
        src={staticFile('audio/music.wav')}
        volume={0.75}
      />

      {/* 2. Scene 1 & 2 Forest Ambience (Frames 0 - 300) */}
      <Sequence from={0} durationInFrames={300}>
        <Audio
          src={staticFile('audio/forest.wav')}
          volume={0.35}
        />
      </Sequence>

      {/* 3. Scene 2 Star Falling Whoosh (Around frame 165) */}
      <Sequence from={165} durationInFrames={75}>
        <Audio
          src={staticFile('audio/star_whoosh.wav')}
          volume={0.8}
        />
      </Sequence>

      {/* 4. Scene 3 Gentle Star Pickup Chime (Around frame 360) */}
      <Sequence from={360} durationInFrames={90}>
        <Audio
          src={staticFile('audio/star_pickup.wav')}
          volume={0.7}
        />
      </Sequence>

      {/* 5. Scene 4 Mountain Wind Gale (Frames 480 - 720) */}
      <Sequence from={480} durationInFrames={240}>
        <Audio
          src={staticFile('audio/mountain_wind.wav')}
          volume={0.65}
        />
      </Sequence>

      {/* 6. Scene 5 Star Launch Whoosh (Around frame 780) */}
      <Sequence from={780} durationInFrames={100}>
        <Audio
          src={staticFile('audio/star_launch.wav')}
          volume={0.85}
        />
      </Sequence>

      {/* 7. Scene 6 Celestial Galaxy Sparkle (Around frame 945) */}
      <Sequence from={945} durationInFrames={195}>
        <Audio
          src={staticFile('audio/galaxy_sparkle.wav')}
          volume={0.9}
        />
      </Sequence>

      {/* ---------------- SCENE VIDEO SEQUENCES ---------------- */}
      {/* Scene 1: The Magical Forest (0s - 5s, 150 frames) */}
      <Sequence from={0} durationInFrames={150}>
        <Scene1Forest />
      </Sequence>

      {/* Scene 2: The Falling Star (5s - 10s, 150 frames) */}
      <Sequence from={150} durationInFrames={150}>
        <Scene2FallingStar />
      </Sequence>

      {/* Scene 3: Saving the Star (10s - 16s, 180 frames) */}
      <Sequence from={300} durationInFrames={180}>
        <Scene3SavingStar />
      </Sequence>

      {/* Scene 4: The Mountain Journey (16s - 24s, 240 frames) */}
      <Sequence from={480} durationInFrames={240}>
        <Scene4MountainClimb />
      </Sequence>

      {/* Scene 5: Returning the Star (24s - 31s, 210 frames) */}
      <Sequence from={720} durationInFrames={210}>
        <Scene5ReturningStar />
      </Sequence>

      {/* Scene 6: Magical Ending (31s - 38s, 210 frames) */}
      <Sequence from={930} durationInFrames={210}>
        <Scene6MagicalEnding />
      </Sequence>

    </AbsoluteFill>
  );
};
