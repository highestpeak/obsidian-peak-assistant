import React, { useEffect, useState } from 'react';
import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { Button } from '@/ui/component/shared-ui/button';
import type { BulkCostEstimate } from '@/service/search/support/cost-estimator';
import {
	formatDurationEstimateMs,
	formatTokenCount,
	formatUsdEstimate,
} from '@/service/search/support/llm-progress-format';

type CostEstimationContentProps = {
	onRun: () => void;
	onSkip: () => void;
	onCancel: () => void;
	estimatePromise: Promise<BulkCostEstimate>;
};

function EstimateRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="pktw-flex pktw-justify-between pktw-py-1 pktw-border-b pktw-border-gray-100 last:pktw-border-0">
			<span className="pktw-text-sm pktw-text-gray-600">{label}</span>
			<span className="pktw-text-sm pktw-font-medium pktw-text-gray-900">{value}</span>
		</div>
	);
}

function LoadingSpinner() {
	return (
		<div className="pktw-flex pktw-items-center pktw-justify-center pktw-py-6 pktw-gap-2">
			<div className="pktw-w-4 pktw-h-4 pktw-border-2 pktw-border-gray-300 pktw-border-t-blue-500 pktw-rounded-full pktw-animate-spin" />
			<span className="pktw-text-sm pktw-text-gray-500">Calculating estimate...</span>
		</div>
	);
}

function CostEstimationContent({ onRun, onSkip, onCancel, estimatePromise }: CostEstimationContentProps) {
	const [estimate, setEstimate] = useState<BulkCostEstimate | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		estimatePromise
			.then(setEstimate)
			.catch((e: unknown) => setError((e as Error).message ?? String(e)));
	}, [estimatePromise]);

	return (
		<div className="pktw-bg-white pktw-rounded-xl pktw-shadow-lg pktw-p-5 pktw-w-full pktw-max-w-sm">
			<span className="pktw-block pktw-text-base pktw-font-semibold pktw-text-gray-900 pktw-mb-1">
				LLM Enrichment — Cost Estimate
			</span>
			<span className="pktw-block pktw-text-xs pktw-text-gray-500 pktw-mb-4">
				Review the estimated cost before running LLM enrichment on pending documents.
			</span>

			{!estimate && !error && <LoadingSpinner />}

			{error && (
				<span className="pktw-block pktw-text-sm pktw-text-red-600 pktw-mb-4">
					Failed to calculate estimate: {error}
				</span>
			)}

			{estimate && estimate.totalDocs > 0 && (
				<div className="pktw-bg-gray-50 pktw-rounded-lg pktw-px-3 pktw-py-2 pktw-mb-4">
					<EstimateRow label="Documents" value={String(estimate.totalDocs)} />
					<EstimateRow
						label="Input tokens"
						value={formatTokenCount(estimate.totalInputTokens)}
					/>
					<EstimateRow
						label="Output tokens"
						value={formatTokenCount(estimate.totalOutputTokens)}
					/>
					<EstimateRow
						label="Estimated cost"
						value={formatUsdEstimate(estimate.totalCostUsd)}
					/>
					<EstimateRow
						label="Estimated time"
						value={formatDurationEstimateMs(estimate.estimatedDurationMs)}
					/>
				</div>
			)}

			{estimate?.totalDocs === 0 && (
				<span className="pktw-block pktw-text-sm pktw-text-gray-500 pktw-mb-4">
					No pending documents found.
				</span>
			)}

			<div className="pktw-flex pktw-flex-col pktw-gap-2">
				{(!estimate || estimate.totalDocs > 0) && (
					<>
						<Button
							onClick={onRun}
							disabled={!estimate}
							className="pktw-w-full pktw-text-sm pktw-font-medium"
						>
							Run with LLM
						</Button>
						<Button
							onClick={onSkip}
							variant="outline"
							disabled={!estimate}
							className="pktw-w-full pktw-text-sm pktw-font-medium"
						>
							Skip LLM enrichment
						</Button>
					</>
				)}
				<Button
					onClick={onCancel}
					variant="ghost"
					className="pktw-w-full pktw-text-sm pktw-text-gray-500"
				>
					Cancel
				</Button>
			</div>
		</div>
	);
}

export class CostEstimationModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(
		private readonly appContext: AppContext,
		private readonly onConfirm: (choice: 'run' | 'skip') => void,
		private readonly estimatePromise: Promise<BulkCostEstimate>,
	) {
		super(appContext.app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-cost-estimation-modal');
		contentEl.style.padding = '0';

		modalEl.style.width = '380px';
		modalEl.style.maxWidth = '90vw';
		modalEl.style.padding = '0';

		const onRun = () => {
			this.close();
			this.onConfirm('run');
		};
		const onSkip = () => {
			this.close();
			this.onConfirm('skip');
		};
		const onCancel = () => this.close();

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CostEstimationContent,
				{ onRun, onSkip, onCancel, estimatePromise: this.estimatePromise },
				this.appContext,
			),
		);
	}

	onClose(): void {
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) {
			setTimeout(() => {
				r.unmount();
				this.contentEl.empty();
			}, 0);
		} else {
			this.contentEl.empty();
		}
	}
}
