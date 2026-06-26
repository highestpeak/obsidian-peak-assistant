import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { Copy, Trash2, FileText, Merge } from 'lucide-react';

export interface DuplicateGroup {
	hash: string;
	files: Array<{
		path: string;
		size: number;
		modified: number;
	}>;
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

export const DeduplicateScanPanel: React.FC<DeduplicateScanPanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();
	const [removedPaths, setRemovedPaths] = useState<Set<string>>(() => new Set());

	const openNote = (path: string): Promise<void> =>
		vault.openNote(path, { newLeaf: false });

	const keepNewest = async (group: DuplicateGroup) => {
		const sorted = [...group.files].sort((a, b) => b.modified - a.modified);
		const toDelete = sorted.slice(1);
		let deleted = 0;
		for (const f of toDelete) {
			const file = vault.findFileByPath(f.path);
			if (file) {
				try {
					await vault.trashFile(file);
					deleted++;
					setRemovedPaths(prev => new Set([...prev, f.path]));
				} catch (e) {
					console.warn('[DeduplicateScan] Failed to delete:', f.path, e);
				}
			}
		}
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

		// Append merge references to the kept file
		const content = await vault.readFileContent(keepFile);
		const mergedRefs = sorted.slice(1).map(f => `- Merged from: [[${f.path.replace(/\.md$/, '')}]]`);
		const updated = content + '\n\n## Merged Duplicates\n\n' + mergedRefs.join('\n') + '\n';
		await vault.replaceFileContent(keepFile, updated);

		let deleted = 0;
		for (const f of sorted.slice(1)) {
			const file = vault.findFileByPath(f.path);
			if (file) {
				try {
					await vault.trashFile(file);
					deleted++;
					setRemovedPaths(prev => new Set([...prev, f.path]));
				} catch (e) {
					console.warn('[DeduplicateScan] Failed to delete:', f.path, e);
				}
			}
		}
		new Notice(`Merged ${deleted + 1} files into "${keepPath}".`);
	};

	const formatSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	const formatDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

	const activeGroups = result.groups.filter(g =>
		g.files.filter(f => !removedPaths.has(f.path)).length > 1
	);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Copy className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Duplicate Files</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{activeGroups.length} groups
					</span>
				</div>
				<span className="pktw-text-[11px] pktw-text-muted-foreground">
					{result.totalFiles} files scanned
				</span>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{activeGroups.length === 0 ? (
					<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
						No duplicate files found.
					</div>
				) : (
					activeGroups.map((group, gi) => {
						const activeFiles = group.files.filter(f => !removedPaths.has(f.path));
						return (
							<div key={group.hash} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-3 pktw-overflow-hidden">
								<div className="pktw-px-3.5 pktw-py-2 pktw-bg-secondary pktw-border-b pktw-border-border pktw-flex pktw-items-center pktw-justify-between">
									<div className="pktw-flex pktw-items-center pktw-gap-1.5">
										<Copy className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
										<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-font-mono">
											{group.hash.slice(0, 8)}...
										</span>
										<span className="pktw-text-[9px] pktw-text-muted-foreground/60">
											{activeFiles.length} identical files
										</span>
									</div>
									<div className="pktw-flex pktw-items-center pktw-gap-1">
										<Button
											variant="ghost"
											size="sm"
											className="pktw-h-6 pktw-text-[10px] pktw-px-2"
											onClick={() => keepNewest(group)}
										>
											<Trash2 className="pktw-w-3 pktw-h-3 pktw-mr-1" />
											Keep Newest
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="pktw-h-6 pktw-text-[10px] pktw-px-2"
											onClick={() => mergeIntoOne(group)}
										>
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
											onClick={() => openNote(file.path)}
										>
											<FileText className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-flex-shrink-0" />
											<span className="pktw-text-[12px] pktw-text-accent pktw-truncate pktw-flex-1">
												{file.path}
											</span>
											<span className="pktw-text-[10px] pktw-text-muted-foreground/60 pktw-flex-shrink-0">
												{formatSize(file.size)}
											</span>
											<span className="pktw-text-[10px] pktw-text-muted-foreground/40 pktw-flex-shrink-0">
												{formatDate(file.modified)}
											</span>
											{fi === 0 && (
												<span className="pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-flex-shrink-0">
													NEWEST
												</span>
											)}
										</div>
									))}
								</div>
							</div>
						);
					})
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{result.summary}
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
			</div>
		</div>
	);
};
