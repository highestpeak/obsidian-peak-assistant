import React, { useEffect, useState } from 'react';
import { Button, Modal } from '@/ui/components/primitives';
import type { CustomPromptDraft } from '@/core/ports/AIControlCenterPort';
import { CUSTOM_PROMPT_TEMPLATE_VARIABLES } from '@/service/copilot/CustomPromptRegistry';
import { PromptInputsTable } from './PromptInputsTable';
import { PromptTemplateEditor } from './PromptTemplateEditor';

export interface CustomPromptEditorModalProps {
	draft: CustomPromptDraft | null;
	onOpenChange: (open: boolean) => void;
	onSave: (draft: CustomPromptDraft) => Promise<void>;
}

const EMPTY_DRAFT: CustomPromptDraft = {
	label: '',
	description: '',
	category: 'writing',
	template: '',
	modelId: '',
};

export function CustomPromptEditorModal({ draft, onOpenChange, onSave }: CustomPromptEditorModalProps): React.ReactElement {
	const [form, setForm] = useState<CustomPromptDraft>(EMPTY_DRAFT);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setForm(draft ?? EMPTY_DRAFT);
		setError(null);
	}, [draft]);

	const update = <K extends keyof CustomPromptDraft>(key: K, value: CustomPromptDraft[K]): void => {
		setForm((current) => ({ ...current, [key]: value }));
	};

	const save = async (): Promise<void> => {
		if (!draft || saving) return;
		setSaving(true);
		setError(null);
		try {
			await onSave({ ...form, modelId: form.modelId?.trim() || undefined });
			onOpenChange(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	};

	const fieldClass = 'pktw-w-full pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-text-pk-text-primary';
	return (
		<Modal open={Boolean(draft)} onOpenChange={onOpenChange}>
			<Modal.Content width="wide" portalClassName="peak-design-root" className="pk-ai-control-center__prompt-modal">
				<Modal.Header>
					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						<Modal.Title>{draft?.filePath ? 'Edit Custom Prompt' : 'New Custom Prompt'}</Modal.Title>
						<Modal.Subtitle>Saved in your Custom Prompts folder and reloaded by Peak automatically.</Modal.Subtitle>
					</div>
					<Modal.Close aria-label="Close Custom Prompt editor" />
				</Modal.Header>
				<Modal.Body className="pktw-flex pktw-flex-col pktw-gap-3 pktw-overflow-y-auto">
					<label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium">Name</span><input className={fieldClass} value={form.label} onChange={(event) => update('label', event.target.value)} /></label>
					<label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium">Description</span><input className={fieldClass} value={form.description ?? ''} onChange={(event) => update('description', event.target.value)} /></label>
					<div className="pktw-grid pktw-grid-cols-2 pktw-gap-3">
						<label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium">Where it appears</span><select className={fieldClass} value={form.category} onChange={(event) => update('category', event.target.value as CustomPromptDraft['category'])}><option value="document">Document</option><option value="vault">Vault</option><option value="writing">Writing</option></select></label>
						<label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium">Model override (optional)</span><input className={fieldClass} placeholder="Use current AI setup default" value={form.modelId ?? ''} onChange={(event) => update('modelId', event.target.value)} /></label>
					</div>
					<PromptTemplateEditor label="Prompt template" ariaLabel="Custom Prompt template" value={form.template} onChange={(template) => update('template', template)} />
					<div className="pktw-rounded-md pktw-border pktw-border-pk-border"><div className="pktw-px-4 pktw-py-3"><span className="pktw-block pktw-text-sm pktw-font-medium">Template inputs</span><span className="pktw-mt-1 pktw-block pktw-text-xs pktw-text-pk-text-tertiary">Peak supplies these values when this Custom Prompt runs.</span></div><PromptInputsTable inputs={CUSTOM_PROMPT_TEMPLATE_VARIABLES} /></div>
					{error ? <span className="pktw-text-xs pktw-text-red-500">{error}</span> : null}
				</Modal.Body>
				<Modal.Footer>
					<div className="pktw-flex pktw-w-full pktw-justify-end pktw-gap-2"><Button variant="secondary" size="sm" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" size="sm" disabled={saving || !form.label.trim() || !form.template.trim()} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Custom Prompt'}</Button></div>
				</Modal.Footer>
			</Modal.Content>
		</Modal>
	);
}
