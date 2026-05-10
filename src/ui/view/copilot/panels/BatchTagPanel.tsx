import React, { useState, useCallback } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { writeTagsToFrontmatter } from '@/service/copilot/frontmatterTagWriter';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { TagSuggestions } from '@/service/copilot/copilot-schemas';
import { ChevronDown, ChevronRight, FileText, Tag } from 'lucide-react';

interface BatchDocResult {
	file: TFile;
	suggestions: TagSuggestions['suggestions'];
	batchId: string;
}

interface BatchTagPanelProps {
	results: BatchDocResult[];
	onClose: () => void;
}

const DocSection: React.FC<{
	docResult: BatchDocResult;
	selections: Record<string, boolean>;
	onToggle: (tag: string) => void;
}> = ({ docResult, selections, onToggle }) => {
	const [expanded, setExpanded] = useState(true);
	const selectedCount = Object.values(selections).filter(Boolean).length;

	return (
		<div className="pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden">
			<button
				type="button"
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-w-full pktw-px-3 pktw-py-2.5 pktw-bg-secondary/50 hover:pktw-bg-secondary pktw-transition-colors pktw-text-left"
				onClick={() => setExpanded(prev => !prev)}
			>
				{expanded
					? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground pktw-flex-shrink-0" />
					: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground pktw-flex-shrink-0" />}
				<FileText className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground pktw-flex-shrink-0" />
				<span className="pktw-text-[13px] pktw-font-medium pktw-truncate pktw-flex-1">
					{docResult.file.basename}
				</span>
				<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-flex-shrink-0">
					{selectedCount}/{docResult.suggestions.length} selected
				</span>
			</button>
			{expanded && (
				<div className="pktw-px-3 pktw-py-2 pktw-space-y-1">
					{docResult.suggestions.map(s => {
						const checked = selections[s.tag] ?? false;
						return (
							<label
								key={s.tag}
								className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1 pktw-cursor-pointer hover:pktw-bg-muted/50 pktw-rounded pktw-px-1"
							>
								<input
									type="checkbox"
									checked={checked}
									onChange={() => onToggle(s.tag)}
									className="pktw-accent-accent"
								/>
								<span className="pktw-text-[13px] pktw-font-semibold pktw-text-accent">
									#{s.tag}
								</span>
								<span className="pktw-text-[10px] pktw-text-muted-foreground/60">
									{Math.round(s.confidence * 100)}%
								</span>
								<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-truncate">
									{s.reason}
								</span>
							</label>
						);
					})}
				</div>
			)}
		</div>
	);
};

export const BatchTagPanel: React.FC<BatchTagPanelProps> = ({ results, onClose }) => {
	// selections[fileIndex][tag] = boolean
	const [allSelections, setAllSelections] = useState<Record<number, Record<string, boolean>>>(() => {
		const init: Record<number, Record<string, boolean>> = {};
		results.forEach((doc, i) => {
			init[i] = {};
			for (const s of doc.suggestions) {
				init[i][s.tag] = s.confidence >= 0.7;
			}
		});
		return init;
	});
	const [applying, setApplying] = useState(false);

	const toggleTag = useCallback((docIdx: number, tag: string) => {
		setAllSelections(prev => ({
			...prev,
			[docIdx]: { ...prev[docIdx], [tag]: !prev[docIdx]?.[tag] },
		}));
	}, []);

	const totalSelected = Object.values(allSelections).reduce(
		(sum, sel) => sum + Object.values(sel).filter(Boolean).length,
		0,
	);

	const handleApplyAll = async () => {
		setApplying(true);
		try {
			let appliedCount = 0;
			const feedbackResolutions: Array<{
				tag: string;
				docPath: string;
				batchId: string;
				status: 'accepted' | 'rejected';
			}> = [];

			for (let i = 0; i < results.length; i++) {
				const doc = results[i];
				const sel = allSelections[i] ?? {};
				const accepted = doc.suggestions.filter(s => sel[s.tag]).map(s => s.tag);
				const rejected = doc.suggestions.filter(s => !sel[s.tag]).map(s => s.tag);

				if (accepted.length > 0) {
					await writeTagsToFrontmatter(doc.file, accepted);
					appliedCount += accepted.length;
				}

				// Build feedback resolutions
				for (const tag of accepted) {
					feedbackResolutions.push({
						tag, docPath: doc.file.path, batchId: doc.batchId, status: 'accepted',
					});
				}
				for (const tag of rejected) {
					feedbackResolutions.push({
						tag, docPath: doc.file.path, batchId: doc.batchId, status: 'rejected',
					});
				}
			}

			// Persist feedback
			if (feedbackResolutions.length > 0) {
				try {
					const repo = SqliteStoreManager.getInstance().getTagSuggestionRepo();
					await repo.resolveBatch(feedbackResolutions);
				} catch (e) {
					console.warn('[BatchTagPanel] Failed to record feedback:', e);
				}
			}

			new Notice(`Applied ${appliedCount} tag${appliedCount !== 1 ? 's' : ''} across ${results.length} document${results.length !== 1 ? 's' : ''}.`);
			onClose();
		} catch (e) {
			new Notice(`Batch apply failed: ${(e as Error).message}`);
		} finally {
			setApplying(false);
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-max-h-[70vh]">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Tag className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Batch Tag Suggestions</span>
				</div>
				<span className="pktw-text-[11px] pktw-text-muted-foreground">
					{results.length} document{results.length !== 1 ? 's' : ''}
				</span>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-4 pktw-space-y-3">
				{results.map((doc, i) => (
					<DocSection
						key={doc.file.path}
						docResult={doc}
						selections={allSelections[i] ?? {}}
						onToggle={(tag) => toggleTag(i, tag)}
					/>
				))}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{totalSelected} tag{totalSelected !== 1 ? 's' : ''} selected
				</span>
				<Button variant="ghost" onClick={onClose}>Skip All</Button>
				<Button onClick={handleApplyAll} disabled={totalSelected === 0 || applying}>
					{applying ? 'Applying...' : `Apply Selected (${totalSelected} tag${totalSelected !== 1 ? 's' : ''})`}
				</Button>
			</div>
		</div>
	);
};
