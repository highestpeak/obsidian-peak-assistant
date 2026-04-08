/**
 * Present Plan phase: generate a report plan and yield an HITL pause.
 *
 * After recon, the agent generates a proposed report outline and presents it
 * to the user. The user can approve, redirect, add/remove paths, or adjust the outline.
 */

import { streamObject } from 'ai';
import { z } from 'zod/v3';
import { type LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { ClassifyResult, ReconResult, PlanSnapshot, VaultHitlPauseEvent, VaultSearchPhase } from '../types';

const planOutputSchema = z.object({
	proposed_outline: z.string().describe('One-paragraph description of the report plan'),
	suggested_sections: z.array(z.string()).describe('McKinsey-style section titles (3-6 sections)'),
	coverage_assessment: z.string().describe('Assessment of evidence coverage'),
	confidence: z.enum(['high', 'medium', 'low']),
});

type PlanOutput = z.infer<typeof planOutputSchema>;

/**
 * Run the Present Plan phase: LLM generates plan → yield HITL pause.
 * Returns the PlanSnapshot (the caller decides how to handle user feedback).
 */
export async function* runPresentPlanPhase(options: {
	userQuery: string;
	classify: ClassifyResult;
	recon: ReconResult;
	aiServiceManager: AIServiceManager;
	stepId: string;
}): AsyncGenerator<LLMStreamEvent | VaultHitlPauseEvent, PlanSnapshot> {
	const { userQuery, classify, recon, aiServiceManager } = options;

	yield {
		type: 'pk-debug',
		debugName: 'PresentPlan: generating outline',
		extra: { evidenceCount: recon.evidence.length },
	};

	// Generate report plan
	const { model } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisVaultPresentPlanSystem);

	const evidenceList = recon.evidence
		.slice(0, 30)
		.map((e) => `- **${e.path}**: ${e.reason}`)
		.join('\n');
	const moreCount = recon.evidence.length > 30 ? String(recon.evidence.length - 30) : undefined;

	let output: PlanOutput;
	try {
		const [systemPrompt, userPrompt] = await Promise.all([
			aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultPresentPlanSystem, {}),
			aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultPresentPlan, {
				userQuery,
				evidenceCount: String(recon.evidence.length),
				evidenceList,
				moreCount,
			}),
		]);
		const result = streamObject({
			model,
			system: systemPrompt,
			prompt: userPrompt,
			schema: planOutputSchema,
		});
		output = await result.object as PlanOutput;
	} catch {
		output = {
			proposed_outline: `Will synthesize ${recon.evidence.length} sources to answer: ${userQuery}`,
			suggested_sections: ['Overview', 'Key Findings', 'Details', 'Conclusions'],
			coverage_assessment: 'Partial coverage based on available evidence.',
			confidence: 'medium',
		};
	}

	const snapshot: PlanSnapshot = {
		evidence: recon.evidence,
		proposedOutline: output.proposed_outline,
		suggestedSections: output.suggested_sections,
		coverageAssessment: output.coverage_assessment,
		confidence: output.confidence,
	};

	yield {
		type: 'pk-debug',
		debugName: 'PresentPlan: yielding HITL pause',
		extra: {
			confidence: output.confidence,
			sectionCount: output.suggested_sections.length,
			evidenceCount: recon.evidence.length,
		},
	};

	// Yield the HITL pause for user review
	yield {
		type: 'hitl-pause',
		pauseId: generateUuidWithoutHyphens(),
		phase: 'present-plan' as VaultSearchPhase,
		snapshot,
		triggerName: 'VaultSearchAgent.PresentPlan',
	};

	return snapshot;
}

