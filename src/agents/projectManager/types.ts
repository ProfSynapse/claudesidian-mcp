import { CommonParameters, CommonResult } from '../../types';

/**
 * Project plan type
 */
export interface ProjectPlan {
  /**
   * Project name
   */
  name: string;
  
  /**
   * Project description
   */
  description: string;
  
  /**
   * Project goals
   */
  goals: string[];
  
  /**
   * Project tasks
   */
  tasks: ProjectTask[];
  
  /**
   * Project timeline
   */
  timeline?: string;
  
  /**
   * Project resources
   */
  resources?: string[];
}

/**
 * Project task
 */
export interface ProjectTask {
  /**
   * Task name
   */
  name: string;
  
  /**
   * Task description
   */
  description: string;
  
  /**
   * Task status
   */
  status: TaskStatus;
  
  /**
   * Task priority
   */
  priority: TaskPriority;
  
  /**
   * Task due date
   */
  dueDate?: string;
  
  /**
   * Task assignee
   */
  assignee?: string;
  
  /**
   * Task subtasks
   */
  subtasks?: ProjectTask[];
  
  /**
   * Dependencies on other tasks (by task ID or index)
   */
  dependencies?: number[];
  
  /**
   * Tools needed for this task
   */
  toolsNeeded?: string[];
  
  /**
   * Whether this task requires specific tools
   */
  needsTool?: boolean;
}

/**
 * Task status
 */
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'inProgress',
  DONE = 'done',
  BLOCKED = 'blocked'
}

/**
 * Task priority
 */
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Project checkpoint
 */
export interface ProjectCheckpoint {
  /**
   * Checkpoint name
   */
  name: string;
  
  /**
   * Checkpoint description
   */
  description: string;
  
  /**
   * Checkpoint date
   */
  date: string;
  
  /**
   * Checkpoint status
   */
  status: CheckpointStatus;
  
  /**
   * Checkpoint notes
   */
  notes?: string;
}

/**
 * Checkpoint status
 */
export enum CheckpointStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  MISSED = 'missed'
}

/**
 * Arguments for project plan
 */
export interface ProjectPlanArgs extends CommonParameters {
  /**
   * Primary goal of the project
   */
  primaryGoal: string;
  
  /**
   * Proposed subgoals to accomplish the primary goal
   */
  subgoals?: ProjectSubgoal[];
  
  /**
   * Optional path for internal reference only (not used for vault interaction)
   * This is only for internal planning purposes and doesn't interact with the vault
   */
  path?: string;
}

/**
 * Project subgoal
 */
export interface ProjectSubgoal {
  /**
   * Description of the subgoal
   */
  description: string;
  
  /**
   * Dependencies on other subgoals
   */
  dependencies?: number[];
  
  /**
   * Steps to accomplish this subgoal
   */
  steps: ProjectStep[];
}

/**
 * Project step
 */
export interface ProjectStep {
  /**
   * Description of the step
   */
  stepDescription: string;
  
  /**
   * Whether this step requires specific tools
   */
  needsTool: boolean;
  
  /**
   * Dependencies on other steps
   */
  dependencies?: number[];
  
  /**
   * Tools needed for this step
   */
  toolsNeeded?: string[];
}

/**
 * Result of project plan
 */
export interface ProjectPlanResult {
  /**
   * The created plan
   */
  plan: {
    primaryGoal: string;
    subgoals: ProjectSubgoal[];
  };
  
  /**
   * Path to the saved project plan
   */
  path: string;
  
  /**
   * Whether the plan was saved successfully
   */
  success: boolean;
  
  /**
   * Signal that user input is required before continuing
   */
  requiresUserInput: boolean;
  
  /**
   * Signal to pause execution until user provides feedback
   */
  pauseExecution: boolean;
  
  /**
   * Message to display to the user about expected behavior
   */
  message: string;
}

/**
 * Arguments for asking a question
 */
export interface AskQuestionArgs extends CommonParameters {
  /**
   * The current context or topic that needs clarification
   */
  context: string;
  
  /**
   * Array of follow-up questions to ask the user
   */
  questions?: string[];
}

/**
 * Result of asking a question
 */
export interface AskQuestionResult extends CommonResult {
  /**
   * The questions that were asked
   */
  questions: string[];
  
  /**
   * The context that was provided
   */
  context: string;
  
  /**
   * Signal that user input is required before continuing
   */
  requiresUserInput: boolean;
  
  /**
   * Signal to pause execution until user provides feedback
   */
  pauseExecution: boolean;
  
  /**
   * Message to display to the user about expected behavior
   */
  message: string;
}

/**
 * Arguments for creating a checkpoint
 */
export interface CheckpointArgs extends CommonParameters {
  /**
   * Description of what has been completed and why feedback is needed
   */
  description: string;
  
  /**
   * Summary of accomplished work
   */
  progressSummary?: string;
  
  /**
   * Why you are stopping at this point
   */
  checkpointReason?: string;
  
  /**
   * Suggested next steps to discuss with the user
   */
  nextStep?: string;
  
  /**
   * Optional path for internal reference only (not used for vault interaction)
   * This is only for internal planning purposes and doesn't interact with the vault
   */
  projectPath?: string;
}

/**
 * Result of creating a checkpoint
 */
export interface CheckpointResult {
  /**
   * Description of what has been completed
   */
  description: string;
  
  /**
   * Summary of accomplished work
   */
  progressSummary: string;
  
  /**
   * Why you are stopping at this point
   */
  checkpointReason: string;
  
  /**
   * Suggested next steps to discuss with the user
   */
  nextStep: string;
  
  /**
   * Path to the project file
   */
  projectPath: string;
  
  /**
   * Whether the checkpoint was created successfully
   */
  success: boolean;
  
  /**
   * Signal that user input is required before continuing
   */
  requiresUserInput: boolean;
  
  /**
   * Signal to pause execution until user provides feedback
   */
  pauseExecution: boolean;
  
  /**
   * Message to display to the user about expected behavior
   */
  message: string;
}

/**
 * Arguments for project completion
 */
export interface CompletionArgs extends CommonParameters {
  /**
   * High-level summary of the completed project
   */
  summary: string;
  
  /**
   * List of specific accomplishments achieved during the project
   */
  accomplishments?: string[];
  
  /**
   * List of challenges encountered and how they were addressed
   */
  challenges?: string[];
  
  /**
   * Key insights, learnings, or discoveries from the project
   */
  learnings?: string[];
  
  /**
   * Suggestions for future work, improvements, or next steps
   */
  futureWork?: string[];
  
  /**
   * Optional path for internal reference only (not used for vault interaction)
   * This is only for internal planning purposes and doesn't interact with the vault
   */
  projectPath?: string;
}

/**
 * Result of project completion
 */
export interface CompletionResult {
  /**
   * High-level summary of the completed project
   */
  summary: string;
  
  /**
   * List of specific accomplishments achieved during the project
   */
  accomplishments: string[];
  
  /**
   * List of challenges encountered and how they were addressed
   */
  challenges: string[];
  
  /**
   * Key insights, learnings, or discoveries from the project
   */
  learnings: string[];
  
  /**
   * Suggestions for future work, improvements, or next steps
   */
  futureWork: string[];
  
  /**
   * Path to the project file
   */
  projectPath: string;
  
  /**
   * Whether the completion was created successfully
   */
  success: boolean;
  
  /**
   * Signal that user input is required before continuing
   */
  requiresUserInput: boolean;
  
  /**
   * Signal to pause execution until user provides feedback
   */
  pauseExecution: boolean;
  
  /**
   * Message to display to the user about expected behavior
   */
  message: string;
}