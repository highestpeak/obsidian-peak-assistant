/**
 * Renders intuition skeleton Markdown via indexing templates + companion JSON from merged memory.
 */

import { IndexingTemplateId } from '@/core/template/TemplateRegistry';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { IntuitionMemory } from './types';

const JSON_VERSION = '2026.05';

function joinPaths(paths: string[]): string {
	return paths.filter(Boolean).join(' · ');
}

function buildSkeletonTemplateData(
	memory: IntuitionMemory,
	meta: { vaultName: string; dateLabel: string },
): Record<string, unknown> {
	const vaultName = meta.vaultName.trim() || 'Vault';
	const themeLine =
		memory.theme?.trim() ||
		'No strong single-theme signal; infer from partitions, entry points, and entities.';
	const evolutionLine =
		memory.evolution.trim() || 'Static library or no clear temporal signal detected.';
	return {
		vaultName,
		dateLabel: meta.dateLabel,
		themeLine,
		hasPartitions: memory.partitions.length > 0,
		partitions: memory.partitions.map((p) => ({
			label: p.label,
			purpose: p.purpose,
			entryPaths: p.entryPaths ?? [],
			entryPathsLine: joinPaths(p.entryPaths ?? []),
			hasEntryPaths: (p.entryPaths?.length ?? 0) > 0,
		})),
		hasCoreEntities: memory.coreEntities.length > 0,
		coreEntities: memory.coreEntities.map((e) => ({
			name: e.name,
			description: e.description,
			location: e.location,
			whyItMatters: e.whyItMatters?.trim() ?? '',
			hasWhyItMatters: Boolean(e.whyItMatters?.trim()),
		})),
		hasTopology: memory.topology.length > 0,
		topology: memory.topology.map((t) => ({
			from: t.from,
			to: t.to,
			relation: t.relation,
		})),
		evolutionLine,
		hasEntryPoints: memory.entryPoints.length > 0,
		entryPoints: memory.entryPoints.map((e) => ({
			intent: e.intent,
			startPaths: e.startPaths ?? [],
			startPathsLine: joinPaths(e.startPaths ?? []),
			whatYouWillFind: e.whatYouWillFind,
		})),
		hasOpenQuestions: memory.openQuestions.length > 0,
		openQuestions: memory.openQuestions,
	};
}

/**
 * Renders the human-facing skeleton Markdown using {@link IndexingTemplateId.KnowledgeIntuitionSkeletonMarkdown}.
 */
export async function renderIntuitionSkeletonMarkdown(
	tm: TemplateManager,
	memory: IntuitionMemory,
	meta: { vaultName: string; dateLabel: string },
): Promise<string> {
	const data = buildSkeletonTemplateData(memory, meta);
	return (await tm.render(IndexingTemplateId.KnowledgeIntuitionSkeletonMarkdown, data)).trim();
}

/**
 * Companion JSON for agents / retrieval (English keys).
 */
export function renderIntuitionSkeletonJson(
	memory: IntuitionMemory,
	meta: { vaultName: string; dateLabel: string },
): Record<string, unknown> {
	return {
		version: JSON_VERSION,
		generatedAt: meta.dateLabel,
		vaultLabel: meta.vaultName,
		theme: memory.theme ?? '',
		partitions: memory.partitions.map((p) => ({
			label: p.label,
			purpose: p.purpose,
			entry_paths: p.entryPaths ?? [],
		})),
		core_entities: memory.coreEntities.map((e) => ({
			name: e.name,
			description: e.description,
			location: e.location,
			why_it_matters: e.whyItMatters ?? '',
		})),
		topology: memory.topology.map((t) => ({
			from: t.from,
			to: t.to,
			relation: t.relation,
		})),
		evolution: memory.evolution,
		entry_points: memory.entryPoints.map((e) => ({
			intent: e.intent,
			start_paths: e.startPaths,
			what_you_will_find: e.whatYouWillFind,
		})),
	};
}
