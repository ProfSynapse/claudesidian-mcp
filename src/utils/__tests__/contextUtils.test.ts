import { parseWorkspaceContext, serializeWorkspaceContext, WorkspaceContext } from '../contextUtils';

describe('contextUtils', () => {
  describe('parseWorkspaceContext', () => {
    it('should parse valid JSON string context', () => {
      const jsonContext = JSON.stringify({ 
        workspaceId: 'test-123', 
        workspacePath: ['path1', 'path2'] 
      });
      
      const parsed = parseWorkspaceContext(jsonContext);
      
      expect(parsed).toEqual({
        workspaceId: 'test-123',
        workspacePath: ['path1', 'path2'],
        activeWorkspace: true
      });
    });
    
    it('should use fallback for invalid JSON', () => {
      const invalidJson = '{not-valid-json}';
      const parsed = parseWorkspaceContext(invalidJson, 'fallback-id');
      
      expect(parsed).toEqual({
        workspaceId: 'fallback-id',
        workspacePath: [],
        activeWorkspace: true
      });
    });
    
    it('should handle object input directly', () => {
      const objContext = { 
        workspaceId: 'obj-123', 
        workspacePath: ['obj-path'],
        activeWorkspace: false
      };
      
      const parsed = parseWorkspaceContext(objContext);
      
      expect(parsed).toEqual({
        workspaceId: 'obj-123',
        workspacePath: ['obj-path'],
        activeWorkspace: false
      });
    });
    
    it('should use fallback for missing workspaceId', () => {
      const incompleteContext = { workspacePath: ['path'] };
      const parsed = parseWorkspaceContext(incompleteContext as any, 'fallback-id');
      
      expect(parsed).toEqual({
        workspaceId: 'fallback-id',
        workspacePath: [],
        activeWorkspace: true
      });
    });
    
    it('should handle undefined input with fallback', () => {
      const parsed = parseWorkspaceContext(undefined, 'undefined-fallback');
      
      expect(parsed).toEqual({
        workspaceId: 'undefined-fallback',
        workspacePath: [],
        activeWorkspace: true
      });
    });
    
    it('should normalize the workspacePath to an array', () => {
      const badContext = { workspaceId: 'test', workspacePath: 'not-an-array' as any };
      const parsed = parseWorkspaceContext(badContext);
      
      expect(parsed.workspacePath).toEqual([]);
    });
  });
  
  describe('serializeWorkspaceContext', () => {
    it('should serialize context to JSON string', () => {
      const context: WorkspaceContext = {
        workspaceId: 'serialize-123',
        workspacePath: ['foo', 'bar'],
        activeWorkspace: true
      };
      
      const serialized = serializeWorkspaceContext(context);
      const parsed = JSON.parse(serialized);
      
      expect(parsed).toEqual({
        workspaceId: 'serialize-123',
        workspacePath: ['foo', 'bar'],
        activeWorkspace: true
      });
    });
    
    it('should handle missing optional fields', () => {
      const minimalContext: WorkspaceContext = {
        workspaceId: 'minimal-123'
      };
      
      const serialized = serializeWorkspaceContext(minimalContext);
      const parsed = JSON.parse(serialized);
      
      expect(parsed).toEqual({
        workspaceId: 'minimal-123',
        workspacePath: [],
        activeWorkspace: true
      });
    });
  });
});