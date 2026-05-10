// src/ui/view/modals/onboarding/IndexProgressDisplay.tsx

import React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

type Props = {
	currentStep: number;
	totalSteps: number;
	stepLabel: string;
	processedFiles: number;
	totalFiles: number;
	isComplete: boolean;
};

export function IndexProgressDisplay({
	currentStep,
	totalSteps,
	stepLabel,
	processedFiles,
	totalFiles,
	isComplete,
}: Props) {
	const pct = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;

	if (isComplete) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-2 pktw-py-4">
				<CheckCircle2 className="pktw-w-8 pktw-h-8 pktw-text-[--interactive-accent]" />
				<span className="pktw-text-sm pktw-font-medium pktw-text-[--text-normal]">
					Indexing complete
				</span>
				<span className="pktw-text-xs pktw-text-[--text-muted]">
					{processedFiles} {processedFiles === 1 ? 'file' : 'files'} indexed
				</span>
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-py-4">
			<div className="pktw-flex pktw-items-center pktw-gap-2">
				<Loader2 className="pktw-w-4 pktw-h-4 pktw-animate-spin pktw-text-[--interactive-accent] pktw-shrink-0" />
				<span className="pktw-text-sm pktw-font-medium pktw-text-[--text-normal]">
					Indexing vault...
				</span>
			</div>

			<span className="pktw-text-xs pktw-text-[--text-muted]">
				Step {currentStep}/{totalSteps}: {stepLabel}
			</span>

			<div
				className="pktw-w-full pktw-h-1.5 pktw-rounded-full pktw-overflow-hidden"
				style={{ background: 'var(--background-modifier-border)' }}
			>
				<div
					className="pktw-h-full pktw-rounded-full pktw-transition-all pktw-duration-300"
					style={{ width: `${pct}%`, background: 'var(--interactive-accent)' }}
				/>
			</div>

			<span className="pktw-text-xs pktw-text-[--text-muted]">
				{processedFiles} / {totalFiles} files
			</span>
		</div>
	);
}
