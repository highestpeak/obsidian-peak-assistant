import { Activity } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { vaultHealthSchema } from '../copilot-schemas';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

async function toJsonSchema(zodSchema: unknown) {
	const { zodToJsonSchema } = await import('zod-to-json-schema');
	return zodToJsonSchema(zodSchema as import('zod').ZodTypeAny);
}

export const vaultHealthAction: CopilotAction = {
	id: 'vault-health',
	label: 'Vault Health',
	description: 'Analyze vault structure for orphans, duplicates, and stale notes',
	icon: Activity,
	category: 'vault',

	relevance(): number {
		return 0.5;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().manager;
		const app = AppContext.getInstance().app;

		// Scan vault metadata via metadataCache (NO file content reading)
		const files = app.vault.getMarkdownFiles();
		const now = Date.now();
		const oneDay = 86400000;

		let orphanCount = 0;
		let totalLinks = 0;
		let staleCount = 0;
		const tagCounts: Record<string, number> = {};
		const fileSummaries: string[] = [];

		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			const linkCount = (cache?.links?.length ?? 0) + (cache?.embeds?.length ?? 0);
			const backlinks = Object.keys(app.metadataCache.resolvedLinks)
				.filter(src => app.metadataCache.resolvedLinks[src]?.[file.path])
				.length;

			if (linkCount === 0 && backlinks === 0) orphanCount++;
			totalLinks += linkCount;

			const daysSince = Math.floor((now - file.stat.mtime) / oneDay);
			if (daysSince > 90) staleCount++;

			// Collect tags
			const tags = cache?.tags?.map(t => t.tag) ?? [];
			const fmTags = (cache?.frontmatter?.tags as string[] | undefined) ?? [];
			for (const t of [...tags, ...fmTags]) {
				tagCounts[t] = (tagCounts[t] || 0) + 1;
			}
		}

		const stats = [
			`Total files: ${files.length}`,
			`Orphan notes (no links in or out): ${orphanCount}`,
			`Average links per note: ${(totalLinks / files.length).toFixed(1)}`,
			`Stale notes (>90 days): ${staleCount}`,
			`Unique tags: ${Object.keys(tagCounts).length}`,
			`Top tags: ${Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, c]) => `${t}(${c})`).join(', ')}`,
		].join('\n');

		const result = await aiManager.queryStructured(
			PromptId.VaultHealth,
			{ stats },
			await toJsonSchema(vaultHealthSchema),
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: null as any,
};
