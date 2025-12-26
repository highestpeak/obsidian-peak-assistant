import type { ResourceLoader, ResourceSummary, ResourceKind } from '@/core/document/types';

/**
 * Resource loader for tag resources
 */
export class TagResourceLoader implements ResourceLoader {
	getResourceType(): ResourceKind {
		return 'tag';
	}

    // todo: implement getSummary
	async getSummary(
		source: string | any,
		promptService: { chatWithPrompt: (promptId: string, variables: any, provider: string, model: string) => Promise<string> },
		provider: string,
		modelId: string
	): Promise<ResourceSummary> {
		// For tags, return a basic summary based on the tag name
		const sourceStr = typeof source === 'string' ? source : '';
		const tagName = sourceStr.replace(/^#/, '');
		return {
			shortSummary: `Tag: ${tagName}`,
			fullSummary: `This is a tag resource for "${tagName}". Tags are used to categorize and organize content in the vault.`,
		};
	}
}

