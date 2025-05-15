import { App, TFile } from 'obsidian';

/**
 * Utility class for link-related operations
 * Centralizes logic for extracting links and backlinks
 */
export class LinkOperations {
    /**
     * Extract outgoing links from a file using Obsidian's metadata cache
     * 
     * @param app Obsidian app instance
     * @param file The file to extract links from
     * @returns Array of outgoing links with display text and target path
     */
    static extractOutgoingLinks(
        app: App,
        file: TFile
    ): Array<{
        displayText: string;
        targetPath: string;
        position: { line: number; col: number; }
    }> {
        const outgoingLinks: Array<{
            displayText: string;
            targetPath: string;
            position: { line: number; col: number; }
        }> = [];
        
        // Get file metadata from cache
        const cache = app.metadataCache.getFileCache(file);
        
        // If no cache or no links, return empty array
        if (!cache || !cache.links) {
            return outgoingLinks;
        }
        
        // Process each link in the file
        for (const link of cache.links) {
            // The link object contains:
            // - link: the target link text (without brackets)
            // - displayText: the text displayed in the link (if using alias syntax)
            // - position: { start: { line, col, offset }, end: { line, col, offset } }
            
            try {
                // Resolve the link path using Obsidian's path resolution
                const targetFile = app.metadataCache.getFirstLinkpathDest(
                    link.link,
                    file.path
                );
                
                // If the target file exists, add it with the resolved path
                if (targetFile) {
                    outgoingLinks.push({
                        displayText: link.displayText || link.link,
                        targetPath: targetFile.path,
                        position: {
                            line: link.position.start.line,
                            col: link.position.start.col
                        }
                    });
                } else {
                    // Try to find the file by searching the vault using various filename formats
                    const potentialFile = LinkOperations.findFileInVault(app, link.link);
                    
                    if (potentialFile) {
                        // Found the file through our enhanced search
                        outgoingLinks.push({
                            displayText: link.displayText || link.link,
                            targetPath: potentialFile.path,
                            position: {
                                line: link.position.start.line,
                                col: link.position.start.col
                            }
                        });
                    } else {
                        // For links that don't resolve to a file, still include them
                        // This could be a link that will be created later, or a link to a file outside the vault
                        // Store the unresolved link for potential future matches
                        
                        // Normalize the link path - strip spaces and special characters
                        const normalizedLinkText = LinkOperations.normalizeLinkText(link.link);
                        
                        outgoingLinks.push({
                            displayText: link.displayText || link.link,
                            targetPath: `unresolved:${normalizedLinkText}`,
                            position: {
                                line: link.position.start.line,
                                col: link.position.start.col
                            }
                        });
                    }
                }
            } catch (error) {
                console.error(`Error resolving link "${link.link}" in ${file.path}:`, error);
                // Continue with other links
            }
        }
        
        return outgoingLinks;
    }
    
    /**
     * Extract incoming links (backlinks) to a file using Obsidian's metadata cache
     * 
     * @param app Obsidian app instance
     * @param file The file to extract backlinks for
     * @returns Array of incoming links with source file path and display text
     */
    static extractIncomingLinks(
        app: App,
        file: TFile
    ): Array<{
        sourcePath: string;
        displayText: string;
        position: { line: number; col: number; }
    }> {
        const incomingLinks: Array<{
            sourcePath: string;
            displayText: string;
            position: { line: number; col: number; }
        }> = [];
        
        // Get the resolvedLinks from the metadata cache
        const resolvedLinks = app.metadataCache.resolvedLinks;
        
        // If no resolved links, return empty array
        if (!resolvedLinks) {
            return incomingLinks;
        }
        
        // Get the normalized file name for alternative matching in various forms
        const normalizedFileNames = LinkOperations.getNormalizedFileNames(file);
        
        // Iterate through all files and their links
        for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
            // Check if any of the links in this file point to our target file
            if (links[file.path]) {
                try {
                    // Get the source file
                    const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
                    
                    if (sourceFile && sourceFile instanceof TFile) {
                        // Get the metadata for the source file
                        const sourceCache = app.metadataCache.getFileCache(sourceFile);
                        
                        if (sourceCache && sourceCache.links) {
                            // Find the specific link(s) that point to our target file
                            for (const link of sourceCache.links) {
                                const linkTarget = app.metadataCache.getFirstLinkpathDest(
                                    link.link,
                                    sourcePath
                                );
                                
                                if (linkTarget && linkTarget.path === file.path) {
                                    incomingLinks.push({
                                        sourcePath: sourcePath,
                                        displayText: link.displayText || link.link,
                                        position: {
                                            line: link.position.start.line,
                                            col: link.position.start.col
                                        }
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing backlink from ${sourcePath} to ${file.path}:`, error);
                    // Continue with other links
                }
            } else {
                // Check for potential unresolved links that might match this file
                try {
                    const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
                    
                    if (sourceFile && sourceFile instanceof TFile) {
                        const sourceCache = app.metadataCache.getFileCache(sourceFile);
                        
                        if (sourceCache && sourceCache.links) {
                            // Check if any unresolved links might be referring to this file
                            for (const link of sourceCache.links) {
                                // Skip links that resolve to an existing file other than our target
                                const linkTarget = app.metadataCache.getFirstLinkpathDest(
                                    link.link,
                                    sourcePath
                                );
                                
                                if (linkTarget && linkTarget.path !== file.path) continue;
                                
                                // For unresolved links or links to our target, check for matches
                                const normalizedLinkText = LinkOperations.normalizeLinkText(link.link);
                                
                                // Check against all normalized forms of the filename
                                if (normalizedFileNames.includes(normalizedLinkText)) {
                                    incomingLinks.push({
                                        sourcePath: sourcePath,
                                        displayText: link.displayText || link.link,
                                        position: {
                                            line: link.position.start.line,
                                            col: link.position.start.col
                                        }
                                    });
                                }
                                
                                // Additionally, check if link text is a substring of the file path or vice versa
                                // This helps with partial matches
                                else if (
                                    normalizedFileNames.some(name => 
                                        name.includes(normalizedLinkText) || 
                                        normalizedLinkText.includes(name)
                                    )
                                ) {
                                    incomingLinks.push({
                                        sourcePath: sourcePath,
                                        displayText: link.displayText || link.link,
                                        position: {
                                            line: link.position.start.line,
                                            col: link.position.start.col
                                        }
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error checking unresolved links from ${sourcePath}:`, error);
                }
            }
        }
        
        return incomingLinks;
    }
    
    /**
     * Normalize link text for more robust matching
     * Removes spaces, special characters, and converts to lowercase
     * 
     * @param linkText The link text to normalize
     * @returns Normalized link text
     */
    static normalizeLinkText(linkText: string): string {
        return linkText
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^\w\s-]/g, '');
    }
    
    /**
     * Generate all normalized versions of a filename for matching
     * 
     * @param file The file to generate normalized names for
     * @returns Array of normalized file names
     */
    static getNormalizedFileNames(file: TFile): string[] {
        const normalizedNames = new Set<string>();
        
        // Get various forms of the file's name
        const basename = file.basename;
        const filename = file.name;
        const path = file.path;
        
        // Add basic forms
        normalizedNames.add(LinkOperations.normalizeLinkText(basename));
        normalizedNames.add(LinkOperations.normalizeLinkText(filename));
        normalizedNames.add(LinkOperations.normalizeLinkText(path));
        
        // Add without extension
        if (filename.endsWith('.md')) {
            normalizedNames.add(LinkOperations.normalizeLinkText(filename.slice(0, -3)));
        }
        
        // Add with spaces replaced
        normalizedNames.add(LinkOperations.normalizeLinkText(basename.replace(/\s+/g, '_')));
        normalizedNames.add(LinkOperations.normalizeLinkText(basename.replace(/\s+/g, '-')));
        
        // Add parent folder + basename variations
        const folderPath = path.split('/').slice(0, -1).join('/');
        if (folderPath) {
            const folder = folderPath.split('/').pop() || '';
            normalizedNames.add(LinkOperations.normalizeLinkText(`${folder}_${basename}`));
            normalizedNames.add(LinkOperations.normalizeLinkText(`${folder}/${basename}`));
        }
        
        return Array.from(normalizedNames);
    }

    /**
     * Find a file in the vault using various filename formats
     * This implements more robust file finding than Obsidian's default link resolution
     * 
     * @param app Obsidian app instance
     * @param linkText The link text to search for
     * @returns The found TFile or null if not found
     */
    static findFileInVault(app: App, linkText: string): TFile | null {
        // Normalize input
        const normalizedLinkText = LinkOperations.normalizeLinkText(linkText);
        
        // Try various transformations of the filename
        const transformations = [
            // Original text
            linkText,
            // Lowercase
            linkText.toLowerCase(),
            // Spaces to underscores
            linkText.replace(/\s+/g, '_'),
            // Spaces to hyphens
            linkText.replace(/\s+/g, '-'),
            // Fully normalized
            normalizedLinkText
        ];
        
        // Create a Set to avoid duplicate paths
        const attemptedPaths = new Set<string>();
        
        // Get all files in vault
        const allFiles = app.vault.getMarkdownFiles();
        
        // Build a map for quick lookup
        const normalizedToFile = new Map<string, TFile>();
        const basenameToFiles = new Map<string, TFile[]>();
        
        // Populate lookup maps
        for (const file of allFiles) {
            // Add with full path
            normalizedToFile.set(LinkOperations.normalizeLinkText(file.path), file);
            
            // Add with basename (without extension)
            const basename = file.basename;
            const normalizedBasename = LinkOperations.normalizeLinkText(basename);
            
            if (!basenameToFiles.has(normalizedBasename)) {
                basenameToFiles.set(normalizedBasename, []);
            }
            basenameToFiles.get(normalizedBasename)?.push(file);
        }
        
        // Try exact match by path with .md extension
        for (const transform of transformations) {
            // Try with .md extension
            const pathWithExt = transform.endsWith('.md') ? transform : `${transform}.md`;
            attemptedPaths.add(pathWithExt);
            
            const file = app.vault.getAbstractFileByPath(pathWithExt);
            if (file instanceof TFile) {
                return file;
            }
        }
        
        // Try normalized path lookup
        for (const transform of transformations) {
            const normalizedTransform = LinkOperations.normalizeLinkText(transform);
            if (normalizedToFile.has(normalizedTransform)) {
                return normalizedToFile.get(normalizedTransform) || null;
            }
        }
        
        // Try basename-only lookup
        for (const transform of transformations) {
            const normalizedTransform = LinkOperations.normalizeLinkText(transform);
            if (basenameToFiles.has(normalizedTransform)) {
                const matchingFiles = basenameToFiles.get(normalizedTransform);
                if (matchingFiles && matchingFiles.length > 0) {
                    return matchingFiles[0]; // Return the first matching file
                }
            }
        }
        
        // Try case-insensitive partial match as last resort
        for (const file of allFiles) {
            const normalizedFilePath = LinkOperations.normalizeLinkText(file.path);
            const normalizedBasename = LinkOperations.normalizeLinkText(file.basename);
            
            for (const transform of transformations) {
                const normalizedTransform = LinkOperations.normalizeLinkText(transform);
                
                if (normalizedFilePath.includes(normalizedTransform) || 
                    normalizedBasename.includes(normalizedTransform)) {
                    return file;
                }
            }
        }
        
        // Not found
        return null;
    }
}