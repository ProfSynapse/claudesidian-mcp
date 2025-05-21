/**
 * Browser compatibility polyfills for Node.js specific APIs
 * This allows Node.js libraries to work in the browser environment
 */

// Create a global patching function that can be called before importing problematic libraries
export function applyBrowserPolyfills() {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
        console.log('Applying browser polyfills for Node.js compatibility');
        
        // Create empty module for url module if it doesn't exist
        if (typeof (global as any).url === 'undefined') {
            (global as any).url = {
                fileURLToPath: (url: string) => {
                    console.log('Polyfill: fileURLToPath called, returning original string');
                    return url?.toString() || '';
                },
                pathToFileURL: (path: string) => {
                    console.log('Polyfill: pathToFileURL called, returning path as URL');
                    return { toString: () => path, href: path };
                }
            };
        }
        
        // Create empty module for path module if it doesn't exist
        if (typeof (global as any).path === 'undefined') {
            (global as any).path = {
                dirname: (path: string) => {
                    console.log('Polyfill: path.dirname called, returning empty string');
                    return '';
                },
                join: (...paths: string[]) => {
                    console.log('Polyfill: path.join called, joining paths with "/"');
                    return paths.filter(p => p).join('/');
                },
                resolve: (...paths: string[]) => {
                    console.log('Polyfill: path.resolve called, joining paths with "/"');
                    return paths.filter(p => p).join('/');
                }
            };
        }
        
        // Create empty module for fs module if it doesn't exist
        if (typeof (global as any).fs === 'undefined') {
            (global as any).fs = {
                existsSync: (path: string) => {
                    console.log('Polyfill: fs.existsSync called, returning false');
                    return false;
                },
                readFileSync: (path: string) => {
                    console.log('Polyfill: fs.readFileSync called, returning empty buffer');
                    return Buffer.from('');
                },
                mkdirSync: (path: string) => {
                    console.log('Polyfill: fs.mkdirSync called, no-op');
                },
                writeFileSync: (path: string, data: any) => {
                    console.log('Polyfill: fs.writeFileSync called, no-op');
                }
            };
        }
        
        console.log('Browser polyfills applied successfully');
    }
}