"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var net_1 = require("net");
/**
 * Creates a connection to the MCP server's named pipe
 * This connector is used by Claude Desktop to communicate with our Obsidian plugin
 */
var pipeName = '\\\\.\\pipe\\claudesidian_mcp';
var socket = (0, net_1.createConnection)(pipeName);
// Pipe stdin/stdout to/from the socket
process.stdin.pipe(socket);
socket.pipe(process.stdout);
// Error handling
socket.on('error', function (err) {
    console.error('IPC connection error:', err);
    process.exit(1);
});
socket.on('connect', function () {
});
