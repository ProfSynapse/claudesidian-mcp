import { BaseTool, IToolContext } from '../BaseTool';
import { formatRelationshipSection, formatPredicate, formatWikilink } from '../../utils/relationshipUtils';

interface KnowledgeTriplet {
    subject: string;
    predicate: string;
    object: string;
}

interface ReasoningArgs {
    title: string;
    query: string;
    goal: string;
    knowledgeGraph?: KnowledgeTriplet[];
    steps?: Array<{
        description: string;
        tool?: string;
        expected_outcome?: string;
    }>;
}

interface ReasoningStep {
    description: string;
    useTool?: string | null;  // Name of tool to use, or null if no tool needed
}

interface ReasoningState {
    goal: string;
    currentSubgoal: string | null;
    knowledgeGraph: Map<string, Set<string>>;
    steps: ReasoningStep[];
}

interface AvailableTool {
    name: string;
    description: string;
}

export class ReasoningTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'reasoning',
            description: 'You are MANDATED to start EVERY interaction with your reasoning tool. If the query relates to past experiences, knowledge, or context, set requiresMemoryContext to true and your first step should be using the searchMemory tool. This applies to personal queries, context-dependent questions, or references to past events. Then determine what additional tools you might need.',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    getSchema() {
        return {
            type: "object",
            properties: {
                title: {
                    type: "string",
                    description: "Title for this reasoning session"
                },
                query: {
                    type: "string",
                    description: "Original query or prompt that initiated this reasoning"
                },
                goal: {
                    type: "string",
                    description: "The main goal to achieve"
                },
                currentSubgoal: {
                    type: "string",
                    description: "Current active subgoal"
                },
                knowledgeGraph: {
                    type: "array",
                    description: "Knowledge triplets that model all relevant aspects of the problem space. Create as many as needed for complete understanding.",
                    items: {
                        type: "object",
                        properties: {
                            subject: {
                                type: "string",
                                description: "Entity that is the source or origin"
                            },
                            predicate: {
                                type: "string",
                                description: "Relationship between subject and object"
                            },
                            object: {
                                type: "string",
                                description: "Entity that is the target or destination"
                            }
                        },
                        required: ["subject", "predicate", "object"]
                    }
                },
                proposer: {
                    type: "object",
                    description: "System for proposing next steps using specified reasoning method",
                    properties: {
                        method: {
                            type: "string",
                            enum: [
                                "deductive",
                                "inductive",
                                "abductive",
                                "first_principles",
                                "analogical",
                                "causal",
                                "systemic"
                            ],
                            description: `
                                deductive: Best for reaching certain conclusions from general principles
                                inductive: Use when building general theories from specific observations
                                abductive: For finding simplest explanation of observations
                                first_principles: Break down complex problems into fundamental truths
                                analogical: Apply solutions from similar problems
                                causal: Analyze cause-effect relationships
                                systemic: Consider whole system interactions
                            `
                        },
                        reasoning_prompt: {
                            type: "string",
                            description: "Given the goal and current state, reason step-by-step what comes next and why?"
                        }
                    },
                    required: ["method", "reasoning_prompt"]
                },
                critic: {
                    type: "array",
                    description: "Provide constructive criticism about the proposer's approach and potential improvements",
                    items: {
                        type: "string",
                        description: "Each criticism will be specific, actionable, and focused on improving the solution"
                    }
                },
                reflector: {
                    type: "object",
                    properties: {
                        observations: {
                            type: "array",
                            items: { type: "string" }
                        },
                        adjustments: {
                            type: "array",
                            items: { type: "string" }
                        }
                    }
                },
                requiresMemoryContext: {
                    type: "boolean",
                    description: "Set to true if this reasoning requires searching memories first. Consider true for: personal queries, context-dependent questions, references to past events, or building on previous interactions. If true, first step must use searchMemory tool."
                },
                steps: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            step_number: {
                                type: "integer",
                                minimum: 1
                            },
                            description: {
                                type: "string",
                                description: "Clear description of the step. If requiresMemoryContext is true, first step must be memory search."
                            },
                            requires_tool: {
                                type: "boolean",
                                description: "Whether this step needs a tool to be executed"
                            },
                            selected_tool: {
                                type: "string",
                                description: "Selected tool if requires_tool is true",
                                enum: {
                                    "$ref": "#/definitions/available_tools"
                                }
                            },
                            memory_context_used: {
                                type: "boolean",
                                description: "Whether this step utilized memory search results"
                            }
                        },
                        required: ["step_number", "description", "requires_tool"]
                    }
                }
            },
            required: ["title", "query", "goal", "requiresMemoryContext"],
            definitions: {
                available_tools: {
                    type: "string",
                    enum: [] as string[],  // Explicitly type as string array
                    description: ""  // Will be populated with tool descriptions
                }
            }
        };
    }


    // Update execute method to handle dynamic tool list
    async execute(args: ReasoningArgs): Promise<any> {
        const schema = this.getSchema();
        
        // Get tools and their metadata
        const tools = await this.context.toolRegistry.getAvailableTools();
        
        // Create tool mapping
        const toolNames: string[] = [];
        const toolDescriptions: string[] = [];
        
        // Populate arrays
        tools.forEach((tool: AvailableTool) => {
            toolNames.push(tool.name);
            toolDescriptions.push(`${tool.name}: ${tool.description}`);
        });

        // Update schema with available tools
        schema.definitions.available_tools = {
            type: "string",
            enum: toolNames,
            description: toolDescriptions.join('\n')
        };

        if (!this.validateArgs(args, schema)) {
            throw new Error('Invalid arguments provided to reasoning tool');
        }

        // Format knowledge graph triplets
        if (args.knowledgeGraph) {
            args.knowledgeGraph = args.knowledgeGraph.map(triplet => ({
                subject: triplet.subject.startsWith('[[') ? triplet.subject : `[[${triplet.subject}]]`,
                predicate: triplet.predicate.startsWith('#') ? triplet.predicate : 
                    `#${triplet.predicate.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
                object: triplet.object.startsWith('[[') ? triplet.object : `[[${triplet.object}]]`
            }));
        }

        const result = args;
        await this.saveReasoningNote(result);
        return result;
    }

    private async saveReasoningNote(analysis: any): Promise<void> {
        const reasoningFolder = `${this.context.settings.rootPath}/reasoning`;
        await this.context.vault.ensureFolder(reasoningFolder);
        
        const filename = `${analysis.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.md`;
        const fullPath = `${reasoningFolder}/${filename}`;
        
        const relationships = analysis.knowledgeGraph?.map((t: KnowledgeTriplet) => 
            `${formatPredicate(t.predicate)} ${formatWikilink(t.object)}`
        ) || [];

        const content = [
            '---',
            'type: reasoning',
            `created: ${new Date().toISOString()}`,
            `query: ${analysis.query}`,
            '---',
            '',
            '# Memory',
            `## Goal: ${analysis.title}`,
            analysis.goal,
            '',
            analysis.currentSubgoal ? [
                '## Current Subgoal',
                analysis.currentSubgoal,
                ''
            ].join('\n') : '',
            formatRelationshipSection(relationships),
            '## Proposer',
            `**Method**: ${analysis.proposer?.method || 'Not specified'}`,
            '',
            `**Reasoning**: ${analysis.proposer?.reasoning_prompt || 'Not provided'}`,
            '',
            '## Critic',
            analysis.critic?.length ? 
                analysis.critic.map((c: string) => `- ${c}`).join('\n') :
                '_No criticisms provided_',
            '',
            '## Reflector',
            '### Observations',
            analysis.reflector?.observations?.length ?
                analysis.reflector.observations.map((o: string) => `- ${o}`).join('\n') :
                '_No observations recorded_',
            '',
            '### Adjustments',
            analysis.reflector?.adjustments?.length ?
                analysis.reflector.adjustments.map((a: string) => `- ${a}`).join('\n') :
                '_No adjustments suggested_',
            '',
            '## Steps',
            analysis.steps?.map((s: any) => 
                `${s.step_number}. ${s.description}${
                    s.requires_tool && s.selected_tool ? ` _(Using: ${s.selected_tool})_` : ''
                }`
            ).join('\n') || '_No steps defined_'
        ].filter(Boolean).join('\n');

        await this.context.vault.createNote(fullPath, content, {
            createFolders: true
        });

        // Update index using IndexManager
        await this.context.indexManager.addToIndex({
            title: analysis.title,
            description: analysis.query,
            section: 'Reasoning Sessions'
        });
    }
}