import { IRefreshManager } from './interfaces';

export class RefreshManager implements IRefreshManager {
    private isRefreshing = false;
    private lastRefreshTime = 0;
    private readonly minimumRefreshInterval = 2000; // 2 seconds

    canRefresh(): boolean {
        const now = Date.now();
        
        if (now - this.lastRefreshTime < this.minimumRefreshInterval) {
            console.log(`Refresh too soon (${now - this.lastRefreshTime}ms < ${this.minimumRefreshInterval}ms), skipping`);
            return false;
        }

        if (this.isRefreshing) {
            console.log('Refresh already in progress, skipping');
            return false;
        }

        return true;
    }

    startRefresh(): void {
        this.isRefreshing = true;
        this.lastRefreshTime = Date.now();
    }

    endRefresh(): void {
        this.isRefreshing = false;
    }

    getLastRefreshTime(): number {
        return this.lastRefreshTime;
    }
}