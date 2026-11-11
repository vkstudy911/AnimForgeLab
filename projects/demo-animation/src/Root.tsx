import React from 'react';
import { Composition } from 'remotion';
import { MainMovie } from './compositions/MainMovie';
import { Scene1Forest } from './scenes/Scene1Forest';
import { Scene2FallingStar } from './scenes/Scene2FallingStar';
import { Scene3SavingStar } from './scenes/Scene3SavingStar';
import { Scene4MountainClimb } from './scenes/Scene4MountainClimb';
import { Scene5ReturningStar } from './scenes/Scene5ReturningStar';
import { Scene6MagicalEnding } from './scenes/Scene6MagicalEnding';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Master 38-second 1080x1920 Instagram Reel Movie */}
      <Composition
        id="LostStarMovie"
        component={MainMovie}
        durationInFrames={1140}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* Individual Scene Compositions for Fast Preview & Diagnostics */}
      <Composition
        id="Scene1-Forest"
        component={Scene1Forest}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scene2-FallingStar"
        component={Scene2FallingStar}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scene3-SavingStar"
        component={Scene3SavingStar}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scene4-MountainClimb"
        component={Scene4MountainClimb}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scene5-ReturningStar"
        component={Scene5ReturningStar}
        durationInFrames={210}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Scene6-MagicalEnding"
        component={Scene6MagicalEnding}
        durationInFrames={210}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
