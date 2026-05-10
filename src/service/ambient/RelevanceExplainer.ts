import type { AmbientSignal } from './types';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { AppContext } from '@/app/context/AppContext';

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

/** Module-level rate limiter for LLM explanation calls. */
let lastLlmCallTs = 0;

/**
 * Generate a one-sentence LLM explanation for why a pushed note is relevant.
 * Rate-limited to 1 call per cooldownMs. Returns null if rate-limited or on error.
 *
 * @param currentParagraph - What the user is currently writing
 * @param pushNoteTitle - Title of the pushed note
 * @param pushNoteExcerpt - First ~150 chars of the pushed note
 * @param cooldownMs - Minimum interval between LLM calls (default: 120000ms)
 */
export async function generateLlmExplanation(
	currentParagraph: string,
	pushNoteTitle: string,
	pushNoteExcerpt: string,
	cooldownMs: number = 120_000,
): Promise<string | null> {
	// Rate limit check
	const now = Date.now();
	if (now - lastLlmCallTs < cooldownMs) return null;
	lastLlmCallTs = now;

	const registry = ProfileRegistry.getInstance();
	// Prefer fast model (cheapest); fall back to agent profile
	const profile = registry.getActiveAgentProfile();
	if (!profile) return null;

	const prompt = [
		`Given the user is writing about: "${currentParagraph.slice(0, 300)}"`,
		`And this note exists: "${pushNoteTitle}" with excerpt: "${pushNoteExcerpt.slice(0, 200)}"`,
		`In one sentence (max 20 words), explain how this note could contribute to the current writing.`,
		`Reply with ONLY the explanation sentence, no preamble.`,
	].join('\n');

	try {
		const app = AppContext.getApp();
		const pluginId = AppContext.getPluginId();

		let resultText = '';
		const messages = queryWithProfile(app, pluginId, profile, {
			prompt,
			maxTurns: 1,
			systemPrompt: 'You are a concise research assistant. Output only the requested sentence.',
		});

		for await (const msg of messages) {
			if (msg?.type === 'assistant' && msg?.message?.content) {
				for (const block of msg.message.content) {
					if (block.type === 'text') {
						resultText += block.text;
					}
				}
			}
			if (msg?.type === 'result' && msg?.text) {
				resultText = msg.text;
			}
		}

		const trimmed = resultText.trim();
		// Enforce max output guard
		if (trimmed.length > 0 && trimmed.length <= 500) {
			return trimmed;
		}
		return trimmed.slice(0, 500) || null;
	} catch (err) {
		console.debug('[RelevanceExplainer] LLM explanation failed (non-critical):', err);
		return null;
	}
}
