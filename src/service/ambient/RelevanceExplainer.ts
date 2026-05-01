import type { AmbientSignal } from './types';

const SIGNAL_PRIORITY: AmbientSignal['type'][] = [
	'graph_neighbor',
	'co_citation',
	'hub_member',
	'shared_tag',
	'recency',
	'text_overlap',
];

function formatSignal(signal: AmbientSignal): string {
	switch (signal.type) {
		case 'shared_tag':
			return `Both tagged with #${signal.tag}`;
		case 'graph_neighbor':
			if (signal.hop === 1) return 'Directly linked';
			if (signal.hop === 2 && signal.via) return `Connected via [[${signal.via}]]`;
			return `${signal.hop}-hop graph neighbor`;
		case 'co_citation':
			return `Co-cited in [[${signal.citingNote}]]`;
		case 'hub_member':
			return `Both in "${signal.hubName}" cluster`;
		case 'text_overlap':
			return `Similar discussion of ${signal.terms.map((t) => `"${t}"`).join(', ')}`;
		case 'recency':
			return `Edited ${signal.editedDaysAgo} days ago in a related session`;
	}
}

/**
 * Generate a human-readable explanation from ambient signals.
 * Picks the highest-priority signal and formats it.
 */
export function generateExplanation(signals: AmbientSignal[]): string {
	if (signals.length === 0) return 'Related content';

	// Find the highest-priority signal
	let best: AmbientSignal | undefined;
	let bestPriority = SIGNAL_PRIORITY.length;

	for (const signal of signals) {
		const priority = SIGNAL_PRIORITY.indexOf(signal.type);
		if (priority !== -1 && priority < bestPriority) {
			bestPriority = priority;
			best = signal;
		}
	}

	if (!best) return 'Related content';
	return formatSignal(best);
}
