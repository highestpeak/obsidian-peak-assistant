import * as React from 'react';
import {
	DirectEditController,
	projectSourceVisualParts,
	type DirectEditRange,
	type HiddenSourceRange,
	type SourceVisualPart,
} from '@/service/composer';
import { useComposerChrome } from './ComposerChromeContext';
import { styleAttrs } from './StyledRuns';
import { InlineMathAtom } from './InlineMathAtom';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';

/**
 * Persisted Markdown leaf adapter.
 *
 * `MarkdownSourceEditor` owns DOM/projection/selection/IME behavior. This
 * wrapper owns only the persisted transaction contract: native bursts,
 * explicit-command flushes, hub history, and object-level structure callbacks.
 */
export interface EditableTextProps {
	blockId: string;
	unitId?: string;
	/** Verbatim source slice this leaf edits. */
	text: string;
	/** Absolute source offset of the slice's first character. */
	sourceFrom: number;
	/** Absolute source ranges that should remain in DOM text but not be visible. */
	hiddenSourceRanges?: readonly HiddenSourceRange[];
	editable: boolean;
	/** Resolve the CURRENT range for a flush (offsets shift after each commit). */
	resolveRange: () => DirectEditRange | null;
	className?: string;
	/** Structural Enter handler for object-owned text, such as one list item. */
	onInsertParagraph?: () => void | Promise<void>;
	/** Structure-owned Tab handler because a list marker is outside this leaf. */
	onIndentListItem?: (outdent: boolean) => boolean;
}

export function EditableText({
	blockId,
	unitId,
	text,
	sourceFrom,
	hiddenSourceRanges,
	editable,
	resolveRange,
	className,
	onInsertParagraph,
	onIndentListItem,
}: EditableTextProps): React.ReactElement {
	const {
		runtime,
		config,
		burstWindowMs,
		registerFlusher,
	} = useComposerChrome();
	const hub = runtime.hub;
	const resolveRef = React.useRef(resolveRange);
	resolveRef.current = resolveRange;
	const controllerRef = React.useRef<DirectEditController | null>(null);
	if (!controllerRef.current && hub) {
		controllerRef.current = new DirectEditController({
			hub,
			resolveRange: () => resolveRef.current(),
			label: config.chrome.actions.directEdit,
			burstWindowMs,
		});
	}
	const controller = controllerRef.current;

	React.useEffect(() => {
		if (!controller) return;
		const unregister = registerFlusher(() => controller.flush());
		return () => {
			unregister();
			controller.dispose();
		};
	}, [controller, registerFlusher]);

	const canEdit = editable && Boolean(hub);
	if (!canEdit || !controller || !hub) {
		const visualParts = projectSourceVisualParts(text, sourceFrom, {
			hiddenRanges: hiddenSourceRanges,
			mathMode: 'atom',
		});
		return (
			<div
				className={className ? `pk-composer-editable ${className}` : 'pk-composer-editable'}
				data-block-id={blockId}
				data-unit-id={unitId}
				data-src-text-from={sourceFrom}
			>
				{visualParts.map((part) => (
					<SourceVisualPartView
						key={`${part.from - sourceFrom}-${part.to - sourceFrom}-${part.kind}`}
						part={part}
						unitId={unitId}
					/>
				))}
			</div>
		);
	}

	return (
		<MarkdownSourceEditor
			value={text}
			sourceFrom={sourceFrom}
			hiddenSourceRanges={hiddenSourceRanges}
			className={className}
			blockId={blockId}
			unitId={unitId}
			mathModeWhenBlurred="atom"
			onSourceChange={(next, meta) => {
				controller.onInput(next);
				if (meta.kind !== 'native') void controller.flush();
			}}
			onCompositionChange={(composing) => controller.setComposing(composing)}
			onBlur={() => controller.endSession()}
			onHistory={(redo) => {
				if (controller.dirty) return false;
				if (redo) void hub.redo();
				else void hub.undo();
				return true;
			}}
			onInsertParagraph={
				onInsertParagraph
					? () => {
							void (async () => {
								await controller.flush();
								await onInsertParagraph();
							})();
							return true;
						}
					: undefined
			}
			onIndentListItem={onIndentListItem}
			suspendExternalSync={() => controller.dirty}
		/>
	);
}

export function SourceVisualPartView({
	part,
	unitId,
}: {
	part: SourceVisualPart;
	unitId?: string;
}): React.ReactElement {
	if (part.kind === 'hidden') {
		return (
			<span
				className="pk-composer-source-token"
				contentEditable={false}
				data-src-token-from={part.from}
				data-src-token-to={part.to}
				aria-hidden="true"
			>
				{part.text}
			</span>
		);
	}
	if (part.kind === 'math') {
		return <InlineMathAtom latex={part.latex} sourceFrom={part.from} sourceTo={part.to} />;
	}
	const { className, style } = styleAttrs(part.style);
	if (part.linkTarget) {
		const linkClass = [
			'pk-composer-link',
			part.linkKind === 'wikilink' ? 'pk-composer-wikilink' : '',
			className ?? '',
		].filter(Boolean).join(' ');
		return (
			<span
				className={linkClass}
				style={style}
				data-src-text-from={part.from}
				data-unit-id={unitId}
				data-link-target={part.linkTarget}
				data-link-kind={part.linkKind}
				data-src-link-from={part.linkRange?.from}
				data-src-link-to={part.linkRange?.to}
				tabIndex={0}
			>
				{part.text}
			</span>
		);
	}
	return (
		<span className={className} style={style} data-src-text-from={part.from} data-unit-id={unitId}>
			{part.text}
		</span>
	);
}
