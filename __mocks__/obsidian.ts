// Mock for Obsidian API
export class App {
  vault = {
    getMarkdownFiles: jest.fn().mockReturnValue([]),
    read: jest.fn().mockResolvedValue(''),
    adapter: {
      read: jest.fn().mockResolvedValue(''),
      write: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(true)
    },
    getAbstractFileByPath: jest.fn()
  };
  
  metadataCache = {
    getFileCache: jest.fn(),
    on: jest.fn().mockReturnValue({}),
    getTags: jest.fn().mockReturnValue({})
  };
  
  workspace = {
    getActiveFile: jest.fn(),
    activeLeaf: null,
    getLeavesOfType: jest.fn().mockReturnValue([]),
    getLeaf: jest.fn().mockReturnValue({
      openFile: jest.fn().mockResolvedValue({})
    }),
    splitActiveLeaf: jest.fn(),
    getLayout: jest.fn(),
    on: jest.fn().mockReturnValue({})
  };
}

export class TFile {
  path: string;
  
  constructor(path: string) {
    this.path = path;
  }
}

export class TFolder {
  path: string;
  children: (TFile | TFolder)[];
  
  constructor(path: string, children: (TFile | TFolder)[] = []) {
    this.path = path;
    this.children = children;
  }
}

export class CachedMetadata {
  frontmatter?: Record<string, any>;
  tags?: { tag: string; position: any }[];
}

export const prepareFuzzySearch = (query: string) => {
  return (text: string) => {
    if (text.toLowerCase().includes(query.toLowerCase())) {
      return { score: 1 };
    }
    return null;
  };
};

export const getAllTags = (cache: any) => {
  return cache.tags ? cache.tags.map((t: any) => t.tag) : [];
};

// Mock for other Obsidian classes and functions
export class Editor {
  getSelection = jest.fn().mockReturnValue('');
  replaceSelection = jest.fn();
  getCursor = jest.fn().mockReturnValue({ line: 0, ch: 0 });
  replaceRange = jest.fn();
  setCursor = jest.fn();
  getValue = jest.fn().mockReturnValue('');
  setValue = jest.fn();
  getLine = jest.fn().mockReturnValue('');
  on = jest.fn();
}

export class MarkdownView {
  editor: Editor = new Editor();
}

export class WorkspaceLeaf {
  openFile = jest.fn().mockResolvedValue({});
}

export class FileSystemAdapter {
  read = jest.fn().mockResolvedValue('');
  write = jest.fn().mockResolvedValue(undefined);
  exists = jest.fn().mockResolvedValue(true);
  readBinary = jest.fn().mockResolvedValue(new ArrayBuffer(0));
  writeBinary = jest.fn().mockResolvedValue(undefined);
}

export class EventRef {}