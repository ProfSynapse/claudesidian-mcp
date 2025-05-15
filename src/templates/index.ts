/**
 * Template file interface
 */
export interface TemplateFile {
    name: string;
    path: string;
}

/**
 * Template file definitions for the template pack feature
 * Maps template names to their file paths and provides metadata
 */
export const templateFiles = {
  meetingNotes: {
    name: 'meeting-notes.md',
    path: 'Templates/meeting-notes.md'
  },
  projectPlan: {
    name: 'project-plan.md',
    path: 'Templates/project-plan.md'
  },
  mapOfContents: {
    name: 'map-of-contents.md',
    path: 'Templates/map-of-contents.md'
  },
  memory: {
    name: 'memory.md',
    path: 'Templates/memory.md'
  },
  prompts: {
    name: 'prompts.md',
    path: 'Templates/prompts.md'
  }
};
