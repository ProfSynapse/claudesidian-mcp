interface Section {
    id: string;
    content: string;
}

export class SectionManager {
    private static START_MARKER = (id: string) => `<!-- section:${id} -->`;
    private static END_MARKER = (id: string) => `<!-- /section:${id} -->`;

    static wrapContent(id: string, content: string): string {
        return `${this.START_MARKER(id)}\n${content}\n${this.END_MARKER(id)}`;
    }

    static findSection(content: string, id: string): Section | null {
        const startMarker = this.START_MARKER(id);
        const endMarker = this.END_MARKER(id);
        
        const startIndex = content.indexOf(startMarker);
        if (startIndex === -1) return null;

        const contentStart = startIndex + startMarker.length;
        const endIndex = content.indexOf(endMarker, contentStart);
        if (endIndex === -1) return null;

        return {
            id,
            content: content.substring(contentStart, endIndex).trim()
        };
    }

    static updateSection(content: string, id: string, newContent: string): string {
        const startMarker = this.START_MARKER(id);
        const endMarker = this.END_MARKER(id);
        
        const startIndex = content.indexOf(startMarker);
        if (startIndex === -1) return content;

        const contentStart = startIndex + startMarker.length;
        const endIndex = content.indexOf(endMarker, contentStart);
        if (endIndex === -1) return content;

        return (
            content.substring(0, startIndex) +
            this.wrapContent(id, newContent) +
            content.substring(endIndex + endMarker.length)
        );
    }
}
