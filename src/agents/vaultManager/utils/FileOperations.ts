import { App, TFile, TFolder } from 'obsidian';

/**
 * Utility class for file operations
 */
export class FileOperations {
  /**
   * Create a note
   * @param app Obsidian app instance
   * @param path Path to the note
   * @param content Content of the note
   * @param overwrite Whether to overwrite if the note already exists
   * @returns Promise that resolves with the created file and whether it already existed
   * @throws Error if creation fails
   */
  static async createNote(
    app: App,
    path: string,
    content: string,
    overwrite: boolean = false
  ): Promise<{ file: TFile; existed: boolean }> {
    // Check if the file already exists
    const existingFile = app.vault.getAbstractFileByPath(path);
    if (existingFile) {
      if (existingFile instanceof TFile) {
        if (overwrite) {
          // Overwrite the existing file
          await app.vault.modify(existingFile, content);
          return { file: existingFile, existed: true };
        } else {
          throw new Error(`File already exists: ${path}`);
        }
      } else {
        throw new Error(`Path exists but is not a file: ${path}`);
      }
    }
    
    // Ensure the parent folder exists
    const folderPath = path.substring(0, path.lastIndexOf('/'));
    if (folderPath) {
      await FileOperations.ensureFolder(app, folderPath);
    }
    
    // Create the file
    const file = await app.vault.create(path, content);
    return { file, existed: false };
  }
  
  /**
   * Create a folder
   * @param app Obsidian app instance
   * @param path Path to the folder
   * @returns Promise that resolves with whether the folder already existed
   * @throws Error if creation fails
   */
  static async createFolder(app: App, path: string): Promise<boolean> {
    // Check if the folder already exists
    const existingFolder = app.vault.getAbstractFileByPath(path);
    if (existingFolder) {
      if (existingFolder instanceof TFolder) {
        return true;
      } else {
        throw new Error(`Path exists but is not a folder: ${path}`);
      }
    }
    
    // Create the folder
    await app.vault.createFolder(path);
    return false;
  }
  
  /**
   * Ensure a folder exists
   * @param app Obsidian app instance
   * @param path Path to the folder
   * @returns Promise that resolves when the folder exists
   */
  static async ensureFolder(app: App, path: string): Promise<void> {
    const folders = path.split('/').filter(p => p.length > 0);
    let currentPath = '';
    
    for (const folder of folders) {
      currentPath += folder;
      
      try {
        await FileOperations.createFolder(app, currentPath);
      } catch (error) {
        // Ignore errors if the folder already exists
      }
      
      currentPath += '/';
    }
  }
  
  /**
   * Delete a note
   * @param app Obsidian app instance
   * @param path Path to the note
   * @returns Promise that resolves when the note is deleted
   * @throws Error if deletion fails
   */
  static async deleteNote(app: App, path: string): Promise<void> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    
    if (!(file instanceof TFile)) {
      throw new Error(`Path is not a file: ${path}`);
    }
    
    await app.vault.delete(file);
  }
  
  /**
   * Delete a folder
   * @param app Obsidian app instance
   * @param path Path to the folder
   * @param recursive Whether to delete recursively
   * @returns Promise that resolves when the folder is deleted
   * @throws Error if deletion fails
   */
  static async deleteFolder(app: App, path: string, recursive: boolean = false): Promise<void> {
    const folder = app.vault.getAbstractFileByPath(path);
    if (!folder) {
      throw new Error(`Folder not found: ${path}`);
    }
    
    if (!(folder instanceof TFolder)) {
      throw new Error(`Path is not a folder: ${path}`);
    }
    
    if (!recursive && folder.children.length > 0) {
      throw new Error(`Folder is not empty: ${path}`);
    }
    
    await app.vault.delete(folder, true);
  }
  
  /**
   * Move a note
   * @param app Obsidian app instance
   * @param path Path to the note
   * @param newPath New path for the note
   * @param overwrite Whether to overwrite if a note already exists at the new path
   * @returns Promise that resolves when the note is moved
   * @throws Error if move fails
   */
  static async moveNote(
    app: App,
    path: string,
    newPath: string,
    overwrite: boolean = false
  ): Promise<void> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    
    if (!(file instanceof TFile)) {
      throw new Error(`Path is not a file: ${path}`);
    }
    
    // Check if the destination already exists
    const existingFile = app.vault.getAbstractFileByPath(newPath);
    if (existingFile) {
      if (overwrite) {
        await app.vault.delete(existingFile);
      } else {
        throw new Error(`Destination already exists: ${newPath}`);
      }
    }
    
    // Ensure the parent folder exists
    const folderPath = newPath.substring(0, newPath.lastIndexOf('/'));
    if (folderPath) {
      await FileOperations.ensureFolder(app, folderPath);
    }
    
    await app.vault.rename(file, newPath);
  }
  
  /**
   * Move a folder
   * @param app Obsidian app instance
   * @param path Path to the folder
   * @param newPath New path for the folder
   * @param overwrite Whether to overwrite if a folder already exists at the new path
   * @returns Promise that resolves when the folder is moved
   * @throws Error if move fails
   */
  static async moveFolder(
    app: App,
    path: string,
    newPath: string,
    overwrite: boolean = false
  ): Promise<void> {
    const folder = app.vault.getAbstractFileByPath(path);
    if (!folder) {
      throw new Error(`Folder not found: ${path}`);
    }
    
    if (!(folder instanceof TFolder)) {
      throw new Error(`Path is not a folder: ${path}`);
    }
    
    // Check if the destination already exists
    const existingFolder = app.vault.getAbstractFileByPath(newPath);
    if (existingFolder) {
      if (overwrite) {
        await app.vault.delete(existingFolder, true);
      } else {
        throw new Error(`Destination already exists: ${newPath}`);
      }
    }
    
    // Ensure the parent folder exists
    const parentPath = newPath.substring(0, newPath.lastIndexOf('/'));
    if (parentPath) {
      await FileOperations.ensureFolder(app, parentPath);
    }
    
    await app.vault.rename(folder, newPath);
  }
}