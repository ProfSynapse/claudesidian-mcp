import { SearchOperations } from '../../agents/vaultLibrarian/utils/SearchOperations';
import { App, TFile, CachedMetadata } from 'obsidian';

// Mock Obsidian's App, TFile, and CachedMetadata
const createMockApp = () => {
  const files = [
    { path: 'file1.md', content: 'This is a test file with some content' },
    { path: 'file2.md', content: 'Another test file with different content' },
    { path: 'notes/file3.md', content: 'A file in a subfolder with test content' },
  ];

  const fileCache = new Map<string, any>();
  fileCache.set('file1.md', {
    frontmatter: {
      title: 'Test File 1',
      tags: ['test', 'example'],
      lastViewedAt: new Date().toISOString(),
      accessCount: 5
    },
    tags: [{ tag: '#test', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 0 } } }]
  });
  fileCache.set('file2.md', {
    frontmatter: {
      title: 'Test File 2',
      category: 'example',
      description: 'An example test file'
    }
  });
  fileCache.set('notes/file3.md', {
    frontmatter: {
      title: 'Test File in Notes',
      tags: ['notes', 'test']
    },
    tags: [
      { tag: '#notes', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 0 } } },
      { tag: '#test', position: { start: { line: 0, col: 0 }, end: { line: 0, col: 0 } } }
    ]
  });

  return {
    vault: {
      getMarkdownFiles: () => files.map(f => ({ path: f.path } as TFile)),
      read: async (file: TFile) => {
        const foundFile = files.find(f => f.path === file.path);
        return foundFile ? foundFile.content : '';
      }
    },
    metadataCache: {
      getFileCache: (file: TFile) => fileCache.get(file.path) as CachedMetadata
    }
  } as unknown as App;
};

describe('SearchOperations', () => {
  let app: App;
  let searchOperations: SearchOperations;

  beforeEach(() => {
    app = createMockApp();
    searchOperations = new SearchOperations(app);
  });

  test('search should find files matching query', async () => {
    const results = await searchOperations.search('test');
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.file.path === 'file1.md')).toBe(true);
    expect(results.some(r => r.file.path === 'file2.md')).toBe(true);
    expect(results.some(r => r.file.path === 'notes/file3.md')).toBe(true);
  });

  test('search should score files with metadata matches higher', async () => {
    const results = await searchOperations.search('test');
    
    // Find the result for file1.md which has more metadata matches
    const file1Result = results.find(r => r.file.path === 'file1.md');
    const file2Result = results.find(r => r.file.path === 'file2.md');
    
    expect(file1Result).toBeDefined();
    expect(file2Result).toBeDefined();
    
    if (file1Result && file2Result) {
      // File1 should have a higher score due to more metadata matches
      expect(file1Result.score).toBeGreaterThan(file2Result.score);
    }
  });

  test('search should respect path filter', async () => {
    const results = await searchOperations.search('test', { path: 'notes/' });
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.file.path.startsWith('notes/'))).toBe(true);
    expect(results.some(r => r.file.path === 'notes/file3.md')).toBe(true);
    expect(results.some(r => r.file.path === 'file1.md')).toBe(false);
  });

  test('search should respect limit', async () => {
    const results = await searchOperations.search('test', { limit: 1 });
    
    expect(results.length).toBe(1);
  });

  test('search should include matches information', async () => {
    const results = await searchOperations.search('test');
    
    expect(results[0].matches.length).toBeGreaterThan(0);
    expect(results[0].matches[0]).toHaveProperty('type');
    expect(results[0].matches[0]).toHaveProperty('term');
    expect(results[0].matches[0]).toHaveProperty('score');
    expect(results[0].matches[0]).toHaveProperty('location');
  });

  test('searchByTag should find files with specific tag', async () => {
    const results = await searchOperations.searchByTag('test');
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(f => f.path === 'file1.md')).toBe(true);
    expect(results.some(f => f.path === 'notes/file3.md')).toBe(true);
  });

  test('searchByProperty should find files with specific property', async () => {
    const results = await searchOperations.searchByProperty('category', 'example');
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(f => f.path === 'file2.md')).toBe(true);
  });

  test('getSnippet should return context around match', () => {
    const content = 'This is a long text with a test word in the middle of the content.';
    const snippet = searchOperations.getSnippet(content, 'test', 10);
    
    expect(snippet).toContain('test');
    expect(snippet.length).toBeLessThan(content.length);
    expect(snippet).toMatch(/\.\.\..*test.*\.\.\./);
  });
});