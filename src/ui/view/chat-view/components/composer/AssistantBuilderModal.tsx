import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Modal, Button } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/core/types/prompt';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import type { ChatAssistantDefinition } from '@/core/types/chat-studio';

/**
 * Assistant builder (chat-studio §8.6): natural-language prompt → editable
 * draft (name/summary/instructions) → optional advanced (tool approval) →
 * explicit Save. The AI NEVER saves, enables, or widens tool permissions —
 * only the user's Save button persists anything.
 */

interface AssistantDraftFields {
	name: string;
	summary: string;
	instructions: string;
	approval: 'always' | 'writes' | 'never';
}

const EMPTY_DRAFT: AssistantDraftFields = { name: '', summary: '', instructions: '', approval: 'writes' };

export interface AssistantBuilderModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** When set, the modal edits an existing assistant instead of creating. */
	editing?: ChatAssistantDefinition | null;
	onSaved: (assistant: ChatAssistantDefinition) => void;
}

export const AssistantBuilderModal: React.FC<AssistantBuilderModalProps> = ({ open, onOpenChange, editing, onSaved }) => {
	const strings = useChatStudioStrings();
	const { manager } = useServiceContext();
	const [prompt, setPrompt] = useState('');
	const [generating, setGenerating] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [draft, setDraft] = useState<AssistantDraftFields>(
		editing
			? { name: editing.name, summary: editing.summary, instructions: editing.instructions, approval: editing.toolPolicy.approval }
			: EMPTY_DRAFT,
	);

	const generateDraft = async () => {
		if (!prompt.trim() || generating) return;
		setGenerating(true);
		setError(null);
		try {
			const result = await manager.queryStructured<{ name?: string; summary?: string; instructions?: string }>(
				PromptId.ChatAssistantDraft,
				{ userPrompt: prompt.trim() },
			);
			setDraft((d) => ({
				...d,
				name: result?.name?.trim() || d.name,
				summary: result?.summary?.trim() || d.summary,
				instructions: result?.instructions?.trim() || d.instructions,
			}));
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setGenerating(false);
		}
	};

	const save = async () => {
		if (!draft.name.trim() || saving) return;
		setSaving(true);
		setError(null);
		try {
			let saved: ChatAssistantDefinition;
			if (editing) {
				saved = await manager.assistant.update({
					...editing,
					name: draft.name.trim(),
					summary: draft.summary.trim(),
					instructions: draft.instructions.trim(),
					toolPolicy: { ...editing.toolPolicy, approval: draft.approval },
				});
			} else {
				saved = await manager.assistant.create({
					name: draft.name.trim(),
					summary: draft.summary.trim(),
					instructions: draft.instructions.trim(),
					toolPolicy: { allow: [], deny: [], approval: draft.approval },
				});
			}
			onSaved(saved);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	const field = (label: string, node: React.ReactNode) => (
		<label className="pktw-flex pktw-flex-col pktw-gap-1">
			<span className="pktw-text-pk-sm pktw-font-medium pktw-text-pk-muted-foreground">{label}</span>
			{node}
		</label>
	);

	const inputCls = 'pktw-w-full pktw-bg-pk-bg pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2 pktw-py-1.5 pktw-text-xs pktw-text-pk-foreground pktw-outline-none focus:pktw-border-pk-accent';

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<Modal.Content width="default" portalClassName="peak-design-root">
				<div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-p-4">
					<span className="pktw-text-sm pktw-font-semibold">{strings.composer.assistantCreateLabel}</span>

					{!editing && (
						<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
							<textarea
								value={prompt}
								onChange={(e) => setPrompt(e.target.value)}
								rows={2}
								placeholder={strings.assistantBuilder.promptPlaceholder}
								className={inputCls}
							/>
							<div className="pktw-flex pktw-items-center pktw-gap-2">
								<Button variant="secondary" size="sm" onClick={generateDraft} disabled={!prompt.trim() || generating}>
									{generating ? <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-animate-spin" /> : <Sparkles className="pktw-w-3.5 pktw-h-3.5" />}
									{strings.projectHome.descriptionAiDraft}
								</Button>
								<span className="pktw-text-pk-xs pktw-text-pk-muted-foreground">{strings.composer.assistantDraftHint}</span>
							</div>
						</div>
					)}

					{field(strings.assistantBuilder.fieldName, (
						<input type="text" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={inputCls} />
					))}
					{field(strings.assistantBuilder.fieldSummary, (
						<input type="text" value={draft.summary} onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))} className={inputCls} />
					))}
					{field(strings.assistantBuilder.fieldInstructions, (
						<textarea rows={6} value={draft.instructions} onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))} className={inputCls} />
					))}
					{field(strings.assistantBuilder.fieldToolApproval, (
						<select
							value={draft.approval}
							onChange={(e) => setDraft((d) => ({ ...d, approval: e.target.value as AssistantDraftFields['approval'] }))}
							className={inputCls}
						>
							<option value="always">{strings.assistantBuilder.approvalAlways}</option>
							<option value="writes">{strings.assistantBuilder.approvalWrites}</option>
							<option value="never">{strings.assistantBuilder.approvalNever}</option>
						</select>
					))}

					{error && <span className="pktw-text-pk-sm pktw-text-pk-danger">{error}</span>}

					<div className="pktw-flex pktw-justify-end pktw-gap-2">
						<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
							{strings.projectHome.cancelLabel}
						</Button>
						<Button variant="primary" size="sm" onClick={save} disabled={!draft.name.trim() || saving}>
							{saving ? <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-animate-spin" /> : null}
							{strings.projectHome.saveLabel}
						</Button>
					</div>
				</div>
			</Modal.Content>
		</Modal>
	);
};
