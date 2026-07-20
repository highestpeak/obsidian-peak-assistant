import React from 'react';
import { DiffView } from '@/ui/components/shared/diff/DiffView';

/** Inline color-dot + label legend used by every diff-style panel. */
export const DiffLegend: React.FC<{
	removedLabel?: string;
	addedLabel?: string;
}> = ({ removedLabel = 'Removed', addedLabel = 'Added' }) => (
	<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-text-xs pktw-text-pk-text-secondary">
		<span className="pktw-inline-flex pktw-items-center pktw-gap-1">
			<span className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-pk-error" />
			{removedLabel}
		</span>
		<span className="pktw-inline-flex pktw-items-center pktw-gap-1">
			<span className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-pk-success" />
			{addedLabel}
		</span>
	</div>
);

/** Legend + DiffView body used by Format-Polish and Polish panels. */
export const DiffSection: React.FC<{
	original: string;
	modified: string;
}> = ({ original, modified }) => (
	<div className="pktw-space-y-3">
		<DiffLegend />
		<DiffView original={original} modified={modified} />
	</div>
);

/** Side-by-side two-column body used by Translate, Rewrite-Selection, etc. */
export const SideBySideSection: React.FC<{
	leftLabel: string;
	rightLabel: string;
	leftText: string;
	rightText: string;
	leftDotClass?: string;
	rightDotClass?: string;
}> = ({
	leftLabel,
	rightLabel,
	leftText,
	rightText,
	leftDotClass = 'pktw-bg-muted-foreground pktw-opacity-40',
	rightDotClass = 'pktw-bg-accent pktw-opacity-60',
}) => (
	<div className="pktw-grid pktw-grid-cols-2 pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden">
		<div className="pktw-p-4 pktw-bg-secondary pktw-border-r pktw-border-border">
			<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2.5">
				<div className={`pktw-w-1.5 pktw-h-1.5 pktw-rounded-full ${leftDotClass}`} />
				<span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">{leftLabel}</span>
			</div>
			<div className="pktw-text-pk-md pktw-leading-relaxed pktw-whitespace-pre-wrap">{leftText}</div>
		</div>
		<div className="pktw-p-4">
			<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2.5">
				<div className={`pktw-w-1.5 pktw-h-1.5 pktw-rounded-full ${rightDotClass}`} />
				<span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">{rightLabel}</span>
			</div>
			<div className="pktw-text-pk-md pktw-leading-relaxed pktw-whitespace-pre-wrap">{rightText}</div>
		</div>
	</div>
);

/** Helper that applies edited text via the appropriate vault path. */
export async function applyDiffResult(params: {
	scope: 'full' | 'selection';
	file: import('obsidian').TFile;
	modified: string;
	vault: { replaceFileContent: (file: import('obsidian').TFile, content: string) => Promise<void> };
}): Promise<void> {
	const { scope, file, modified, vault } = params;
	if (scope === 'selection') {
		const editor = (window as any).app?.workspace?.activeEditor?.editor;
		if (editor) {
			editor.replaceSelection(modified);
			return;
		}
	}
	await vault.replaceFileContent(file, modified);
}
