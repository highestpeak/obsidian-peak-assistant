import React from 'react';
import { Notice } from 'obsidian';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { PenLine } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { SideBySideSection } from '@/ui/view/copilot/components/DiffBodyParts';

interface RewriteSelectionPanelProps {
	result: string;
	ctx: DocumentContext;
	onClose: () => void;
}

export const RewriteSelectionPanel: React.FC<RewriteSelectionPanelProps> = ({
	result, ctx, onClose,
}) => {
	const original = ctx.selection ?? '';
	const originalWords = original.split(/(\s+)/);
	const rewrittenWords = result.split(/(\s+)/);

	const handleApply = () => {
		try {
			const editor = (window as any).app?.workspace?.activeEditor?.editor;
			if (editor) {
				editor.replaceSelection(result);
				new Notice('Selection replaced.');
				onClose();
			} else {
				new Notice('No active editor found.');
			}
		} catch (e) {
			new Notice(`Failed to apply: ${(e as Error).message}`);
		}
	};

	return (
		<CopilotPanelShell
			icon={PenLine}
			title="Rewrite Selection"
			scopeBadgeOverride="Before / After"
			footerSummary={`${originalWords.length} → ${rewrittenWords.length} words`}
			onClose={onClose}
			actions={[{ label: 'Apply Rewrite', onClick: handleApply }]}
		>
			<SideBySideSection
				leftLabel="Original"
				rightLabel="Rewritten"
				leftText={original}
				rightText={result}
				leftDotClass="pktw-bg-pk-error pktw-opacity-60"
				rightDotClass="pktw-bg-pk-success pktw-opacity-60"
			/>
		</CopilotPanelShell>
	);
};
