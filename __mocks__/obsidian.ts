/**
 * Mock implementation of Obsidian API for testing
 */

// Basic types
export interface TFile {
  path: string;
  name: string;
  extension: string;
  stat: {
    ctime: number;
    mtime: number;
    size: number;
  };
  vault: Vault;
  basename: string;
}

export interface TFolder {
  path: string;
  name: string;
  children: Array<TFile | TFolder>;
  vault: Vault;
  isRoot: () => boolean;
  parent: TFolder | null;
}

export interface Plugin {
  manifest: {
    dir: string;
    id: string;
    name: string;
    version: string;
    author: string;
  };
  addSettingTab: (settingTab: PluginSettingTab) => void;
  addCommand: (command: any) => void;
  addRibbonIcon: (icon: string, title: string, callback: () => void) => void;
  registerEvent: (event: any) => void;
  loadData: () => Promise<any>;
  saveData: (data: any) => Promise<void>;
}

export class App {
  vault: Vault;
  workspace: Workspace;
  metadataCache: MetadataCache;
  setting: any;

  constructor() {
    this.vault = new Vault();
    this.workspace = new Workspace();
    this.metadataCache = new MetadataCache();
  }
}

export class Vault {
  adapter: any = {};
  config: any = {};
  
  async read(file: TFile): Promise<string> {
    return '';
  }
  
  async readBinary(file: TFile): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
  
  async create(path: string, data: string): Promise<TFile> {
    return {
      path,
      name: path.split('/').pop() || '',
      extension: path.split('.').pop() || '',
      stat: {
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0,
      },
      vault: this,
      basename: path.split('/').pop()?.split('.')[0] || '',
    };
  }
  
  async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
    return this.create(path, '');
  }
  
  async delete(file: TFile | TFolder): Promise<void> {}
  
  async rename(file: TFile | TFolder, newPath: string): Promise<void> {}
  
  async modify(file: TFile, data: string): Promise<void> {}
  
  async modifyBinary(file: TFile, data: ArrayBuffer): Promise<void> {}
  
  async append(file: TFile, data: string): Promise<void> {}
  
  getAbstractFileByPath(path: string): TFile | TFolder | null {
    return null;
  }
  
  getFiles(): TFile[] {
    return [];
  }
  
  getAllLoadedFiles(): Array<TFile | TFolder> {
    return [];
  }
  
  getMarkdownFiles(): TFile[] {
    return [];
  }
  
  getRoot(): TFolder {
    return {
      path: '/',
      name: '/',
      children: [],
      vault: this,
      isRoot: () => true,
      parent: null,
    };
  }
  
  createFolder(path: string): Promise<void> {
    return Promise.resolve();
  }
}

export class Workspace {
  activeLeaf: any = null;
  
  getActiveFile(): TFile | null {
    return null;
  }
  
  getActiveViewOfType<T>(type: any): T | null {
    return null;
  }
  
  getLeavesOfType(type: string): any[] {
    return [];
  }
}

export class MetadataCache {
  getFileCache(file: TFile): any {
    return null;
  }
  
  getCache(path: string): any {
    return null;
  }
  
  fileToLinktext(file: TFile, sourcePath: string): string {
    return '';
  }
  
  resolveLink(linktext: string, sourcePath: string): string | null {
    return null;
  }
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  
  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
  }
  
  display(): void {}
  
  hide(): void {}
}

export class Setting {
  containerEl: HTMLElement;
  
  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }
  
  setName(name: string): this {
    return this;
  }
  
  setDesc(desc: string): this {
    return this;
  }
  
  addText(callback: (text: any) => any): this {
    return this;
  }
  
  addTextArea(callback: (text: any) => any): this {
    return this;
  }
  
  addToggle(callback: (toggle: any) => any): this {
    return this;
  }
  
  addButton(callback: (button: any) => any): this {
    return this;
  }
  
  addDropdown(callback: (dropdown: any) => any): this {
    return this;
  }
  
  addSlider(callback: (slider: any) => any): this {
    return this;
  }
  
  addMomentFormat(callback: (format: any) => any): this {
    return this;
  }
}

export class Notice {
  constructor(message: string, timeout?: number) {}
}

export class Modal {
  app: App;
  
  constructor(app: App) {
    this.app = app;
  }
  
  open(): void {}
  
  close(): void {}
}

export class FuzzySuggestModal<T> {
  app: App;
  
  constructor(app: App) {
    this.app = app;
  }
  
  getSuggestions(query: string): T[] {
    return [];
  }
  
  renderSuggestion(item: T, el: HTMLElement): void {}
  
  onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void {}
}

export interface Editor {
  getLine(line: number): string;
  setLine(line: number, text: string): void;
  replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition): void;
  getRange(from: EditorPosition, to: EditorPosition): string;
  getCursor(): EditorPosition;
  setCursor(pos: EditorPosition): void;
  getValue(): string;
  setValue(value: string): void;
}

export interface EditorPosition {
  line: number;
  ch: number;
}

export interface MarkdownView {
  editor: Editor;
  getMode(): string;
  getViewData(): string;
  setViewData(data: string, clear: boolean): void;
}

export const moment = () => ({
  format: () => '',
});

export class Events {
  on(name: string, callback: (...data: any) => any, ctx?: any): EventRef {
    return { } as EventRef;
  }
  
  off(name: string, callback: (...data: any) => any): void {}
  
  offref(ref: EventRef): void {}
  
  trigger(name: string, ...data: any[]): void {}
}

export interface EventRef {}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function resolveSubpath(path: string, subpath: string): string {
  return path;
}

export function parseFrontMatterEntry(frontmatter: any, key: string): any {
  return null;
}

export function parseFrontMatterStringArray(frontmatter: any, key: string): string[] {
  return [];
}

export function parseFrontMatterAliases(frontmatter: any): string[] {
  return [];
}

export interface EventRef {}

export enum HoverLinkSource {
  INTERNAL_LINK,
  EXTERNAL_LINK,
  FOOTNOTE,
}

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isMacOS: false,
  isWindows: true,
  isLinux: false,
};