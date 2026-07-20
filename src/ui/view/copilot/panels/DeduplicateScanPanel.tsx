import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { Copy, Trash2, FileText, Merge } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { PanelEmptyState } from '@/ui/view/copilot/components/FindingsBodyParts';

export interface DuplicateGroup {
	hash: string;
	files: Array<{ path: string; size: number; modified: number }>;
}

export interface DeduplicateScanResult {
	groups: DuplicateGroup[];
	totalFiles: number;
	duplicateFiles: number;
	summary: string;
}

interface DeduplicateScanPanelProps {
	result: DeduplicateScanResult;
	ctx: DocumentContext;
	onClose: () => void;
}

const formatSize = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export const DeduplicateScanPanel: React.FC<DeduplicateScanPanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();
	const [removedPaths, setRemovedPaths] = useState<Set<string>>(() => new Set());

	const deleteFiles = async (paths: string[]): Promise<number> => {
		let deleted = 0;
		for (const path of paths) {
			const file = vault.findFileByPath(path);
			if (!file) continue;
			try {
				await vault.trashFile(file);
				deleted++;
				setRemovedPaths(prev => new Set([...prev, path]));
			} catch (e) {
				console.warn('[DeduplicateScan] Failed to delete:', path, e);
			}
		}
		return deleted;
	};

	const keepNewest = async (group: DuplicateGroup) => {
		const sorted = [...group.files].sort((a, b) => b.modified - a.modified);
		const deleted = await deleteFiles(sorted.slice(1).map(f => f.path));
		new Notice(`Deleted ${deleted} duplicate file${deleted !== 1 ? 's' : ''}, kept "${sorted[0].path}".`);
	};

	const mergeIntoOne = async (group: DuplicateGroup) => {
		const sorted = [...group.files].sort((a, b) => b.modified - a.modified);
		const keepPath = sorted[0].path;
		const keepFile = vault.findFileByPath(keepPath);
		if (!keepFile) {
			new Notice(`File not found: ${keepPath}`);
			return;
		}
		const content = await vault.readFileContent(keepFile);
		const mergedRefs = sorted.slice(1).map(f => `- Merged from: [[${f.path.replace(/\.md$/, '')}]]`);
		await vault.replaceFileContent(keepFile, content + '\n\n## Merged Duplicates\n\n' + mergedRefs.join('\n') + '\n');
		const deleted = await deleteFiles(sorted.slice(1).map(f => f.path));
		new Notice(`Merged ${deleted + 1} files into "${keepPath}".`);
	};

	const activeGroups = result.groups.filter(g =>
		g.files.filter(f => !removedPaths.has(f.path)).length > 1
	);

	return (
		<CopilotPanelShell
			icon={Copy}
			title="Duplicate Files"
			badge={`${activeGroups.length} groups`}
			subtitle={`${result.totalFiles} files scanned`}
			footerSummary={result.summary}
			onClose={onClose}
		>
			{activeGroups.length === 0 ? (
				<PanelEmptyState message="No duplicate files found." />
			) : (
				activeGroups.map((group) => {
					const activeFiles = group.files.filter(f => !removedPaths.has(f.path));
					return (
						<div key={group.hash} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-3 pktw-overflow-hidden">
							<div className="pktw-px-3.5 pktw-py-2 pktw-bg-secondary pktw-border-b pktw-border-border pktw-flex pktw-items-center pktw-justify-between">
								<div className="pktw-flex pktw-items-center pktw-gap-1.5">
									<Copy className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
									<span className="pktw-text-pk-sm pktw-text-muted-foreground pktw-font-mono">{group.hash.slice(0, 8)}...</span>
									<span className="pktw-text-[9px] pktw-text-muted-foreground/60">{activeFiles.length} identical files</span>
								</div>
								<div className="pktw-flex pktw-items-center pktw-gap-1">
									<Button variant="ghost" size="sm" className="pktw-h-6 pktw-text-pk-xs pktw-px-2" onClick={() => keepNewest(group)}>
										<Trash2 className="pktw-w-3 pktw-h-3 pktw-mr-1" />
										Keep Newest
									</Button>
									<Button variant="ghost" size="sm" className="pktw-h-6 pktw-text-pk-xs pktw-px-2" onClick={() => mergeIntoOne(group)}>
										<Merge className="pktw-w-3 pktw-h-3 pktw-mr-1" />
										Merge
									</Button>
								</div>
							</div>
							<div className="pktw-px-3.5 pktw-py-2">
								{activeFiles.map((file, fi) => (
									<div
										key={file.path}
										className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-cursor-pointer hover:pktw-bg-muted pktw-rounded pktw-px-2 pktw-transition-colors"
										onClick={() => { void vault.openNote(file.path, { newLeaf: false }); }}
									>
										<FileText className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-flex-shrink-0" />
										<span className="pktw-text-pk-base pktw-text-accent pktw-truncate pktw-flex-1">{file.path}</span>
										<span className="pktw-text-pk-xs pktw-text-muted-foreground/60 pktw-flex-shrink-0">{formatSize(file.size)}</span>
										<span className="pktw-text-pk-xs pktw-text-muted-foreground/40 pktw-flex-shrink-0">{formatDate(file.modified)}</span>
										{fi === 0 && (
											<span className="pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-flex-shrink-0">NEWEST</span>
										)}
									</div>
								))}
							</div>
						</div>
					);
				})
			)}
		</CopilotPanelShell>
	);
};
