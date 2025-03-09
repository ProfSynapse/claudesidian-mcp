import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageInterface } from './StorageInterface';

/**
 * FileSystemStorage implements the StorageInterface using Node.js filesystem APIs
 * This is used in the standalone MCP server context when running outside of Obsidian
 */
export class FileSystemStorage implements StorageInterface {
    constructor(private basePath: string = '.') {
        // Ensure the base path exists
        this.ensureFolder(this.basePath).catch(err => {
            console.error(`Failed to create base path: ${err}`);
        });
    }

    /**
     * Get the absolute path for a relative path
     */
    private getAbsolutePath(relativePath: string): string {
        return path.isAbsolute(relativePath) 
            ? relativePath 
            : path.join(this.basePath, relativePath);
    }

    async createNote(filePath: string, content: string, options?: { createFolders?: boolean }): Promise<any> {
        try {
            const absolutePath = this.getAbsolutePath(filePath);
            
            if (options?.createFolders) {
                await this.ensureFolder(path.dirname(absolutePath));
            }
            
            await fs.writeFile(absolutePath, content, 'utf8');
            return { path: absolutePath };
        } catch (error) {
            console.error(`Error creating note: ${error}`);
            throw error;
        }
    }

    async readNote(filePath: string): Promise<string> {
        try {
            const absolutePath = this.getAbsolutePath(filePath);
            return await fs.readFile(absolutePath, 'utf8');
        } catch (error) {
            console.error(`Error reading note: ${error}`);
            throw error;
        }
    }

    async deleteNote(filePath: string): Promise<void> {
        try {
            const absolutePath = this.getAbsolutePath(filePath);
            await fs.unlink(absolutePath);
        } catch (error) {
            console.error(`Error deleting note: ${error}`);
            throw error;
        }
    }

    async ensureFolder(folderPath: string): Promise<void> {
        try {
            const absolutePath = this.getAbsolutePath(folderPath);
            await fs.mkdir(absolutePath, { recursive: true });
        } catch (error) {
            console.error(`Error creating folder: ${error}`);
            throw error;
        }
    }

    async folderExists(folderPath: string): Promise<boolean> {
        try {
            const absolutePath = this.getAbsolutePath(folderPath);
            const stat = await fs.stat(absolutePath);
            return stat.isDirectory();
        } catch (error) {
            return false;
        }
    }
}
