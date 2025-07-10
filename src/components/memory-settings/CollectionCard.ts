import { ButtonComponent } from 'obsidian';

/**
 * Individual collection card component
 * Ensures consistent layout and styling for each collection
 */
export class CollectionCard {
    private containerEl: HTMLElement;
    private collectionName: string;
    private onReindex: (button: ButtonComponent) => Promise<void>;
    private onDelete: (button: ButtonComponent, cardEl: HTMLElement) => Promise<void>;
    private cardEl: HTMLElement | null = null;

    constructor(
        containerEl: HTMLElement, 
        collectionName: string,
        onReindex: (button: ButtonComponent) => Promise<void>,
        onDelete: (button: ButtonComponent, cardEl: HTMLElement) => Promise<void>
    ) {
        this.containerEl = containerEl;
        this.collectionName = collectionName;
        this.onReindex = onReindex;
        this.onDelete = onDelete;
    }

    /**
     * Display the collection card
     */
    display(): void {
        // Create the card row
        this.cardEl = this.containerEl.createEl('div', { cls: 'collection-row' });
        
        // Collection name
        this.cardEl.createEl('span', { 
            text: this.collectionName,
            cls: 'collection-name'
        });
        
        // Action buttons container
        const actionsContainer = this.cardEl.createEl('div', { cls: 'collection-actions' });
        
        // Reindex button
        const reindexButton = new ButtonComponent(actionsContainer)
            .setButtonText('Reindex')
            .setClass('collection-action-button')
            .onClick(async () => {
                await this.onReindex(reindexButton);
            });
        reindexButton.buttonEl.addClass('collection-reindex-btn');
        
        // Delete button  
        const deleteButton = new ButtonComponent(actionsContainer)
            .setButtonText('Delete')
            .setClass('collection-action-button')
            .onClick(async () => {
                await this.onDelete(deleteButton, this.cardEl!);
            });
        deleteButton.buttonEl.addClass('collection-delete-btn');
    }

    /**
     * Remove the card from the DOM
     */
    remove(): void {
        if (this.cardEl) {
            this.cardEl.remove();
            this.cardEl = null;
        }
    }

    /**
     * Get the collection name
     */
    getCollectionName(): string {
        return this.collectionName;
    }
}