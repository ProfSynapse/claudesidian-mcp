/**
 * Location: src/handlers/services/BaseSchemaProvider.ts
 * 
 * Base abstract class for schema enhancement providers. Implements common
 * functionality for schema enhancement and provides DRY foundation for
 * specific enhancement providers.
 * Extends this class to create specific enhancement providers.
 */

import { ISchemaProvider } from '../interfaces/ISchemaProvider';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorUtils';

export abstract class BaseSchemaProvider implements ISchemaProvider {
    abstract readonly name: string;
    abstract readonly description: string;

    /**
     * Default priority - can be overridden by implementations
     */
    getPriority(): number {
        return 100;
    }

    /**
     * Default implementation - checks tool name patterns.
     * Override for more sophisticated logic.
     */
    async canEnhance(toolName: string, baseSchema: any): Promise<boolean> {
        try {
            return this.shouldEnhanceToolName(toolName) && this.hasValidSchema(baseSchema);
        } catch (error) {
            logger.systemError(error as Error, `${this.name} - Error in canEnhance`);
            return false;
        }
    }

    abstract enhanceSchema(toolName: string, baseSchema: any): Promise<any>;

    /**
     * Common utility: Check if tool name should be enhanced by this provider
     * Override this method to define tool name patterns for enhancement
     */
    protected shouldEnhanceToolName(toolName: string): boolean {
        // Default: enhance all tools (override in subclasses for specific patterns)
        return true;
    }

    /**
     * Common utility: Validate that base schema is valid for enhancement
     */
    protected hasValidSchema(baseSchema: any): boolean {
        return baseSchema && typeof baseSchema === 'object' && baseSchema.properties;
    }

    /**
     * Common utility: Deep clone schema to avoid mutations
     */
    protected cloneSchema(schema: any): any {
        try {
            return JSON.parse(JSON.stringify(schema));
        } catch (error) {
            logger.systemError(error as Error, `${this.name} - Error cloning schema`);
            return { ...schema }; // Shallow clone fallback
        }
    }

    /**
     * Common utility: Merge enhanced properties into base schema
     */
    protected mergeProperties(baseSchema: any, enhancedProperties: any): any {
        const enhanced = this.cloneSchema(baseSchema);
        
        if (enhancedProperties) {
            enhanced.properties = {
                ...enhanced.properties,
                ...enhancedProperties
            };
        }
        
        return enhanced;
    }

    /**
     * Common utility: Add conditional validation rules to schema
     */
    protected addConditionalValidation(schema: any, condition: any, validation: any): any {
        const enhanced = this.cloneSchema(schema);
        
        if (!enhanced.allOf) {
            enhanced.allOf = [];
        }
        
        enhanced.allOf.push({
            if: condition,
            then: validation
        });
        
        return enhanced;
    }

    /**
     * Common utility: Add required fields conditionally
     */
    protected addConditionalRequired(schema: any, condition: any, requiredFields: string[]): any {
        return this.addConditionalValidation(schema, condition, {
            required: requiredFields
        });
    }

    /**
     * Common utility: Log enhancement activity for debugging
     */
    protected logEnhancement(toolName: string, action: string, details?: any): void {
        logger.systemLog(`[${this.name}] Enhanced ${toolName}: ${action}`, details);
    }

    /**
     * Common utility: Safe error handling wrapper for enhancement operations
     */
    protected async safeEnhance<T>(
        operation: () => Promise<T>,
        fallbackValue: T,
        operationName: string
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            logger.systemError(
                error as Error, 
                `${this.name} - Error in ${operationName}: ${getErrorMessage(error)}`
            );
            return fallbackValue;
        }
    }
}