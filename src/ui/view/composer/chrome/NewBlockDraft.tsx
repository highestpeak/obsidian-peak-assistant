import * as React from 'react';
import {
	FileText,
	Image as ImageIcon,
	Sparkles,
	Square,
} from 'lucide-react';
import {
	buildInsertBelowOps,
	composerDraftEditorKind,
	composerDraftHiddenRanges,
	composerDraftHasContent,
	composerDraftPresentationKind,
	composerDraftReferenceSource,
	composerDraftReferenceTarget,
	hasSourceVisualSyntaxChange,
	insertMarkdownDraftBreak,
	modelToHtml,
	parseTableSource,
	projectSourceVisualParts,
	serializeTable,
	type TableModel,
} from '@/service/composer';
import { StreamdownIsolated } from '@/ui/component/mine';
import { Button } from '@/ui/components/primitives';
import {
	mapDomSelectionToSource,
	restoreDomSelectionFromSource,
	type MappedSelection,
} from './selectionMapping';
import { useComposerChrome } from './ComposerChromeContext';
import { useComposerSurfaces } from './ComposerSurfaceCoordinator';
import { renderContentEditableProjection } from './contentEditableProjection';

export interface NewBlockDraftProps {
	blockId: string;
	initialTypeId?: string;
	onDone(): void;
}

type GenerationStatus = 'idle' | 'generating' | 'complete' | 'error';

/**
 * One inline, review-before-write block at the real insertion anchor.
 *
 * Structural Markdown remains the serialized source of truth, but the default
 * surface edits one live Markdown projection, table cells, or a reference
 * target. Raw Markdown is never presented beside a second preview.
 */
export function NewBlockDraft({
	blockId,
	initialTypeId = 'markdown',
	onDone,
}: NewBlockDraftProps): React.ReactElement {
	const chrome = useComposerChrome();
	const hub = chrome.runtime.hub;
	const generation = chrome.runtime.blockDraftGeneration;
	const config = chrome.config.chrome.insertDraft;
	const type = config.types.find((candidate) => candidate.id === initialTypeId) ?? config.types[0];
	const typeId = type?.id ?? 'markdown';
	const editorKind = composerDraftEditorKind(typeId);
	const [source, setSource] = React.useState(type?.initialValue ?? '');
	const [generatedSource, setGeneratedSource] = React.useState('');
	const [aiPrompt, setAiPrompt] = React.useState('');
	const [aiOpen, setAiOpen] = React.useState(false);
	const [status, setStatus] = React.useState<GenerationStatus>('idle');
	const [committing, setCommitting] = React.useState(false);
	const [error, setError] = React.useState('');
	const abortRef = React.useRef<AbortController | null>(null);
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const surfaces = useComposerSurfaces();
	const claimSurface = surfaces.claim;
	const releaseSurface = surfaces.release;
	const surfaceId = React.useId();
	const previewSource =
		(status === 'generating' || status === 'complete') && generatedSource
			? generatedSource
			: source;
	const canWrite = Boolean(
		composerDraftHasContent(status === 'complete' ? 'ai' : typeId, previewSource) &&
		hub &&
		chrome.snapshot &&
		!committing &&
		status !== 'generating',
	);
	const canGenerate = Boolean(
		aiPrompt.trim() &&
		generation &&
		chrome.snapshot &&
		!committing,
	);

	React.useEffect(() => {
		claimSurface({ id: surfaceId, kind: 'draft', ownerId: blockId });
		return () => releaseSurface(surfaceId);
	}, [blockId, claimSurface, releaseSurface, surfaceId]);
	React.useEffect(() => {
		const root = rootRef.current;
		const ownerWindow = root?.ownerDocument.defaultView;
		if (!root || !ownerWindow) return;
		const frame = ownerWindow.requestAnimationFrame(() => {
			root.querySelector<HTMLElement>('[data-draft-autofocus="true"]')?.focus();
		});
		return () => ownerWindow.cancelAnimationFrame(frame);
	}, []);
	React.useEffect(() => () => abortRef.current?.abort(), []);

	const updateSource = (next: string) => {
		abortRef.current?.abort();
		abortRef.current = null;
		setGeneratedSource('');
		setStatus('idle');
		setError('');
		setSource(next);
	};
	const stopGeneration = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		setStatus('idle');
		setGeneratedSource('');
	};
	const generate = async () => {
		if (!canGenerate || !generation || !chrome.snapshot) return;
		const controller = new AbortController();
		abortRef.current?.abort();
		abortRef.current = controller;
		setGeneratedSource('');
		setError('');
		setStatus('generating');
		const anchor = chrome.snapshot.blocks.find((candidate) => candidate.blockId === blockId);
		const insertionAt = anchor?.source.to ?? chrome.snapshot.sourceText.length;
		let next = '';
		try {
			for await (const event of generation.stream({
				prompt: aiPrompt.trim(),
				targetSource: chrome.snapshot.sourceText,
				before: chrome.snapshot.sourceText.slice(0, insertionAt),
				after: chrome.snapshot.sourceText.slice(insertionAt),
				signal: controller.signal,
			})) {
				if (event.type !== 'text-delta') continue;
				next += event.text;
				setGeneratedSource(next);
			}
			if (controller.signal.aborted) return;
			setStatus(next.trim() ? 'complete' : 'error');
			if (!next.trim()) setError(config.generationFailed);
		} catch {
			if (controller.signal.aborted) return;
			setStatus('error');
			setError(config.generationFailed);
		} finally {
			if (abortRef.current === controller) abortRef.current = null;
		}
	};
	const commit = async () => {
		if (!canWrite || !hub || !chrome.snapshot) return;
		const built = buildInsertBelowOps(chrome.snapshot, blockId, previewSource);
		if (!built) return;
		setCommitting(true);
		try {
			await hub.commit({
				origin: 'direct',
				label: chrome.config.chrome.actions.insertBelow,
				operations: built.operations,
				target: built.target,
				expectedBlockDelta: built.expectedBlockDelta,
			});
			onDone();
		} catch {
			setCommitting(false);
		}
	};
	const cancel = () => {
		abortRef.current?.abort();
		onDone();
	};

	return (
		<div
			ref={rootRef}
			className="pk-new-block-draft"
			data-chrome="true"
			data-draft-kind={editorKind}
			data-draft-type={typeId}
			data-generation-status={status}
			aria-label={`${config.chooserLabel} · ${type?.label ?? typeId}`}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					cancel();
					return;
				}
				if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
					event.preventDefault();
					void commit();
				}
			}}
		>
			<div className="pk-new-block-draft__workspace">
				{(status === 'generating' || status === 'complete') && generatedSource ? (
					<div className="pk-new-block-draft__generated" aria-live="polite">
						<StreamdownIsolated isAnimating={status === 'generating'}>
							{generatedSource}
						</StreamdownIsolated>
					</div>
				) : (
					<DraftEditor
						typeId={typeId}
						typeLabel={type?.label ?? typeId}
						source={source}
						placeholder={type?.placeholder ?? ''}
						onSource={updateSource}
					/>
				)}
			</div>
			{aiOpen && (
				<div className="pk-new-block-draft__ai" data-composer-surface-owner={blockId}>
					<Sparkles size={14} aria-hidden />
					<input
						autoFocus
						value={aiPrompt}
						placeholder={config.generationPlaceholder}
						onChange={(event) => setAiPrompt(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
							event.preventDefault();
							void generate();
						}}
					/>
					<Button
						variant="secondary"
						size="sm"
						disabled={status !== 'generating' && !canGenerate}
						title={!generation ? config.generationUnavailable : undefined}
						onClick={() => status === 'generating' ? stopGeneration() : void generate()}
					>
						{status === 'generating' ? <Square size={12} /> : <Sparkles size={13} />}
						{status === 'generating' ? config.stop : config.generate}
					</Button>
				</div>
			)}
			{error && <span className="pk-new-block-draft__error" role="alert">{error}</span>}
			<div className="pk-new-block-draft__footer">
				<span className="pk-new-block-draft__hint">{config.shortcutHint}</span>
				<span className="pk-new-block-draft__actions">
					<Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={committing}>
						{config.cancel}
					</Button>
					{editorKind !== 'ai' && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							data-active={aiOpen || undefined}
							onClick={() => setAiOpen((open) => !open)}
						>
							<Sparkles size={13} />
							{config.generate}
						</Button>
					)}
					<Button type="button" size="sm" onClick={() => void commit()} disabled={!canWrite}>
						{status === 'complete' ? config.acceptGenerated : config.commit}
					</Button>
				</span>
			</div>
		</div>
	);
}

function DraftEditor({
	typeId,
	typeLabel,
	source,
	placeholder,
	onSource,
}: {
	typeId: string;
	typeLabel: string;
	source: string;
	placeholder: string;
	onSource(source: string): void;
}): React.ReactElement {
	const kind = composerDraftEditorKind(typeId);
	if (kind === 'table') {
		return <DraftTableEditor source={source} onSource={onSource} />;
	}
	if (kind === 'reference') {
		return (
			<DraftReferenceEditor
				typeId={typeId}
				typeLabel={typeLabel}
				source={source}
				placeholder={placeholder}
				onSource={onSource}
			/>
		);
	}
	const presentationKind = composerDraftPresentationKind(source);
	return (
		<div
			className="pk-new-block-draft__visual"
			data-markdown-kind={presentationKind}
		>
			<VisualDraftTextEditor
				value={source}
				placeholder={placeholder}
				onChange={onSource}
			/>
		</div>
	);
}

function VisualDraftTextEditor({
	value,
	placeholder,
	onChange,
}: {
	value: string;
	placeholder: string;
	onChange(value: string): void;
}): React.ReactElement {
	const ref = React.useRef<HTMLDivElement | null>(null);
	const pendingSelection = React.useRef<MappedSelection | null>(null);
	const focused = React.useRef(false);
	const composing = React.useRef(false);
	// Replace the projected subtree only when Markdown structure changes. This
	// avoids React rendering a second copy beside contentEditable's native DOM.
	const [projection, setProjection] = React.useState({ text: value, version: 0 });
	const projectionRef = React.useRef(projection);
	projectionRef.current = projection;
	const hiddenRanges = React.useMemo(
		() => composerDraftHiddenRanges(projection.text),
		[projection.text],
	);
	const parts = React.useMemo(
		() => projectSourceVisualParts(projection.text, 0, {
			hiddenRanges,
			mathMode: 'source',
		}),
		[hiddenRanges, projection.text],
	);
	const projectionHtml = React.useMemo(
		() => renderContentEditableProjection(parts, undefined, hiddenRanges),
		[hiddenRanges, parts],
	);
	const project = (next: string, selection: MappedSelection | null) => {
		pendingSelection.current = selection;
		setProjection((current) => ({
			text: next,
			version: current.version + 1,
		}));
	};
	React.useLayoutEffect(() => {
		const el = ref.current;
		const pending = pendingSelection.current;
		if (!el || !pending || !focused.current) return;
		el.focus({ preventScroll: true });
		restoreDomSelectionFromSource(el, pending);
		pendingSelection.current = null;
	}, [projection]);
	React.useLayoutEffect(() => {
		if (projectionRef.current.text === value) return;
		if (focused.current) {
			const beforeKind = composerDraftPresentationKind(projectionRef.current.text);
			const afterKind = composerDraftPresentationKind(value);
			const beforeHidden = composerDraftHiddenRanges(projectionRef.current.text);
			const afterHidden = composerDraftHiddenRanges(value);
			if (beforeKind === afterKind && JSON.stringify(beforeHidden) === JSON.stringify(afterHidden)) {
				return;
			}
			const el = ref.current;
			const selection = el?.ownerDocument.getSelection();
			project(value, el && selection ? mapDomSelectionToSource(el, selection) : null);
			return;
		}
		setProjection((current) => ({
			text: value,
			version: current.version + 1,
		}));
	}, [value]);
	const handleInput = () => {
		const el = ref.current;
		if (!el) return;
		const next = el.textContent ?? '';
		onChange(next);
		if (composing.current) return;
		const nextHiddenRanges = composerDraftHiddenRanges(next);
		const hiddenRangesChanged =
			JSON.stringify(hiddenRanges) !== JSON.stringify(nextHiddenRanges);
		if (!hiddenRangesChanged && !hasSourceVisualSyntaxChange(
			projectionRef.current.text,
			next,
			0,
			{ hiddenRanges: nextHiddenRanges, mathMode: 'source' },
		)) return;
		const selection = el.ownerDocument.getSelection();
		project(next, selection ? mapDomSelectionToSource(el, selection) : null);
	};
	const insertBreak = (soft: boolean) => {
		const el = ref.current;
		if (!el) return;
		const selection = el.ownerDocument.getSelection();
		const mapped = selection ? mapDomSelectionToSource(el, selection) : null;
		if (!mapped) return;
		const liveText = el.textContent ?? '';
		const edit = insertMarkdownDraftBreak(liveText, mapped.from, mapped.to, soft);
		const nextSelection: MappedSelection = {
			from: edit.selectionStart,
			to: edit.selectionEnd,
			anchor: edit.selectionStart,
			focus: edit.selectionEnd,
			direction: 'collapsed',
		};
		onChange(edit.value);
		project(edit.value, nextSelection);
	};
	return (
		<div
			ref={ref}
			className="pk-new-block-draft__editor pk-composer-editable"
			contentEditable
			suppressContentEditableWarning
			spellCheck={false}
			data-draft-autofocus="true"
			data-placeholder={placeholder}
			data-src-text-from={0}
			onInput={handleInput}
			onBeforeInput={(event) => {
				const native = event.nativeEvent as InputEvent;
				if (native.inputType !== 'insertParagraph' && native.inputType !== 'insertLineBreak') {
					return;
				}
				event.preventDefault();
				if (native.isComposing) return;
				insertBreak(native.inputType === 'insertLineBreak');
			}}
			onFocus={() => {
				focused.current = true;
			}}
			onBlur={() => {
				const next = ref.current?.textContent ?? value;
				focused.current = false;
				pendingSelection.current = null;
				onChange(next);
				if (projectionRef.current.text === next) return;
				setProjection((current) => ({
					text: next,
					version: current.version + 1,
				}));
			}}
			onCompositionStart={() => {
				composing.current = true;
			}}
			onCompositionEnd={() => {
				composing.current = false;
				handleInput();
			}}
			onKeyDown={(event) => {
				if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
				if (event.metaKey || event.ctrlKey) return;
				event.preventDefault();
				insertBreak(event.shiftKey);
			}}
			dangerouslySetInnerHTML={{ __html: projectionHtml }}
		/>
	);
}

function DraftTableEditor({
	source,
	onSource,
}: {
	source: string;
	onSource(source: string): void;
}): React.ReactElement {
	const model = React.useMemo(() => safeDraftTable(source), [source]);
	if (!model) return <span className="pk-new-block-draft__invalid">{source}</span>;
	const updateCell = (rowIndex: number, cellIndex: number, text: string) => {
		const next: TableModel = {
			...model,
			rows: model.rows.map((row, currentRow) => currentRow === rowIndex
				? {
						...row,
						cells: row.cells.map((cell, currentCell) =>
							currentCell === cellIndex ? { ...cell, text } : cell),
					}
				: row),
		};
		onSource(serializeTable(next, modelToHtml));
	};
	return (
		<div className="pk-new-block-draft__table-wrap">
			<table className="pk-composer-table pk-new-block-draft__table">
				<tbody>
					{model.rows.map((row, rowIndex) => (
						<tr key={rowIndex}>
							{row.cells.map((cell, cellIndex) => {
								const Tag = row.isHeader ? 'th' : 'td';
								return (
									<Tag key={cellIndex}>
										<input
											data-draft-autofocus={rowIndex === 0 && cellIndex === 0 ? 'true' : undefined}
											value={cell.text}
											onChange={(event) => updateCell(rowIndex, cellIndex, event.currentTarget.value)}
										/>
									</Tag>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function safeDraftTable(source: string): TableModel | null {
	try {
		return parseTableSource(source);
	} catch {
		return null;
	}
}

function DraftReferenceEditor({
	typeId,
	typeLabel,
	source,
	placeholder,
	onSource,
}: {
	typeId: string;
	typeLabel: string;
	source: string;
	placeholder: string;
	onSource(source: string): void;
}): React.ReactElement {
	const target = composerDraftReferenceTarget(source);
	return (
		<div className="pk-new-block-draft__reference">
			<span className="pk-new-block-draft__reference-icon" aria-hidden>
				{typeId === 'image' ? <ImageIcon size={20} /> : <FileText size={20} />}
			</span>
			<span className="pk-new-block-draft__reference-body">
				<span className="pk-new-block-draft__reference-kind">{typeLabel}</span>
				<input
					data-draft-autofocus="true"
					value={target}
					placeholder={placeholder}
					onChange={(event) => onSource(composerDraftReferenceSource(event.currentTarget.value))}
				/>
			</span>
		</div>
	);
}
