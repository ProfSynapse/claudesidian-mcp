# Checkpoint Command Update Plan

## Files to Update

1. src/tools/core/commands/ProjectCommands.ts:
   - Rename `CheckCompletionCommand` class to `CheckpointCommand`
   - Update class implementation with new parameters and behavior
   - Remove completion-related terminology
   - Update JSDoc comments to reflect checkpoint functionality

2. src/tools/core/ProjectTool.ts:
   - Update import statement to use `CheckpointCommand`
   - Rename `checkCompletionCommand` property to `checkpointCommand`
   - Update constructor to initialize `checkpointCommand`

## Implementation Details

### ProjectCommands.ts Changes
```typescript
/**
 * Command handler for creating checkpoints in task execution
 * Used to pause for user feedback and confirm progress
 */
export class CheckpointCommand implements IProjectCommandHandler {
    async execute(args: any, context: IToolContext): Promise<any> {
        if (!args.description || typeof args.description !== 'string') {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Description parameter is required and must be a string'
            );
        }

        return {
            description: args.description,
            progressSummary: args.progressSummary || '',
            checkpointReason: args.checkpointReason || '',
            nextStep: args.nextStep || ''
        };
    }

    getSchema(): any {
        return {
            properties: {
                description: {
                    type: 'string',
                    description: 'Description of the checkpoint - what has been completed and why feedback is needed'
                },
                progressSummary: {
                    type: 'string',
                    description: 'Summary of what has been accomplished up to this point'
                },
                checkpointReason: {
                    type: 'string',
                    description: 'Explanation of why this is a good point to pause and get feedback'
                },
                nextStep: {
                    type: 'string',
                    description: 'Suggested next step or action after this checkpoint'
                }
            },
            required: ['description']
        };
    }
}
```

### ProjectTool.ts Changes
```typescript
import { AskQuestionCommand, CheckpointCommand, CreatePlanCommand } from './commands/ProjectCommands';

export class ProjectTool implements ITool {
    private askQuestionCommand: AskQuestionCommand;
    private checkpointCommand: CheckpointCommand;
    private createPlanCommand: CreatePlanCommand;

    constructor() {
        this.askQuestionCommand = new AskQuestionCommand();
        this.checkpointCommand = new CheckpointCommand();
        this.createPlanCommand = new CreatePlanCommand();
    }
}
```

Would you like me to proceed with implementing these changes?