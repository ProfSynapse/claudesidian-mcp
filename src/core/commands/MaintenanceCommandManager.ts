/**
 * Maintenance Command Manager
 * Handles maintenance and troubleshooting commands
 */

import { Notice } from 'obsidian';
import { CommandContext } from './CommandDefinitions';

export class MaintenanceCommandManager {
  constructor(private context: CommandContext) {}

  /**
   * Execute maintenance command
   */
  async executeMaintenanceCommand(commandId: string): Promise<void> {
    // Basic maintenance operations
    console.log(`Executing maintenance command: ${commandId}`);
  }

  /**
   * Get available maintenance commands
   */
  getMaintenanceCommands(): string[] {
    return ['open-settings', 'run-diagnostics'];
  }

  /**
   * Register maintenance commands
   */
  registerMaintenanceCommands(): void {
    this.registerDiagnosticsCommand();
  }

  /**
   * Register troubleshoot command
   */
  registerTroubleshootCommand(): void {
    console.log('Troubleshoot command registered');
  }

  /**
   * Register diagnostics command for testing service health
   */
  private registerDiagnosticsCommand(): void {
    this.context.plugin.addCommand({
      id: 'run-service-diagnostics',
      name: 'Run Service Diagnostics',
      callback: async () => {
        await this.runServiceDiagnostics();
      }
    });
  }

  /**
   * Run comprehensive service diagnostics
   */
  private async runServiceDiagnostics(): Promise<void> {
    console.log('🔍 Running Service Diagnostics...\n');
    new Notice('Running service diagnostics... Check console for results.');

    let passed = 0;
    let failed = 0;
    const results: string[] = [];

    // Check critical services
    const criticalServices = [
      'vaultOperations',
      'eventManager',
      'workspaceService',
      'memoryService',
      'sessionService',
      'llmService',
      'customPromptStorageService',
      'conversationService',
      'chatService'
    ];

    for (const serviceName of criticalServices) {
      try {
        if (!this.context.getService) {
          console.error(`❌ ${serviceName}: getService not available`);
          results.push(`❌ ${serviceName}: getService not available`);
          failed++;
          continue;
        }

        const service = await this.context.getService(serviceName, 5000);
        if (service) {
          console.log(`✅ ${serviceName}: OK`);
          results.push(`✅ ${serviceName}`);
          passed++;
        } else {
          console.error(`❌ ${serviceName}: Not initialized`);
          results.push(`❌ ${serviceName}: Not initialized`);
          failed++;
        }
      } catch (error: any) {
        console.error(`❌ ${serviceName}: Error -`, error.message);
        results.push(`❌ ${serviceName}: ${error.message}`);
        failed++;
      }
    }

    // Check plugin.services getter
    console.log('\n🔍 Checking plugin.services getter...');
    const services = (this.context.plugin as any).services;
    const expectedServices = ['memoryService', 'workspaceService', 'sessionService', 'conversationService', 'customPromptStorageService'];

    for (const name of expectedServices) {
      if (services && services[name]) {
        console.log(`✅ plugin.services.${name}: Available`);
        results.push(`✅ plugin.services.${name}`);
        passed++;
      } else {
        console.error(`❌ plugin.services.${name}: Missing`);
        results.push(`❌ plugin.services.${name}: Missing`);
        failed++;
      }
    }

    // Final report
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

    if (failed === 0) {
      console.log('🎉 All services healthy!');
      new Notice(`✅ All services healthy! (${passed} passed)`);
    } else {
      console.warn('⚠️ Some services are not available');
      new Notice(`⚠️ ${failed} service(s) failed. Check console for details.`);
    }
  }
}