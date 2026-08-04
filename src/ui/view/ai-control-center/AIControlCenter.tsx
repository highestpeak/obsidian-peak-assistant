import React, { useEffect, useMemo, useState } from 'react';
import { Bot, FileText, Plus, Search, Sparkles, UserRound } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import type { AIControlActionSummary, AIControlCenterPort, CustomPromptDraft, EditableBuiltInPrompt } from '@/core/ports/AIControlCenterPort';
import type { CustomPromptDefShape } from '@/core/ports/CustomPromptSourcePort';
import type { ChatAssistantDefinition } from '@/core/types/chat-studio';
import type { PromptId } from '@/core/types/prompt';
import { getTemplateMetadata } from '@/core/template/TemplateRegistry';
import { ChatStudioStringsProvider } from '@/ui/view/chat-view/chatStudioStringsContext';
import { AssistantBuilderModal } from '@/ui/view/chat-view/components/composer/AssistantBuilderModal';
import { PromptEditorModal } from './PromptEditorModal';
import { CustomPromptEditorModal } from './CustomPromptEditorModal';

type Selection =
	| { kind: 'action'; id: string }
	| { kind: 'custom'; id: string }
	| { kind: 'assistant'; id: string };

interface AIControlCenterProps {
	runtime: AIControlCenterPort;
}

function categoryLabel(category: AIControlActionSummary['category']): string {
	if (category === 'document') return 'Composer & Copilot';
	if (category === 'vault') return 'Vault Intelligence';
	return 'Writing';
}

function selectionForFirst(actions: readonly AIControlActionSummary[]): Selection | null {
	const first = actions[0];
	return first ? { kind: 'action', id: first.id } : null;
}

export function AIControlCenter({ runtime }: AIControlCenterProps): React.ReactElement {
	const [actions, setActions] = useState<readonly AIControlActionSummary[]>([]);
	const [customPrompts, setCustomPrompts] = useState<readonly CustomPromptDefShape[]>([]);
	const [assistants, setAssistants] = useState<readonly ChatAssistantDefinition[]>([]);
	const [selected, setSelected] = useState<Selection | null>(null);
	const [query, setQuery] = useState('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [builtInEditor, setBuiltInEditor] = useState<EditableBuiltInPrompt | null>(null);
	const [customEditor, setCustomEditor] = useState<CustomPromptDraft | null>(null);
	const [assistantEditor, setAssistantEditor] = useState<ChatAssistantDefinition | null | 'new'>(null);

	const refresh = async (): Promise<void> => {
		setLoading(true);
		setError(null);
		try {
			const [nextActions, nextCustomPrompts, nextAssistants] = await Promise.all([
				runtime.listActions(),
				runtime.listCustomPrompts(),
				runtime.listAssistants(),
			]);
			setActions(nextActions);
			setCustomPrompts(nextCustomPrompts);
			setAssistants(nextAssistants);
			setSelected((current) => current ?? selectionForFirst(nextActions));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { void refresh(); }, []);

	const visibleRows = useMemo(() => {
		const normalized = query.trim().toLocaleLowerCase();
		const matches = (...values: Array<string | undefined>): boolean => !normalized || values.some((value) => value?.toLocaleLowerCase().includes(normalized));
		return [
			...actions.filter((item) => matches(item.label, item.description, categoryLabel(item.category))).map((item) => ({ key: `action:${item.id}`, kind: 'action' as const, item })),
			...customPrompts.filter((item) => matches(item.label, item.description, item.category)).map((item) => ({ key: `custom:${item.id}`, kind: 'custom' as const, item })),
			...assistants.filter((item) => matches(item.name, item.summary)).map((item) => ({ key: `assistant:${item.id}`, kind: 'assistant' as const, item })),
		];
	}, [actions, assistants, customPrompts, query]);

	const selectedAction = selected?.kind === 'action' ? actions.find((item) => item.id === selected.id) ?? null : null;
	const selectedCustom = selected?.kind === 'custom' ? customPrompts.find((item) => item.id === selected.id) ?? null : null;
	const selectedAssistant = selected?.kind === 'assistant' ? assistants.find((item) => item.id === selected.id) ?? null : null;

	const openBuiltInPrompt = async (id: PromptId): Promise<void> => {
		try {
			setBuiltInEditor(await runtime.readBuiltInPrompt(id));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};

	const saveBuiltInPrompt = async (content: string): Promise<void> => {
		if (!builtInEditor) return;
		await runtime.saveBuiltInPrompt(builtInEditor.id, content);
	};

	const resetBuiltInPrompt = async (): Promise<void> => {
		if (!builtInEditor) return;
		await runtime.resetBuiltInPrompt(builtInEditor.id);
	};

	const saveCustomPrompt = async (draft: CustomPromptDraft): Promise<void> => {
		if (draft.filePath) await runtime.updateCustomPrompt(draft as Required<Pick<CustomPromptDraft, 'filePath'>> & CustomPromptDraft);
		else await runtime.createCustomPrompt(draft);
		await refresh();
	};

	const removeCustomPrompt = async (): Promise<void> => {
		if (!selectedCustom) return;
		if (!window.confirm(`Delete Custom Prompt “${selectedCustom.label}”?`)) return;
		try {
			await runtime.deleteCustomPrompt(selectedCustom.filePath);
			setSelected(selectionForFirst(actions));
			await refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};

	return (
		<ChatStudioStringsProvider>
			<div className="pktw-flex pktw-h-full pktw-min-h-0 pktw-flex-col pktw-bg-pk-background">
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-border-b pktw-border-pk-border pktw-px-5 pktw-py-3">
					<div className="pktw-flex pktw-flex-col pktw-gap-0.5"><span className="pktw-text-lg pktw-font-semibold">AI Control Center</span><span className="pktw-text-xs pktw-text-pk-text-tertiary">Manage the prompts, Custom Prompts, and Chat Assistants that Peak actually uses.</span></div>
					<div className="pktw-flex pktw-items-center pktw-gap-2"><Button size="sm" variant="secondary" onClick={() => setAssistantEditor('new')}><Plus size={14} /> New assistant</Button><Button size="sm" variant="primary" onClick={() => setCustomEditor({ label: '', description: '', category: 'writing', template: '', modelId: '' })}><Plus size={14} /> New Custom Prompt</Button></div>
				</div>
				<div className="pktw-grid pktw-min-h-0 pktw-flex-1 pktw-grid-cols-[300px_minmax(0,1fr)]">
					<div className="pktw-flex pktw-min-h-0 pktw-flex-col pktw-border-r pktw-border-pk-border">
						<div className="pktw-p-3"><label className="pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2"><Search size={14} className="pktw-text-pk-text-tertiary" /><input aria-label="Search AI controls" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search AI actions…" className="pktw-w-full pktw-border-0 pktw-bg-transparent pktw-py-1.5 pktw-text-sm pktw-outline-none" /></label></div>
						<div className="pktw-min-h-0 pktw-flex-1 pktw-overflow-y-auto pktw-px-2 pktw-pb-3">
							{loading ? <span className="pktw-block pktw-p-3 pktw-text-sm pktw-text-pk-text-tertiary">Loading controls…</span> : null}
							{visibleRows.map((row) => {
								const active = selected?.kind === row.kind && selected.id === row.item.id;
								const select = (): void => setSelected({ kind: row.kind, id: row.item.id });
								const icon = row.kind === 'action' ? <Sparkles size={16} /> : row.kind === 'custom' ? <FileText size={16} /> : <UserRound size={16} />;
								const title = row.kind === 'assistant' ? row.item.name : row.item.label;
								const subtitle = row.kind === 'action' ? categoryLabel(row.item.category) : row.kind === 'custom' ? 'Custom Prompt' : 'Chat Assistant';
								return <Button key={row.key} variant="ghost" className={`pktw-mb-1 pktw-flex pktw-h-auto pktw-w-full pktw-items-start pktw-gap-2 pktw-p-2 pktw-text-left ${active ? 'pktw-bg-pk-accent/10' : ''}`} onClick={select}><span className="pktw-mt-0.5 pktw-text-pk-text-tertiary">{icon}</span><span className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col"><span className="pktw-truncate pktw-text-sm pktw-font-medium">{title}</span><span className="pktw-truncate pktw-text-xs pktw-text-pk-text-tertiary">{subtitle}</span></span></Button>;
							})}
							{!loading && visibleRows.length === 0 ? <span className="pktw-block pktw-p-3 pktw-text-sm pktw-text-pk-text-tertiary">No configurable AI controls match this search.</span> : null}
						</div>
					</div>
					<div className="pktw-min-h-0 pktw-overflow-y-auto pktw-p-6">
						{error ? <div className="pktw-mb-4 pktw-rounded-md pktw-border pktw-border-red-300 pktw-bg-red-50 pktw-p-3 pktw-text-sm pktw-text-red-700">{error}</div> : null}
						{selectedAction ? <ActionDetail action={selectedAction} onEditPrompt={openBuiltInPrompt} /> : null}
						{selectedCustom ? <CustomPromptDetail prompt={selectedCustom} onEdit={() => setCustomEditor({ filePath: selectedCustom.filePath, label: selectedCustom.label, description: selectedCustom.description, category: selectedCustom.category, template: selectedCustom.template, modelId: selectedCustom.modelId })} onDelete={() => void removeCustomPrompt()} /> : null}
						{selectedAssistant ? <AssistantDetail assistant={selectedAssistant} onEdit={() => setAssistantEditor(selectedAssistant)} /> : null}
						{!selectedAction && !selectedCustom && !selectedAssistant && !loading ? <EmptyDetail /> : null}
					</div>
				</div>
				<PromptEditorModal prompt={builtInEditor} onOpenChange={(open) => { if (!open) setBuiltInEditor(null); }} onSave={saveBuiltInPrompt} onReset={resetBuiltInPrompt} />
				<CustomPromptEditorModal draft={customEditor} onOpenChange={(open) => { if (!open) setCustomEditor(null); }} onSave={saveCustomPrompt} />
				<AssistantBuilderModal open={assistantEditor !== null} editing={assistantEditor === 'new' ? null : assistantEditor} onOpenChange={(open) => { if (!open) setAssistantEditor(null); }} onSaved={(assistant) => { setAssistantEditor(null); setSelected({ kind: 'assistant', id: assistant.id }); void refresh(); }} />
			</div>
		</ChatStudioStringsProvider>
	);
}

function ActionDetail({ action, onEditPrompt }: { action: AIControlActionSummary; onEditPrompt: (id: PromptId) => Promise<void> }): React.ReactElement {
	return <div className="pktw-flex pktw-max-w-4xl pktw-flex-col pktw-gap-6"><div className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">{categoryLabel(action.category)}</span><span className="pktw-text-2xl pktw-font-semibold">{action.label}</span><span className="pktw-text-sm pktw-text-pk-text-secondary">{action.description}</span></div><div className="pktw-flex pktw-flex-col pktw-gap-2"><span className="pktw-text-sm pktw-font-semibold">Prompt & instructions</span><span className="pktw-text-xs pktw-text-pk-text-tertiary">Each prompt below is directly rendered by this action. Changes apply on its next run.</span>{action.promptIds.map((promptId) => { const meta = getTemplateMetadata(promptId); return <div key={promptId} className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-p-3"><div className="pktw-flex pktw-min-w-0 pktw-flex-col"><span className="pktw-text-sm pktw-font-medium">{meta.label ?? promptId}</span><span className="pktw-text-xs pktw-text-pk-text-tertiary">{meta.description ?? 'Built-in prompt; a Vault override is optional.'}</span></div><Button size="sm" variant="secondary" onClick={() => void onEditPrompt(promptId)}>Edit prompt</Button></div>; })}</div></div>;
}

function CustomPromptDetail({ prompt, onEdit, onDelete }: { prompt: CustomPromptDefShape; onEdit: () => void; onDelete: () => void }): React.ReactElement {
	return <div className="pktw-flex pktw-max-w-4xl pktw-flex-col pktw-gap-6"><div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-3"><div className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">Custom Prompt · {prompt.category}</span><span className="pktw-text-2xl pktw-font-semibold">{prompt.label}</span><span className="pktw-text-sm pktw-text-pk-text-secondary">{prompt.description || 'No description yet.'}</span></div><div className="pktw-flex pktw-gap-2"><Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button><Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button></div></div><div className="pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-p-4"><span className="pktw-block pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">Template</span><pre className="pktw-mt-2 pktw-whitespace-pre-wrap pktw-font-mono pktw-text-xs pktw-text-pk-text-secondary">{prompt.template}</pre></div><div className="pktw-rounded-lg pktw-border pktw-border-pk-border pktw-p-4"><span className="pktw-text-sm pktw-font-medium">Model</span><span className="pktw-mt-1 pktw-block pktw-text-sm pktw-text-pk-text-secondary">{prompt.modelId || 'Uses the active AI Setup default.'}</span></div></div>;
}

function AssistantDetail({ assistant, onEdit }: { assistant: ChatAssistantDefinition; onEdit: () => void }): React.ReactElement {
	return <div className="pktw-flex pktw-max-w-4xl pktw-flex-col pktw-gap-6"><div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-3"><div className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">Chat Assistant</span><span className="pktw-text-2xl pktw-font-semibold">{assistant.name}</span><span className="pktw-text-sm pktw-text-pk-text-secondary">{assistant.summary || 'No summary yet.'}</span></div><Button size="sm" variant="secondary" onClick={onEdit}>Edit assistant</Button></div><div className="pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-p-4"><span className="pktw-block pktw-text-sm pktw-font-medium">Instructions</span><span className="pktw-mt-2 pktw-block pktw-whitespace-pre-wrap pktw-text-sm pktw-text-pk-text-secondary">{assistant.instructions || 'No instructions yet.'}</span></div><div className="pktw-grid pktw-grid-cols-2 pktw-gap-3"><div className="pktw-rounded-lg pktw-border pktw-border-pk-border pktw-p-4"><span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">Approval</span><span className="pktw-mt-1 pktw-block pktw-text-sm">{assistant.toolPolicy.approval}</span></div><div className="pktw-rounded-lg pktw-border pktw-border-pk-border pktw-p-4"><span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">Model</span><span className="pktw-mt-1 pktw-block pktw-text-sm">{assistant.preferredModel?.modelId || 'Uses the active AI Setup default.'}</span></div></div></div>;
}

function EmptyDetail(): React.ReactElement {
	return <div className="pktw-flex pktw-h-full pktw-min-h-[320px] pktw-items-center pktw-justify-center"><div className="pktw-flex pktw-max-w-sm pktw-flex-col pktw-items-center pktw-gap-2 pktw-text-center"><Bot size={28} className="pktw-text-pk-text-tertiary" /><span className="pktw-text-base pktw-font-medium">Select an AI action</span><span className="pktw-text-sm pktw-text-pk-text-tertiary">Only controls that change a real Peak run appear here.</span></div></div>;
}
