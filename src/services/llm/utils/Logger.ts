/**
 * Enhanced Logger
 * Structured logging with multiple outputs and severity levels
 * Based on patterns from existing logging services
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  component?: string;
  metadata?: Record<string, any>;
  executionId?: string;
  testId?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logDirectory: string;
  maxFileSize: number; // in bytes
  maxFiles: number;
  includeTimestamp: boolean;
  includeStackTrace: boolean;
}

export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  private constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: 'info',
      enableConsole: true,
      enableFile: false,
      logDirectory: './logs',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      includeTimestamp: true,
      includeStackTrace: false,
      ...config
    };

    this.ensureLogDirectory();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * Create a child logger with component context
   */
  child(component: string): ComponentLogger {
    return new ComponentLogger(this, component);
  }

  /**
   * Debug level logging
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Info level logging
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  /**
   * Warning level logging
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error | Record<string, any>): void {
    const metadata = error instanceof Error ? {
      error: error.message,
      stack: error.stack
    } : error;
    
    this.log('error', message, metadata);
  }

  /**
   * Log test execution events
   */
  testEvent(event: string, testId: string, metadata?: Record<string, any>): void {
    this.log('info', `Test Event: ${event}`, {
      testId,
      eventType: 'test',
      ...metadata
    });
  }

  /**
   * Log optimization events
   */
  optimizationEvent(event: string, generation: number, metadata?: Record<string, any>): void {
    this.log('info', `Optimization: ${event}`, {
      generation,
      eventType: 'optimization',
      ...metadata
    });
  }

  /**
   * Log provider API calls
   */
  apiCall(provider: string, method: string, latency: number, tokens?: number, cost?: number): void {
    this.log('debug', `API Call: ${provider}.${method}`, {
      provider,
      method,
      latency,
      tokens,
      cost,
      eventType: 'api'
    });
  }

  /**
   * Log performance metrics
   */
  performance(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.log('info', `Performance: ${operation}`, {
      operation,
      duration,
      eventType: 'performance',
      ...metadata
    });
  }

  /**
   * Main logging method
   */
  log(level: LogLevel, message: string, metadata?: Record<string, any>, component?: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message
    };
    
    if (component !== undefined) entry.component = component;
    if (metadata !== undefined) entry.metadata = metadata;

    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    if (this.config.enableFile) {
      this.logToFile(entry);
    }
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    this.ensureLogDirectory();
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Enable file logging
   */
  enableFileLogging(directory?: string): void {
    this.config.enableFile = true;
    if (directory) {
      this.config.logDirectory = directory;
    }
    this.ensureLogDirectory();
  }

  /**
   * Disable file logging
   */
  disableFileLogging(): void {
    this.config.enableFile = false;
  }

  /**
   * Flush logs (useful for testing)
   */
  flush(): void {
    // In a real implementation, this would flush any buffered logs
  }

  // Private methods

  private shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] >= this.logLevels[this.config.level];
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = this.config.includeTimestamp 
      ? `[${entry.timestamp.toISOString()}] `
      : '';
    
    const component = entry.component ? `[${entry.component}] ` : '';
    const level = `[${entry.level.toUpperCase()}] `;
    
    let output = `${timestamp}${level}${component}${entry.message}`;
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += ` ${JSON.stringify(entry.metadata, null, 2)}`;
    }

    switch (entry.level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }

  private logToFile(entry: LogEntry): void {
    const logFile = join(this.config.logDirectory, `lab-kit-${this.getDateString()}.log`);
    const line = JSON.stringify(entry) + '\n';
    
    try {
      appendFileSync(logFile, line);
      this.rotateLogsIfNeeded(logFile);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private ensureLogDirectory(): void {
    if (this.config.enableFile && !existsSync(this.config.logDirectory)) {
      try {
        mkdirSync(this.config.logDirectory, { recursive: true });
      } catch (error) {
        console.error('Failed to create log directory:', error);
        this.config.enableFile = false;
      }
    }
  }

  private getDateString(): string {
    return new Date().toISOString().split('T')[0]!;
  }

  private rotateLogsIfNeeded(logFile: string): void {
    try {
      const stats = require('fs').statSync(logFile);
      if (stats.size > this.config.maxFileSize) {
        // Simple rotation - rename current file with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
        require('fs').renameSync(logFile, rotatedFile);
        
        // Clean up old files if we exceed maxFiles
        this.cleanupOldLogs();
      }
    } catch (error) {
      // Ignore rotation errors
    }
  }

  private cleanupOldLogs(): void {
    try {
      const fs = require('fs');
      const files = fs.readdirSync(this.config.logDirectory)
        .filter((file: string) => file.startsWith('lab-kit-') && file.endsWith('.log'))
        .map((file: string) => ({
          name: file,
          path: join(this.config.logDirectory, file),
          stats: fs.statSync(join(this.config.logDirectory, file))
        }))
        .sort((a: any, b: any) => b.stats.mtime - a.stats.mtime);

      // Keep only the most recent files
      if (files.length > this.config.maxFiles) {
        const filesToDelete = files.slice(this.config.maxFiles);
        filesToDelete.forEach((file: any) => {
          try {
            fs.unlinkSync(file.path);
          } catch (error) {
            // Ignore cleanup errors
          }
        });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Component-specific logger that includes component context
 */
export class ComponentLogger {
  constructor(
    private parent: Logger,
    private component: string
  ) {}

  debug(message: string, metadata?: Record<string, any>): void {
    this.parent.log('debug', message, metadata, this.component);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.parent.log('info', message, metadata, this.component);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.parent.log('warn', message, metadata, this.component);
  }

  error(message: string, error?: Error | Record<string, any>): void {
    const metadata = error instanceof Error ? {
      error: error.message,
      stack: error.stack
    } : error;
    
    this.parent.log('error', message, metadata, this.component);
  }

  testEvent(event: string, testId: string, metadata?: Record<string, any>): void {
    this.parent.testEvent(event, testId, { component: this.component, ...metadata });
  }

  apiCall(provider: string, method: string, latency: number, tokens?: number, cost?: number): void {
    this.parent.apiCall(provider, method, latency, tokens, cost);
  }

  performance(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.parent.performance(operation, duration, { component: this.component, ...metadata });
  }
}

/**
 * Global logger instance
 */
export const logger = Logger.getInstance();

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string): ComponentLogger {
  return logger.child(component);
}