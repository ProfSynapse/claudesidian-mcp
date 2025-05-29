import { TFile } from 'obsidian';

export interface FileContentResult {
  content: string;
  frontmatter: string;
  mainContent: string;
}

export interface IFileContentService {
  /**
   * Read and validate a file, extracting its content and frontmatter
   * @param filePath Path to the file to read
   * @returns File content result or null if invalid/not found
   */
  readFile(filePath: string): Promise<FileContentResult | null>;

  /**
   * Validate that a file exists and is not a folder
   * @param file Abstract file from Obsidian vault
   * @returns true if file is valid for processing
   */
  validateFile(file: any): boolean;

  /**
   * Extract frontmatter from content
   * @param content Full file content
   * @returns Separated frontmatter and main content
   */
  extractFrontmatter(content: string): { frontmatter: string; mainContent: string };

  /**
   * Generate a hash of content for comparison
   * @param content The content to hash
   * @returns A hash string
   */
  hashContent(content: string): string;

  /**
   * Read file content directly
   * @param filePath Path to the file to read
   * @returns File content as string
   */
  readFileContent(filePath: string): Promise<string>;
}
