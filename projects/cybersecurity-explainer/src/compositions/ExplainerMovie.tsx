import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Scene1Hook } from '../scenes/Scene1Hook';
import { Scene2Scanning } from '../scenes/Scene2Scanning';
import { Scene3HowItWorks } from '../scenes/Scene3HowItWorks';
import { Scene4IndiaBanking } from '../scenes/Scene4IndiaBanking';
import { Scene5Defense } from '../scenes/Scene5Defense';
import { Scene6Ending } from '../scenes/Scene6Ending';

export const ExplainerMovie: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#020617' }}>

      {/* ---------------- BACKGROUND CYBER SOUNDTRACK ---------------- */}
      <Audio
        src={staticFile('audio/cyber_music.wav')}
        volume={0.32}
      />

      {/* ---------------- SCENE 1: THE HOOK (Frames 0 - 180) ---------------- */}
      <Sequence from={0} durationInFrames={180}>
        <Scene1Hook />
      </Sequence>
      {/* Voiceover Scene 1 */}
      <Sequence from={15} durationInFrames={160}>
        <Audio src={staticFile('audio/vo_scene1.wav')} volume={1.0} />
      </Sequence>
      {/* Glitch SFX */}
      <Sequence from={70} durationInFrames={40}>
        <Audio src={staticFile('audio/glitch_sfx.wav')} volume={0.8} />
      </Sequence>

      {/* ---------------- SCENE 2: SCANNING (Frames 180 - 480) ---------------- */}
      <Sequence from={180} durationInFrames={300}>
        <Scene2Scanning />
      </Sequence>
      {/* Voiceover Scene 2 */}
      <Sequence from={195} durationInFrames={280}>
        <Audio src={staticFile('audio/vo_scene2.wav')} volume={1.0} />
      </Sequence>
      {/* Scan Radar SFX */}
      <Sequence from={200} durationInFrames={75}>
        <Audio src={staticFile('audio/scan_sfx.wav')} volume={0.7} />
      </Sequence>

      {/* ---------------- SCENE 3: HOW IT WORKS (Frames 480 - 900) ---------------- */}
      <Sequence from={480} durationInFrames={420}>
        <Scene3HowItWorks />
      </Sequence>
      {/* Voiceover Scene 3 */}
      <Sequence from={495} durationInFrames={400}>
        <Audio src={staticFile('audio/vo_scene3.wav')} volume={1.0} />
      </Sequence>
      {/* Alert SFX */}
      <Sequence from={660} durationInFrames={60}>
        <Audio src={staticFile('audio/alert_sfx.wav')} volume={0.65} />
      </Sequence>

      {/* ---------------- SCENE 4: INDIA FINANCIAL ALERT (Frames 900 - 1200) ---------------- */}
      <Sequence from={900} durationInFrames={300}>
        <Scene4IndiaBanking />
      </Sequence>
      {/* Voiceover Scene 4 */}
      <Sequence from={915} durationInFrames={280}>
        <Audio src={staticFile('audio/vo_scene4.wav')} volume={1.0} />
      </Sequence>
      {/* Beacon SFX */}
      <Sequence from={925} durationInFrames={60}>
        <Audio src={staticFile('audio/alert_sfx.wav')} volume={0.7} />
      </Sequence>

      {/* ---------------- SCENE 5: DEFENSE PILLARS (Frames 1200 - 1440) ---------------- */}
      <Sequence from={1200} durationInFrames={240}>
        <Scene5Defense />
      </Sequence>
      {/* Voiceover Scene 5 */}
      <Sequence from={1215} durationInFrames={220}>
        <Audio src={staticFile('audio/vo_scene5.wav')} volume={1.0} />
      </Sequence>
      {/* Shield Activation SFX */}
      <Sequence from={1205} durationInFrames={75}>
        <Audio src={staticFile('audio/shield_sfx.wav')} volume={0.8} />
      </Sequence>

      {/* ---------------- SCENE 6: ENDING VERDICT (Frames 1440 - 1680) ---------------- */}
      <Sequence from={1440} durationInFrames={240}>
        <Scene6Ending />
      </Sequence>
      {/* Voiceover Scene 6 */}
      <Sequence from={1455} durationInFrames={200}>
        <Audio src={staticFile('audio/vo_scene6.wav')} volume={1.0} />
      </Sequence>
      {/* Final Shield Dome Resonance */}
      <Sequence from={1445} durationInFrames={80}>
        <Audio src={staticFile('audio/shield_sfx.wav')} volume={0.85} />
      </Sequence>

    </AbsoluteFill>
  );
};
