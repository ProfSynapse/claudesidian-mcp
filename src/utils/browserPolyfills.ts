/**
 * Browser compatibility polyfills for Node.js specific APIs
 * This allows Node.js libraries to work in the browser environment
 */

// Create a global patching function that can be called before importing problematic libraries
export function applyBrowserPolyfills() {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
        console.log('Applying browser polyfills for Node.js compatibility');
        
        // Fix for the fileURLToPath issue in transformers.js
        // Module requires this to be globally available
        (window as any).URL = window.URL || {};
        (window as any).URL.fileURLToPath = (url: string) => {
            console.log('Polyfill: URL.fileURLToPath called, returning safe path');
            return './';
        };
        
        // Create proper polyfill for Node's url module
        // This needs to match the import structure used by transformers.js
        if (typeof (global as any).url === 'undefined') {
            (global as any).url = {};
        }
        
        // Add default property to match ES module import structure
        (global as any).url.default = {
            fileURLToPath: (url: string) => {
                console.log('Polyfill: url.default.fileURLToPath called, returning safe path');
                return './';
            },
            pathToFileURL: (path: string) => {
                console.log('Polyfill: url.default.pathToFileURL called, returning path as URL');
                return { toString: () => path, href: path };
            }
        };
        
        // Create empty module for path module if it doesn't exist
        if (typeof (global as any).path === 'undefined') {
            (global as any).path = {};
        }
        
        // Add default property to match ES module import structure
        (global as any).path.default = {
            dirname: (path: string) => {
                console.log('Polyfill: path.default.dirname called, returning dot');
                return '.';
            },
            join: (...paths: string[]) => {
                console.log('Polyfill: path.default.join called, joining paths with "/"');
                return paths.filter(p => p).join('/');
            },
            resolve: (...paths: string[]) => {
                console.log('Polyfill: path.default.resolve called, joining paths with "/"');
                return paths.filter(p => p).join('/');
            }
        };
        
        // Create empty module for fs module if it doesn't exist
        if (typeof (global as any).fs === 'undefined') {
            (global as any).fs = {};
        }
        
        // Add default property to match ES module import structure
        (global as any).fs.default = {
            existsSync: (path: string) => {
                console.log('Polyfill: fs.default.existsSync called, returning false');
                return false;
            },
            readFileSync: (path: string) => {
                console.log('Polyfill: fs.default.readFileSync called, returning empty buffer');
                return Buffer.from('');
            },
            mkdirSync: (path: string) => {
                console.log('Polyfill: fs.default.mkdirSync called, no-op');
            },
            writeFileSync: (path: string, data: any) => {
                console.log('Polyfill: fs.default.writeFileSync called, no-op');
            }
        };
        
        // Add a safe meta.url polyfill which is used by transformers.js
        if (typeof (globalThis as any).import === 'undefined') {
            (globalThis as any).import = {};
            (globalThis as any).import.meta = {
                url: './'
            };
        }
        
        console.log('Browser polyfills applied successfully');
    }
}