import * as React from 'react';
import { Sparkles, Square } from 'lucide-react';
import { buildInsertBelowOps, insertDraftSyntax } from '@/service/composer';
import { StreamdownIsolated } from '@/ui/component/mine';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from './ComposerChromeContext';

export interface NewBlockDraftProps {
	blockId: string;
	initialTypeId?: string;
	onDone(): void;
}

type GenerationStatus = 'idle' | 'generating' | 'complete' | 'error';

/**
 * One review-before-write draft for every insert kind.
 *
 * Markdown is the only editable source of truth. Type buttons insert visible
 * syntax, preview uses the shared production renderer, and AI output remains a
 * local candidate until the user explicitly accepts it.
 */
export function NewBlockDraft({
	blockId,
	initialTypeId = 'paragraph',
	onDone,
}: NewBlockDraftProps): React.ReactElement {
	const chrome = useComposerChrome();
	const hub = chrome.runtime.hub;
	const generation = chrome.runtime.blockDraftGeneration;
	const config = chrome.config.chrome.insertDraft;
	const initialType = config.types.find((type) => type.id === initialTypeId) ?? config.types[0];
	const [source, setSource] = React.useState(initialType?.initialValue ?? '');
	const [generatedSource, setGeneratedSource] = React.useState('');
	const [status, setStatus] = React.useState<GenerationStatus>('idle');
	const [committing, setCommitting] = React.useState(false);
	const [error, setError] = React.useState('');
	const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
	const abortRef = React.useRef<AbortController | null>(null);
	const placeholder = initialType?.placeholder ?? '';
	const previewSource =
		(status === 'generating' || status === 'complete') && generatedSource
			? generatedSource
			: source;
	const canWrite = Boolean(previewSource.trim() && hub && chrome.snapshot && !committing && status !== 'generating');
	const canGenerate = Boolean(source.trim() && generation && chrome.snapshot && !committing);

	React.useEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		const frame = input.ownerDocument.defaultView?.requestAnimationFrame(() => {
			input.focus();
			input.setSelectionRange(input.value.length, input.value.length);
		});
		return () => {
			if (frame !== undefined) input.ownerDocument.defaultView?.cancelAnimationFrame(frame);
		};
	}, []);

	React.useEffect(() => () => abortRef.current?.abort(), []);

	const updateSource = (next: string) => {
		abortRef.current?.abort();
		abortRef.current = null;
		setSource(next);
		setGeneratedSource('');
		setStatus('idle');
		setError('');
	};

	const applyShortcut = (type: (typeof config.types)[number]) => {
		const input = inputRef.current;
		const selectionStart = input?.selectionStart ?? source.length;
		const selectionEnd = input?.selectionEnd ?? source.length;
		const next = insertDraftSyntax(
			source,
			selectionStart,
			selectionEnd,
			type.syntaxPrefix,
			type.syntaxSuffix,
		);
		updateSource(next.value);
		const frame = input?.ownerDocument.defaultView?.requestAnimationFrame(() => {
			input.focus();
			input.setSelectionRange(next.selectionStart, next.selectionEnd);
		});
		return () => {
			if (frame !== undefined) input?.ownerDocument.defaultView?.cancelAnimationFrame(frame);
		};
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
		const anchor = chrome.snapshot.blocks.find((block) => block.blockId === blockId);
		const insertionAt = anchor?.source.to ?? chrome.snapshot.sourceText.length;
		let next = '';
		try {
			for await (const event of generation.stream({
				prompt: source.trim(),
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
			// Conflict is surfaced by the shared transaction lifecycle. Keep the
			// draft open so the user never loses uncommitted source.
			setCommitting(false);
		}
	};

	const cancel = () => {
		abortRef.current?.abort();
		onDone();
	};

	return (
		<div
			className="pk-new-block-draft"
			data-chrome="true"
			data-generation-status={status}
			aria-label={config.title}
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
			<div className="pk-new-block-draft__header">
				<span className="pk-new-block-draft__title">{config.title}</span>
				<span className="pk-new-block-draft__description">{config.description}</span>
			</div>
			<div className="pk-new-block-draft__shortcuts" role="group" aria-label={config.chooserLabel}>
				{config.types.filter((type) => type.shortcut).map((type) => (
					<Button
						key={type.id}
						type="button"
						variant="secondary"
						size="sm"
						className="pk-new-block-draft__shortcut"
						onClick={() => applyShortcut(type)}
					>
						{type.label}
					</Button>
				))}
			</div>
			<div className="pk-new-block-draft__workspace">
				<label className="pk-new-block-draft__pane">
					<span className="pk-new-block-draft__pane-label">{config.sourceLabel}</span>
					<textarea
						ref={inputRef}
						className="pk-new-block-draft__input"
						placeholder={placeholder}
						value={source}
						disabled={status === 'generating'}
						onChange={(event) => updateSource(event.target.value)}
					/>
				</label>
				<div className="pk-new-block-draft__pane">
					<span className="pk-new-block-draft__pane-label">{config.previewLabel}</span>
					<div className="pk-new-block-draft__preview" aria-live="polite">
						{previewSource.trim() ? (
							<StreamdownIsolated isAnimating={status === 'generating'}>
								{previewSource}
							</StreamdownIsolated>
						) : (
							<span className="pk-new-block-draft__empty">{config.previewEmpty}</span>
						)}
					</div>
				</div>
			</div>
			{error && <span className="pk-new-block-draft__error" role="alert">{error}</span>}
			<div className="pk-new-block-draft__footer">
				<span className="pk-new-block-draft__hint">{config.shortcutHint}</span>
				<span className="pk-new-block-draft__actions">
					<Button type="button" variant="secondary" size="sm" onClick={cancel} disabled={committing}>
						{config.cancel}
					</Button>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={() => status === 'generating' ? stopGeneration() : void generate()}
						disabled={status !== 'generating' && !canGenerate}
						title={!generation ? config.generationUnavailable : undefined}
					>
						{status === 'generating' ? <Square size={12} /> : <Sparkles size={13} />}
						{status === 'generating' ? config.stop : config.generate}
					</Button>
					<Button type="button" size="sm" onClick={() => void commit()} disabled={!canWrite}>
						{status === 'complete' ? config.acceptGenerated : config.commit}
					</Button>
				</span>
			</div>
		</div>
	);
}
