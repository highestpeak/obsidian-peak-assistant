import type { App } from 'obsidian';
import type { ResourceLoader, ResourceKind, SpecialResourceType, DocumentType, Summarizable } from '@/core/document/types';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { TagResourceLoader } from '../TagResourceLoader';
import { FolderResourceLoader } from '../FolderResourceLoader';

/**
 * Manager for resource loaders.
 * Handles both special resource types (tag, folder, category) and document types.
 * For document types, delegates to DocumentLoaderManager.
 */
export class ResourceLoaderManager {
    private readonly loaderMap = new Map<SpecialResourceType, ResourceLoader>();
    private readonly documentLoaderManager: DocumentLoaderManager;
    private readonly specialTypes: Set<SpecialResourceType> = new Set(['tag', 'folder', 'category']);

    constructor(app: App, documentLoaderManager?: DocumentLoaderManager) {
        // Use provided DocumentLoaderManager or get singleton instance
        this.documentLoaderManager = documentLoaderManager || DocumentLoaderManager.getInstance();

        // Register resource loaders for special resource types
        this.registerLoader(new TagResourceLoader());
        this.registerLoader(new FolderResourceLoader(app));
    }

    /**
     * Register a resource loader for special resource types
     */
    registerLoader(loader: ResourceLoader): void {
        const resourceType = loader.getResourceType();
        // Only register special resource types
        if (this.specialTypes.has(resourceType as SpecialResourceType)) {
            this.loaderMap.set(resourceType as SpecialResourceType, loader);
        }
    }

    /**
     * Check if a resource kind is a special resource type
     */
    isSpecialResourceType(resourceKind: ResourceKind): resourceKind is SpecialResourceType {
        return this.specialTypes.has(resourceKind as SpecialResourceType);
    }

    /**
     * Get loader for a resource kind (supports both document types and special resource types)
     * Returns Summarizable interface which both DocumentLoader and ResourceLoader implement
     */
    getLoader(resourceKind: ResourceKind): Summarizable | null {
        // Check if it's a special resource type
        if (this.isSpecialResourceType(resourceKind)) {
            return this.loaderMap.get(resourceKind) || null;
        }

        // Otherwise, it's a document type - get from DocumentLoaderManager
        return this.documentLoaderManager.getLoaderForDocumentType(resourceKind as DocumentType);
    }

    /**
     * Get summary for a resource by source string
     * Handles both document types and special resource types automatically
     */
    async getSummary(
        source: string,
        resourceKind: ResourceKind,
        promptService: { chatWithPrompt: (promptId: string, variables: any, provider: string, model: string) => Promise<string> },
        provider: string,
        modelId: string
    ): Promise<{ shortSummary: string; fullSummary?: string } | null> {
        const loader = this.getLoader(resourceKind);
        if (!loader) {
            return null;
        }

        if (this.isSpecialResourceType(resourceKind)) {
            return await loader.getSummary(source, promptService, provider, modelId);
        }
        
        const doc = await this.documentLoaderManager.readByPath(source);
        return doc ? await loader.getSummary(doc, promptService, provider, modelId) : null;
    }
}

