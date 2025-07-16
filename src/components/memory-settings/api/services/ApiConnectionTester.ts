/**
 * ApiConnectionTester - Handles API connection testing
 * Follows Single Responsibility Principle by focusing only on connection testing
 */

import { Notice } from 'obsidian';

export interface ConnectionTestResult {
    success: boolean;
    message: string;
    details?: any;
}

/**
 * Service responsible for testing API connections
 * Follows SRP by focusing only on connection testing operations
 */
export class ApiConnectionTester {
    /**
     * Test Ollama connection
     */
    async testOllamaConnection(url: string): Promise<ConnectionTestResult> {
        try {
            const response = await fetch(`${url}api/tags`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const models = data.models || [];
            const embeddingModels = this.filterEmbeddingModels(models);
            
            if (embeddingModels.length > 0) {
                return {
                    success: true,
                    message: `✅ Ollama connected! Found ${embeddingModels.length} embedding model(s): ${embeddingModels.map((m: any) => m.name).join(', ')}`,
                    details: {
                        totalModels: models.length,
                        embeddingModels: embeddingModels.length,
                        modelNames: embeddingModels.map((m: any) => m.name)
                    }
                };
            } else {
                return {
                    success: false,
                    message: '⚠️ Ollama connected but no embedding models found. Please run: ollama pull nomic-embed-text',
                    details: {
                        totalModels: models.length,
                        embeddingModels: 0,
                        allModelNames: models.map((m: any) => m.name)
                    }
                };
            }
        } catch (error) {
            return {
                success: false,
                message: `❌ Failed to connect to Ollama: ${(error as Error).message || String(error)}. Make sure Ollama is running.`,
                details: {
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }

    /**
     * Test generic API connection
     */
    async testGenericConnection(url: string, headers?: Record<string, string>): Promise<ConnectionTestResult> {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: headers || {}
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return {
                success: true,
                message: `✅ Connection successful to ${url}`,
                details: {
                    status: response.status,
                    statusText: response.statusText,
                    headers: {}
                }
            };
        } catch (error) {
            return {
                success: false,
                message: `❌ Failed to connect to ${url}: ${(error as Error).message || String(error)}`,
                details: {
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }

    /**
     * Test connection and show notice
     */
    async testConnectionWithNotice(
        testFunction: () => Promise<ConnectionTestResult>,
        button: HTMLButtonElement
    ): Promise<ConnectionTestResult> {
        const originalText = button.textContent;
        
        try {
            button.textContent = 'Testing...';
            button.disabled = true;
            
            const result = await testFunction();
            
            // Show notice based on result
            if (result.success) {
                new Notice(result.message, 4000);
            } else {
                new Notice(result.message, 5000);
            }
            
            return result;
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    /**
     * Filter models to find embedding models
     */
    private filterEmbeddingModels(models: any[]): any[] {
        return models.filter((m: any) => 
            m.name.includes('embed') || 
            m.name.includes('nomic') || 
            m.name.includes('mxbai') ||
            m.name.includes('all-minilm')
        );
    }

    /**
     * Get Ollama setup instructions
     */
    getOllamaSetupInstructions(): string {
        return `
            <div class="ollama-step">
                <h5>Step 1: Install Ollama</h5>
                <p><strong>Windows:</strong></p>
                <ul>
                    <li>Visit <a href="https://ollama.com/download/windows" target="_blank">ollama.com/download/windows</a></li>
                    <li>Download and run <code>OllamaSetup.exe</code></li>
                    <li>Follow the installer (no admin rights required)</li>
                </ul>
                <p><strong>Mac/Linux:</strong> Follow instructions at <a href="https://ollama.com" target="_blank">ollama.com</a></p>
            </div>
            
            <div class="ollama-step">
                <h5>Step 2: Start Ollama Service</h5>
                <p>Open Command Prompt/Terminal and run:</p>
                <code>ollama serve</code>
                <p><strong>Keep this window open</strong> - Ollama needs to run in the background</p>
                <p><em>Note: If you get a "port already in use" error, Ollama may already be running as a service.</em></p>
            </div>
            
            <div class="ollama-step">
                <h5>Step 3: Download Embedding Model</h5>
                <p>In a <strong>new</strong> terminal window, run:</p>
                <ul>
                    <li><code>ollama pull nomic-embed-text</code> (Recommended - 274MB, 768 dims)</li>
                    <li><code>ollama pull mxbai-embed-large</code> (Large model - 669MB, 1024 dims)</li>
                    <li><code>ollama pull all-minilm</code> (Lightweight - 46MB, 384 dims)</li>
                </ul>
                <p>Wait for the download to complete (may take a few minutes)</p>
            </div>
            
            <div class="ollama-step">
                <h5>Step 4: Verify Setup</h5>
                <p>Check installed models:</p>
                <code>ollama list</code>
                <p>You should see your embedding model listed. Then use the "Test Connection" button below.</p>
            </div>
            
            <div class="ollama-step">
                <h5>Troubleshooting</h5>
                <ul>
                    <li><strong>Port 11434 already in use:</strong> Ollama may already be running. Check Task Manager (Windows) or Activity Monitor (Mac)</li>
                    <li><strong>Command not found:</strong> Restart your terminal or log out/in again</li>
                    <li><strong>Connection failed:</strong> Make sure <code>ollama serve</code> is running and showing "Listening on 127.0.0.1:11434"</li>
                </ul>
            </div>
        `;
    }

    /**
     * Get connection test statistics
     */
    getConnectionStats(): {
        supportedProviders: string[];
        testMethods: string[];
    } {
        return {
            supportedProviders: ['ollama', 'generic'],
            testMethods: ['testOllamaConnection', 'testGenericConnection']
        };
    }
}