import React, { useEffect, useState } from 'react';
import { Button, Modal } from '@/ui/components/primitives';
import type { EditableBuiltInPrompt } from '@/core/ports/AIControlCenterPort';

export interface PromptEditorModalProps {
	prompt: EditableBuiltInPrompt | null;
	onOpenChange: (open: boolean) => void;
	onSave: (content: string) => Promise<void>;
	onReset: () => Promise<void>;
}

export function PromptEditorModal({ prompt, onOpenChange, onSave, onReset }: PromptEditorModalProps): React.ReactElement {
	const [content, setContent] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setContent(prompt?.content ?? '');
		setError(null);
	}, [prompt]);

	const save = async (): Promise<void> => {
		if (!prompt || saving) return;
		setSaving(true);
		setError(null);
		try {
			await onSave(content);
			onOpenChange(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	};

	const reset = async (): Promise<void> => {
		if (!prompt || !prompt.overridden || saving) return;
		setSaving(true);
		setError(null);
		try {
			await onReset();
			onOpenChange(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal open={Boolean(prompt)} onOpenChange={onOpenChange}>
			<Modal.Content width="wide" portalClassName="peak-design-root">
				<Modal.Header>
					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						<Modal.Title>Edit {prompt?.label}</Modal.Title>
						<Modal.Subtitle>{prompt?.description}</Modal.Subtitle>
					</div>
					<Modal.Close aria-label="Close prompt editor" />
				</Modal.Header>
				<Modal.Body className="pktw-flex pktw-flex-col pktw-gap-3">
					<span className="pktw-text-xs pktw-text-pk-text-tertiary">
						Use the Handlebars fields already declared by the owning action. Saving changes the Vault override and affects the next run.
					</span>
					<textarea
						aria-label="Prompt template"
						value={content}
						onChange={(event) => setContent(event.target.value)}
						className="pktw-min-h-[360px] pktw-w-full pktw-resize-y pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-p-3 pktw-font-mono pktw-text-xs pktw-text-pk-text-primary"
					/>
					{error ? <span className="pktw-text-xs pktw-text-red-500">{error}</span> : null}
				</Modal.Body>
				<Modal.Footer>
					<div className="pktw-flex pktw-w-full pktw-items-center pktw-justify-between pktw-gap-2">
						<div>
							{prompt?.overridden ? <Button variant="ghost" size="sm" disabled={saving} onClick={() => void reset()}>Restore built-in</Button> : null}
						</div>
						<div className="pktw-flex pktw-gap-2">
							<Button variant="secondary" size="sm" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
							<Button variant="primary" size="sm" disabled={saving || !content.trim()} onClick={() => void save()}>{saving ? 'Saving…' : 'Save prompt'}</Button>
						</div>
					</div>
				</Modal.Footer>
			</Modal.Content>
		</Modal>
	);
}
