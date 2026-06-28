import React from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { DetectAndFileResult } from '@/service/copilot/copilot-schemas';
import { Inbox, ExternalLink, FilePlus, Check } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { PanelEmptyState } from '@/ui/view/copilot/components/FindingsBodyParts';

const CONTENT_TYPE_LABELS: Record<string, string> = {
	'todo': 'Todo',
	'reference': 'Reference',
	'quote': 'Quote',
	'idea': 'Idea',
	'meeting-note': 'Meeting Note',
	'snippet': 'Code Snippet',
	'bookmark': 'Bookmark',
};

interface DetectAndFilePanelProps {
	result: DetectAndFileResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const DetectAndFilePanel: React.FC<DetectAndFilePanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();

	const handleAppend = async (path: string, formattedText: string) => {
		const appended = await vault.appendToFileAtPath(path, formattedText);
		if (!appended) {
			new Notice(`File not found: ${path}`);
			return;
		}
		new Notice(`Appended to: ${path}`);
	};

	const handleCreateNew = async () => {
		if (!result.fallbackAction) return;
		const { suggestedTitle, suggestedFolder, formattedText } = result.fallbackAction;
		try {
			const path = await vault.createNoteInFolder(suggestedFolder, suggestedTitle, formattedText);
			new Notice(`Created: ${path}`);
		} catch (e) {
			new Notice(`Failed: ${(e as Error).message}`);
		}
	};

	const badge = `${CONTENT_TYPE_LABELS[result.contentType] ?? result.contentType} · ${Math.round(result.confidence * 100)}%`;

	return (
		<CopilotPanelShell
			icon={Inbox}
			title="Detect & File"
			badge={badge}
			subtitle={result.summary}
			footerSummary={`${result.suggestions.length} destination${result.suggestions.length !== 1 ? 's' : ''} suggested`}
			onClose={onClose}
		>
			{result.suggestions.length === 0 ? (
				<PanelEmptyState message="No suitable existing notes found." />
			) : (
				result.suggestions.map((suggestion, i) => (
					<div
						key={suggestion.path}
						className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden"
					>
						<div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-border-b pktw-border-border">
							<div className="pktw-w-[22px] pktw-h-[22px] pktw-rounded-full pktw-bg-accent/10 pktw-text-accent pktw-flex pktw-items-center pktw-justify-center pktw-text-[11px] pktw-font-bold pktw-flex-shrink-0">
								{i + 1}
							</div>
							<span
								className="pktw-text-[13px] pktw-font-semibold pktw-text-accent pktw-truncate pktw-cursor-pointer hover:pktw-underline"
								onClick={() => { void vault.openNote(suggestion.path, { newLeaf: false }); }}
							>
								{suggestion.title}
							</span>
							<ExternalLink className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-flex-shrink-0" />
							<span className="pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-flex-shrink-0 pktw-ml-auto">
								{Math.round(suggestion.score * 100)}%
							</span>
						</div>
						<div className="pktw-px-3.5 pktw-py-2.5">
							<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-block pktw-mb-2">{suggestion.reason}</span>
							<div className="pktw-p-2 pktw-bg-muted pktw-rounded pktw-text-[11px] pktw-font-mono pktw-whitespace-pre-wrap pktw-max-h-[100px] pktw-overflow-y-auto pktw-mb-2">
								{suggestion.formattedText.slice(0, 300)}
							</div>
							<Button
								size="sm"
								className="pktw-h-7 pktw-text-[11px] pktw-gap-1"
								onClick={() => handleAppend(suggestion.path, suggestion.formattedText)}
							>
								<Check className="pktw-w-3 pktw-h-3" />
								Append Here
							</Button>
						</div>
					</div>
				))
			)}

			{result.fallbackAction && (
				<div className="pktw-mt-4 pktw-pt-4 pktw-border-t pktw-border-border">
					<span className="pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-muted-foreground pktw-block pktw-mb-2">
						Or create a new note
					</span>
					<div className="pktw-flex pktw-items-center pktw-gap-2">
						<span className="pktw-text-[12px]">{result.fallbackAction.suggestedTitle}</span>
						<span className="pktw-text-[10px] pktw-text-muted-foreground">in {result.fallbackAction.suggestedFolder}/</span>
						<Button
							variant="outline"
							size="sm"
							className="pktw-h-7 pktw-text-[11px] pktw-gap-1 pktw-ml-auto"
							onClick={handleCreateNew}
						>
							<FilePlus className="pktw-w-3 pktw-h-3" />
							Create
						</Button>
					</div>
				</div>
			)}
		</CopilotPanelShell>
	);
};
