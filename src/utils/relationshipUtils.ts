export interface Relationship {
    predicate: string;
    object: string;
}

export function formatRelationship(relationship: string): Relationship {
    // Handle cases where the relationship is already properly formatted
    if (relationship.includes(' ')) {
        const [predicate, ...objectParts] = relationship.split(' ');
        return {
            predicate: formatPredicate(predicate),
            object: formatWikilink(objectParts.join(' '))
        };
    }
    
    return {
        predicate: '',
        object: formatWikilink(relationship)
    };
}

export function formatPredicate(text: string): string {
    text = text.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    return text.startsWith('#') ? text : `#${text}`;
}

export function formatWikilink(text: string): string {
    text = text.trim()
        .replace(/^\[\[(.*)\]\]$/, '$1'); // Remove existing wikilink if present
    return `[[${text}]]`;
}

export function formatRelationshipSection(relationships: string[] = []): string {
    if (!relationships || relationships.length === 0) {
        return '# Relationships\n_No relationships defined_';
    }

    const formattedRelationships = relationships.map(rel => {
        const { predicate, object } = formatRelationship(rel);
        return `${predicate} ${object}`;
    });

    return [
        '# Relationships',
        ...formattedRelationships
    ].join('\n');
}
