/**
 * Detects when vault startup loading is complete
 */
export class VaultReadyDetector {
  private vaultIsReady: boolean = false;
  private startupFileEventCount: number = 0;
  private startupCheckTimer: NodeJS.Timeout | null = null;
  private readyCallbacks: (() => void)[] = [];

  /**
   * Start monitoring for vault ready state
   */
  startDetection(): void {
    console.log('[VaultReadyDetector] Starting vault ready detection');

    // Monitor file event frequency to detect when startup loading is complete
    this.startupFileEventCount = 0;

    // Check if vault is ready after initial file events settle
    this.startupCheckTimer = setTimeout(() => {
      this.checkVaultReady();
    }, 2000); // Initial check after 2 seconds
  }

  /**
   * Increment startup event count
   */
  incrementEventCount(): void {
    this.startupFileEventCount++;
  }

  /**
   * Get current event count
   */
  getEventCount(): number {
    return this.startupFileEventCount;
  }

  /**
   * Check if vault is ready
   */
  isReady(): boolean {
    return this.vaultIsReady;
  }

  /**
   * Wait for vault to be ready
   */
  async waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      if (this.vaultIsReady) {
        resolve();
        return;
      }

      this.readyCallbacks.push(resolve);
    });
  }

  /**
   * Check if vault loading has completed by monitoring file event patterns
   */
  private checkVaultReady(): void {
    const currentEventCount = this.startupFileEventCount;

    // Wait a bit more and check if events have stopped
    setTimeout(() => {
      if (this.startupFileEventCount === currentEventCount) {
        // No new file events in the last second, vault is likely ready
        this.vaultIsReady = true;
        console.log(`[VaultReadyDetector] Vault ready detected after ${this.startupFileEventCount} startup file events`);
        
        // Call all waiting callbacks
        this.readyCallbacks.forEach(callback => callback());
        this.readyCallbacks = [];
      } else {
        // Still receiving events, check again
        console.log(`[VaultReadyDetector] Still receiving startup events (${this.startupFileEventCount} total), checking again...`);
        this.startupCheckTimer = setTimeout(() => this.checkVaultReady(), 1000);
      }
    }, 1000);
  }

  /**
   * Reset detection state
   */
  reset(): void {
    this.vaultIsReady = false;
    this.startupFileEventCount = 0;
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer);
      this.startupCheckTimer = null;
    }
  }

  /**
   * Clean up resources
   */
  unload(): void {
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer);
      this.startupCheckTimer = null;
    }
    this.readyCallbacks = [];
  }
}