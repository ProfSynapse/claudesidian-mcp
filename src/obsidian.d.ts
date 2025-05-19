import { App as ObsidianApp } from 'obsidian';

// Extend the Obsidian App interface to include the version property
declare module 'obsidian' {
  interface App extends ObsidianApp {
    version: string;
  }
}

declare global {
  interface Window {
    app: App;
    mcpProgressHandlers?: {
      updateProgress: (data: any) => void;
      completeProgress: (data: any) => void;
      cancelProgress: (data: any) => void;
    };
  }
}

export {};