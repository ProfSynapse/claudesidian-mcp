import { App } from 'obsidian';

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