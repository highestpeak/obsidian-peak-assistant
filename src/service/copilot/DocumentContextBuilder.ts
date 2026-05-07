import type { App, TFile } from 'obsidian';

import type { DocumentContext } from './CopilotActionRegistry';

export class DocumentContextBuilder {
	static build(app: App, file: TFile, content: string, selection?: string): DocumentContext {
		const cache = app.metadataCache.getFileCache(file);
		const tags = (cache?.frontmatter?.tags as string[] ?? [])
			.concat((cache?.tags ?? []).map(t => t.tag.replace(/^#/, '')));
		const links = (cache?.links ?? []).map(l => l.link);
		const backlinks = Object.keys(
			(app.metadataCache as any).getBacklinksForFile?.(file)?.data ?? {}
		).length;
		const headingCount = cache?.headings?.length ?? 0;
		const wordCount = content.split(/\s+/).filter(Boolean).length;

		return {
			file,
			title: file.basename,
			content,
			selection: selection || undefined,
			scope: selection ? 'selection' : 'full',
			wordCount,
			tags: [...new Set(tags)],
			links,
			backlinks,
			headingCount,
			isOrphan: backlinks === 0,
			frontmatter: cache?.frontmatter ?? {},
		};
	}
}
