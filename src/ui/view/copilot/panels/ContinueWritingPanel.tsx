// src/ui/view/copilot/panels/ContinueWritingPanel.tsx
import React from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { Check, X } from 'lucide-react';

interface ContinueWritingPanelProps {
	result: string;
	file: TFile;
	onClose: () => void;
}

export const ContinueWritingPanel: React.FC<ContinueWritingPanelProps> = ({
	result, file, onClose,
}) => {
	const handleInsert = async () => {
		const app = AppContext.getInstance().app;
		try {
			const current = await app.vault.read(file);
			const separator = current.endsWith('\n') ? '' : '\n';
			await app.vault.modify(file, current + separator + result);
			new Notice('Continuation appended to document.');
			onClose();
		} catch (e) {
			new Notice(`Failed to insert: ${(e as Error).message}`);
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<span className="pktw-text-sm pktw-font-semibold">Continue Writing</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						Continuation
					</span>
				</div>
			</div>

			{/* Content */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				<div className="pktw-border-l-3 pktw-border-l-accent pktw-pl-4 pktw-py-2">
					<div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap">
						{result}
					</div>
				</div>
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<Button variant="ghost" onClick={onClose}>
					<X className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					Discard
				</Button>
				<Button onClick={handleInsert}>
					<Check className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					Insert at End
				</Button>
			</div>
		</div>
	);
};
