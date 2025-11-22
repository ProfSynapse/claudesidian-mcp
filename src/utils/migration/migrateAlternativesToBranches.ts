/**
 * Migration script to convert legacy alternatives to branches
 *
 * This script converts the old alternatives array system to the new alternativeBranches system.
 * Run this ONCE on existing conversations before removing type definitions.
 *
 * @deprecated This is a one-time migration utility and should be removed after migration is complete
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { ConversationData, ConversationMessage } from '../../types/chat/ChatTypes';

export interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  errors: string[];
  details: {
    conversationId: string;
    messagesWithAlternatives: number;
    alternativesMigrated: number;
  }[];
}

/**
 * Migrate all conversations in a vault from legacy alternatives to branches
 */
export async function migrateConversations(vaultPath: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
    details: []
  };

  const conversationsPath = path.join(vaultPath, '.conversations');

  try {
    // Check if conversations directory exists
    const dirExists = await fs.access(conversationsPath).then(() => true).catch(() => false);
    if (!dirExists) {
      result.errors.push(`Conversations directory not found: ${conversationsPath}`);
      return result;
    }

    // Find all conversation JSON files
    const files = await fs.readdir(conversationsPath);
    const conversationFiles = files.filter(file => file.endsWith('.json'));
    result.total = conversationFiles.length;

    console.log(`[Migration] Found ${result.total} conversation files`);

    // Process each conversation file
    for (const file of conversationFiles) {
      const filePath = path.join(conversationsPath, file);

      try {
        const migrationDetail = await migrateConversationFile(filePath);

        if (migrationDetail.alternativesMigrated > 0) {
          result.migrated++;
          result.details.push(migrationDetail);
          console.log(`[Migration] Migrated ${file}: ${migrationDetail.alternativesMigrated} alternatives converted`);
        } else {
          result.skipped++;
          console.log(`[Migration] Skipped ${file}: No alternatives to migrate`);
        }
      } catch (error) {
        const errorMsg = `Failed to migrate ${file}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        console.error(`[Migration] ${errorMsg}`);
      }
    }

    console.log(`[Migration] Complete: ${result.migrated} migrated, ${result.skipped} skipped, ${result.errors.length} errors`);

  } catch (error) {
    const errorMsg = `Failed to read conversations directory: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(errorMsg);
    console.error(`[Migration] ${errorMsg}`);
  }

  return result;
}

/**
 * Migrate a single conversation file
 */
async function migrateConversationFile(filePath: string): Promise<{
  conversationId: string;
  messagesWithAlternatives: number;
  alternativesMigrated: number;
}> {
  const detail = {
    conversationId: path.basename(filePath, '.json'),
    messagesWithAlternatives: 0,
    alternativesMigrated: 0
  };

  // Read the conversation file
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const conversation: ConversationData = JSON.parse(fileContent);

  // Check if any messages have legacy alternatives
  const messagesWithAlternatives = conversation.messages.filter(
    msg => msg.alternatives && msg.alternatives.length > 0
  );

  if (messagesWithAlternatives.length === 0) {
    return detail; // Nothing to migrate
  }

  // Backup original file
  const backupPath = `${filePath}.backup-${Date.now()}`;
  await fs.copyFile(filePath, backupPath);
  console.log(`[Migration] Created backup: ${backupPath}`);

  // Migrate each message
  let modified = false;
  for (const message of conversation.messages) {
    if (message.alternatives && message.alternatives.length > 0) {
      detail.messagesWithAlternatives++;
      const migratedCount = migrateMessageAlternatives(message);
      detail.alternativesMigrated += migratedCount;
      modified = true;
    }
  }

  // Save migrated conversation
  if (modified) {
    const migrated = JSON.stringify(conversation, null, 2);
    await fs.writeFile(filePath, migrated, 'utf-8');
    console.log(`[Migration] Saved migrated conversation: ${filePath}`);
  }

  return detail;
}

/**
 * Migrate a single message's alternatives to branches
 */
function migrateMessageAlternatives(message: ConversationMessage): number {
  if (!message.alternatives || message.alternatives.length === 0) {
    return 0;
  }

  // Initialize alternativeBranches if it doesn't exist
  if (!message.alternativeBranches) {
    message.alternativeBranches = [];
  }

  let migratedCount = 0;

  // Convert each alternative to a branch
  for (const alternative of message.alternatives) {
    // Check if this alternative is already in alternativeBranches
    const existingBranch = message.alternativeBranches.find(
      branch => branch.id === alternative.id
    );

    if (!existingBranch) {
      // Create new branch from alternative
      message.alternativeBranches.push({
        id: alternative.id,
        parentMessageId: message.id,
        status: alternative.state === 'aborted' ? 'aborted' : 'complete',
        content: alternative.content,
        toolCalls: alternative.toolCalls,
        createdAt: alternative.timestamp || Date.now(),
        updatedAt: alternative.timestamp || Date.now(),
        metadata: alternative.metadata
      });
      migratedCount++;
    }
  }

  // Migrate activeAlternativeIndex to activeAlternativeId
  if (message.activeAlternativeIndex !== undefined && message.activeAlternativeIndex > 0) {
    const alternativeArrayIndex = message.activeAlternativeIndex - 1;
    if (message.alternativeBranches[alternativeArrayIndex]) {
      message.activeAlternativeId = message.alternativeBranches[alternativeArrayIndex].id;
    }
  }

  // DON'T delete the legacy alternatives array yet - we'll do that after verification
  // Just add a comment flag for manual cleanup later
  (message as any).__migratedAlternatives = true;

  return migratedCount;
}

/**
 * Verify migration results by scanning for legacy alternatives
 */
export async function verifyMigration(vaultPath: string): Promise<{
  totalMessages: number;
  messagesWithLegacyAlternatives: number;
  messagesWithBranches: number;
  inconsistencies: string[];
}> {
  const result = {
    totalMessages: 0,
    messagesWithLegacyAlternatives: 0,
    messagesWithBranches: 0,
    inconsistencies: [] as string[]
  };

  const conversationsPath = path.join(vaultPath, '.conversations');

  try {
    const files = await fs.readdir(conversationsPath);
    const conversationFiles = files.filter(file => file.endsWith('.json'));

    for (const file of conversationFiles) {
      const filePath = path.join(conversationsPath, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const conversation: ConversationData = JSON.parse(fileContent);

      for (const message of conversation.messages) {
        result.totalMessages++;

        const hasLegacyAlternatives = message.alternatives && message.alternatives.length > 0;
        const hasBranches = message.alternativeBranches && message.alternativeBranches.length > 0;

        if (hasLegacyAlternatives) {
          result.messagesWithLegacyAlternatives++;

          // Check if legacy alternatives were converted to branches
          if (!hasBranches) {
            result.inconsistencies.push(
              `${file}: Message ${message.id} has legacy alternatives but no branches`
            );
          } else if (message.alternatives!.length !== message.alternativeBranches!.length) {
            result.inconsistencies.push(
              `${file}: Message ${message.id} has ${message.alternatives!.length} alternatives but ${message.alternativeBranches!.length} branches`
            );
          }
        }

        if (hasBranches) {
          result.messagesWithBranches++;
        }
      }
    }
  } catch (error) {
    result.inconsistencies.push(`Failed to verify: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Clean up legacy alternatives after successful migration
 * WARNING: This permanently removes the old alternatives array
 */
export async function cleanupLegacyAlternatives(vaultPath: string): Promise<{
  cleaned: number;
  errors: string[];
}> {
  const result = {
    cleaned: 0,
    errors: [] as string[]
  };

  const conversationsPath = path.join(vaultPath, '.conversations');

  try {
    const files = await fs.readdir(conversationsPath);
    const conversationFiles = files.filter(file => file.endsWith('.json'));

    for (const file of conversationFiles) {
      const filePath = path.join(conversationsPath, file);

      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const conversation: ConversationData = JSON.parse(fileContent);

        let modified = false;
        for (const message of conversation.messages) {
          if (message.alternatives && message.alternatives.length > 0) {
            // Delete the legacy alternatives array
            delete message.alternatives;
            // Delete the activeAlternativeIndex (we now use activeAlternativeId)
            delete message.activeAlternativeIndex;
            // Delete migration flag
            delete (message as any).__migratedAlternatives;
            modified = true;
          }
        }

        if (modified) {
          const cleaned = JSON.stringify(conversation, null, 2);
          await fs.writeFile(filePath, cleaned, 'utf-8');
          result.cleaned++;
        }
      } catch (error) {
        result.errors.push(`Failed to clean ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    result.errors.push(`Failed to access conversations: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

// Example usage (for testing):
//
// async function runMigration() {
//   const vaultPath = '/path/to/your/vault';
//
//   // Step 1: Migrate
//   console.log('Step 1: Migrating conversations...');
//   const migrationResult = await migrateConversations(vaultPath);
//   console.log('Migration result:', migrationResult);
//
//   // Step 2: Verify
//   console.log('\nStep 2: Verifying migration...');
//   const verifyResult = await verifyMigration(vaultPath);
//   console.log('Verification result:', verifyResult);
//
//   if (verifyResult.inconsistencies.length === 0) {
//     // Step 3: Clean up (only if verification passed)
//     console.log('\nStep 3: Cleaning up legacy alternatives...');
//     const cleanupResult = await cleanupLegacyAlternatives(vaultPath);
//     console.log('Cleanup result:', cleanupResult);
//   } else {
//     console.error('\nMigration verification failed! DO NOT run cleanup.');
//   }
// }
