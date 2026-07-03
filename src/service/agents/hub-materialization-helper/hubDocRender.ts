// Renders the final hub markdown from a HubDraft using the IndexingTemplateId.HubDocSkeleton
// Handlebars template. Wraps skeleton body around a user-preserved trailing content block.

import { IndexingTemplateId } from '@/core/template/TemplateRegistry';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { HubDraft } from '@/core/schemas/agents/hubMaterialization';

export interface HubDocRenderInput {
	tm: TemplateManager;
	draft: HubDraft;
	hubNodeId: string;
	planId: string;
	coverage: number;
	userPreservedContent: string;
	/** ISO string; caller provides so tests can pin the timestamp. */
	generatedAtIso?: string;
}

export async function renderHubDocMarkdown(input: HubDocRenderInput): Promise<string> {
	const {
		tm,
		draft,
		hubNodeId,
		planId,
		coverage,
		userPreservedContent,
		generatedAtIso = new Date().toISOString(),
	} = input;

	return tm.render(IndexingTemplateId.HubDocSkeleton, {
		title: draft.title,
		summary: draft.summary,
		coreConceptSection: draft.coreConceptSection,
		structureSection: draft.structureSection,
		evolutionSection: draft.evolutionSection,
		openQuestionsSection: draft.openQuestionsSection,
		entryPointsSection: draft.entryPointsSection,
		hubNodeId,
		planId,
		coverage: coverage.toFixed(3),
		generatedAtIso,
		userPreservedContent,
	});
}
