import { Character } from '../schemas/index.js';

export class CharacterManagerAgent {
  /**
   * Generates character layer breakdown and bone/pivot structures
   */
  async createCharacter(name: string, description: string): Promise<Character> {
    return {
      id: `char_${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      description,
      colorPalette: ['#22c55e', '#16a34a', '#86efac', '#15803d', '#ffffff'],
      parts: [
        { id: 'torso', name: 'Torso', layerName: 'body_torso', pivot: { x: 0.5, y: 0.8 }, zIndex: 10 },
        { id: 'head', name: 'Head', layerName: 'body_head', pivot: { x: 0.5, y: 0.9 }, zIndex: 20, parentPartId: 'torso' },
        { id: 'eye_left', name: 'Left Eye', layerName: 'face_eye_l', pivot: { x: 0.5, y: 0.5 }, zIndex: 22, parentPartId: 'head' },
        { id: 'eye_right', name: 'Right Eye', layerName: 'face_eye_r', pivot: { x: 0.5, y: 0.5 }, zIndex: 22, parentPartId: 'head' },
        { id: 'mouth', name: 'Mouth', layerName: 'face_mouth', pivot: { x: 0.5, y: 0.5 }, zIndex: 23, parentPartId: 'head' },
        { id: 'arm_left', name: 'Left Arm', layerName: 'limb_arm_l', pivot: { x: 0.8, y: 0.2 }, zIndex: 5, parentPartId: 'torso' },
        { id: 'arm_right', name: 'Right Arm', layerName: 'limb_arm_r', pivot: { x: 0.2, y: 0.2 }, zIndex: 25, parentPartId: 'torso' },
        { id: 'leg_left', name: 'Left Leg', layerName: 'limb_leg_l', pivot: { x: 0.5, y: 0.1 }, zIndex: 8, parentPartId: 'torso' },
        { id: 'leg_right', name: 'Right Leg', layerName: 'limb_leg_r', pivot: { x: 0.5, y: 0.1 }, zIndex: 8, parentPartId: 'torso' },
      ],
    };
  }
}
