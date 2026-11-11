import React from 'react';
import { Composition } from 'remotion';
import { MyComp } from './MyComp';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MyComp"
      component={MyComp}
      durationInFrames={90}
      fps={30}
      width={1280}
      height={720}
    />
  );
};
