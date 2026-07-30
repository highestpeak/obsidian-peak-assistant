import * as React from 'react';
import {
	ChevronLeft,
	ChevronRight,
	MapPin,
} from 'lucide-react';
import type { ComposerDocumentSnapshot } from '@/core/composer';
import {
	diffWords,
	generationSourceText,
	generationVariantText,
	type ComposerHistoryActivity,
	type ComposerHistoryTransactionResolver,
	type DiffSegment,
} from '@/service/composer';
import { Button, IconButton, Modal } from '@/ui/components/primitives';
import type { SidecarStrings } from './sidecarConfig';

export interface HistoryDetailModalProps {
	activity: ComposerHistoryActivity;
	snapshot?: ComposerDocumentSnapshot;
	transactionResolver?: ComposerHistoryTransactionResolver;
	strings: SidecarStrings;
	onClose(): void;
	onLocate?(blockId: string): boolean | void;
	/**
	 * Kept temporarily for call-site compatibility. History detail is read-only:
	 * a stale generation must never be presented as safely restorable.
	 */
	onRestore?(runId: string): boolean;
	/** @deprecated History detail no longer mutates the document. */
	onRollback?(historyId: string): Promise<void> | void;
}

export function HistoryDetailModal({
	activity,
	snapshot,
	transactionResolver,
	strings,
	onClose,
	onLocate,
}: HistoryDetailModalProps): React.ReactElement {
	const runs = activity.generation?.runs ?? [];
	const [variantIndex, setVariantIndex] = React.useState(Math.max(0, runs.length - 1));
	React.useEffect(() => {
		setVariantIndex(Math.max(0, runs.length - 1));
	}, [activity.activityId, runs.length]);

	const run = runs[variantIndex];
	const transactionItem = activity.transactions[0];
	const transactionPreview = transactionItem
		? transactionResolver?.preview(transactionItem.historyId) ?? null
		: null;
	const originalText = run
		? generationSourceText(run)
		: transactionPreview?.beforeText
			?? activity.receipt?.targetQuote
			?? activity.targetQuote
			?? '';
	const generatedText = run
		? generationVariantText(run)
		: transactionPreview?.afterText
			?? activity.receipt?.responseSummary
			?? activity.receipt?.insights.map((item) => item.detail || item.label).join('\n')
			?? activity.changeSummary
			?? '';
	const current = resolveCurrentTarget(activity, snapshot);
	const sourceChanged = Boolean(
		snapshot
		&& (
			current.resolution !== 'same'
			|| (
				run
				&& run.originRevision !== snapshot.revision
			)
		),
	);

	return (
		<Modal open onOpenChange={(open) => { if (!open) onClose(); }}>
			<Modal.Content
				width="wide"
				className="pk-history-modal"
				portalClassName="peak-design-root"
				data-comparison={activity.comparisonKind}
				data-testid="pk-history-detail-modal"
			>
				<Modal.Header className="pk-history-modal__head">
					<span className="pk-history-modal__heading">
						<Modal.Title asChild>
							<strong>{activity.actionLabel}</strong>
						</Modal.Title>
						<Modal.Subtitle asChild>
							<span>{strings.historyDetailSubtitle}</span>
						</Modal.Subtitle>
					</span>
					<Modal.Close label={strings.close} />
				</Modal.Header>

				<Modal.Body className="pk-history-modal__body">
					<div className="pk-history-modal__meta">
						<span>{activity.targetLabel}</span>
						<span>{formatHistoryDate(activity.occurredAt)}</span>
						{activity.detailAvailability === 'legacy' && (
							<span data-state="legacy">{strings.historyNoContent}</span>
						)}
					</div>

					{activity.receipt?.instruction && (
						<section className="pk-history-modal__instruction">
							<span>{strings.historyInstruction}</span>
							<strong>{activity.receipt.instruction}</strong>
						</section>
					)}

					{runs.length > 1 && (
						<div className="pk-history-modal__variants">
							<IconButton
								label={strings.historyPreviousVersion}
								disabled={variantIndex <= 0}
								onClick={() => setVariantIndex((currentIndex) => Math.max(0, currentIndex - 1))}
							>
								<ChevronLeft />
							</IconButton>
							<span>
								{formatVersion(strings.historyVersion, variantIndex + 1, runs.length)}
							</span>
							<IconButton
								label={strings.historyNextVersion}
								disabled={variantIndex >= runs.length - 1}
								onClick={() =>
									setVariantIndex((currentIndex) =>
										Math.min(runs.length - 1, currentIndex + 1)
									)}
							>
								<ChevronRight />
							</IconButton>
						</div>
					)}

					{sourceChanged && (
						<div className="pk-history-modal__notice" data-state="changed">
							{strings.historySourceChanged}
						</div>
					)}

					<HistoryComparison
						kind={activity.comparisonKind}
						originalText={originalText}
						generatedText={generatedText}
						resultLabel={
							activity.source === 'document'
								? strings.historyAfter
								: strings.historyGenerated
						}
						strings={strings}
					/>

					{activity.receipt && (
						<HistoryProcess activity={activity} strings={strings} />
					)}
				</Modal.Body>

				{current.blockId && onLocate && (
					<Modal.Footer className="pk-history-modal__footer">
						<Button
							variant="outline"
							onClick={() => {
								if (onLocate(current.blockId!) !== false) onClose();
							}}
						>
							<MapPin />
							{strings.locateInDocument}
						</Button>
					</Modal.Footer>
				)}
			</Modal.Content>
		</Modal>
	);
}

function HistoryComparison({
	kind,
	originalText,
	generatedText,
	resultLabel,
	strings,
}: {
	kind: ComposerHistoryActivity['comparisonKind'];
	originalText: string;
	generatedText: string;
	resultLabel: string;
	strings: SidecarStrings;
}): React.ReactElement {
	if (!originalText && !generatedText) {
		return (
			<div className="pk-history-modal__empty">
				{strings.historyNoContent}
			</div>
		);
	}
	if (kind === 'rewrite') {
		const segments = diffWords(originalText, generatedText);
		return (
			<section className="pk-history-modal__comparison" data-kind={kind}>
				<div data-side="diff">
					<span>{strings.historyDiff}</span>
					<pre>{segments.map(renderDiffSegment)}</pre>
				</div>
			</section>
		);
	}
	return (
		<section className="pk-history-modal__comparison" data-kind={kind}>
			<div data-side="original">
				<span>{strings.historyOriginal}</span>
				<pre>{originalText || strings.historyNoContent}</pre>
			</div>
			<div data-side="generated">
				<span>{resultLabel}</span>
				<pre>{generatedText || strings.historyNoContent}</pre>
			</div>
		</section>
	);
}

function renderDiffSegment(segment: DiffSegment, index: number): React.ReactElement {
	if (segment.kind === 'del') {
		return (
			<del key={index} className="pk-history-diff-del">
				{segment.text}
			</del>
		);
	}
	if (segment.kind === 'ins') {
		return (
			<ins key={index} className="pk-history-diff-ins">
				{segment.text}
			</ins>
		);
	}
	return <React.Fragment key={index}>{segment.text}</React.Fragment>;
}

function HistoryProcess({
	activity,
	strings,
}: {
	activity: ComposerHistoryActivity;
	strings: SidecarStrings;
}): React.ReactElement {
	const receipt = activity.receipt!;
	const hasProcess = receipt.sources.length > 0
		|| receipt.trace.length > 0
		|| Boolean(receipt.safeError);
	if (!hasProcess) {
		return (
			<section className="pk-history-modal__process">
				<span>{strings.historyProcess}</span>
				<strong>{strings.historyNoContent}</strong>
			</section>
		);
	}
	return (
		<section className="pk-history-modal__process">
			<span>{strings.historyProcess}</span>
			{receipt.safeError && <strong data-state="error">{receipt.safeError}</strong>}
			{receipt.sources.map((source) => (
				<div key={source.id}>
					<span>{strings.receiptSources}</span>
					<strong>{source.label}</strong>
					{source.detail && <small>{source.detail}</small>}
				</div>
			))}
			{receipt.trace.map((trace) => (
				<div key={trace.id} data-status={trace.status}>
					<span>{strings.receiptTrace}</span>
					<strong>{trace.label}</strong>
				</div>
			))}
		</section>
	);
}

function resolveCurrentTarget(
	activity: ComposerHistoryActivity,
	snapshot: ComposerDocumentSnapshot | undefined,
): {
	resolution: 'same' | 'changed' | 'missing';
	text: string;
	blockId?: string;
} {
	if (!snapshot) return { resolution: 'missing', text: '' };
	if (!activity.targetBlockId) {
		return {
			resolution: activity.documentId === snapshot.documentId ? 'same' : 'changed',
			text: snapshot.sourceText,
		};
	}
	const exact = snapshot.blocks.find((block) => block.blockId === activity.targetBlockId);
	const target = exact ?? snapshot.blocks.find((block) =>
		activity.targetBlockId?.startsWith(stableBlockPrefix(block.blockId))
		|| block.blockId.startsWith(stableBlockPrefix(activity.targetBlockId!)),
	);
	if (!target) return { resolution: 'missing', text: '' };
	return {
		resolution: exact ? 'same' : 'changed',
		text: snapshot.sourceText.slice(target.source.from, target.source.to),
		blockId: target.blockId,
	};
}

function stableBlockPrefix(blockId: string): string {
	return `${blockId.split('-').slice(0, -1).join('-')}-`;
}

function formatVersion(template: string, current: number, total: number): string {
	return template
		.replace('{current}', String(current))
		.replace('{total}', String(total));
}

function formatHistoryDate(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).format(new Date(timestamp));
}
