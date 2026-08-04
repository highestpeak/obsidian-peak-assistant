import React, { useEffect, useMemo, useState } from 'react';
import { Bot, FileText, MessageSquareText, Plus, Search, Sparkles, UserRound } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import type {
	AIControlActionSummary,
	AIControlCenterPort,
	AIControlProductArea,
	AIControlPromptSlot,
	CustomPromptDraft,
	EditableBuiltInPrompt,
} from '@/core/ports/AIControlCenterPort';
import type { CustomPromptDefShape } from '@/core/ports/CustomPromptSourcePort';
import type { ChatAssistantDefinition } from '@/core/types/chat-studio';
import type { PromptId } from '@/core/types/prompt';
import { CUSTOM_PROMPT_TEMPLATE_VARIABLES } from '@/service/copilot/CustomPromptRegistry';
import { ChatStudioStringsProvider } from '@/ui/view/chat-view/chatStudioStringsContext';
import { AssistantBuilderModal } from '@/ui/view/chat-view/components/composer/AssistantBuilderModal';
import { PromptEditorModal } from './PromptEditorModal';
import { CustomPromptEditorModal } from './CustomPromptEditorModal';
import { PromptInputsTable } from './PromptInputsTable';

type Selection =
	| { kind: 'action'; id: string }
	| { kind: 'custom'; id: string }
	| { kind: 'assistant'; id: string };

type BrowseScope = 'all' | AIControlProductArea | 'custom-prompts' | 'chat-assistants';

interface AIControlCenterProps {
	runtime: AIControlCenterPort;
}

const PRODUCT_AREAS: ReadonlyArray<{ id: AIControlProductArea; label: string }> = [
	{ id: 'search-knowledge', label: 'Search & Knowledge' },
	{ id: 'ai-search-graph', label: 'AI Search & Graph' },
	{ id: 'composer-copilot', label: 'Composer & Copilot' },
	{ id: 'chat-generation', label: 'Chat & Generation' },
	{ id: 'vault-intelligence', label: 'Vault Intelligence' },
];

function areaLabel(area: AIControlProductArea): string {
	return PRODUCT_AREAS.find((item) => item.id === area)?.label ?? area;
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
	const [scope, setScope] = useState<BrowseScope>('all');
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
		const actionRows = actions
			.filter((item) => (scope === 'all' || PRODUCT_AREAS.some((area) => area.id === scope) ? scope === 'all' || item.area === scope : false))
			.filter((item) => matches(item.label, item.description, areaLabel(item.area)))
			.map((item) => ({ key: `action:${item.id}`, kind: 'action' as const, item }));
		const customRows = (scope === 'all' || scope === 'custom-prompts')
			? customPrompts.filter((item) => matches(item.label, item.description)).map((item) => ({ key: `custom:${item.id}`, kind: 'custom' as const, item }))
			: [];
		const assistantRows = (scope === 'all' || scope === 'chat-assistants')
			? assistants.filter((item) => matches(item.name, item.summary)).map((item) => ({ key: `assistant:${item.id}`, kind: 'assistant' as const, item }))
			: [];
		return [...actionRows, ...customRows, ...assistantRows];
	}, [actions, assistants, customPrompts, query, scope]);

	const selectedAction = selected?.kind === 'action' ? actions.find((item) => item.id === selected.id) ?? null : null;
	const selectedCustom = selected?.kind === 'custom' ? customPrompts.find((item) => item.id === selected.id) ?? null : null;
	const selectedAssistant = selected?.kind === 'assistant' ? assistants.find((item) => item.id === selected.id) ?? null : null;

	const selectScope = (nextScope: BrowseScope): void => {
		setScope(nextScope);
		setQuery('');
		if (nextScope === 'custom-prompts') {
			setSelected(customPrompts[0] ? { kind: 'custom', id: customPrompts[0].id } : null);
			return;
		}
		if (nextScope === 'chat-assistants') {
			setSelected(assistants[0] ? { kind: 'assistant', id: assistants[0].id } : null);
			return;
		}
		const nextAction = nextScope === 'all' ? actions[0] : actions.find((item) => item.area === nextScope);
		setSelected(nextAction ? { kind: 'action', id: nextAction.id } : null);
	};

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
		await refresh();
	};

	const resetBuiltInPrompt = async (): Promise<void> => {
		if (!builtInEditor) return;
		await runtime.resetBuiltInPrompt(builtInEditor.id);
		await refresh();
	};

	const saveCustomPrompt = async (draft: CustomPromptDraft): Promise<void> => {
		const saved = draft.filePath
			? await runtime.updateCustomPrompt(draft as Required<Pick<CustomPromptDraft, 'filePath'>> & CustomPromptDraft)
			: await runtime.createCustomPrompt(draft);
		setScope('custom-prompts');
		setSelected({ kind: 'custom', id: saved.id });
		await refresh();
	};

	const removeCustomPrompt = async (): Promise<void> => {
		if (!selectedCustom || !window.confirm(`Delete Custom Prompt “${selectedCustom.label}”?`)) return;
		try {
			await runtime.deleteCustomPrompt(selectedCustom.filePath);
			setSelected(null);
			await refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};

	const scopeTitle = scope === 'all'
		? 'All controls'
		: scope === 'custom-prompts'
			? 'Custom Prompts'
			: scope === 'chat-assistants'
				? 'Chat Assistants'
				: areaLabel(scope);

	return (
		<ChatStudioStringsProvider>
			<div className="pktw-flex pktw-h-full pktw-min-h-0 pktw-flex-col pktw-bg-pk-background">
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-border-b pktw-border-pk-border pktw-px-5 pktw-py-3">
					<div className="pktw-flex pktw-flex-col pktw-gap-0.5"><span className="pktw-text-lg pktw-font-semibold">AI Control Center</span><span className="pktw-text-xs pktw-text-pk-text-tertiary">Edit the AI actions and prompts Peak uses on a later run.</span></div>
					<div className="pktw-flex pktw-items-center pktw-gap-2"><Button size="sm" variant="secondary" onClick={() => setAssistantEditor('new')}><Plus size={14} /> New assistant</Button><Button size="sm" variant="primary" onClick={() => setCustomEditor({ label: '', description: '', category: 'writing', template: '', modelId: '' })}><Plus size={14} /> New Custom Prompt</Button></div>
				</div>
				<div className="pktw-grid pktw-min-h-0 pktw-flex-1 pktw-grid-cols-[220px_330px_minmax(0,1fr)]">
					<BrowseRail scope={scope} onSelect={selectScope} actions={actions} customPrompts={customPrompts} assistants={assistants} />
					<div className="pktw-flex pktw-min-h-0 pktw-flex-col pktw-border-r pktw-border-pk-border">
						<div className="pktw-border-b pktw-border-pk-border pktw-p-3"><span className="pktw-block pktw-text-sm pktw-font-semibold">{scopeTitle}</span><label className="pktw-mt-3 pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2"><Search size={14} className="pktw-text-pk-text-tertiary" /><input aria-label="Search AI controls" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actions or prompts…" className="pktw-w-full pktw-border-0 pktw-bg-transparent pktw-py-1.5 pktw-text-sm pktw-outline-none" /></label></div>
						<div className="pktw-min-h-0 pktw-flex-1 pktw-overflow-y-auto pktw-p-2">
							{loading ? <span className="pktw-block pktw-p-3 pktw-text-sm pktw-text-pk-text-tertiary">Loading controls…</span> : null}
							{visibleRows.map((row) => <ControlRow key={row.key} row={row} active={selected?.kind === row.kind && selected.id === row.item.id} onSelect={() => setSelected({ kind: row.kind, id: row.item.id })} />)}
							{!loading && visibleRows.length === 0 ? <span className="pktw-block pktw-p-3 pktw-text-sm pktw-text-pk-text-tertiary">No configurable controls match this view.</span> : null}
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
				<AssistantBuilderModal open={assistantEditor !== null} editing={assistantEditor === 'new' ? null : assistantEditor} onOpenChange={(open) => { if (!open) setAssistantEditor(null); }} onSaved={(assistant) => { setAssistantEditor(null); setSelected({ kind: 'assistant', id: assistant.id }); setScope('chat-assistants'); void refresh(); }} />
			</div>
		</ChatStudioStringsProvider>
	);
}

function BrowseRail({ scope, onSelect, actions, customPrompts, assistants }: { scope: BrowseScope; onSelect: (scope: BrowseScope) => void; actions: readonly AIControlActionSummary[]; customPrompts: readonly CustomPromptDefShape[]; assistants: readonly ChatAssistantDefinition[] }): React.ReactElement {
	const actionCount = actions.length;
	const countFor = (area: AIControlProductArea): number => actions.filter((action) => action.area === area).length;
	return <nav aria-label="AI Control Center sections" className="pktw-flex pktw-min-h-0 pktw-flex-col pktw-border-r pktw-border-pk-border pktw-p-2"><span className="pktw-px-2 pktw-py-2 pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">Peak AI</span><RailButton active={scope === 'all'} icon={<Sparkles size={15} />} label="All controls" count={actionCount + customPrompts.length + assistants.length} onClick={() => onSelect('all')} />{PRODUCT_AREAS.map((area) => <RailButton key={area.id} active={scope === area.id} icon={<Bot size={15} />} label={area.label} count={countFor(area.id)} onClick={() => onSelect(area.id)} />)}<div className="pktw-mx-2 pktw-my-3 pktw-border-t pktw-border-pk-border" /><span className="pktw-px-2 pktw-pb-2 pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">Your AI</span><RailButton active={scope === 'custom-prompts'} icon={<FileText size={15} />} label="Custom Prompts" count={customPrompts.length} onClick={() => onSelect('custom-prompts')} /><RailButton active={scope === 'chat-assistants'} icon={<UserRound size={15} />} label="Chat Assistants" count={assistants.length} onClick={() => onSelect('chat-assistants')} /></nav>;
}

function RailButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count: number; onClick: () => void }): React.ReactElement {
	return <Button variant="ghost" className={`pktw-mb-1 pktw-flex pktw-h-auto pktw-w-full pktw-items-center pktw-justify-between pktw-gap-2 pktw-px-2 pktw-py-2 pktw-text-left ${active ? 'pktw-bg-pk-accent/10 pktw-text-pk-accent' : ''}`} onClick={onClick}><span className="pktw-flex pktw-min-w-0 pktw-items-center pktw-gap-2"><span>{icon}</span><span className="pktw-truncate pktw-text-sm">{label}</span></span><span className="pktw-text-xs pktw-text-pk-text-tertiary">{count}</span></Button>;
}

function ControlRow({ row, active, onSelect }: { row: { kind: Selection['kind']; item: AIControlActionSummary | CustomPromptDefShape | ChatAssistantDefinition }; active: boolean; onSelect: () => void }): React.ReactElement {
	const icon = row.kind === 'action' ? <Sparkles size={16} /> : row.kind === 'custom' ? <FileText size={16} /> : <MessageSquareText size={16} />;
	const title = row.kind === 'assistant' ? row.item.name : row.item.label;
	const description = row.kind === 'assistant' ? row.item.summary : row.item.description;
	return <Button variant="ghost" className={`pktw-mb-1 pktw-flex pktw-h-auto pktw-w-full pktw-items-start pktw-gap-2 pktw-p-2.5 pktw-text-left ${active ? 'pktw-bg-pk-accent/10' : ''}`} onClick={onSelect}><span className="pktw-mt-0.5 pktw-text-pk-text-tertiary">{icon}</span><span className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col pktw-gap-0.5"><span className="pktw-text-sm pktw-font-medium">{title}</span><span className="pktw-line-clamp-2 pktw-text-xs pktw-text-pk-text-tertiary">{description || 'No description yet.'}</span></span></Button>;
}

function ActionDetail({ action, onEditPrompt }: { action: AIControlActionSummary; onEditPrompt: (id: PromptId) => Promise<void> }): React.ReactElement {
	return <div className="pktw-flex pktw-max-w-4xl pktw-flex-col pktw-gap-6"><div className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">{areaLabel(action.area)}</span><span className="pktw-text-2xl pktw-font-semibold">{action.label}</span><span className="pktw-text-sm pktw-text-pk-text-secondary">{action.description}</span></div><div className="pktw-flex pktw-flex-col pktw-gap-3"><div><span className="pktw-block pktw-text-sm pktw-font-semibold">Prompts</span><span className="pktw-mt-1 pktw-block pktw-text-xs pktw-text-pk-text-tertiary">These are the instructions this action renders on its next run. The values below are supplied by Peak at run time.</span></div>{action.promptSlots.map((slot) => <PromptSlotCard key={slot.id} slot={slot} onEdit={() => void onEditPrompt(slot.id)} />)}</div></div>;
}

function PromptSlotCard({ slot, onEdit }: { slot: AIControlPromptSlot; onEdit: () => void }): React.ReactElement {
	const roleLabel = slot.role === 'system' ? 'System prompt' : slot.role === 'user' ? 'User prompt' : 'Instruction prompt';
	return <div className="pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-surface"><div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-3 pktw-p-4"><div className="pktw-flex pktw-min-w-0 pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">{roleLabel}</span><span className="pktw-text-sm pktw-font-medium">{slot.label}</span><span className="pktw-text-xs pktw-text-pk-text-secondary">{slot.description}</span></div><Button size="sm" variant="secondary" onClick={onEdit}>Edit prompt</Button></div><PromptInputsTable inputs={slot.inputs} /></div>;
}

function CustomPromptDetail({ prompt, onEdit, onDelete }: { prompt: CustomPromptDefShape; onEdit: () => void; onDelete: () => void }): React.ReactElement {
	const inputs = CUSTOM_PROMPT_TEMPLATE_VARIABLES.map((field) => ({ name: field.name, description: field.description }));
	return <div className="pktw-flex pktw-max-w-4xl pktw-flex-col pktw-gap-6"><div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-3"><div className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">Custom Prompt</span><span className="pktw-text-2xl pktw-font-semibold">{prompt.label}</span><span className="pktw-text-sm pktw-text-pk-text-secondary">{prompt.description || 'No description yet.'}</span></div><div className="pktw-flex pktw-gap-2"><Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button><Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button></div></div><div className="pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-surface"><div className="pktw-p-4"><span className="pktw-block pktw-text-sm pktw-font-medium">Template inputs</span><span className="pktw-mt-1 pktw-block pktw-text-xs pktw-text-pk-text-tertiary">Peak supplies these document values when this Custom Prompt runs.</span></div><PromptInputsTable inputs={inputs} /></div></div>;
}

function AssistantDetail({ assistant, onEdit }: { assistant: ChatAssistantDefinition; onEdit: () => void }): React.ReactElement {
	return <div className="pktw-flex pktw-max-w-4xl pktw-flex-col pktw-gap-6"><div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-3"><div className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">Chat Assistant</span><span className="pktw-text-2xl pktw-font-semibold">{assistant.name}</span><span className="pktw-text-sm pktw-text-pk-text-secondary">{assistant.summary || 'No summary yet.'}</span></div><Button size="sm" variant="secondary" onClick={onEdit}>Edit assistant</Button></div><div className="pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-p-4"><span className="pktw-block pktw-text-sm pktw-font-medium">Instructions</span><span className="pktw-mt-2 pktw-block pktw-whitespace-pre-wrap pktw-text-sm pktw-text-pk-text-secondary">{assistant.instructions || 'No instructions yet.'}</span></div></div>;
}

function EmptyDetail(): React.ReactElement {
	return <div className="pktw-flex pktw-h-full pktw-min-h-[320px] pktw-items-center pktw-justify-center"><div className="pktw-flex pktw-max-w-sm pktw-flex-col pktw-items-center pktw-gap-2 pktw-text-center"><Bot size={28} className="pktw-text-pk-text-tertiary" /><span className="pktw-text-base pktw-font-medium">Select a control</span><span className="pktw-text-sm pktw-text-pk-text-tertiary">Only actions that use a real Peak prompt appear here.</span></div></div>;
}
