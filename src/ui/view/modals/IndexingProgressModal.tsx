import React, { useEffect, useState } from 'react';
import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { Button } from '@/ui/component/shared-ui/button';
import type { PendingLlmEnrichmentProgress } from '@/service/search/support/llm-enrichment-progress-tracker';
import {
	formatDurationEstimateMs,
	formatTokenCount,
	formatUsdEstimate,
} from '@/service/search/support/llm-progress-format';

type ProgressSubscriber = (ev: PendingLlmEnrichmentProgress) => void;

type IndexingProgressContentProps = {
	onCancel: () => void;
	subscribe: (cb: ProgressSubscriber) => () => void;
};

function ProgressBar({ value, max }: { value: number; max: number }) {
	const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
	return (
		<div className="pktw-w-full pktw-bg-gray-200 pktw-rounded-full pktw-h-2 pktw-overflow-hidden">
			<div
				className="pktw-bg-blue-500 pktw-h-2 pktw-rounded-full pktw-transition-all pktw-duration-300"
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

function StatRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="pktw-flex pktw-justify-between pktw-py-1">
			<span className="pktw-text-xs pktw-text-gray-500">{label}</span>
			<span className="pktw-text-xs pktw-font-medium pktw-text-gray-800">{value}</span>
		</div>
	);
}

function truncatePath(path: string, maxLen = 52): string {
	if (path.length <= maxLen) return path;
	return `…${path.slice(-(maxLen - 1))}`;
}

function IndexingProgressContent({ onCancel, subscribe }: IndexingProgressContentProps) {
	const [ev, setEv] = useState<PendingLlmEnrichmentProgress | null>(null);

	useEffect(() => {
		const unsub = subscribe(setEv);
		return unsub;
	}, [subscribe]);

	const docsPerMin =
		ev && ev.elapsedMs > 0 ? ((ev.processed / ev.elapsedMs) * 60_000).toFixed(1) : '—';

	const tokPerSec =
		ev && ev.elapsedMs > 0
			? formatTokenCount(Math.round((ev.sumTotalTokens / ev.elapsedMs) * 1000))
			: '—';

	return (
		<div className="pktw-bg-white pktw-rounded-xl pktw-shadow-lg pktw-p-5 pktw-w-full pktw-max-w-sm">
			<span className="pktw-block pktw-text-base pktw-font-semibold pktw-text-gray-900 pktw-mb-1">
				LLM Enrichment — Running
			</span>

			{!ev && (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-4">
					<div className="pktw-w-4 pktw-h-4 pktw-border-2 pktw-border-gray-300 pktw-border-t-blue-500 pktw-rounded-full pktw-animate-spin" />
					<span className="pktw-text-sm pktw-text-gray-500">Starting...</span>
				</div>
			)}

			{ev && (
				<div className="pktw-flex pktw-flex-col pktw-gap-3">
					<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-1">
						<span className="pktw-text-sm pktw-text-gray-600">
							{ev.processed} / {ev.total} docs
						</span>
						<span className="pktw-text-sm pktw-font-medium pktw-text-gray-900">
							{ev.total > 0
								? `${Math.round((ev.processed / ev.total) * 100)}%`
								: '0%'}
						</span>
					</div>

					<ProgressBar value={ev.processed} max={ev.total} />

					<div className="pktw-bg-gray-50 pktw-rounded-lg pktw-px-3 pktw-py-2">
						<StatRow label="Speed" value={`${docsPerMin} docs/min · ${tokPerSec} tok/s`} />
						<StatRow label="ETA" value={formatDurationEstimateMs(ev.estimatedRemainingMs)} />
						<StatRow
							label="Running cost"
							value={`${formatUsdEstimate(ev.sumCostUsd)} (est. final: ${formatUsdEstimate(ev.estimatedFinalCostUsd)})`}
						/>
						<StatRow
							label="Tokens used"
							value={`${formatTokenCount(ev.sumTotalTokens)} / ~${formatTokenCount(ev.estimatedFinalTotalTokens)}`}
						/>
					</div>

					<div className="pktw-bg-gray-50 pktw-rounded-lg pktw-px-3 pktw-py-1">
						<span className="pktw-block pktw-text-xs pktw-text-gray-400 pktw-font-mono pktw-truncate">
							{truncatePath(ev.path)}
						</span>
					</div>
				</div>
			)}

			<div className="pktw-mt-4">
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

export class IndexingProgressModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private subscribers = new Set<ProgressSubscriber>();
	private cancelled = false;

	constructor(
		private readonly appContext: AppContext,
		private readonly onCancel: () => void,
	) {
		super(appContext.app);
	}

	updateProgress(ev: PendingLlmEnrichmentProgress): void {
		for (const cb of this.subscribers) {
			cb(ev);
		}
	}

	isCancelled(): boolean {
		return this.cancelled;
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-indexing-progress-modal');
		contentEl.style.padding = '0';

		modalEl.style.width = '400px';
		modalEl.style.maxWidth = '90vw';
		modalEl.style.padding = '0';

		const subscribe = (cb: ProgressSubscriber) => {
			this.subscribers.add(cb);
			return () => this.subscribers.delete(cb);
		};

		const handleCancel = () => {
			this.cancelled = true;
			this.close();
			this.onCancel();
		};

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				IndexingProgressContent,
				{ onCancel: handleCancel, subscribe },
				this.appContext,
			),
		);
	}

	onClose(): void {
		this.subscribers.clear();
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
