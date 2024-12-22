
import { createConnection } from 'net';

/**
 * Creates a connection to the MCP server's named pipe
 * This connector is used by Claude Desktop to communicate with our Obsidian plugin
 */
const pipeName = '\\\\.\\pipe\\bridge_mcp';
const socket = createConnection(pipeName);

// Pipe stdin/stdout to/from the socket
process.stdin.pipe(socket);
socket.pipe(process.stdout);

// Error handling
socket.on('error', (err) => {
    console.error('IPC connection error:', err);
    process.exit(1);
});

socket.on('connect', () => {
});