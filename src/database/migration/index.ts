/**
 * Location: src/database/migration/index.ts
 *
 * Migration Module Exports
 *
 * Central export point for the legacy JSON to JSONL/SQLite migration system.
 */

export { LegacyMigrator } from './LegacyMigrator';
export type { MigrationStatus, MigrationResult } from './LegacyMigrator';
