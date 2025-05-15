import { Notice, Plugin, requestUrl } from 'obsidian';
import { MCPSettings } from '../types';

interface ReleaseAsset {
    name: string;
    browser_download_url: string;
}

interface GitHubRelease {
    tag_name: string;
    assets: ReleaseAsset[];
}

/**
 * UpdateManager handles checking for and applying plugin updates from GitHub releases
 * Fetches the latest release info and downloads required files:
 * - main.js
 * - connector.js
 * - styles.css
 * - manifest.json
 */
export class UpdateManager {
    private readonly GITHUB_API = 'https://api.github.com/repos/ProfSynapse/claudesidian-mcp';
    private readonly REQUIRED_FILES = ['main.js', 'connector.js', 'styles.css', 'manifest.json'];

    constructor(private plugin: Plugin) {}

    /**
     * Check if a new version is available
     * @returns true if update available, false if current
     */
    async checkForUpdate(): Promise<boolean> {
        try {
            const release = await this.fetchLatestRelease();
            const latestVersion = release.tag_name.replace('v', '');
            const currentVersion = this.plugin.manifest.version;
            
            return this.compareVersions(latestVersion, currentVersion) > 0;
        } catch (error) {
            console.error('Failed to check for updates:', error);
            throw new Error('Failed to check for updates: ' + (error as Error).message);
        }
    }

    /**
     * Download and install the latest version of the plugin
     */
    async updatePlugin(): Promise<void> {
        try {
            const release = await this.fetchLatestRelease();
            const latestVersion = release.tag_name.replace('v', '');
            
            // Verify all required files exist in release
            const assets = release.assets;
            const missingFiles = this.REQUIRED_FILES.filter(file => 
                !assets.some(asset => asset.name === file)
            );

            if (missingFiles.length > 0) {
                throw new Error(`Release is missing required files: ${missingFiles.join(', ')}`);
            }

            // Download and save each file
            for (const fileName of this.REQUIRED_FILES) {
                const asset = assets.find((a: ReleaseAsset) => a.name === fileName);
                if (!asset) continue;

                const content = await this.downloadFile(asset.browser_download_url);
                
                // Handle file content appropriately based on type
                await this.plugin.app.vault.adapter.writeBinary(
                    `${this.plugin.manifest.dir}/${fileName}`,
                    content
                );
            }

            // Update the manifest in memory with the latest version
            this.plugin.manifest.version = latestVersion;
            
            // Update settings to reflect the latest version
            await this.updateVersionInSettings(latestVersion);

            new Notice(`Plugin updated successfully to version ${latestVersion}! Please refresh Obsidian to apply changes.`);
        } catch (error) {
            console.error('Failed to update plugin:', error);
            new Notice('Failed to update plugin: ' + (error as Error).message);
            throw error;
        }
    }

    /**
     * Update the version in the plugin settings
     * @param version The version to set
     */
    private async updateVersionInSettings(version: string): Promise<void> {
        try {
            // Load current settings
            const currentData = await this.plugin.loadData() as MCPSettings;
            
            // Create updated settings with version info
            const updatedData = {
                ...currentData,
                lastUpdateVersion: version,
                lastUpdateDate: new Date().toISOString()
            };
            
            // Save the updated settings
            await this.plugin.saveData(updatedData);
        } catch (error) {
            console.error('Failed to update version in settings:', error);
            // Don't throw here to prevent blocking the update process
        }
    }

    /**
     * Compare two version strings
     * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
     */
    private compareVersions(v1: string, v2: string): number {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            if (parts1[i] > parts2[i]) return 1;
            if (parts1[i] < parts2[i]) return -1;
        }
        
        return 0;
    }

    /**
     * Fetch latest release information from GitHub
     */
    private async fetchLatestRelease(): Promise<GitHubRelease> {
        const response = await requestUrl({
            url: `${this.GITHUB_API}/releases/latest`,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Obsidian-Plugin-Updater'
            }
        });
        
        if (response.status !== 200) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        return response.json;
    }

    /**
     * Download file content from URL
     */
    private async downloadFile(url: string): Promise<ArrayBuffer> {
        const response = await requestUrl({
            url: url,
            method: 'GET'
        });
        
        if (response.status !== 200) {
            throw new Error(`Failed to download file: ${response.status}`);
        }
        
        return response.arrayBuffer;
    }
}
