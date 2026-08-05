import React, { useEffect, useState } from 'react';
import { Button, Modal } from '@/ui/components/primitives';
import type { EditableBuiltInPrompt } from '@/core/ports/AIControlCenterPort';
import { PromptInputsTable } from './PromptInputsTable';

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
			<Modal.Content width="wide" portalClassName="peak-design-root" className="pk-ai-control-center__prompt-modal">
				<Modal.Header>
					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						<Modal.Title>Edit {prompt?.label}</Modal.Title>
						<Modal.Subtitle>{prompt?.description}</Modal.Subtitle>
					</div>
					<Modal.Close aria-label="Close prompt editor" />
				</Modal.Header>
				<Modal.Body className="pktw-flex pktw-flex-col pktw-gap-4 pktw-overflow-y-auto">
					<span className="pktw-text-xs pktw-text-pk-text-tertiary">
						Saving changes the Vault override. The next run of this action renders this exact template with the fields shown below.
					</span>
					<label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium">Vault override template</span><textarea
						aria-label="Prompt template"
						rows={28}
						value={content}
						onChange={(event) => setContent(event.target.value)}
						className="pk-ai-control-center__prompt-textarea pktw-w-full pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-p-3 pktw-font-mono pktw-text-xs pktw-text-pk-text-primary"
					/></label>
					<div className="pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface"><div className="pktw-px-4 pktw-py-3"><span className="pktw-block pktw-text-sm pktw-font-medium">Template inputs</span><span className="pktw-mt-1 pktw-block pktw-text-xs pktw-text-pk-text-tertiary">These values are supplied by Peak when this action runs. They are not settings to fill in here.</span></div><PromptInputsTable inputs={prompt?.inputs ?? []} /></div>
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
