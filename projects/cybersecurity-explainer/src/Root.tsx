import React from 'react';
import { Composition } from 'remotion';
import { ExplainerMovie } from './compositions/ExplainerMovie';
import { Scene1Hook } from './scenes/Scene1Hook';
import { Scene2Scanning } from './scenes/Scene2Scanning';
import { Scene3HowItWorks } from './scenes/Scene3HowItWorks';
import { Scene4IndiaBanking } from './scenes/Scene4IndiaBanking';
import { Scene5Defense } from './scenes/Scene5Defense';
import { Scene6Ending } from './scenes/Scene6Ending';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Master 56-second 1080x1920 Instagram Reel Explainer Film */}
      <Composition
        id="CyberExplainer"
        component={ExplainerMovie}
        durationInFrames={1680}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* Individual Scene Compositions */}
      <Composition
        id="Scene1-Hook"
        component={Scene1Hook}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scene2-Scanning"
        component={Scene2Scanning}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scene3-HowItWorks"
        component={Scene3HowItWorks}
        durationInFrames={420}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scene4-IndiaBanking"
        component={Scene4IndiaBanking}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scene5-Defense"
        component={Scene5Defense}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scene6-Ending"
        component={Scene6Ending}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
