"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var net_1 = require("net");
/**
 * Creates a connection to the MCP server
 * This connector is used by Claude Desktop to communicate with our Obsidian plugin
 * Uses named pipes on Windows and Unix domain sockets on macOS/Linux
 */
var getIPCPath = function () {
    return process.platform === 'win32'
        ? '\\\\.\\pipe\\claudesidian_mcp'
        : '/tmp/claudesidian_mcp.sock';
};
// Maximum number of connection attempts
var MAX_RETRIES = 3;
var retryCount = 0;
function connectWithRetry() {
    process.stderr.write("Attempting to connect to MCP server (attempt ".concat(retryCount + 1, "/").concat(MAX_RETRIES, ")...\n"));
    try {
        var socket = (0, net_1.createConnection)(getIPCPath());
        // Pipe stdin/stdout to/from the socket
        process.stdin.pipe(socket);
        socket.pipe(process.stdout);
        // Error handling
        socket.on('error', function (err) {
            process.stderr.write("IPC connection error: ".concat(err, "\n"));
            if (retryCount < MAX_RETRIES - 1) {
                retryCount++;
                process.stderr.write("Retrying connection in 1 second...\n");
                setTimeout(connectWithRetry, 1000);
            }
            else {
                process.stderr.write("Maximum retry attempts reached. Please ensure Obsidian is running with the Claudesidian MCP plugin enabled.\n");
                process.exit(1);
            }
        });
        socket.on('connect', function () {
            process.stderr.write('Connected to MCP server successfully\n');
        });
        socket.on('close', function () {
            process.stderr.write('Connection to MCP server closed\n');
            process.exit(0);
        });
    }
    catch (error) {
        process.stderr.write("Error creating connection: ".concat(error, "\n"));
        process.exit(1);
    }
}
// Start the connection process
connectWithRetry();
