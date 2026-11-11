import { Storyboard, Character, Scene } from '../schemas/index.js';

export class ScenePlannerAgent {
  /**
   * Plans individual scenes with durations, transitions, and character actions
   */
  async planScenes(projectId: string, storyboard: Storyboard, character: Character): Promise<Scene[]> {
    return storyboard.beats.map((beat, index) => {
      return {
        id: `scene_${index + 1}`,
        projectId,
        sequenceIndex: index,
        title: beat.sceneTitle,
        description: beat.visualSummary,
        duration: beat.targetDurationSeconds,
        characterIds: [character.id],
        transition: {
          type: index === 0 ? 'fade' : 'dissolve',
          duration: 0.5,
        },
        timeline: {
          duration: beat.targetDurationSeconds,
          fps: 30,
          characterActions: this.getActionsForBeat(beat.beatNumber, beat.targetDurationSeconds),
          cameraMoves: this.getCameraMoveForBeat(beat.beatNumber, beat.targetDurationSeconds),
          audioTracks: [],
        },
      };
    });
  }

  private getActionsForBeat(beatNumber: number, duration: number) {
    if (beatNumber === 1) {
      return [
        { actionId: 'act_walk_in', name: 'walk' as const, startTime: 0, duration: 2.0, parameters: { speed: 1.2 } },
        { actionId: 'act_look', name: 'look_around' as const, startTime: 2.0, duration: 1.5, parameters: { angle: 25 } },
        { actionId: 'act_blink_1', name: 'blink' as const, startTime: 1.2, duration: 0.3, parameters: {} },
      ];
    }
    if (beatNumber === 2) {
      return [
        { actionId: 'act_wave', name: 'wave' as const, startTime: 0.5, duration: 2.5, parameters: { arm: 'right', cycles: 3 } },
        { actionId: 'act_smile', name: 'smile' as const, startTime: 0.8, duration: 3.0, parameters: { intensity: 1.0 } },
        { actionId: 'act_blink_2', name: 'blink' as const, startTime: 2.2, duration: 0.3, parameters: {} },
      ];
    }
    return [
      { actionId: 'act_turn', name: 'walk' as const, startTime: 0.5, duration: duration - 0.5, parameters: { direction: 'forward_away' } },
    ];
  }

  private getCameraMoveForBeat(beatNumber: number, duration: number) {
    if (beatNumber === 2) {
      return [
        {
          type: 'zoom' as const,
          startX: 0,
          startY: 0,
          endX: 0,
          endY: 0,
          startZoom: 1.0,
          endZoom: 1.15,
          easing: 'ease-in-out' as const,
          duration,
        },
      ];
    }
    if (beatNumber === 3) {
      return [
        {
          type: 'push' as const,
          startX: 0,
          startY: 0,
          endX: 30,
          endY: -20,
          startZoom: 1.0,
          endZoom: 1.2,
          easing: 'ease-in-out' as const,
          duration,
        },
      ];
    }
    return [
      {
        type: 'static' as const,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        startZoom: 1.0,
        endZoom: 1.0,
        easing: 'linear' as const,
        duration,
      },
    ];
  }
}
