import { Notice } from 'obsidian';

interface ModelConfig {
    name: string;
    dimensions: number;
    maxTokens: number;
    modelPath: string;
    tokenizerPath: string;
    configPath: string;
}

interface LoadedModel {
    pipeline: any;
    tokenizer: any;
    config: ModelConfig;
    isLoaded: boolean;
    isLoading: boolean;
    loadPromise?: Promise<void>;
}

/**
 * Manages local ONNX models for embedding generation
 * Handles model loading, caching, and lifecycle management
 */
export class LocalModelManager {
    private static instance: LocalModelManager;
    private models: Map<string, LoadedModel> = new Map();
    private isInitialized = false;
    private initializePromise?: Promise<void>;

    private readonly MODEL_CONFIGS: Record<string, ModelConfig> = {
        'all-MiniLM-L6-v2': {
            name: 'all-MiniLM-L6-v2',
            dimensions: 384,
            maxTokens: 512,
            modelPath: '/static/models/all-MiniLM-L6-v2/onnx/model_quantized_q8.onnx',
            tokenizerPath: '/static/models/all-MiniLM-L6-v2/onnx/tokenizer.json',
            configPath: '/static/models/all-MiniLM-L6-v2/onnx/config.json'
        }
    };

    private constructor() {}

    static getInstance(): LocalModelManager {
        if (!LocalModelManager.instance) {
            LocalModelManager.instance = new LocalModelManager();
        }
        return LocalModelManager.instance;
    }

    /**
     * Initialize the model manager
     * Sets up the environment and prepares for model loading
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        if (this.initializePromise) {
            return this.initializePromise;
        }

        this.initializePromise = this.doInitialize();
        return this.initializePromise;
    }

    private async doInitialize(): Promise<void> {
        try {
            console.log('Initializing LocalModelManager...');
            
            // Import transformers.js
            const { env } = await import('@xenova/transformers');
            
            // Configure Transformers.js to use local models
            env.allowLocalModels = false; // We'll use our own model loading
            env.allowRemoteModels = false;
            env.useBrowserCache = true;
            
            // Set custom model path if supported
            if ('localURL' in env) {
                (env as any).localURL = window.location.origin + '/';
            }
            
            this.isInitialized = true;
            console.log('LocalModelManager initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize LocalModelManager:', error);
            throw new Error(`Failed to initialize local embedding models: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Load a specific model
     * @param modelName Name of the model to load
     * @returns Promise that resolves when model is loaded
     */
    async loadModel(modelName: string): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const config = this.MODEL_CONFIGS[modelName];
        if (!config) {
            throw new Error(`Unsupported model: ${modelName}`);
        }

        let model = this.models.get(modelName);
        if (!model) {
            model = {
                pipeline: null,
                tokenizer: null,
                config,
                isLoaded: false,
                isLoading: false
            };
            this.models.set(modelName, model);
        }

        if (model.isLoaded) {
            return;
        }

        if (model.isLoading && model.loadPromise) {
            return model.loadPromise;
        }

        model.isLoading = true;
        model.loadPromise = this.doLoadModel(model);
        
        try {
            await model.loadPromise;
        } finally {
            model.isLoading = false;
        }
    }

    private async doLoadModel(model: LoadedModel): Promise<void> {
        try {
            console.log(`Loading model: ${model.config.name}...`);
            
            const startTime = Date.now();
            new Notice(`Loading local embedding model: ${model.config.name}...`);

            // Import pipeline from transformers.js
            const { pipeline } = await import('@xenova/transformers');
            
            // Create the embedding pipeline
            model.pipeline = await pipeline('feature-extraction', model.config.name, {
                quantized: true,
                local_files_only: false, // Allow downloading if not cached
                cache_dir: './.cache/transformers',
                revision: 'main'
            });

            model.isLoaded = true;
            
            const loadTime = Date.now() - startTime;
            console.log(`Model ${model.config.name} loaded successfully in ${loadTime}ms`);
            new Notice(`Local embedding model loaded successfully (${(loadTime / 1000).toFixed(1)}s)`);
            
        } catch (error) {
            console.error(`Failed to load model ${model.config.name}:`, error);
            model.isLoaded = false;
            throw new Error(`Failed to load model ${model.config.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get a loaded model
     * @param modelName Name of the model
     * @returns Loaded model or null if not loaded
     */
    getModel(modelName: string): LoadedModel | null {
        const model = this.models.get(modelName);
        return model && model.isLoaded ? model : null;
    }

    /**
     * Get model configuration
     * @param modelName Name of the model
     * @returns Model configuration or null if not found
     */
    getModelConfig(modelName: string): ModelConfig | null {
        return this.MODEL_CONFIGS[modelName] || null;
    }

    /**
     * Check if a model is available
     * @param modelName Name of the model
     * @returns True if model is supported
     */
    isModelSupported(modelName: string): boolean {
        return modelName in this.MODEL_CONFIGS;
    }

    /**
     * Get list of supported models
     * @returns Array of supported model names
     */
    getSupportedModels(): string[] {
        return Object.keys(this.MODEL_CONFIGS);
    }

    /**
     * Get model status
     * @param modelName Name of the model
     * @returns Model status information
     */
    getModelStatus(modelName: string): {
        isSupported: boolean;
        isLoaded: boolean;
        isLoading: boolean;
        config?: ModelConfig;
    } {
        const config = this.MODEL_CONFIGS[modelName];
        const model = this.models.get(modelName);
        
        return {
            isSupported: !!config,
            isLoaded: model?.isLoaded || false,
            isLoading: model?.isLoading || false,
            config
        };
    }

    /**
     * Unload a model to free memory
     * @param modelName Name of the model to unload
     */
    async unloadModel(modelName: string): Promise<void> {
        const model = this.models.get(modelName);
        if (!model) {
            return;
        }

        try {
            // Clean up the pipeline if it has cleanup methods
            if (model.pipeline && typeof model.pipeline.dispose === 'function') {
                await model.pipeline.dispose();
            }
            
            model.pipeline = null;
            model.tokenizer = null;
            model.isLoaded = false;
            
            console.log(`Model ${modelName} unloaded successfully`);
            
        } catch (error) {
            console.error(`Error unloading model ${modelName}:`, error);
        }
    }

    /**
     * Unload all models to free memory
     */
    async unloadAllModels(): Promise<void> {
        const modelNames = Array.from(this.models.keys());
        
        for (const modelName of modelNames) {
            await this.unloadModel(modelName);
        }
        
        this.models.clear();
        console.log('All models unloaded successfully');
    }

    /**
     * Get memory usage information
     * @returns Memory usage statistics
     */
    getMemoryUsage(): {
        loadedModels: number;
        totalModels: number;
        estimatedMemoryMB: number;
    } {
        const loadedModels = Array.from(this.models.values()).filter(m => m.isLoaded).length;
        const totalModels = this.models.size;
        
        // Rough estimate: all-MiniLM-L6-v2 quantized model is approximately 80-90MB
        const estimatedMemoryMB = loadedModels * 90;
        
        return {
            loadedModels,
            totalModels,
            estimatedMemoryMB
        };
    }

    /**
     * Cleanup method to be called when the plugin is disabled
     */
    async cleanup(): Promise<void> {
        await this.unloadAllModels();
        this.isInitialized = false;
        this.initializePromise = undefined;
        console.log('LocalModelManager cleanup completed');
    }
}