import { ServerStatus } from '../types';

export class StatusManager {
    private currentStatus: ServerStatus = 'stopped';

    setStatus(status: ServerStatus) {
        this.currentStatus = status;
        console.log(`MCP Server status changed to: ${status}`);
    }

    getStatus(): ServerStatus {
        return this.currentStatus;
    }
}