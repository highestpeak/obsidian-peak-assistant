import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { composerTargetBlockId } from '@/core/composer';
import { receiptCounts, type RunArtifactCategory, type RunReceipt } from '@/service/composer';
import { cn } from '@/ui/react/lib/utils';
import { useSidecar } from './SidecarContext';

/**
 * Peak Composer — run receipt (WP9, handoff §12.3). ONE compact receipt per run;
 * expanding it switches Changes / Insights / Sources / Trace IN PLACE inside the
 * same message — they are never restored as permanent top-level tabs. Change
 * items locate the in-body candidate; Source items open the source; Insight /
 * Trace expand inline. Nothing here opens a modal (spatial artifacts, out of WP
 * scope, are the only exception).
 */
export function RunReceiptCard({ receipt }: { receipt: RunReceipt }): React.ReactElement {
	const { config, onLocate, onOpenSource } = useSidecar();
	const s = config.strings;
	const [expanded, setExpanded] = React.useState(false);
	const [category, setCategory] = React.useState<RunArtifactCategory>('changes');
	const counts = receiptCounts(receipt);

	return (
		<div className="pk-receipt" data-status={receipt.status} data-testid="pk-receipt">
			<button type="button" className="pk-receipt-head" onClick={() => setExpanded((v) => !v)}>
				{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
				<span className="pk-receipt-action">{receipt.action}</span>
				<span className="pk-receipt-target">{receipt.targetLabel}</span>
				<span className="pk-receipt-counts">
					{counts.changes}·{counts.insights}·{counts.sources}
				</span>
			</button>
			{expanded && (
				<div className="pk-receipt-body">
					<div className="pk-receipt-tabs" role="tablist">
						<ReceiptTab label={s.receiptChanges} active={category === 'changes'} count={counts.changes} onSelect={() => setCategory('changes')} />
						<ReceiptTab label={s.receiptInsights} active={category === 'insights'} count={counts.insights} onSelect={() => setCategory('insights')} />
						<ReceiptTab label={s.receiptSources} active={category === 'sources'} count={counts.sources} onSelect={() => setCategory('sources')} />
						<ReceiptTab label={s.receiptTrace} active={category === 'trace'} count={counts.trace} onSelect={() => setCategory('trace')} />
					</div>
					<div className="pk-receipt-items">
						{category === 'changes' &&
							receipt.changes.map((c) => (
								<button
									key={c.changeId}
									type="button"
									className="pk-receipt-item"
									onClick={() => {
										const blockId = composerTargetBlockId(c.target);
										if (blockId) onLocate?.(blockId);
									}}
								>
									{c.label}
								</button>
							))}
						{category === 'insights' &&
							receipt.insights.map((it) => (
								<div key={it.id} className="pk-receipt-item pk-receipt-item--static">
									{it.label}
									{it.detail && <span className="pk-receipt-detail">{it.detail}</span>}
								</div>
							))}
						{category === 'sources' &&
							receipt.sources.map((src) => (
								<button key={src.id} type="button" className="pk-receipt-item" onClick={() => onOpenSource?.(src.path)}>
									{src.label}
								</button>
							))}
						{category === 'trace' &&
							receipt.trace.map((t) => (
								<div key={t.id} className={cn('pk-receipt-item pk-receipt-item--static', `pk-trace--${t.status}`)}>
									{t.label}
								</div>
							))}
					</div>
				</div>
			)}
		</div>
	);
}

function ReceiptTab({
	label,
	active,
	count,
	onSelect,
}: {
	label: string;
	active: boolean;
	count: number;
	onSelect: () => void;
}): React.ReactElement {
	return (
		<button type="button" role="tab" aria-selected={active} className={cn('pk-receipt-tab', active && 'pk-receipt-tab--active')} onClick={onSelect}>
			{label}
			<span className="pk-status-chip pk-status-chip--sm">{count}</span>
		</button>
	);
}
