export const CONFIG = {
    APP_NAME: 'Claudesidian MCP',
    REFERRER: 'obsidian.md',
    PROMPTS: {
        SYSTEM: 'You are a helpful assistant integrated with Obsidian via Claudesidian MCP.',
        formatUserPrompt: (prompt: string, selectedText: string = '', fullNote: string = '') => {
            return `${prompt}\n\nContext:\n${selectedText}\n\nFull note:\n${fullNote}`;
        }
    }
};
