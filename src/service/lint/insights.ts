import { PromptId } from '@/core/prompt/PromptId';
import { TemplateManager } from '@/core/template/TemplateManager';
import type { LintFinding } from './types';

export type HealthInsightKind =
	| 'broken-link-repair'
	| 'missing-targets'
	| 'noise-source'
	| 'orphan-reconnect'
	| 'tag-coverage'
	| 'content-cleanup';

export type HealthInsightSeverity = 'critical' | 'warning' | 'info';

export interface HealthInsightAction {
	id: string;
	label: string;
	mode: 'ai' | 'manual' | 'safe';
	prompt?: string;
}

export interface HealthInsight {
	id: string;
	kind: HealthInsightKind;
	severity: HealthInsightSeverity;
	title: string;
	summary: string;
	impact: Array<{ label: string; value: string | number }>;
	recommendedActions: HealthInsightAction[];
	evidence: LintFinding[];
	evidenceLabel: string;
}

interface BrokenLinkFile {
	finding: LintFinding;
	sourcePath: string;
	targets: string[];
	targetCount: number;
	occurrenceCount: number;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function dirname(path: string | null): string {
	if (!path) return '(unknown)';
	const idx = path.lastIndexOf('/');
	if (idx <= 0) return '(vault root)';
	return path.slice(0, idx);
}

function formatList(items: string[], limit: number): string {
	const sample = items.slice(0, limit);
	const suffix = items.length > limit ? `, and ${items.length - limit} more` : '';
	return `${sample.join(', ')}${suffix}`;
}

function brokenLinkFiles(findings: LintFinding[]): BrokenLinkFile[] {
	return findings
		.filter(f => f.signalId === 'S-BROKEN-LINK')
		.map((finding) => {
			const sourcePath = typeof finding.metadata.sourcePath === 'string'
				? finding.metadata.sourcePath
				: finding.filePath ?? '';
			const targets = asStringArray(finding.metadata.brokenTargets);
			const targetCount = Number(finding.metadata.brokenTargetCount ?? targets.length) || targets.length;
			const occurrenceCount = Number(finding.metadata.brokenOccurrenceCount ?? targetCount) || targetCount;
			return { finding, sourcePath, targets, targetCount, occurrenceCount };
		})
		.filter(item => item.sourcePath.length > 0);
}

// T11Y-6: the six builders below now render
// templates/prompts/lint-{broken-link-repair, missing-targets, noise-source,
// orphan-reconnect, tag-coverage, content-cleanup}.md via TemplateManager.
function requireTm() {
	const tm = TemplateManager.getInstance();
	if (!tm) throw new Error('TemplateManager not bound — cannot render lint insight prompts.');
	return tm;
}

async function buildBrokenLinkPrompt(files: BrokenLinkFile[]): Promise<string> {
	const topFiles = files.slice(0, 20).map((item) => {
		const targets = item.targets.slice(0, 8).map(t => `[[${t}]]`).join(', ');
		return `- ${item.sourcePath}: ${item.targetCount} missing targets, ${item.occurrenceCount} occurrences. Targets: ${targets}`;
	}).join('\n');
	return requireTm().render(PromptId.LintBrokenLinkRepair, { topFiles });
}

async function buildMissingTargetsPrompt(files: BrokenLinkFile[], repeatedTargets: Array<{ target: string; fileCount: number; occurrenceCount: number }>): Promise<string> {
	const targetLines = repeatedTargets.slice(0, 25)
		.map(t => `- [[${t.target}]] referenced by ${t.fileCount} files, ${t.occurrenceCount} occurrences`)
		.join('\n');
	const sourceSample = files.slice(0, 12).map(item => `- ${item.sourcePath}`).join('\n');
	return requireTm().render(PromptId.LintMissingTargets, { targetLines, sourceSample });
}

async function buildNoisePrompt(folder: string, files: BrokenLinkFile[]): Promise<string> {
	const fileLines = files.slice(0, 20).map(item => `- ${item.sourcePath}: ${item.occurrenceCount} unresolved links`).join('\n');
	return requireTm().render(PromptId.LintNoiseSource, { folder, fileLines });
}

async function buildOrphanPrompt(findings: LintFinding[]): Promise<string> {
	const lines = findings.slice(0, 25).map(f => `- ${f.filePath ?? f.title}: ${f.description}`).join('\n');
	return requireTm().render(PromptId.LintOrphanReconnect, { lines });
}

async function buildTagPrompt(findings: LintFinding[]): Promise<string> {
	const lines = findings.slice(0, 40).map(f => `- ${f.filePath ?? f.title}`).join('\n');
	return requireTm().render(PromptId.LintTagCoverage, { lines });
}

async function buildContentPrompt(findings: LintFinding[]): Promise<string> {
	const lines = findings.slice(0, 30).map(f => `- ${f.filePath ?? f.title}: ${f.description}`).join('\n');
	return requireTm().render(PromptId.LintContentCleanup, { lines });
}

function topRepeatedTargets(files: BrokenLinkFile[]): Array<{ target: string; fileCount: number; occurrenceCount: number }> {
	const map = new Map<string, { files: Set<string>; occurrenceCount: number }>();
	for (const file of files) {
		for (const target of file.targets) {
			const entry = map.get(target) ?? { files: new Set<string>(), occurrenceCount: 0 };
			entry.files.add(file.sourcePath);
			entry.occurrenceCount += 1;
			map.set(target, entry);
		}
	}
	return Array.from(map.entries())
		.map(([target, data]) => ({ target, fileCount: data.files.size, occurrenceCount: data.occurrenceCount }))
		.filter(item => item.fileCount > 1)
		.sort((a, b) => b.fileCount - a.fileCount || b.occurrenceCount - a.occurrenceCount);
}

function topNoiseFolder(files: BrokenLinkFile[]): { folder: string; files: BrokenLinkFile[]; occurrenceCount: number } | null {
	const totalOccurrences = files.reduce((sum, item) => sum + item.occurrenceCount, 0);
	if (totalOccurrences < 50) return null;

	const byFolder = new Map<string, BrokenLinkFile[]>();
	for (const file of files) {
		const folder = dirname(file.sourcePath);
		byFolder.set(folder, [...(byFolder.get(folder) ?? []), file]);
	}

	const ranked = Array.from(byFolder.entries())
		.map(([folder, folderFiles]) => ({
			folder,
			files: folderFiles.sort((a, b) => b.occurrenceCount - a.occurrenceCount),
			occurrenceCount: folderFiles.reduce((sum, item) => sum + item.occurrenceCount, 0),
		}))
		.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

	const top = ranked[0];
	if (!top || top.occurrenceCount / totalOccurrences < 0.45 || top.files.length < 5) return null;
	return top;
}

export async function buildVaultHealthInsights(findings: LintFinding[]): Promise<HealthInsight[]> {
	const openFindings = findings.filter(f => f.status === 'open');
	const insights: HealthInsight[] = [];
	const brokenFiles = brokenLinkFiles(openFindings).sort((a, b) => b.occurrenceCount - a.occurrenceCount);
	const totalBrokenOccurrences = brokenFiles.reduce((sum, item) => sum + item.occurrenceCount, 0);
	const allBrokenTargets = new Set(brokenFiles.flatMap(item => item.targets));

	if (brokenFiles.length > 0) {
		insights.push({
			id: 'broken-link-repair',
			kind: 'broken-link-repair',
			severity: totalBrokenOccurrences > 100 ? 'critical' : 'warning',
			title: `${brokenFiles.length} files need broken-link repair`,
			summary: `${totalBrokenOccurrences} unresolved link occurrences across ${allBrokenTargets.size} unique missing targets. Start with the files where one repair pass clears the most navigation debt.`,
			impact: [
				{ label: 'Files', value: brokenFiles.length },
				{ label: 'Occurrences', value: totalBrokenOccurrences },
				{ label: 'Missing targets', value: allBrokenTargets.size },
			],
			recommendedActions: [
				{ id: 'ai-repair-links', label: 'Ask AI to repair', mode: 'ai', prompt: await buildBrokenLinkPrompt(brokenFiles) },
				{ id: 'manual-top-files', label: 'Review top files', mode: 'manual' },
			],
			evidence: brokenFiles.slice(0, 8).map(item => item.finding),
			evidenceLabel: 'Highest-impact files',
		});
	}

	const repeatedTargets = topRepeatedTargets(brokenFiles);
	if (repeatedTargets.length > 0) {
		const references = repeatedTargets.reduce((sum, item) => sum + item.fileCount, 0);
		insights.push({
			id: 'missing-targets',
			kind: 'missing-targets',
			severity: repeatedTargets.length > 10 ? 'warning' : 'info',
			title: `${repeatedTargets.length} missing notes are referenced repeatedly`,
			summary: `These look more like missing concepts or aliases than one-off typos. Creating or mapping them can repair many files at once.`,
			impact: [
				{ label: 'Targets', value: repeatedTargets.length },
				{ label: 'File references', value: references },
			],
			recommendedActions: [
				{ id: 'ai-map-targets', label: 'Map or create notes', mode: 'ai', prompt: await buildMissingTargetsPrompt(brokenFiles, repeatedTargets) },
			],
			evidence: brokenFiles.filter(item => item.targets.some(t => repeatedTargets.slice(0, 20).some(rt => rt.target === t))).slice(0, 8).map(item => item.finding),
			evidenceLabel: `Top targets: ${formatList(repeatedTargets.map(item => `[[${item.target}]]`), 5)}`,
		});
	}

	const noise = topNoiseFolder(brokenFiles);
	if (noise) {
		insights.push({
			id: 'noise-source',
			kind: 'noise-source',
			severity: 'info',
			title: `Broken-link noise is concentrated in ${noise.folder}`,
			summary: `${noise.occurrenceCount} unresolved links come from one folder. This may be imported/generated material that should be excluded or batch-reviewed instead of counted as normal vault debt.`,
			impact: [
				{ label: 'Folder files', value: noise.files.length },
				{ label: 'Occurrences', value: noise.occurrenceCount },
			],
			recommendedActions: [
				{ id: 'ai-classify-noise', label: 'Classify noise', mode: 'ai', prompt: await buildNoisePrompt(noise.folder, noise.files) },
				{ id: 'manual-ignore-folder', label: 'Review ignore rule', mode: 'manual' },
			],
			evidence: noise.files.slice(0, 8).map(item => item.finding),
			evidenceLabel: 'Folder sample',
		});
	}

	const orphanFindings = openFindings.filter(f => f.signalId === 'S-ORPHAN');
	if (orphanFindings.length > 0) {
		insights.push({
			id: 'orphan-reconnect',
			kind: 'orphan-reconnect',
			severity: orphanFindings.length > 25 ? 'warning' : 'info',
			title: `${orphanFindings.length} notes are disconnected from the graph`,
			summary: 'These notes may contain useful material, but they are hard to rediscover because nothing links to or from them.',
			impact: [
				{ label: 'Orphans', value: orphanFindings.length },
			],
			recommendedActions: [
				{ id: 'ai-reconnect-orphans', label: 'Suggest links', mode: 'ai', prompt: await buildOrphanPrompt(orphanFindings) },
			],
			evidence: orphanFindings.slice(0, 8),
			evidenceLabel: 'Disconnected notes',
		});
	}

	const untaggedFindings = openFindings.filter(f => f.signalId === 'G-UNTAGGED');
	if (untaggedFindings.length > 0) {
		insights.push({
			id: 'tag-coverage',
			kind: 'tag-coverage',
			severity: untaggedFindings.length > 100 ? 'warning' : 'info',
			title: `${untaggedFindings.length} notes have no tags`,
			summary: 'Batch tag suggestions can improve browsing and clustering, but should stay restrained to avoid taxonomy sprawl.',
			impact: [
				{ label: 'Untagged', value: untaggedFindings.length },
			],
			recommendedActions: [
				{ id: 'ai-suggest-tags', label: 'Suggest tags', mode: 'ai', prompt: await buildTagPrompt(untaggedFindings) },
			],
			evidence: untaggedFindings.slice(0, 8),
			evidenceLabel: 'Sample notes',
		});
	}

	const contentFindings = openFindings.filter(f => f.signalId === 'C-EMPTY' || f.signalId === 'C-STUB');
	if (contentFindings.length > 0) {
		insights.push({
			id: 'content-cleanup',
			kind: 'content-cleanup',
			severity: contentFindings.some(f => f.signalId === 'C-EMPTY') ? 'warning' : 'info',
			title: `${contentFindings.length} empty or stub notes need triage`,
			summary: 'These are good candidates for delete, merge, or expand decisions rather than manual line-by-line editing.',
			impact: [
				{ label: 'Notes', value: contentFindings.length },
			],
			recommendedActions: [
				{ id: 'ai-triage-content', label: 'Triage notes', mode: 'ai', prompt: await buildContentPrompt(contentFindings) },
			],
			evidence: contentFindings.slice(0, 8),
			evidenceLabel: 'Sample notes',
		});
	}

	return insights.sort((a, b) => {
		const rank: Record<HealthInsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
		return rank[a.severity] - rank[b.severity];
	});
}
