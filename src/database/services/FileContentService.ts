import { Plugin, TFile } from 'obsidian';
import { IFileContentService, FileContentResult } from '../interfaces/IFileContentService';
import * as crypto from 'crypto';

/**
 * Service for handling file content operations
 * Responsible for reading files, extracting frontmatter, and content validation
 */
export class FileContentService implements IFileContentService {
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * Read and validate a file, extracting its content and frontmatter
   * @param filePath Path to the file to read
   * @returns File content result or null if invalid/not found
   */
  async readFile(filePath: string): Promise<FileContentResult | null> {
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      
      if (!this.validateFile(file)) {
        return null;
      }

      const content = await this.plugin.app.vault.read(file as TFile);
      const { frontmatter, mainContent } = this.extractFrontmatter(content);

      return {
        content,
        frontmatter,
        mainContent
      };
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Read file content directly
   * @param filePath Path to the file to read
   * @returns File content as string
   */
  async readFileContent(filePath: string): Promise<string> {
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    
    if (!this.validateFile(file)) {
      throw new Error(`Invalid file: ${filePath}`);
    }

    return await this.plugin.app.vault.read(file as TFile);
  }

  /**
   * Validate that a file exists and is not a folder
   * @param file Abstract file from Obsidian vault
   * @returns true if file is valid for processing
   */
  validateFile(file: any): boolean {
    return file instanceof TFile;
  }

  /**
   * Extract frontmatter from content
   * @param content Full file content
   * @returns Separated frontmatter and main content
   */
  extractFrontmatter(content: string): { frontmatter: string; mainContent: string } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    
    if (frontmatterMatch) {
      return {
        frontmatter: frontmatterMatch[1],
        mainContent: content.slice(frontmatterMatch[0].length)
      };
    }
    
    return {
      frontmatter: '',
      mainContent: content
    };
  }

  /**
   * Generate a hash of content for comparison
   * @param content The content to hash
   * @returns A hash string
   */
  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}