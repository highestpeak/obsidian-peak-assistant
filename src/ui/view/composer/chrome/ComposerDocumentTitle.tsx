import * as React from 'react';
import { Pencil } from 'lucide-react';
import {
	composerDocumentTitle,
	normalizeComposerDocumentTitleDraft,
} from '@/core/composer';
import { Button } from '@/ui/component/shared-ui/button';
import type { ComposerChromeConfig } from '../config/composerConfig';

interface ComposerDocumentTitleProps {
	filePath: string;
	strings: ComposerChromeConfig['documentTitle'];
	onRename?: (title: string) => void | Promise<void>;
}

interface ComposerTitleEditorProps {
	busy: boolean;
	draft: string;
	error: string | null;
	errorId: string;
	inputRef: React.RefObject<HTMLInputElement>;
	strings: ComposerChromeConfig['documentTitle'];
	onBlur(): void;
	onCancel(): void;
	onChange(value: string): void;
	onSubmit(): void;
}

export function ComposerDocumentTitle({
	filePath,
	strings,
	onRename,
}: ComposerDocumentTitleProps): React.ReactElement {
	const currentTitle = composerDocumentTitle(filePath);
	const [editing, setEditing] = React.useState(false);
	const [draft, setDraft] = React.useState(currentTitle);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const submittingRef = React.useRef(false);
	const cancellingRef = React.useRef(false);
	const errorId = React.useId();

	React.useEffect(() => {
		if (editing) return;
		setDraft(currentTitle);
		setError(null);
	}, [currentTitle, editing]);

	React.useEffect(() => {
		if (!editing) return;
		inputRef.current?.focus();
		inputRef.current?.select();
	}, [editing]);

	function startEditing(): void {
		if (!onRename) return;
		cancellingRef.current = false;
		setDraft(currentTitle);
		setError(null);
		setEditing(true);
	}

	function cancelEditing(): void {
		if (submittingRef.current) return;
		cancellingRef.current = true;
		setDraft(currentTitle);
		setError(null);
		setEditing(false);
	}

	async function submitEditing(): Promise<void> {
		if (!onRename || submittingRef.current || cancellingRef.current) return;
		const normalized = normalizeComposerDocumentTitleDraft(draft);
		if (!normalized.ok) {
			setError(normalized.reason === 'empty' ? strings.empty : strings.pathSeparator);
			return;
		}
		if (normalized.title === currentTitle) {
			setEditing(false);
			return;
		}
		submittingRef.current = true;
		setBusy(true);
		setError(null);
		try {
			await onRename(normalized.title);
			setEditing(false);
		} catch {
			setError(strings.renameFailed);
		} finally {
			submittingRef.current = false;
			setBusy(false);
		}
	}

	function handleBlur(): void {
		if (cancellingRef.current) return;
		void submitEditing();
	}

	return (
		<span className="pk-composer-document-title-heading" role="heading" aria-level={1}>
			{editing ? (
				<ComposerTitleEditor
					busy={busy}
					draft={draft}
					error={error}
					errorId={errorId}
					inputRef={inputRef}
					strings={strings}
					onBlur={handleBlur}
					onCancel={cancelEditing}
					onChange={(value) => {
						setDraft(value);
						setError(null);
					}}
					onSubmit={() => void submitEditing()}
				/>
			) : (
				<ComposerTitleDisplay
					title={currentTitle}
					editable={Boolean(onRename)}
					editLabel={strings.edit}
					onStartEditing={startEditing}
				/>
			)}
		</span>
	);
}

function ComposerTitleDisplay({
	title,
	editable,
	editLabel,
	onStartEditing,
}: {
	title: string;
	editable: boolean;
	editLabel: string;
	onStartEditing(): void;
}): React.ReactElement {
	if (!editable) return <span className="pk-composer-document-title">{title}</span>;
	return (
		<Button
			type="button"
			variant="unstyled"
			size="xs"
			className="pk-composer-document-title"
			aria-label={`${editLabel}: ${title}`}
			title={editLabel}
			onClick={onStartEditing}
		>
			<span className="pk-composer-document-title__text">{title}</span>
			<Pencil className="pk-composer-document-title__icon" aria-hidden="true" />
		</Button>
	);
}

function ComposerTitleEditor({
	busy,
	draft,
	error,
	errorId,
	inputRef,
	strings,
	onBlur,
	onCancel,
	onChange,
	onSubmit,
}: ComposerTitleEditorProps): React.ReactElement {
	function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
		if (event.nativeEvent.isComposing) return;
		if (event.key === 'Enter') {
			event.preventDefault();
			onSubmit();
			return;
		}
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		onCancel();
	}

	return (
		<>
			<input
				ref={inputRef}
				className="pk-composer-document-title-input"
				value={draft}
				disabled={busy}
				aria-label={strings.inputLabel}
				aria-invalid={Boolean(error)}
				aria-describedby={error ? errorId : undefined}
				onBlur={onBlur}
				onChange={(event) => onChange(event.currentTarget.value)}
				onKeyDown={handleKeyDown}
			/>
			{error && (
				<span id={errorId} className="pk-composer-document-title-error" role="alert">
					{error}
				</span>
			)}
		</>
	);
}

export { composerDocumentTitle } from '@/core/composer';
