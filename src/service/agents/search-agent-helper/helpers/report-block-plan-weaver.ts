import type {
	AppendicesBlockSpec,
	BodyBlockSpec,
	ReportPlan,
	ReportVisualBlueprint,
	VisualPrescription,
} from '@/core/schemas/agents/search-agent-schemas';

/**
 * A single report block work item after weaving plan + visuals.
 * Stored in context as structured data; rendered to strings only when calling DashboardBlocksAgent.
 */
export type ReportBlockBlueprintItem =
	| {
			kind: 'body';
			blockId: string;
			spec: BodyBlockSpec;
			visual?: VisualPrescription;
	  }
	| {
			kind: 'appendix';
			blockId: string;
			spec: AppendicesBlockSpec;
			visual?: VisualPrescription;
	  };

/**
 * Weave ReportPlan block specs with VisualBlueprint prescriptions into ordered block items.
 * Order: body blocks first (in plan order), then appendices (in plan order).
 */
export function weaveReportBlockBlueprintItems(
	plan: ReportPlan,
	blueprint?: ReportVisualBlueprint,
): ReportBlockBlueprintItem[] {
	const blueprintMapByBlockId = new Map<string, VisualPrescription>();
	for (const p of blueprint?.blocks ?? []) blueprintMapByBlockId.set(p.blockId, p);

	const items: ReportBlockBlueprintItem[] = [];

	for (const spec of plan.bodyBlocksSpec ?? []) {
		items.push({
			kind: 'body',
			blockId: spec.blockId,
			spec,
			visual: blueprintMapByBlockId.get(spec.blockId),
		});
	}

	for (const spec of plan.appendicesBlocksSpec ?? []) {
		items.push({
			kind: 'appendix',
			blockId: spec.blockId,
			spec,
			visual: blueprintMapByBlockId.get(spec.blockId),
		});
	}

	return items;
}
