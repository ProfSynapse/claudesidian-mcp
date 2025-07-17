/**
 * SessionSchemaBuilder - Handles schema building for session parameters and results
 * Follows Single Responsibility Principle by focusing only on schema operations
 */

/**
 * Service responsible for building JSON schemas for session modes
 * Follows SRP by focusing only on schema building operations
 */
export class SessionSchemaBuilder {
    /**
     * Get parameter schema for create session mode
     */
    getParameterSchema(): any {
        return {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name for the session'
                },
                description: {
                    type: 'string',
                    description: 'Description of the session purpose'
                },
                context: {
                    type: 'string',
                    description: 'Purpose or goal of this session - IMPORTANT: This will be stored with the session and used in memory operations',
                    minLength: 1
                },
                generateContextTrace: {
                    type: 'boolean',
                    description: 'Whether to generate an initial memory trace with session context',
                    default: true
                },
                sessionGoal: {
                    type: 'string',
                    description: 'The goal or purpose of this session (for memory context)'
                },
                previousSessionId: {
                    type: 'string',
                    description: 'Reference to previous session ID to establish continuity'
                },
                tags: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Tags to associate with this session'
                },
                contextDepth: {
                    type: 'string',
                    enum: ['minimal', 'standard', 'comprehensive'],
                    description: 'How much context to include in the initial memory trace',
                    default: 'standard'
                },
                workspaceContext: {
                    oneOf: [
                        {
                            type: 'object',
                            properties: {
                                workspaceId: { 
                                    type: 'string',
                                    description: 'Workspace identifier (optional - uses default workspace if not provided)' 
                                },
                                workspacePath: { 
                                    type: 'array', 
                                    items: { type: 'string' },
                                    description: 'Path from root workspace to specific phase/task'
                                }
                            },
                            description: 'Optional workspace context object - if not provided, uses a default workspace'
                        },
                        {
                            type: 'string',
                            description: 'Optional workspace context as JSON string - must contain workspaceId field'
                        }
                    ],
                    description: 'Optional workspace context - if not provided, uses a default workspace'
                }
            }
        };
    }

    /**
     * Get result schema for create session mode
     */
    getResultSchema(): any {
        return {
            type: 'object',
            properties: {
                success: {
                    type: 'boolean',
                    description: 'Whether the operation was successful'
                },
                data: {
                    type: 'object',
                    properties: {
                        sessionId: {
                            type: 'string',
                            description: 'ID of the created session'
                        },
                        name: {
                            type: 'string',
                            description: 'Name of the created session'
                        },
                        workspaceId: {
                            type: 'string',
                            description: 'ID of the workspace'
                        },
                        startTime: {
                            type: 'number',
                            description: 'Session start timestamp'
                        },
                        previousSessionId: {
                            type: 'string',
                            description: 'ID of the previous session (if continuing)'
                        },
                        purpose: {
                            type: 'string',
                            description: 'The purpose of this session extracted from context parameter'
                        },
                        context: {
                            type: 'string',
                            description: 'Contextual information about the operation (from CommonResult)'
                        },
                        memoryContext: {
                            type: 'object',
                            description: 'Detailed contextual information about the session',
                            properties: {
                                summary: {
                                    type: 'string',
                                    description: 'Summary of the workspace state at session start'
                                },
                                purpose: {
                                    type: 'string',
                                    description: 'The purpose or goal of this session derived from context parameter'
                                },
                                relevantFiles: {
                                    type: 'array',
                                    items: {
                                        type: 'string'
                                    },
                                    description: 'Key files relevant to this session'
                                },
                                recentActivities: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            timestamp: {
                                                type: 'number',
                                                description: 'When the activity occurred'
                                            },
                                            description: {
                                                type: 'string',
                                                description: 'Description of the activity'
                                            },
                                            type: {
                                                type: 'string',
                                                description: 'Type of activity'
                                            }
                                        }
                                    },
                                    description: 'Recent activities in the workspace'
                                },
                                tags: {
                                    type: 'array',
                                    items: {
                                        type: 'string'
                                    },
                                    description: 'Tags describing this session'
                                }
                            },
                            required: ['summary', 'tags']
                        }
                    },
                    required: ['sessionId', 'workspaceId', 'startTime']
                },
                error: {
                    type: 'string',
                    description: 'Error message if operation failed'
                },
                context: {
                    type: 'string',
                    description: 'The purpose and context of this session creation'
                }
            },
            required: ['success']
        };
    }

    /**
     * Merge parameter schema with base schema
     */
    getMergedParameterSchema(baseSchema: any): any {
        const modeSchema = this.getParameterSchema();
        
        return {
            ...baseSchema,
            properties: {
                ...baseSchema.properties,
                ...modeSchema.properties
            }
        };
    }

    /**
     * Merge result schema with base schema
     */
    getMergedResultSchema(baseSchema: any): any {
        const modeSchema = this.getResultSchema();
        
        // Merge the schemas
        const mergedSchema = {
            ...baseSchema,
            properties: {
                ...baseSchema.properties,
                ...modeSchema.properties
            }
        };

        // Update context property description if it exists
        if (mergedSchema.properties.context) {
            mergedSchema.properties.context.description = 'The purpose and context of this session creation';
        }

        return mergedSchema;
    }

    /**
     * Validate schema structure
     */
    validateSchemaStructure(schema: any): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check for required properties
        if (!schema.type) {
            errors.push('Schema must have a type property');
        }

        if (!schema.properties) {
            errors.push('Schema must have properties');
        }

        // Check for common properties
        if (schema.properties && !schema.properties.sessionId) {
            warnings.push('Schema missing sessionId property');
        }

        if (schema.properties && !schema.properties.workspaceId) {
            warnings.push('Schema missing workspaceId property');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get schema documentation
     */
    getSchemaDocumentation(): {
        parameters: string;
        results: string;
        examples: any;
    } {
        return {
            parameters: `
                Parameters for creating a new session:
                - name: Optional name for the session
                - description: Optional description of the session purpose
                - context: Purpose or goal of this session (stored with session)
                - generateContextTrace: Whether to generate initial memory trace (default: true)
                - sessionGoal: The goal or purpose of this session for memory context
                - previousSessionId: Reference to previous session ID for continuity
                - tags: Array of tags to associate with this session
                - contextDepth: How much context to include (minimal/standard/comprehensive)
                - workspaceContext: Optional workspace context (object or JSON string)
            `,
            results: `
                Results from session creation:
                - success: Whether the operation was successful
                - data: Object containing session details
                  - sessionId: ID of the created session
                  - name: Name of the created session
                  - workspaceId: ID of the workspace
                  - startTime: Session start timestamp
                  - previousSessionId: ID of previous session (if continuing)
                  - memoryContext: Detailed contextual information
                - error: Error message if operation failed
                - context: The purpose and context of this session creation
            `,
            examples: {
                parameter: {
                    name: "Research Session",
                    description: "Session for researching new features",
                    context: "Research new authentication methods",
                    generateContextTrace: true,
                    sessionGoal: "Identify best authentication approach",
                    tags: ["research", "authentication"],
                    contextDepth: "standard"
                },
                result: {
                    success: true,
                    data: {
                        sessionId: "sess_123456789",
                        name: "Research Session",
                        workspaceId: "ws_default",
                        startTime: 1640995200000,
                        memoryContext: {
                            summary: "Workspace: Default Workspace",
                            tags: ["research", "authentication", "folder:root"]
                        }
                    },
                    context: "Created session with purpose: Research new authentication methods"
                }
            }
        };
    }

    /**
     * Get property descriptions
     */
    getPropertyDescriptions(): {
        parameters: Record<string, string>;
        results: Record<string, string>;
    } {
        return {
            parameters: {
                name: 'Name for the session',
                description: 'Description of the session purpose',
                context: 'Purpose or goal of this session - IMPORTANT: This will be stored with the session and used in memory operations',
                generateContextTrace: 'Whether to generate an initial memory trace with session context',
                sessionGoal: 'The goal or purpose of this session (for memory context)',
                previousSessionId: 'Reference to previous session ID to establish continuity',
                tags: 'Tags to associate with this session',
                contextDepth: 'How much context to include in the initial memory trace',
                workspaceContext: 'Optional workspace context - if not provided, uses a default workspace'
            },
            results: {
                success: 'Whether the operation was successful',
                sessionId: 'ID of the created session',
                name: 'Name of the created session',
                workspaceId: 'ID of the workspace',
                startTime: 'Session start timestamp',
                previousSessionId: 'ID of the previous session (if continuing)',
                memoryContext: 'Detailed contextual information about the session',
                error: 'Error message if operation failed',
                context: 'The purpose and context of this session creation'
            }
        };
    }
}