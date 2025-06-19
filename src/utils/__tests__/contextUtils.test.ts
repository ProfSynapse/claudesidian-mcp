import { parseWorkspaceContext, serializeWorkspaceContext, WorkspaceContext } from '../contextUtils';

describe('contextUtils', () => {
  describe('parseWorkspaceContext', () => {
    it('should parse string representation of workspace context', () => {
      const stringContext = JSON.stringify({
        workspaceId: 'test-workspace-123',
        workspacePath: ['project', 'phase1']
      });
      
      const parsed = parseWorkspaceContext(stringContext);
      
      expect(parsed).not.toBeNull();
      expect(parsed?.workspaceId).toBe('test-workspace-123');
      expect(parsed?.workspacePath).toEqual(['project', 'phase1']);
      expect(parsed?.activeWorkspace).toBe(true);
    });
    
    it('should handle object representation of workspace context', () => {
      const objContext = {
        workspaceId: 'test-workspace-456',
        workspacePath: ['project', 'phase2']
      };
      
      const parsed = parseWorkspaceContext(objContext);
      
      expect(parsed).not.toBeNull();
      expect(parsed?.workspaceId).toBe('test-workspace-456');
      expect(parsed?.workspacePath).toEqual(['project', 'phase2']);
    });
    
    it('should handle undefined or null workspace context', () => {
      expect(parseWorkspaceContext(undefined)).toBeNull();
      expect(parseWorkspaceContext(null)).toBeNull();
    });
    
    it('should use fallback ID when workspaceId is missing', () => {
      // In TypeScript this would be an actual WorkspaceContext, but for the test we're 
      // simulating what happens when a user passes an object without workspaceId
      const contextWithoutId = {
        workspacePath: ['project', 'phase3']
      } as any;
      
      const parsed = parseWorkspaceContext(contextWithoutId);
      
      expect(parsed).not.toBeNull();
      if (parsed) {
        expect(parsed.workspaceId).toBe('default-workspace');
        expect(parsed.workspacePath).toEqual(['project', 'phase3']);
      }
    });
    
    it('should handle custom fallback ID', () => {
      // In TypeScript this would be an actual WorkspaceContext, but for the test we're 
      // simulating what happens when a user passes an object without workspaceId
      const contextWithoutId = {
        workspacePath: ['project', 'phase4']
      } as any;
      
      const parsed = parseWorkspaceContext(contextWithoutId, 'custom-fallback');
      
      expect(parsed).not.toBeNull();
      if (parsed) {
        expect(parsed.workspaceId).toBe('custom-fallback');
        expect(parsed.workspacePath).toEqual(['project', 'phase4']);
      }
    });
    
    it('should handle invalid JSON string with fallback', () => {
      const invalidJson = '{invalid json';
      
      const parsed = parseWorkspaceContext(invalidJson, 'fallback-for-invalid');
      
      expect(parsed).not.toBeNull();
      if (parsed) {
        expect(parsed.workspaceId).toBe('fallback-for-invalid');
        expect(parsed.workspacePath).toEqual([]);
      }
    });
  });
  
  describe('serializeWorkspaceContext', () => {
    it('should serialize workspace context to JSON string', () => {
      const context: WorkspaceContext = {
        workspaceId: 'test-workspace-789',
        workspacePath: ['project', 'phase5'],
        activeWorkspace: true
      };
      
      const serialized = serializeWorkspaceContext(context);
      
      expect(typeof serialized).toBe('string');
      const parsed = JSON.parse(serialized);
      expect(parsed.workspaceId).toBe('test-workspace-789');
      expect(parsed.workspacePath).toEqual(['project', 'phase5']);
      expect(parsed.activeWorkspace).toBe(true);
    });
  });
});