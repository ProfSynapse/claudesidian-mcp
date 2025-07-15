/**
 * Core service management interface following Interface Segregation Principle
 */
export interface IServiceManager {
    get<T>(name: string): Promise<T>;
    isReady(name: string): boolean;
    start(): Promise<void>;
    stop(): Promise<void>;
}

/**
 * Service registration interface - separate from consumption
 */
export interface IServiceRegistry {
    register<T>(descriptor: IServiceDescriptor<T>): void;
    unregister(name: string): void;
    getDescriptor(name: string): IServiceDescriptor | null;
}

/**
 * Service lifecycle management interface
 */
export interface IServiceLifecycle {
    initialize<T>(descriptor: IServiceDescriptor<T>): Promise<T>;
    cleanup(serviceName: string): Promise<void>;
    getStatus(serviceName: string): ServiceStatus;
}

/**
 * Service descriptor interface following Liskov Substitution Principle
 */
export interface IServiceDescriptor<T = any> {
    name: string;
    dependencies: string[];
    create(): Promise<T>;
    stage: LoadingStage;
}

/**
 * Service status tracking
 */
export interface ServiceStatus {
    name: string;
    stage: LoadingStage;
    initialized: boolean;
    ready: boolean;
    error?: Error;
}

/**
 * Loading stages enum
 */
export enum LoadingStage {
    IMMEDIATE = 1,
    BACKGROUND_FAST = 2,
    BACKGROUND_SLOW = 3,
    ON_DEMAND = 4
}