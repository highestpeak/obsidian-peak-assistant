import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import type { Round } from '@/ui/view/quick-search/store/searchSessionStore';

export interface SynthesizeResult {
	summary: string;
	sections: Array<{ title: string; content: string }>;
}

/**
 * Merges all analysis rounds into a single unified report.
 *
 * Simple text-in/text-out agent (no vault tools). Sends all rounds
 * to the LLM with instructions to merge, gets back a unified JSON report.
 */
export class SynthesizeAgent {
	async synthesize(rounds: Round[]): Promise<SynthesizeResult> {
		const ctx = AppContext.getInstance();
		const mgr = ctx.aiServiceManager;

		const fullText = await mgr.queryText(
			PromptId.AiAnalysisSynthesize,
			{
				rounds: rounds.map((r) => ({
					query: r.query,
					summary: r.summary,
					sections: r.sections.map((s) => ({ title: s.title, content: s.content })),
					annotations: r.annotations.map((a) => ({
						type: a.type,
						sectionTitle: r.sections[a.sectionIndex]?.title ?? '',
						comment: a.comment,
					})),
				})),
			},
			{
				systemPrompt: await mgr.renderPrompt(PromptId.AiAnalysisSynthesizeSystem, {}),
			},
		);

		// Parse JSON from response — handle markdown code fences
		const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/) || fullText.match(/(\{[\s\S]*\})/);
		if (!jsonMatch) throw new Error('SynthesizeAgent: no JSON in response');
		const jsonStr = jsonMatch[1] || jsonMatch[0];
		return JSON.parse(jsonStr) as SynthesizeResult;
	}
}
