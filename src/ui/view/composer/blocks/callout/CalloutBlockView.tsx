import * as React from 'react';
import { AlertTriangle, CircleHelp, Info, Lightbulb, MessageSquare, Sparkles } from 'lucide-react';
import type { ComposerBlock, ComposerDocumentSnapshot } from '@/core/composer';
import { EditableText } from '../../chrome/EditableText';
import { presentCallout, type CalloutTextRange } from './calloutPresentation';

export function CalloutBlockView({
	block,
	snapshot,
	editing,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	editing: boolean;
}): React.ReactElement {
	const callout = presentCallout(snapshot, block);
	return (
		<div className="pk-composer-callout" data-callout-type={callout.type}>
			<div className="pk-composer-callout__title">
				<CalloutIcon type={callout.type} />
				<CalloutEditableText
					block={block}
					snapshot={snapshot}
					range={callout.title}
					editing={editing}
					className="pk-composer-callout__title-text"
				/>
			</div>
			<div className="pk-composer-callout__body">
				{callout.body.map((range, index) => (
					<CalloutEditableText
						key={`${range.from}-${index}`}
						block={block}
						snapshot={snapshot}
						range={range}
						editing={editing}
						className="pk-composer-callout__body-text"
					/>
				))}
			</div>
		</div>
	);
}

function CalloutEditableText({
	block,
	snapshot,
	range,
	editing,
	className,
}: {
	block: ComposerBlock;
	snapshot: ComposerDocumentSnapshot;
	range: CalloutTextRange;
	editing: boolean;
	className: string;
}): React.ReactElement {
	return (
		<EditableText
			blockId={block.blockId}
			text={range.text}
			sourceFrom={range.from}
			editable={editing}
			className={className}
			resolveRange={() => resolveCurrentCalloutRange(snapshot, block.blockId, range)}
		/>
	);
}

function resolveCurrentCalloutRange(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	original: CalloutTextRange,
) {
	const block = locateBlock(snapshot, blockId);
	if (!block) return null;
	const current = presentCallout(snapshot, block);
	const next = original.part === 'title'
		? current.title
		: current.body[original.index] ?? current.body[current.body.length - 1];
	if (!next) return null;
	return {
		from: next.from,
		to: next.to,
		current: snapshot.sourceText.slice(next.from, next.to),
		target: { kind: 'block' as const, blockId: block.blockId },
		normalizeInput: (text: string) => {
			if (next.requiresLeadingSpace && text) return ` ${text}`;
			if (next.requiresBodyLine) return `\n> ${text}`;
			return text;
		},
	};
}

function locateBlock(snapshot: ComposerDocumentSnapshot, blockId: string): ComposerBlock | undefined {
	const exact = snapshot.blocks.find((block) => block.blockId === blockId);
	if (exact) return exact;
	const prefix = blockId.split('-').slice(0, -1).join('-') + '-';
	return snapshot.blocks.find((block) => block.blockId.startsWith(prefix));
}

function CalloutIcon({ type }: { type: string }): React.ReactElement {
	const Icon = iconFor(type);
	return <Icon className="pk-composer-callout__icon" size={16} aria-hidden />;
}

function iconFor(type: string) {
	if (type === 'tip' || type === 'abstract') return Sparkles;
	if (type === 'warning' || type === 'danger' || type === 'failure') return AlertTriangle;
	if (type === 'question') return CircleHelp;
	if (type === 'info') return Info;
	if (type === 'note') return MessageSquare;
	return Lightbulb;
}
