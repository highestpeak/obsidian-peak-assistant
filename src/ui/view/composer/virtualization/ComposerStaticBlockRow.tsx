import * as React from 'react';
import type { ComposerBlock, ComposerDocumentSnapshot } from '@/core/composer';
import {
	headingTextStart,
	listItemContentStart,
	listItemOwnContentEnd,
	type ComposerComment,
	type HiddenSourceRange,
} from '@/service/composer';
import { CalloutBlockView } from '../blocks/callout/CalloutBlockView';
import { CommentAnchorMarker } from '../chrome/CommentPanel';
import { StaticEditableText } from '../chrome/EditableText';

/**
 * Low-allocation visual shell for ordinary rows in a long document.
 *
 * Keeping only the text leaf static is insufficient: ComposerBlockRow also
 * owns surface timers, effects, rails, SVG controls and review plumbing. Fast
 * virtual traversal can exhaust Chromium CppHeap through that allocation rate
 * even while the simultaneous row count stays bounded. This component retains
 * exact Markdown/link projection and geometry, then yields to the complete row
 * only when the root policy identifies real interactive state.
 */
export function ComposerStaticBlockRow({
	block,
	snapshot,
	folded,
	spacing,
	emptyPreview,
	comments,
	activeCommentId,
	commentLabel,
	onActiveComment,
	onRequestEditor,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	folded: boolean;
	spacing: string;
	emptyPreview: string;
	comments: readonly ComposerComment[];
	activeCommentId: string | null;
	commentLabel: string;
	onActiveComment: (commentId: string) => void;
	onRequestEditor?: (event: React.MouseEvent<HTMLDivElement>) => void;
}): React.ReactElement {
	const isHeading = block.kind === 'heading';
	const unitized = block.kind === 'list' ||
		block.kind === 'task' ||
		(block.kind === 'paragraph' && block.units.length > 1);
	return (
		<div
			className="pk-composer-block pk-composer-block--static"
			data-kind={block.kind}
			data-block-id={block.blockId}
			data-folded={folded}
			data-level={isHeading ? block.renderModel.level ?? 1 : undefined}
			data-spacing={spacing}
			data-unitized={unitized ? 'true' : undefined}
			data-static-block-row="true"
			onClick={onRequestEditor}
		>
			<div className="pk-composer-block__body">
				<CommentAnchorMarker
					comments={comments}
					activeCommentId={activeCommentId}
					label={commentLabel}
					onActivate={onActiveComment}
				/>
				{!isHeading && folded ? (
					<div className="pk-composer-summary">{block.renderModel.text || emptyPreview}</div>
				) : (
					<StaticBlockBody block={block} snapshot={snapshot} />
				)}
			</div>
		</div>
	);
}

function StaticBlockBody({
	block,
	snapshot,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
}): React.ReactElement {
	if (block.kind === 'list' || block.kind === 'task') {
		return <StaticListBody block={block} snapshot={snapshot} />;
	}
	if (block.kind === 'callout') {
		return <CalloutBlockView block={block} snapshot={snapshot} editing={false} />;
	}
	if (
		block.kind === 'paragraph' &&
		block.units.filter((unit) => unit.unitKind === 'paragraph-line').length > 1
	) {
		return <StaticParagraphLinesBody block={block} snapshot={snapshot} />;
	}
	return <StaticTextBody block={block} snapshot={snapshot} />;
}

function StaticParagraphLinesBody({
	block,
	snapshot,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
}): React.ReactElement {
	const lines = block.units.filter((unit) => unit.unitKind === 'paragraph-line');
	return (
		<div className="pk-composer-paragraph-lines" data-block-id={block.blockId}>
			{lines.map((line) => (
				<div
					key={line.unitId}
					className="pk-composer-paragraph__line"
					data-unit-id={line.unitId}
				>
					<StaticEditableText
						blockId={block.blockId}
						unitId={line.unitId}
						text={snapshot.sourceText.slice(line.from, line.to)}
						sourceFrom={line.from}
						className="pk-composer-prose pk-composer-paragraph__line-text"
					/>
				</div>
			))}
		</div>
	);
}

function StaticTextBody({
	block,
	snapshot,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
}): React.ReactElement {
	const isHeading = block.kind === 'heading';
	const isQuote = block.kind === 'quote';
	const textStart = isHeading ? headingTextStart(snapshot.sourceText, block.source) : block.source.from;
	const hiddenSourceRanges = isQuote
		? quoteMarkerRanges(snapshot.sourceText, block.source.from, block.source.to)
		: undefined;
	const className = isHeading
		? `pk-composer-heading pk-heading-${block.renderModel.level ?? 1}`
		: blockBodyClass(block.kind);
	return (
		<StaticEditableText
			blockId={block.blockId}
			text={snapshot.sourceText.slice(textStart, block.source.to)}
			sourceFrom={textStart}
			hiddenSourceRanges={hiddenSourceRanges}
			className={className}
		/>
	);
}

function StaticListBody({
	block,
	snapshot,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
}): React.ReactElement {
	const items = block.units.filter((unit) => unit.unitKind === 'list-item');
	return (
		<div className="pk-composer-list" data-block-id={block.blockId}>
			{items.map((unit) => {
				const depth = listItemDepth(unit, items);
				const contentStart = listItemContentStart(snapshot.sourceText, unit);
				const contentEnd = listItemOwnContentEnd(snapshot.sourceText, unit, items);
				const prefix = snapshot.sourceText.slice(unit.from, contentStart);
				const checkbox = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(prefix);
				return (
					<div
						key={unit.unitId}
						className="pk-composer-list__row"
						data-unit-id={unit.unitId}
						data-list-top-level={!unit.parentUnitId ? 'true' : 'false'}
						data-list-depth={depth}
						style={{ '--pk-composer-row-depth': depth } as React.CSSProperties}
					>
						{checkbox ? (
							<input
								type="checkbox"
								className="pk-composer-task-check"
								checked={checkbox[2] !== ' '}
								readOnly
								disabled
								aria-hidden="true"
							/>
						) : (
							<span className="pk-composer-list__bullet" aria-hidden>•</span>
						)}
						<StaticEditableText
							blockId={block.blockId}
							unitId={unit.unitId}
							text={snapshot.sourceText.slice(contentStart, contentEnd)}
							sourceFrom={contentStart}
							className="pk-composer-list__text"
						/>
					</div>
				);
			})}
		</div>
	);
}

function listItemDepth(
	unit: ComposerBlock['units'][number],
	items: readonly ComposerBlock['units'][number][],
): number {
	let depth = 0;
	let parentId = unit.parentUnitId;
	const seen = new Set<string>();
	while (parentId && !seen.has(parentId)) {
		seen.add(parentId);
		depth += 1;
		parentId = items.find((candidate) => candidate.unitId === parentId)?.parentUnitId;
	}
	return depth;
}

function quoteMarkerRanges(sourceText: string, from: number, to: number): HiddenSourceRange[] {
	const ranges: HiddenSourceRange[] = [];
	let cursor = from;
	while (cursor < to) {
		const lineEnd = sourceText.indexOf('\n', cursor);
		const end = lineEnd >= 0 && lineEnd < to ? lineEnd : to;
		const marker = /^>\s?/.exec(sourceText.slice(cursor, end));
		if (marker) ranges.push({ from: cursor, to: cursor + marker[0].length });
		if (lineEnd < 0 || lineEnd >= to) break;
		cursor = lineEnd + 1;
	}
	return ranges;
}

function blockBodyClass(kind: ComposerBlock['kind']): string {
	if (kind === 'quote' || kind === 'callout') return 'pk-composer-quote';
	return 'pk-composer-prose';
}
