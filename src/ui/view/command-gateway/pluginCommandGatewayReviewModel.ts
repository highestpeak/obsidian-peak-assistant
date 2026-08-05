import type {
	PluginCommandGatewayScanProgress,
	PluginCommandReviewItem,
	PluginCommandRisk,
} from '@/core/types/plugin-command-gateway';

export type PluginCommandAccessFilter =
	| 'all'
	| 'allowed'
	| 'not-allowed'
	| 'unavailable';

export type PluginCommandAttentionKind =
	| 'interactive'
	| 'unsafe'
	| 'unclassified'
	| 'unavailable';

export interface PluginCommandReviewFilters {
	readonly query: string;
	readonly pluginId: string;
	readonly risk: 'all' | PluginCommandRisk;
	readonly access: PluginCommandAccessFilter;
}

export interface PluginCommandReviewGroup {
	readonly pluginId: string;
	readonly pluginName: string;
	readonly pluginVersion: string;
	readonly items: readonly PluginCommandReviewItem[];
	readonly eligibleCount: number;
}

export interface PluginCommandReviewSummary {
	readonly approved: number;
	readonly notAllowed: number;
	readonly unavailable: number;
}

export function isPluginCommandContextual(item: PluginCommandReviewItem): boolean {
	return item.descriptor.availability === 'conditional';
}

export function pluginCommandAttentionKind(
	item: PluginCommandReviewItem,
): PluginCommandAttentionKind | null {
	if (item.effectiveRisk === 'destructive') return 'unsafe';
	if (item.descriptor.interaction === 'modal') return 'interactive';
	if (
		item.descriptor.availability === 'unavailable' ||
		item.descriptor.availability === 'unknown'
	) {
		return 'unavailable';
	}
	if (item.effectiveRisk === 'unknown') return 'unclassified';
	return null;
}

export function isPluginCommandUnavailable(item: PluginCommandReviewItem): boolean {
	return pluginCommandAttentionKind(item) !== null;
}

export function isPluginCommandBulkEligible(item: PluginCommandReviewItem): boolean {
	if (item.approved || isPluginCommandUnavailable(item)) return false;
	return item.effectiveRisk === 'read' || item.effectiveRisk === 'edit';
}

export function filterPluginCommandItems(
	items: readonly PluginCommandReviewItem[],
	filters: PluginCommandReviewFilters,
): PluginCommandReviewItem[] {
	const query = filters.query.trim().toLocaleLowerCase();
	return items.filter((item) => {
		if (filters.pluginId !== 'all' && item.descriptor.pluginId !== filters.pluginId) return false;
		if (filters.risk !== 'all' && item.effectiveRisk !== filters.risk) return false;
		if (!matchesAccess(item, filters.access)) return false;
		if (!query) return true;
		return [
			item.descriptor.commandId,
			item.descriptor.commandName,
			item.descriptor.pluginId,
			item.descriptor.pluginName,
			item.finding?.summary ?? '',
		].join(' ').toLocaleLowerCase().includes(query);
	});
}

export function groupPluginCommandItems(
	items: readonly PluginCommandReviewItem[],
): PluginCommandReviewGroup[] {
	const groups = new Map<string, {
		pluginId: string;
		pluginName: string;
		pluginVersion: string;
		items: PluginCommandReviewItem[];
	}>();
	for (const item of items) {
		const descriptor = item.descriptor;
		let group = groups.get(descriptor.pluginId);
		if (!group) {
			group = {
				pluginId: descriptor.pluginId,
				pluginName: descriptor.pluginName,
				pluginVersion: descriptor.pluginVersion,
				items: [],
			};
			groups.set(descriptor.pluginId, group);
		}
		group.items.push(item);
	}
	return [...groups.values()].map((group) => ({
		...group,
		eligibleCount: group.items.filter(isPluginCommandBulkEligible).length,
	}));
}

export function summarizePluginCommandItems(
	items: readonly PluginCommandReviewItem[],
): PluginCommandReviewSummary {
	return items.reduce<PluginCommandReviewSummary>((summary, item) => {
		if (item.approved) return { ...summary, approved: summary.approved + 1 };
		if (isPluginCommandUnavailable(item)) {
			return { ...summary, unavailable: summary.unavailable + 1 };
		}
		return { ...summary, notAllowed: summary.notAllowed + 1 };
	}, { approved: 0, notAllowed: 0, unavailable: 0 });
}

/**
 * A Scan has no honest percentage until at least one explanation batch has
 * completed. Returning null lets the UI show an indeterminate activity bar
 * instead of pretending that an unresolved provider request is "35%" done.
 */
export function pluginCommandScanRatio(
	progress: PluginCommandGatewayScanProgress,
): number | null {
	if (progress.phase === 'complete') return 1;
	if (progress.phase !== 'explaining') return null;
	if (progress.totalCommands <= 0 || progress.processedCommands <= 0) return null;
	return Math.min(1, progress.processedCommands / progress.totalCommands);
}

export function formatPluginCommandCopy(
	template: string,
	values: Readonly<Record<string, string | number>>,
): string {
	let result = template;
	for (const [key, value] of Object.entries(values)) {
		result = result.split(`{${key}}`).join(String(value));
	}
	return result;
}

function matchesAccess(
	item: PluginCommandReviewItem,
	filter: PluginCommandAccessFilter,
): boolean {
	if (filter === 'all') return true;
	if (filter === 'allowed') return item.approved;
	if (filter === 'unavailable') return isPluginCommandUnavailable(item);
	return !item.approved && !isPluginCommandUnavailable(item);
}
