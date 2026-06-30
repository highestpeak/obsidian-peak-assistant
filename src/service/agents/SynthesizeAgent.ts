import { PromptId } from '@/core/types/prompt';
import type { Round } from '@/core/search/v2SessionTypes';
import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';

export interface SynthesizeResult {
	summary: string;
	sections: Array<{ title: string; content: string }>;
}

/**
 * Merges all analysis rounds into a single unified report.
 *
 * T11J B1: the caller injects an `IAgentPrompter` so the agent no longer
 * reaches `AppContext.getInstance().manager`.
 */
export class SynthesizeAgent {
	constructor(private readonly prompter: IAgentPrompter) {}

	async synthesize(rounds: Round[]): Promise<SynthesizeResult> {
		const fullText = await this.prompter.queryText(
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
				systemPrompt: await this.prompter.renderPrompt(PromptId.AiAnalysisSynthesizeSystem, {}),
			},
		);

		// Parse JSON from response — handle markdown code fences
		const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/) || fullText.match(/(\{[\s\S]*\})/);
		if (!jsonMatch) throw new Error('SynthesizeAgent: no JSON in response');
		const jsonStr = jsonMatch[1] || jsonMatch[0];
		return JSON.parse(jsonStr) as SynthesizeResult;
	}
}
