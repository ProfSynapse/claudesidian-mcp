import { createConnection } from 'net';
import { dirname, basename } from 'path';

/**
 * Creates a connection to the MCP server
 * This connector is used by Claude Desktop to communicate with our Obsidian plugin
 * Uses named pipes on Windows and Unix domain sockets on macOS/Linux
 *
 * The IPC path now includes the vault name to support multiple vaults
 */

/**
 * Sanitizes a vault name for use in identifiers, filenames, and configuration keys
 *
 * This function standardizes vault names by:
 * - Converting to lowercase
 * - Removing special characters (keeping only alphanumeric, spaces, and hyphens)
 * - Replacing spaces with hyphens
 * - Normalizing multiple consecutive hyphens to a single hyphen
 *
 * @param vaultName - The original vault name to sanitize
 * @returns A sanitized version of the vault name suitable for use in identifiers
 */
const sanitizeVaultName = (vaultName) => {
    if (!vaultName) return '';
    
    return vaultName
        .toLowerCase()           // Convert to lowercase
        .replace(/[^\w\s-]/g, '') // Remove special characters (keep alphanumeric, spaces, hyphens)
        .replace(/\s+/g, '-')     // Replace spaces with hyphens
        .replace(/-+/g, '-');     // Replace multiple consecutive hyphens with a single one
};

/**
 * Extracts the vault name from the script execution path
 *
 * The script path follows the pattern:
 * /path/to/vault_name/.obsidian/plugins/claudesidian-mcp/connector.js
 *
 * We need to go up 4 levels from the script path to reach the vault name:
 * 1. dirname(scriptPath) -> /path/to/vault_name/.obsidian/plugins/claudesidian-mcp
 * 2. dirname() -> /path/to/vault_name/.obsidian/plugins
 * 3. dirname() -> /path/to/vault_name/.obsidian
 * 4. dirname() -> /path/to/vault_name
 * 5. basename() -> vault_name
 *
 * @returns The extracted vault name or empty string if not found
 */
const extractVaultName = () => {
    try {
        // Get the script path from process.argv
        const scriptPath = process.argv[1];
        
        if (!scriptPath) {
            process.stderr.write('DEBUG: Script path is undefined or empty\n');
            return '';
        }
        
        process.stderr.write(`DEBUG: Script path: ${scriptPath}\n`);
        
        // Go up 4 levels in the directory hierarchy to reach the vault name
        // 1. claudesidian-mcp directory
        const pluginDir = dirname(scriptPath);
        process.stderr.write(`DEBUG: Plugin directory: ${pluginDir}\n`);
        
        // 2. plugins directory
        const pluginsDir = dirname(pluginDir);
        process.stderr.write(`DEBUG: Plugins directory: ${pluginsDir}\n`);
        
        // 3. .obsidian directory
        const obsidianDir = dirname(pluginsDir);
        process.stderr.write(`DEBUG: Obsidian directory: ${obsidianDir}\n`);
        
        // 4. vault directory (parent of .obsidian)
        const vaultDir = dirname(obsidianDir);
        process.stderr.write(`DEBUG: Vault directory: ${vaultDir}\n`);
        
        // The vault name is the basename of the vault directory
        const vaultName = basename(vaultDir);
        process.stderr.write(`DEBUG: Extracted vault name: ${vaultName}\n`);
        
        if (!vaultName) {
            process.stderr.write('WARNING: Extracted vault name is empty\n');
            return '';
        }
        
        return vaultName;
    } catch (error) {
        process.stderr.write(`ERROR: Failed to extract vault name: ${error}\n`);
        process.stderr.write(`ERROR: Stack trace: ${error.stack}\n`);
        return '';
    }
};

/**
 * Gets the IPC path with vault name included
 *
 * This creates a unique IPC path for each vault to prevent conflicts
 * between different vault instances.
 *
 * @returns The IPC path string with vault name included
 */
const getIPCPath = () => {
    // Extract and sanitize the vault name
    const vaultName = extractVaultName();
    const sanitizedVaultName = sanitizeVaultName(vaultName);
    
    // Add the sanitized vault name to the IPC path
    return process.platform === 'win32'
        ? `\\\\.\\pipe\\claudesidian_mcp_${sanitizedVaultName}`
        : `/tmp/claudesidian_mcp_${sanitizedVaultName}.sock`;
};

// Maximum number of connection attempts
const MAX_RETRIES = 3;
let retryCount = 0;

/**
 * Attempts to connect to the MCP server with retry logic
 *
 * This function:
 * 1. Creates a connection to the IPC path
 * 2. Sets up error handling with detailed diagnostics
 * 3. Implements retry logic with backoff
 * 4. Provides helpful error messages for troubleshooting
 */
function connectWithRetry() {
    const ipcPath = getIPCPath();
    process.stderr.write(`Attempting to connect to MCP server (attempt ${retryCount + 1}/${MAX_RETRIES})...\n`);
    process.stderr.write(`Using IPC path: ${ipcPath}\n`);
    
    try {
        const socket = createConnection(ipcPath);

        // Pipe stdin/stdout to/from the socket
        process.stdin.pipe(socket);
        socket.pipe(process.stdout);

        // Enhanced error handling with detailed diagnostics
        socket.on('error', (err) => {
            const errorMessage = `IPC connection error: ${err}`;
            process.stderr.write(`ERROR: ${errorMessage}\n`);
            
            // Provide specific guidance based on error type
            // Cast error to NodeJS.ErrnoException to access the code property
            const nodeErr = err as NodeJS.ErrnoException;
            if (nodeErr.code === 'ENOENT') {
                process.stderr.write(`The IPC path does not exist. This may indicate:\n`);
                process.stderr.write(`1. Obsidian is not running\n`);
                process.stderr.write(`2. The Claudesidian MCP plugin is not enabled\n`);
                process.stderr.write(`3. The vault name extraction failed (extracted: "${sanitizeVaultName(extractVaultName())}")\n`);
            } else if (nodeErr.code === 'ECONNREFUSED') {
                process.stderr.write(`Connection refused. The server may have stopped or is not listening.\n`);
            }
            
            if (retryCount < MAX_RETRIES - 1) {
                retryCount++;
                const retryDelay = 1000 * retryCount; // Increasing backoff
                process.stderr.write(`Retrying connection in ${retryDelay/1000} second(s)...\n`);
                setTimeout(connectWithRetry, retryDelay);
            } else {
                process.stderr.write(`Maximum retry attempts reached. Please ensure:\n`);
                process.stderr.write(`1. Obsidian is running\n`);
                process.stderr.write(`2. The Claudesidian MCP plugin is enabled\n`);
                process.stderr.write(`3. The plugin settings are correctly configured\n`);
                process.stderr.write(`4. Check the extracted vault name: "${extractVaultName()}"\n`);
                process.exit(1);
            }
        });

        socket.on('connect', () => {
            process.stderr.write('Connected to MCP server successfully\n');
        });

        socket.on('close', () => {
            process.stderr.write('Connection to MCP server closed\n');
            process.exit(0);
        });
    } catch (error) {
        // Provide more detailed error information
        process.stderr.write(`ERROR: Failed to create connection: ${error}\n`);
        
        // Add stack trace for debugging
        if (error instanceof Error && error.stack) {
            process.stderr.write(`Stack trace: ${error.stack}\n`);
        }
        
        // Log the IPC path that was being used
        process.stderr.write(`Was attempting to connect to: ${getIPCPath()}\n`);
        process.stderr.write(`Extracted vault name: "${extractVaultName()}"\n`);
        
        process.exit(1);
    }
}

// Start the connection process
connectWithRetry();
