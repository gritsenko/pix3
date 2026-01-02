import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptCreatorService } from './ScriptCreatorService';

describe('ScriptCreatorService', () => {
  let service: ScriptCreatorService;

  beforeEach(() => {
    service = new ScriptCreatorService();
  });

  describe('generateScriptTemplate', () => {
    it('should generate controller template with correct class name', () => {
      const template = (service as any).generateScriptTemplate('PlayerMovement', 'controller');

      expect(template).toContain('export class PlayerMovementController extends ScriptControllerBase');
      expect(template).toContain("nodeType: 'PlayerMovementController'");
      expect(template).toContain('import { ScriptControllerBase } from');
    });

    it('should generate behavior template with correct class name', () => {
      const template = (service as any).generateScriptTemplate('RotateObject', 'behavior');

      expect(template).toContain('export class RotateObjectBehavior extends BehaviorBase');
      expect(template).toContain("nodeType: 'RotateObjectBehavior'");
      expect(template).toContain('import { BehaviorBase } from');
    });

    it('should include lifecycle methods', () => {
      const template = (service as any).generateScriptTemplate('Test', 'controller');

      expect(template).toContain('onAttach()');
      expect(template).toContain('onStart()');
      expect(template).toContain('onUpdate(dt: number)');
      expect(template).toContain('onDetach()');
    });

    it('should include property schema boilerplate', () => {
      const template = (service as any).generateScriptTemplate('Test', 'controller');

      expect(template).toContain('static getPropertySchema(): PropertySchema');
      expect(template).toContain('properties: [');
      expect(template).toContain('// Add property definitions here');
    });

    it('should include constructor with parameters initialization', () => {
      const template = (service as any).generateScriptTemplate('Test', 'behavior');

      expect(template).toContain('constructor(id: string, type: string)');
      expect(template).toContain('super(id, type)');
      expect(template).toContain('this.parameters = {');
    });

    it('should include helpful comments and examples', () => {
      const template = (service as any).generateScriptTemplate('MyScript', 'controller');

      expect(template).toContain('Auto-generated script');
      expect(template).toContain('// Implement your update logic here');
    });

    it('should use correct import paths', () => {
      const template = (service as any).generateScriptTemplate('Test', 'behavior');

      expect(template).toContain("import { BehaviorBase } from '@/core/ScriptComponent'");
      expect(template).toContain("import type { PropertySchema } from '@/fw'");
    });
  });

  describe('service lifecycle', () => {
    it('should track active creators', () => {
      expect(service.getCreators()).toHaveLength(0);

      void service.showCreator({
        scriptName: 'TestScript',
        scriptType: 'controller',
      });

      expect(service.getCreators()).toHaveLength(1);
      expect(service.getCreators()[0].params.scriptName).toBe('TestScript');
    });

    it('should remove creator after cancellation', () => {
      void service.showCreator({
        scriptName: 'TestScript',
        scriptType: 'controller',
      });

      const creatorId = service.getCreators()[0].id;
      service.cancel(creatorId);

      expect(service.getCreators()).toHaveLength(0);
    });
  });
});
