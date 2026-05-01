import { AppContext } from '@/app/context/AppContext';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { LintSignalDetector, LintScanContext, LintFinding } from '../types';

/**
 * S-ORPHAN: notes with zero incoming and outgoing links.
 */
export const OrphanDetector: LintSignalDetector = {
	id: 'S-ORPHAN',
	dimension: 'structural',
	severity: 'warning',
	signalWeight: 0.30,
	label: 'Orphan Notes',
	description: 'Notes with no incoming or outgoing links',
	requiresLlm: false,

	async detect(_context: LintScanContext): Promise<LintFinding[]> {
		const mgr = SqliteStoreManager.getInstance();
		const edgeRepo = mgr.getMobiusEdgeRepo('vault');
		const nodeRepo = mgr.getMobiusNodeRepo('vault');

		const orphanIds = await edgeRepo.getHardOrphanNodeIds(500);
		if (orphanIds.length === 0) return [];

		const nodeMap = await nodeRepo.getByIds(orphanIds);
		const findings: LintFinding[] = [];

		for (const [nodeId, node] of nodeMap) {
			findings.push({
				id: `S-ORPHAN:${nodeId}`,
				signalId: 'S-ORPHAN',
				severity: 'warning',
				filePath: nodeId,
				title: `Orphan: ${node.label}`,
				description: 'No incoming or outgoing links',
				fixActions: ['suggest-links', 'delete-note'],
				metadata: { label: node.label },
				status: 'open',
			});
		}

		return findings;
	},
};

/**
 * S-BROKEN-LINK: wiki links pointing to non-existent notes.
 */
export const BrokenLinkDetector: LintSignalDetector = {
	id: 'S-BROKEN-LINK',
	dimension: 'structural',
	severity: 'error',
	signalWeight: 0.25,
	label: 'Broken Links',
	description: 'Wiki links pointing to non-existent notes',
	requiresLlm: false,

	async detect(_context: LintScanContext): Promise<LintFinding[]> {
		const app = AppContext.getApp();
		const unresolvedLinks = app.metadataCache.unresolvedLinks;
		const findings: LintFinding[] = [];

		for (const filePath of Object.keys(unresolvedLinks)) {
			const targets = unresolvedLinks[filePath];
			for (const target of Object.keys(targets)) {
				findings.push({
					id: `S-BROKEN-LINK:${filePath}:${target}`,
					signalId: 'S-BROKEN-LINK',
					severity: 'error',
					filePath,
					title: `Broken link: [[${target}]]`,
					description: `In ${filePath}, link target does not exist`,
					fixActions: ['redirect-link', 'create-note', 'remove-link'],
					metadata: { target, sourceFile: filePath },
					status: 'open',
				});
			}
		}

		return findings;
	},
};
