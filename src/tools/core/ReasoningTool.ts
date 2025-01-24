import { BaseTool, IToolContext } from '../BaseTool';
import { formatRelationshipSection, formatPredicate, formatWikilink } from '../../utils/relationshipUtils';
import { MemoryManager } from '../../services/MemoryManager';
import { ProceduralPattern, ProceduralStep } from '../../types';

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
        actual_outcome?: string;
        success?: boolean;
    }>;
    reflector?: {
        observations: string[];
        adjustments: string[];
    };
    proposer?: {
        method: 'deductive' | 'inductive' | 'abductive' | 'first_principles' | 'analogical' | 'causal' | 'systemic';
        reasoning_prompt: string;
    };
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
    private memoryManager: MemoryManager;

    constructor(
        context: IToolContext,
        memoryManager: MemoryManager
    ) {
        super(context, {
            name: 'reasoning',
            description: 'ENFORCED WORKFLOW REQUIREMENT: This tool MUST be used after reviewIndex. It automatically creates a memory at the end.\n\n' +
                        'Required Sequence:\n' +
                        '1. manageMemory reviewIndex (MUST BE DONE FIRST)\n' +
                        '2. Use this reasoning tool (YOU ARE HERE)\n' +
                        '   - Automatically creates memory when done\n' +
                        '   - Sets endConversation: true\n\n' +
                        'Purpose:\n' +
                        '- Analyze reviewed memories\n' +
                        '- Plan necessary steps\n' +
                        '- Document decision process\n' +
                        '- Create memory of reasoning\n\n' +
                        'Key Features:\n' +
                        '- Validates memory review was done\n' +
                        '- Automatically creates memory\n' +
                        '- Saves reasoning process\n' +
                        '- Creates procedural patterns\n' +
                        '- Auto-completes conversation\n\n' +
                        'Note: The tool automatically creates a memory with your reasoning\n' +
                        'and marks the conversation as complete. No additional memory\n' +
                        'creation step is needed.',
            version: '1.0.0',
            author: 'Claudesidian MCP'
        });
        this.memoryManager = memoryManager;
    }

    /**
     * Check if current reasoning session was successful
     */
    private isSuccessfulPattern(args: ReasoningArgs): boolean {
        if (!args.steps || args.steps.length === 0) return false;

        const stepsWithOutcomes = args.steps.filter(s => s.expected_outcome);
        if (stepsWithOutcomes.length === 0) return false;

        return stepsWithOutcomes.every(step => 
            step.success || 
            (step.actual_outcome && step.actual_outcome.includes(step.expected_outcome || ''))
        );
    }

    /**
     * Save successful reasoning as a procedural pattern
     */
    private async saveProceduralPattern(args: ReasoningArgs) {
        try {
            const pattern: ProceduralPattern = {
                input: {
                    goal: args.goal,
                    query_type: args.query,
                    tools_needed: args.steps?.filter(s => s.tool).map(s => s.tool || '').filter(t => t !== '') || []
                },
                context: {
                    knowledgeGraph: args.knowledgeGraph || [],
                    reasoning_method: args.proposer?.method
                },
                steps: args.steps?.filter(s => s.tool).map(step => ({
                    tool: step.tool || '',
                    args: {},
                    expectedOutcome: step.expected_outcome || '',
                    actualOutcome: step.actual_outcome || ''
                })) as ProceduralStep[] || [],
                success: true,
                usageCount: 1,
                lastUsed: new Date().toISOString()
            };

            await this.memoryManager.createProceduralMemory(
                `pattern_${args.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
                `Procedural pattern for: ${args.goal}`,
                pattern
            );
        } catch (error) {
            console.error('Error saving procedural pattern:', error);
        }
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
                    description: "Knowledge triplets that model all relevant aspects of the problem space",
                    items: {
                        type: "object",
                        properties: {
                            subject: { type: "string" },
                            predicate: { type: "string" },
                            object: { type: "string" }
                        },
                        required: ["subject", "predicate", "object"]
                    }
                },
                proposer: {
                    type: "object",
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
                            ]
                        },
                        reasoning_prompt: { type: "string" }
                    },
                    required: ["method", "reasoning_prompt"]
                },
                critic: {
                    type: "array",
                    items: { type: "string" }
                },
                reflector: {
                    type: "object",
                    properties: {
                        observations: { type: "array", items: { type: "string" } },
                        adjustments: { type: "array", items: { type: "string" } }
                    }
                },
                requiresMemoryContext: { type: "boolean" },
                steps: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            step_number: { type: "integer", minimum: 1 },
                            description: { type: "string" },
                            requires_tool: { type: "boolean" },
                            selected_tool: { "$ref": "#/definitions/available_tools" },
                            memory_context_used: { type: "boolean" }
                        },
                        required: ["step_number", "description", "requires_tool"]
                    }
                }
            },
            required: ["title", "query", "currentSubgoal", "knowledgeGraph", "proposer", "critic", "reflector", "requiresMemoryContext", "steps"],
            definitions: {
                available_tools: {
                    type: "string",
                    enum: [] as string[],
                    description: ""
                }
            }
        };
    }

    async execute(args: ReasoningArgs): Promise<any> {
        try {
            // Validate workflow state using ToolRegistry
            if (this.context.toolRegistry.phase === 'start') {
                throw new Error('Must call reviewIndex before using reasoning tool');
            }
            if (this.context.toolRegistry.phase !== 'reviewed') {
                throw new Error('Reasoning tool must be used immediately after reviewIndex');
            }

            const schema = this.getSchema();
            const tools = await this.context.toolRegistry.getAvailableTools();
            
            const toolNames: string[] = [];
            const toolDescriptions: string[] = [];
            
            tools.forEach((tool: AvailableTool) => {
                toolNames.push(tool.name);
                toolDescriptions.push(`${tool.name}: ${tool.description}`);
            });

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

            if (this.isSuccessfulPattern(args)) {
                await this.saveProceduralPattern(args);
            }

            // Save reasoning as memory note
            await this.context.toolRegistry.executeTool('manageMemory', {
                action: 'create',
                title: args.title,
                content: `# ${args.title}\n\n${args.goal}\n\n## Reasoning Steps\n${args.steps?.map(s => 
                    `- ${s.description}${s.tool ? ` (Using: ${s.tool})` : ''}`
                ).join('\n')}`,
                metadata: {
                    category: 'Procedural',
                    description: args.goal,
                    tags: ['reasoning', args.proposer?.method || 'unspecified_method'],
                    success: this.isSuccessfulPattern(args)
                },
                endConversation: true
            });

            // Phase transitions will happen in ToolRegistry.executeTool

            return result;
        } catch (error) {
            console.error('Error in reasoning execution:', error);
            throw error;
        }
    }

    private async saveReasoningNote(analysis: any): Promise<void> {
        const reasoningFolder = `${this.context.settings.rootPath}/reasoning`;
        await this.context.vault.ensureFolder(reasoningFolder);
        
        const filename = `${analysis.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.md`;
        const fullPath = `${reasoningFolder}/${filename}`;

        const usedProceduralMemories = analysis.steps?.some((s: any) => 
            s.memory_context_used && s.selected_tool === 'searchMemory' && 
            s.description.toLowerCase().includes('procedural')
        );
        
        const relationships = analysis.knowledgeGraph?.map((t: KnowledgeTriplet) => 
            `${formatPredicate(t.predicate)} ${formatWikilink(t.object)}`
        ) || [];

        const content = [
            '---',
            'type: reasoning',
            `created: ${new Date().toISOString()}`,
            `query: ${analysis.query}`,
            usedProceduralMemories ? 'category: procedural' : '',
            'metadata:',
            '  isMoc: true',
            '  mocLinks: []',
            '---',
            '',
            '# Memory',
            `## Goal: ${analysis.title}`,
            analysis.goal,
            '',
            '## Memory Context',
            'This reasoning note serves as a map of content (#moc) for:',
            '1. The goal and approach taken',
            '2. Knowledge relationships discovered',
            '3. Tool sequences used',
            usedProceduralMemories ? '4. Procedural patterns identified' : '',
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

        await this.context.indexManager.addToIndex({
            title: analysis.title,
            description: analysis.query,
            section: 'Reasoning Sessions',
            type: 'reasoning',
            timestamp: Date.now()  // Use current Unix timestamp instead of ISO string
        });
    }
}
