import { streamText } from 'ai';
import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';
import type { V2Section } from '@/ui/view/quick-search/store/searchSessionStore';

export class ReportOrchestrator {
	private get aiServiceManager() {
		return AppContext.getInstance().aiServiceManager;
	}

	/**
	 * Read vault note content for given paths.
	 * Uses the Obsidian vault API directly (same as vaultMcpServer).
	 */
	private async readEvidence(paths: string[]): Promise<string> {
		const vault = AppContext.getInstance().app.vault;
		const chunks: string[] = [];
		for (const p of paths) {
			const file = vault.getAbstractFileByPath(p);
			if (!file || !('extension' in file)) continue;
			try {
				const content = await vault.cachedRead(file as any);
				chunks.push(`### [[${p.replace(/\.md$/, '')}]]\n${content.slice(0, 3000)}`);
			} catch { /* skip unreadable */ }
		}
		return chunks.join('\n\n---\n\n');
	}

	/**
	 * Generate all sections in parallel, then generate executive summary.
	 */
	async generateReport(
		sections: V2Section[],
		allEvidencePaths: string[],
		overview: string,
		userQuery: string,
	): Promise<void> {
		const store = useSearchSessionStore;

		// Mark all sections as generating
		for (const sec of sections) {
			store.getState().updatePlanSection(sec.id, (s) => ({ ...s, status: 'generating' }));
		}

		// Generate body sections in parallel
		await Promise.all(sections.map((sec) => this.generateSection(sec, sections, overview, userQuery)));

		// Generate executive summary after all sections complete
		await this.generateSummary(sections, allEvidencePaths, overview, userQuery);
	}

	/**
	 * Generate a single section via streamText.
	 */
	async generateSection(
		section: V2Section,
		allSections: V2Section[],
		overview: string,
		userQuery: string,
		userPrompt?: string,
	): Promise<void> {
		const store = useSearchSessionStore;
		const mgr = this.aiServiceManager;

		try {
			const evidenceContent = await this.readEvidence(section.evidencePaths);
			const otherSections = allSections
				.filter((s) => s.id !== section.id)
				.map((s) => `- ${s.title} (${s.contentType})`)
				.join('\n');

			const [systemPrompt, userMessage] = await Promise.all([
				mgr.renderPrompt(PromptId.AiAnalysisReportSectionSystem, {}),
				mgr.renderPrompt(PromptId.AiAnalysisReportSection, {
					userQuery,
					reportOverview: overview,
					sectionTitle: section.title,
					contentType: section.contentType,
					visualType: section.visualType,
					sectionBrief: section.brief,
					otherSections,
					evidenceContent,
					userPrompt: userPrompt ?? '',
				}),
			]);

			const { model } = mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSectionSystem);
			const result = streamText({
				model,
				system: systemPrompt,
				prompt: userMessage,
			});

			let fullText = '';
			for await (const chunk of result.textStream) {
				fullText += chunk;
				store.getState().appendSectionChunk(section.id, chunk);
			}

			store.getState().completeSectionContent(section.id, fullText);
		} catch (err: any) {
			store.getState().failSection(section.id, err?.message ?? 'Generation failed');
		}
	}

	/**
	 * Regenerate a single section with optional user prompt.
	 */
	async regenerateSection(
		sectionId: string,
		allSections: V2Section[],
		overview: string,
		userQuery: string,
		userPrompt?: string,
	): Promise<void> {
		const store = useSearchSessionStore;
		store.getState().startSectionRegenerate(sectionId);

		const section = store.getState().v2PlanSections.find((s) => s.id === sectionId);
		if (!section) return;

		await this.generateSection(section, allSections, overview, userQuery, userPrompt);
	}

	/**
	 * Generate executive summary after all body sections are complete.
	 * Reuses V1's summary approach: blocksSummary = first 300 chars per section.
	 */
	private async generateSummary(
		sections: V2Section[],
		allEvidencePaths: string[],
		overview: string,
		userQuery: string,
	): Promise<void> {
		const store = useSearchSessionStore;
		const mgr = this.aiServiceManager;

		store.getState().setSummaryStreaming(true);

		const blocksSummary = sections
			.map((sec) => `### ${sec.title}\n${sec.content.slice(0, 300)}`)
			.join('\n\n');

		const evidenceList = allEvidencePaths
			.map((p) => `- [[${p.replace(/\.md$/, '')}]]`)
			.join('\n');

		const [systemPrompt, userMessage] = await Promise.all([
			mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummarySystem, {}),
			mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummary, {
				userQuery,
				reportPlan: overview,
				blocksSummary,
				evidenceList,
			}),
		]);

		const { model } = mgr.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSummarySystem);
		const result = streamText({ model, system: systemPrompt, prompt: userMessage });

		let fullText = '';
		for await (const chunk of result.textStream) {
			fullText += chunk;
			store.getState().setSummary(fullText);
		}

		store.getState().setSummaryStreaming(false);
	}
}
