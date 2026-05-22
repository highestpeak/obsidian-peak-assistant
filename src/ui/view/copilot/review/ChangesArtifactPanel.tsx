import React, { useMemo } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import { diffLines, type LineOp } from '@/ui/component/diff/lineDiff';
import type { ChangeArtifact, ChangeBlockArtifact } from '@/service/copilot/CopilotRunArtifacts';

interface ChangesPanelProps {
	changes: ChangeArtifact[];
	/** Block ids that the user explicitly deselected. */
	deselectedBlockIds?: Set<string>;
	/** Toggle selection state for one block. */
	onToggleBlock?: (blockId: string) => void;
	/** Original document content. Required for whole-document view; falls back to block-only diff if missing. */
	originalContent?: string;
	/** Which view to render. Controlled by parent (shell). Defaults to 'blocks'. */
	viewMode?: 'whole-doc' | 'blocks';
}

// ─── Per-block diff (fallback when originalContent missing) ──────────────────

const PerBlockDiff: React.FC<{
	block: ChangeBlockArtifact;
	deselected: boolean;
	onAccept?: (blockId: string) => void;
	onReject?: (blockId: string) => void;
}> = ({ block, deselected, onAccept, onReject }) => {
	const ops = useMemo(() => diffLines(block.before, block.after), [block.before, block.after]);
	return (
		<BlockCard
			heading={block.heading?.trim() || 'Proposed change'}
			deselected={deselected}
			onAccept={onAccept ? () => onAccept(block.id) : undefined}
			onReject={onReject ? () => onReject(block.id) : undefined}
			editCount={ops.filter(o => o.type !== 'equal').length}
		>
			<DiffLineList ops={ops} dimmed={deselected} />
		</BlockCard>
	);
};

// ─── Whole-document view ─────────────────────────────────────────────────────

interface DocSegment {
	type: 'unchanged' | 'block';
	originalStart: number; // 1-based original line number where this segment starts
	originalLines: string[]; // original lines in this segment (verbatim)
	// Only present when type === 'block'
	block?: ChangeBlockArtifact;
	change?: ChangeArtifact;
	proposedLines?: string[]; // lines from block.after
}

/**
 * Split the original document into segments: unchanged stretches interleaved
 * with the change blocks (in document order). For each block, locate its
 * `before` text inside the original; if not found, append the block at the end.
 */
function buildSegments(originalContent: string, changes: ChangeArtifact[]): DocSegment[] {
	const flat = changes.flatMap(c => c.blocks.map(b => ({ block: b, change: c })));

	type Match = { block: ChangeBlockArtifact; change: ChangeArtifact; charStart: number; charEnd: number };
	const matches: Match[] = [];
	const taken: Array<{ start: number; end: number }> = [];

	function overlaps(s: number, e: number): boolean {
		return taken.some(t => !(e <= t.start || s >= t.end));
	}

	for (const { block, change } of flat) {
		if (!block.before) {
			// Pure insertion — append at end via charStart=originalContent.length
			matches.push({ block, change, charStart: originalContent.length, charEnd: originalContent.length });
			continue;
		}
		// Find first non-overlapping occurrence.
		let from = 0;
		while (from < originalContent.length) {
			const idx = originalContent.indexOf(block.before, from);
			if (idx < 0) break;
			const end = idx + block.before.length;
			if (!overlaps(idx, end)) {
				matches.push({ block, change, charStart: idx, charEnd: end });
				taken.push({ start: idx, end });
				break;
			}
			from = idx + 1;
		}
	}

	// Sort by char position (ascending). Stable for same-position items.
	matches.sort((a, b) => a.charStart - b.charStart);

	const segments: DocSegment[] = [];
	const lineOffsets = computeLineOffsets(originalContent);
	let cursorChar = 0;

	for (const m of matches) {
		// Unchanged segment before this match
		if (m.charStart > cursorChar) {
			const text = originalContent.slice(cursorChar, m.charStart);
			segments.push({
				type: 'unchanged',
				originalStart: charToLine(cursorChar, lineOffsets),
				originalLines: splitLinesPreserve(text),
			});
		}
		segments.push({
			type: 'block',
			originalStart: charToLine(m.charStart, lineOffsets),
			originalLines: splitLinesPreserve(originalContent.slice(m.charStart, m.charEnd)),
			block: m.block,
			change: m.change,
			proposedLines: splitLinesPreserve(m.block.after),
		});
		cursorChar = m.charEnd;
	}
	// Trailing unchanged segment
	if (cursorChar < originalContent.length) {
		const text = originalContent.slice(cursorChar);
		segments.push({
			type: 'unchanged',
			originalStart: charToLine(cursorChar, lineOffsets),
			originalLines: splitLinesPreserve(text),
		});
	}

	return segments;
}

function splitLinesPreserve(text: string): string[] {
	if (text.length === 0) return [];
	return text.replace(/\r\n/g, '\n').split('\n');
}

function computeLineOffsets(content: string): number[] {
	const offsets: number[] = [0];
	for (let i = 0; i < content.length; i++) {
		if (content[i] === '\n') offsets.push(i + 1);
	}
	return offsets;
}

function charToLine(charIdx: number, offsets: number[]): number {
	// Binary search: find largest offset <= charIdx; that's its 0-based line; +1 for 1-based.
	let lo = 0, hi = offsets.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (offsets[mid] <= charIdx) lo = mid + 1;
		else hi = mid - 1;
	}
	return hi + 1; // 1-based
}

// ─── Shared rendering primitives ─────────────────────────────────────────────

const LineRow: React.FC<{
	lineNumber: number;
	prefix: ' ' | '+' | '-';
	text: string;
	tone: 'unchanged' | 'added' | 'removed';
	dimmed?: boolean;
}> = ({ lineNumber, prefix, text, tone, dimmed }) => {
	const bg =
		tone === 'added' ? 'pktw-bg-emerald-500/10' :
		tone === 'removed' ? 'pktw-bg-rose-500/10' :
		'';
	const fg =
		tone === 'added' ? 'pktw-text-emerald-800 dark:pktw-text-emerald-300' :
		tone === 'removed' ? 'pktw-text-rose-800 dark:pktw-text-rose-300' :
		'pktw-text-foreground';
	return (
		<div
			className={cn(
				'pktw-grid pktw-min-w-0 pktw-grid-cols-[44px_16px_minmax(0,1fr)] pktw-items-start',
				bg,
				dimmed && tone !== 'unchanged' && 'pktw-opacity-40',
			)}
			style={{ userSelect: 'text' }}
		>
			<span className="pktw-pr-2 pktw-py-0.5 pktw-text-right pktw-font-mono pktw-text-[11px] pktw-text-muted-foreground/70 pktw-tabular-nums pktw-select-none">
				{lineNumber}
			</span>
			<span className="pktw-py-0.5 pktw-text-center pktw-font-mono pktw-text-[11px] pktw-text-muted-foreground pktw-select-none">
				{prefix}
			</span>
			<span
				className={cn('pktw-py-0.5 pktw-pl-1 pktw-pr-3 pktw-whitespace-pre-wrap pktw-break-words pktw-font-mono pktw-text-[12px] pktw-leading-relaxed', fg)}
				style={{ userSelect: 'text' }}
			>
				{text.length === 0 ? ' ' : text}
			</span>
		</div>
	);
};

const DiffLineList: React.FC<{ ops: LineOp[]; dimmed?: boolean }> = ({ ops, dimmed }) => {
	let lineNo = 1;
	return (
		<div className="pktw-flex pktw-flex-col">
			{ops.map((op, i) => {
				const tone = op.type === 'added' ? 'added' : op.type === 'removed' ? 'removed' : 'unchanged';
				const prefix = op.type === 'added' ? '+' : op.type === 'removed' ? '-' : ' ';
				const ln = lineNo++;
				return <LineRow key={i} lineNumber={ln} prefix={prefix} text={op.text} tone={tone} dimmed={dimmed} />;
			})}
		</div>
	);
};

const AcceptRejectButtons: React.FC<{
	deselected: boolean;
	onAccept?: () => void;
	onReject?: () => void;
}> = ({ deselected, onAccept, onReject }) => {
	if (!onAccept && !onReject) return null;
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1">
			<Button
				size="sm"
				variant={!deselected ? 'default' : 'outline'}
				className={cn(
					'pktw-h-7 pktw-gap-1 pktw-px-2 pktw-text-[11px]',
					!deselected && 'pktw-bg-emerald-600 hover:pktw-bg-emerald-700 pktw-text-white',
				)}
				onClick={onAccept}
				title="Accept this change when applying"
			>
				<CheckCircle2 className="pktw-h-3.5 pktw-w-3.5" />
				{!deselected ? 'Accepted' : 'Accept'}
			</Button>
			<Button
				size="sm"
				variant={deselected ? 'default' : 'outline'}
				className={cn(
					'pktw-h-7 pktw-gap-1 pktw-px-2 pktw-text-[11px]',
					deselected && 'pktw-bg-rose-600 hover:pktw-bg-rose-700 pktw-text-white',
				)}
				onClick={onReject}
				title="Skip this change when applying"
			>
				<XCircle className="pktw-h-3.5 pktw-w-3.5" />
				{deselected ? 'Rejected' : 'Reject'}
			</Button>
		</div>
	);
};

const BlockCard: React.FC<{
	heading: string;
	deselected: boolean;
	editCount: number;
	onAccept?: () => void;
	onReject?: () => void;
	children: React.ReactNode;
}> = ({ heading, deselected, editCount, onAccept, onReject, children }) => (
	<div className={cn(
		'pktw-rounded-md pktw-border pktw-border-border pktw-overflow-hidden',
		deselected && 'pktw-opacity-90 pktw-border-dashed',
	)}>
		<div className={cn(
			'pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-border-b pktw-border-border',
			deselected ? 'pktw-bg-muted/40' : 'pktw-bg-pk-accent/5',
		)}>
			<span className="pktw-text-[12px] pktw-font-medium pktw-text-foreground" style={{ userSelect: 'text' }}>
				{heading}
			</span>
			<span className="pktw-flex-1" />
			<span className="pktw-text-[10px] pktw-text-muted-foreground">
				{editCount} edit{editCount === 1 ? '' : 's'}
			</span>
			<AcceptRejectButtons deselected={deselected} onAccept={onAccept} onReject={onReject} />
		</div>
		<div>{children}</div>
	</div>
);

// ─── Whole-document renderer ─────────────────────────────────────────────────

const WholeDocChangesView: React.FC<{
	originalContent: string;
	changes: ChangeArtifact[];
	deselectedBlockIds: Set<string>;
	onAccept?: (blockId: string) => void;
	onReject?: (blockId: string) => void;
}> = ({ originalContent, changes, deselectedBlockIds, onAccept, onReject }) => {
	const segments = useMemo(() => buildSegments(originalContent, changes), [originalContent, changes]);
	let lineCounter = 1;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-0">
			{segments.map((seg, idx) => {
				if (seg.type === 'unchanged') {
					const startLine = lineCounter;
					const rows = seg.originalLines.map((text, i) => {
						const ln = lineCounter++;
						return <LineRow key={`u-${idx}-${i}`} lineNumber={ln} prefix=" " text={text} tone="unchanged" />;
					});
					if (rows.length === 0) return null;
					return (
						<div key={`unchanged-${idx}-${startLine}`} className="pktw-flex pktw-flex-col">
							{rows}
						</div>
					);
				}

				// Block segment
				const block = seg.block!;
				const isDeselected = deselectedBlockIds.has(block.id);
				const heading = block.heading?.trim() || 'Proposed change';

				const removedRows: React.ReactNode[] = [];
				const addedRows: React.ReactNode[] = [];

				if (isDeselected) {
					// When deselected, keep the original lines (skip the change visually).
					seg.originalLines.forEach((text, i) => {
						const ln = lineCounter++;
						removedRows.push(
							<LineRow key={`b-${idx}-orig-${i}`} lineNumber={ln} prefix=" " text={text} tone="unchanged" />,
						);
					});
				} else {
					seg.originalLines.forEach((text, i) => {
						const ln = lineCounter++;
						removedRows.push(
							<LineRow key={`b-${idx}-r-${i}`} lineNumber={ln} prefix="-" text={text} tone="removed" />,
						);
					});
					seg.proposedLines?.forEach((text, i) => {
						const ln = lineCounter++;
						addedRows.push(
							<LineRow key={`b-${idx}-a-${i}`} lineNumber={ln} prefix="+" text={text} tone="added" />,
						);
					});
				}

				return (
					<div
						key={`block-${idx}-${block.id}`}
						className={cn(
							'pktw-my-2 pktw-rounded-md pktw-border',
							isDeselected ? 'pktw-border-dashed pktw-border-muted-foreground/30' : 'pktw-border-pk-accent/30',
						)}
					>
						<div className={cn(
							'pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5',
							isDeselected ? 'pktw-bg-muted/40' : 'pktw-bg-pk-accent/5',
						)}>
							<span className="pktw-text-[12px] pktw-font-medium pktw-text-foreground" style={{ userSelect: 'text' }}>
								{heading}
							</span>
							<span className="pktw-flex-1" />
							<AcceptRejectButtons
								deselected={isDeselected}
								onAccept={onAccept ? () => onAccept(block.id) : undefined}
								onReject={onReject ? () => onReject(block.id) : undefined}
							/>
						</div>
						<div>
							{removedRows}
							{addedRows}
						</div>
					</div>
				);
			})}
		</div>
	);
};

// ─── Top-level panel ─────────────────────────────────────────────────────────

export const ChangesArtifactPanel: React.FC<ChangesPanelProps> = ({
	changes,
	deselectedBlockIds,
	onToggleBlock,
	originalContent,
	viewMode = 'blocks',
}) => {
	const deselected = deselectedBlockIds ?? new Set<string>();
	const hasOriginal = typeof originalContent === 'string' && originalContent.length > 0;

	const accept = (blockId: string) => {
		if (!onToggleBlock) return;
		// Accept = ensure NOT in deselected set. If already accepted, no-op.
		if (deselected.has(blockId)) onToggleBlock(blockId);
	};
	const reject = (blockId: string) => {
		if (!onToggleBlock) return;
		// Reject = ensure IS in deselected set.
		if (!deselected.has(blockId)) onToggleBlock(blockId);
	};

	if (changes.length === 0) {
		return (
			<div className="pktw-flex pktw-h-full pktw-items-center pktw-justify-center pktw-text-sm pktw-text-muted-foreground">
				No document changes were proposed.
			</div>
		);
	}

	return (
		<div
			className="pktw-flex pktw-flex-col pktw-gap-3 pktw-max-w-4xl pktw-mx-auto pktw-w-full pktw-px-4 pktw-py-3"
			style={{ userSelect: 'text' }}
		>
			{viewMode === 'whole-doc' && hasOriginal ? (
				<WholeDocChangesView
					originalContent={originalContent!}
					changes={changes}
					deselectedBlockIds={deselected}
					onAccept={onToggleBlock ? accept : undefined}
					onReject={onToggleBlock ? reject : undefined}
				/>
			) : (
				<div className="pktw-flex pktw-flex-col pktw-gap-4">
					{changes.map(change =>
						change.blocks.map(block => (
							<PerBlockDiff
								key={block.id}
								block={block}
								deselected={deselected.has(block.id)}
								onAccept={onToggleBlock ? accept : undefined}
								onReject={onToggleBlock ? reject : undefined}
							/>
						)),
					)}
				</div>
			)}
		</div>
	);
};
