import { Notice } from 'obsidian';

/**
 * Interface for rate limiting implementations
 */
export interface IRateLimiter {
    checkRateLimit(): Promise<void>;
    trackRequest(): void;
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
    requestsPerMinute: number;
    showNotifications?: boolean;
}

/**
 * Base rate limiter implementation
 */
export class RateLimiter implements IRateLimiter {
    private requestsPerMinute: number;
    private requestsThisMinute: number = 0;
    private lastRequestMinute: number = 0;
    private showNotifications: boolean;

    constructor(config: RateLimiterConfig) {
        this.requestsPerMinute = config.requestsPerMinute;
        this.showNotifications = config.showNotifications ?? true;
    }

    /**
     * Track a request for rate limiting
     */
    trackRequest(): void {
        const now = new Date();
        const currentMinute = now.getMinutes();
        
        if (currentMinute !== this.lastRequestMinute) {
            // Reset counter for a new minute
            this.requestsThisMinute = 1;
            this.lastRequestMinute = currentMinute;
        } else {
            // Increment counter
            this.requestsThisMinute++;
        }
    }

    /**
     * Check rate limit before making a request
     * Implements delay if approaching limit
     */
    async checkRateLimit(): Promise<void> {
        const now = new Date();
        const currentMinute = now.getMinutes();
        
        // Reset counter if we're in a new minute
        if (currentMinute !== this.lastRequestMinute) {
            this.requestsThisMinute = 0;
            this.lastRequestMinute = currentMinute;
            return;
        }
        
        // If we're approaching the limit, delay the request
        if (this.requestsThisMinute >= this.requestsPerMinute) {
            const secondsToNextMinute = 60 - now.getSeconds();
            // Add a small buffer to ensure we're in the next minute
            const delayMs = (secondsToNextMinute + 1) * 1000;
            
            if (this.showNotifications) {
                new Notice(`Rate limit approached. Waiting ${secondsToNextMinute} seconds...`);
            }
            
            await new Promise(resolve => setTimeout(resolve, delayMs));
            
            // Reset after delay
            this.requestsThisMinute = 0;
        }
    }

    /**
     * Get current request count for this minute
     */
    getRequestCount(): number {
        return this.requestsThisMinute;
    }

    /**
     * Get configured rate limit
     */
    getRateLimit(): number {
        return this.requestsPerMinute;
    }
}

/**
 * Token bucket rate limiter for more sophisticated rate limiting
 */
export class TokenBucketRateLimiter implements IRateLimiter {
    private capacity: number;
    private tokensPerInterval: number;
    private interval: number; // in milliseconds
    private tokens: number;
    private lastRefill: number;
    private showNotifications: boolean;

    constructor(config: {
        capacity: number;
        tokensPerInterval: number;
        interval: number;
        showNotifications?: boolean;
    }) {
        this.capacity = config.capacity;
        this.tokensPerInterval = config.tokensPerInterval;
        this.interval = config.interval;
        this.tokens = config.capacity;
        this.lastRefill = Date.now();
        this.showNotifications = config.showNotifications ?? true;
    }

    private refillTokens(): void {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const intervalsElapsed = timePassed / this.interval;
        
        const newTokens = Math.floor(intervalsElapsed * this.tokensPerInterval);
        if (newTokens > 0) {
            this.tokens = Math.min(this.capacity, this.tokens + newTokens);
            this.lastRefill = now;
        }
    }

    async checkRateLimit(): Promise<void> {
        this.refillTokens();
        
        if (this.tokens < 1) {
            const waitTime = this.interval / this.tokensPerInterval;
            
            if (this.showNotifications) {
                new Notice(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
            }
            
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this.refillTokens();
        }
    }

    trackRequest(): void {
        this.tokens = Math.max(0, this.tokens - 1);
    }

    getAvailableTokens(): number {
        this.refillTokens();
        return this.tokens;
    }
}