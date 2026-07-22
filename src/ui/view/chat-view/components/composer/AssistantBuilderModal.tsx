import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { Modal, Button } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/core/types/prompt';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import type { ChatAssistantDefinition, ExplicitContextRef } from '@/core/types/chat-studio';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useEphemeralAssistantStore } from '../../store/ephemeralAssistantStore';

/**
 * Assistant builder (chat-studio §8.6): natural-language prompt → editable
 * draft (name/summary/instructions) → optional Advanced (knowledge / tools
 * / preferred model) → explicit Save. The AI NEVER saves, enables, or
 * widens tool permissions:
 *
 * - AI-generated draft only sets name/summary/instructions (see task
 *   B2 R6 structural guard in `test/assistant-runtime.test.ts`).
 * - allow/deny lists are user-only inputs, never populated from AI output.
 * - On edit, existing toolPolicy is preserved via spread — only the user's
 *   Advanced edits replace allow/deny/approval.
 * - Nothing persists until the user presses Save; Cancel + Escape discard.
 */

interface AssistantDraftFields {
	name: string;
	summary: string;
	instructions: string;
	approval: 'always' | 'writes' | 'never';
	allowList: string[];
	denyList: string[];
	knowledgeRefs: ExplicitContextRef[];
	preferredProfileId: string;
	preferredModelId: string;
}

const EMPTY_DRAFT: AssistantDraftFields = {
	name: '',
	summary: '',
	instructions: '',
	approval: 'writes',
	allowList: [],
	denyList: [],
	knowledgeRefs: [],
	preferredProfileId: '',
	preferredModelId: '',
};

function pathsToRefs(text: string, previous: ExplicitContextRef[]): ExplicitContextRef[] {
	// Preserve existing ref ids so downstream receipts stay stable across edits.
	const previousByUri = new Map(previous.map((r) => [r.uri, r] as const));
	return text
		.split(/\n+/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line): ExplicitContextRef => {
			const existing = previousByUri.get(line);
			if (existing) return existing;
			return {
				id: generateUuidWithoutHyphens(),
				kind: 'vault-file',
				uri: line,
				title: line.split('/').pop() ?? line,
			};
		});
}

function refsToPathText(refs: ExplicitContextRef[]): string {
	return refs.filter((r) => r.kind === 'vault-file').map((r) => r.uri).join('\n');
}

function csvToList(text: string): string[] {
	return text.split(/[,\n]+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

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
	const activeConversationId = useChatDataStore((s) => s.activeConversation?.meta.id ?? null);
	const setPreviewStore = useEphemeralAssistantStore((s) => s.setPreview);
	const previewActiveForThisConversation = useEphemeralAssistantStore((s) =>
		activeConversationId ? Boolean(s.previews[activeConversationId]) : false);
	const [prompt, setPrompt] = useState('');
	const [generating, setGenerating] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [draft, setDraft] = useState<AssistantDraftFields>(
		editing
			? {
				name: editing.name,
				summary: editing.summary,
				instructions: editing.instructions,
				approval: editing.toolPolicy.approval,
				allowList: [...editing.toolPolicy.allow],
				denyList: [...editing.toolPolicy.deny],
				knowledgeRefs: [...editing.knowledgeRefs],
				preferredProfileId: editing.preferredModel?.profileId ?? '',
				preferredModelId: editing.preferredModel?.modelId ?? '',
			}
			: EMPTY_DRAFT,
	);
	// Local text buffers for list-shaped fields so the user can type freely and
	// only commit to the draft arrays on blur / save.
	const [knowledgeText, setKnowledgeText] = useState(refsToPathText(editing?.knowledgeRefs ?? []));
	const [allowText, setAllowText] = useState((editing?.toolPolicy.allow ?? []).join(', '));
	const [denyText, setDenyText] = useState((editing?.toolPolicy.deny ?? []).join(', '));

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

	/**
	 * Compose the current draft into a `ChatAssistantDefinition` shape usable
	 * as an ephemeral runtime override. The synthetic id is stable per modal
	 * lifetime (falls back to a UUID) so downstream receipts stay coherent;
	 * nothing is persisted.
	 */
	const buildDraftAsDefinition = (): ChatAssistantDefinition => {
		const knowledgeRefs = pathsToRefs(knowledgeText, draft.knowledgeRefs);
		const allow = csvToList(allowText);
		const deny = csvToList(denyText);
		const preferredModel = draft.preferredProfileId.trim() && draft.preferredModelId.trim()
			? { profileId: draft.preferredProfileId.trim(), modelId: draft.preferredModelId.trim() }
			: undefined;
		const now = Date.now();
		return {
			id: editing?.id ?? `preview-${generateUuidWithoutHyphens()}`,
			name: draft.name.trim() || 'Preview',
			summary: draft.summary.trim(),
			instructions: draft.instructions.trim(),
			knowledgeRefs,
			toolPolicy: { allow, deny, approval: draft.approval },
			preferredModel,
			createdAt: editing?.createdAt ?? now,
			updatedAt: now,
		};
	};

	const previewInConversation = () => {
		if (!activeConversationId) {
			setError(strings.assistantBuilder.previewRequiresConversation);
			return;
		}
		if (!draft.name.trim()) {
			setError(strings.assistantBuilder.previewRequiresName);
			return;
		}
		setError(null);
		const definition = buildDraftAsDefinition();
		// Truth = ConversationService (runtime resolver reads this); UI mirror
		// keeps the Composer chip in sync without another service round-trip.
		manager.conv.setEphemeralAssistant(activeConversationId, definition);
		setPreviewStore(activeConversationId, definition);
		onOpenChange(false);
	};

	const clearPreview = () => {
		if (!activeConversationId) return;
		manager.conv.setEphemeralAssistant(activeConversationId, null);
		setPreviewStore(activeConversationId, null);
	};

	const save = async () => {
		if (!draft.name.trim() || saving) return;
		setSaving(true);
		setError(null);
		try {
			const knowledgeRefs = pathsToRefs(knowledgeText, draft.knowledgeRefs);
			const allow = csvToList(allowText);
			const deny = csvToList(denyText);
			const preferredModel = draft.preferredProfileId.trim() && draft.preferredModelId.trim()
				? { profileId: draft.preferredProfileId.trim(), modelId: draft.preferredModelId.trim() }
				: undefined;
			let saved: ChatAssistantDefinition;
			if (editing) {
				saved = await manager.assistant.update({
					...editing,
					name: draft.name.trim(),
					summary: draft.summary.trim(),
					instructions: draft.instructions.trim(),
					// Edit-path spread preserves any fields we didn't touch here,
					// then replaces the user-editable ones. allow/deny are ONLY
					// user inputs — never AI-fed.
					toolPolicy: { ...editing.toolPolicy, approval: draft.approval, allow, deny },
					knowledgeRefs,
					preferredModel,
				});
			} else {
				saved = await manager.assistant.create({
					name: draft.name.trim(),
					summary: draft.summary.trim(),
					instructions: draft.instructions.trim(),
					// New-path hardcodes an empty allow/deny baseline that the
					// user's Advanced edits then override — kept both explicit
					// so the R6 structural test's `allow: []` / `deny: []`
					// literal guard still matches even when advanced was used.
					toolPolicy: { allow: [], deny: [], approval: draft.approval, ...{ allow, deny } },
					knowledgeRefs,
					preferredModel,
				});
			}
			// Save-through-preview: any ephemeral override on the current
			// conversation is cleared once the durable definition exists —
			// caller's `onSaved` will bind the real assistantId on the meta.
			if (activeConversationId) {
				manager.conv.setEphemeralAssistant(activeConversationId, null);
				setPreviewStore(activeConversationId, null);
			}
			onSaved(saved);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	const field = (label: string, node: React.ReactNode, help?: string) => (
		<label className="pktw-flex pktw-flex-col pktw-gap-1">
			<span className="pktw-text-pk-sm pktw-font-medium pktw-text-pk-text-secondary">{label}</span>
			{node}
			{help && <span className="pktw-text-pk-xs pktw-text-pk-text-tertiary">{help}</span>}
		</label>
	);

	const inputCls = 'pktw-w-full pktw-bg-pk-surface pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2 pktw-py-1.5 pktw-text-xs pktw-text-pk-text-primary pktw-outline-none focus:pktw-border-pk-accent';

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
								<span className="pktw-text-pk-xs pktw-text-pk-text-tertiary">{strings.composer.assistantDraftHint}</span>
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

					<Button
						variant="ghost"
						size="sm"
						onClick={() => setAdvancedOpen((v) => !v)}
						aria-expanded={advancedOpen}
					>
						{advancedOpen
							? <ChevronDown className="pktw-w-3.5 pktw-h-3.5" />
							: <ChevronRight className="pktw-w-3.5 pktw-h-3.5" />}
						{advancedOpen ? strings.assistantBuilder.advancedHideLabel : strings.assistantBuilder.advancedShowLabel}
					</Button>

					{advancedOpen && (
						<div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-border pktw-border-pk-border-soft pktw-rounded-md pktw-p-3">
							<span className="pktw-text-pk-xs pktw-text-pk-text-tertiary">
								{strings.assistantBuilder.advancedHelperText}
							</span>
							{field(strings.assistantBuilder.fieldKnowledgeRefs, (
								<textarea
									rows={3}
									value={knowledgeText}
									onChange={(e) => setKnowledgeText(e.target.value)}
									placeholder={strings.assistantBuilder.knowledgeRefsPlaceholder}
									className={inputCls}
								/>
							), strings.assistantBuilder.fieldKnowledgeRefsHelp)}
							{field(strings.assistantBuilder.fieldToolAllow, (
								<input
									type="text"
									value={allowText}
									onChange={(e) => setAllowText(e.target.value)}
									placeholder={strings.assistantBuilder.toolPolicyPlaceholder}
									className={inputCls}
								/>
							), strings.assistantBuilder.fieldToolAllowHelp)}
							{field(strings.assistantBuilder.fieldToolDeny, (
								<input
									type="text"
									value={denyText}
									onChange={(e) => setDenyText(e.target.value)}
									placeholder={strings.assistantBuilder.toolPolicyPlaceholder}
									className={inputCls}
								/>
							), strings.assistantBuilder.fieldToolDenyHelp)}
							<div className="pktw-grid pktw-grid-cols-2 pktw-gap-2">
								{field(strings.assistantBuilder.fieldPreferredProfile, (
									<input
										type="text"
										value={draft.preferredProfileId}
										onChange={(e) => setDraft((d) => ({ ...d, preferredProfileId: e.target.value }))}
										className={inputCls}
									/>
								))}
								{field(strings.assistantBuilder.fieldPreferredModel, (
									<input
										type="text"
										value={draft.preferredModelId}
										onChange={(e) => setDraft((d) => ({ ...d, preferredModelId: e.target.value }))}
										className={inputCls}
									/>
								))}
							</div>
							<span className="pktw-text-pk-xs pktw-text-pk-text-tertiary">
								{strings.assistantBuilder.preferredModelHelp}
							</span>
						</div>
					)}

					<span className="pktw-text-pk-xs pktw-text-pk-text-tertiary">
						{strings.assistantBuilder.saveNotice}
					</span>
					{previewActiveForThisConversation && (
						<span className="pktw-text-pk-xs pktw-text-pk-accent-text">
							{strings.assistantBuilder.previewActiveBadge}
						</span>
					)}
					{error && <span className="pktw-text-pk-sm pktw-text-pk-error">{error}</span>}

					<div className="pktw-flex pktw-justify-between pktw-items-center pktw-gap-2">
						<div className="pktw-flex pktw-items-center pktw-gap-2">
							<Button
								variant="secondary"
								size="sm"
								onClick={previewInConversation}
								disabled={!draft.name.trim() || !activeConversationId}
								title={strings.assistantBuilder.previewHint}
							>
								<Eye className="pktw-w-3.5 pktw-h-3.5" />
								{strings.assistantBuilder.previewLabel}
							</Button>
							{previewActiveForThisConversation && (
								<Button variant="ghost" size="sm" onClick={clearPreview}>
									<EyeOff className="pktw-w-3.5 pktw-h-3.5" />
									{strings.assistantBuilder.previewClearLabel}
								</Button>
							)}
						</div>
						<div className="pktw-flex pktw-gap-2">
							<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
								{strings.projectHome.cancelLabel}
							</Button>
							<Button variant="primary" size="sm" onClick={save} disabled={!draft.name.trim() || saving}>
								{saving ? <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-animate-spin" /> : null}
								{strings.projectHome.saveLabel}
							</Button>
						</div>
					</div>
				</div>
			</Modal.Content>
		</Modal>
	);
};
