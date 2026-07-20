import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { Pencil, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/core/types/prompt';
import type { ChatConversation, ChatProject } from '@/service/chat/types';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '../../store/chatViewStore';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import {
	descriptionReducer,
	initialDescriptionState,
	isDescriptionBusy,
	isDescriptionDirty,
} from './descriptionState';

interface ProjectDescriptionEditorProps {
	project: ChatProject;
	conversations: ChatConversation[];
	/** Reports the view/edit transition up so the hero can top-align (audit P9). */
	onEditingChange?: (editing: boolean) => void;
}

/**
 * Inline description editor (chat-studio §9 / PROJ-02 / RUN-05, audit P2/P9).
 *
 * View state: click description text → in-place raised textarea panel. A pencil +
 * "Edit" affordance appears on hover/focus (no standalone Edit button, no italic
 * placeholder). AI draft and human edits share ONE textarea; AI never auto-saves.
 * Only user Save calls manager.proj.updateProjectDescription; the SYSTEM generated
 * summary is rendered as a separate muted line.
 */
export const ProjectDescriptionEditor: React.FC<ProjectDescriptionEditorProps> = ({
	project,
	conversations,
	onEditingChange,
}) => {
	const strings = useChatStudioStrings().projectHome;
	const { manager } = useServiceContext();

	const savedDescription = project.context?.description ?? '';
	const generatedSummary = project.context?.shortSummary ?? '';

	const [state, dispatch] = useReducer(
		descriptionReducer,
		savedDescription,
		initialDescriptionState,
	);

	// Sync when project changes externally (reload / other tab saves).
	const lastSavedRef = useRef(savedDescription);
	useEffect(() => {
		if (savedDescription !== lastSavedRef.current) {
			lastSavedRef.current = savedDescription;
			dispatch({ type: 'saved-changed', value: savedDescription });
		}
	}, [savedDescription]);

	// Report edit-mode transitions so the hero grid can top-align.
	useEffect(() => {
		onEditingChange?.(state.status !== 'view');
	}, [state.status, onEditingChange]);

	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	useEffect(() => {
		if (state.status === 'editing' && textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.select();
		}
	}, [state.status]);

	const persist = useCallback(async (value: string) => {
		dispatch({ type: 'save-start' });
		try {
			const updated = await manager.proj.updateProjectDescription(project.meta.id, value);
			// Update stores so downstream reads pick up the new value.
			useChatDataStore.getState().updateProject(updated);
			useChatViewStore.getState().setProjectOverview(updated);
			lastSavedRef.current = value;
			dispatch({ type: 'save-done', value });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			dispatch({ type: 'save-error', message: msg });
		}
	}, [manager, project.meta.id]);

	const draftWithAi = useCallback(async () => {
		dispatch({ type: 'ai-start' });
		try {
			const titles = conversations.slice(0, 15).map(c => c.meta.title).filter(Boolean).join('\n');
			const text = await manager.queryText(PromptId.ProjectDescriptionDraft, {
				projectName: project.meta.name,
				generatedSummary,
				conversationTitles: titles,
				currentDescription: state.draft,
			});
			dispatch({ type: 'ai-done', value: text.trim() });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			dispatch({ type: 'ai-error', message: msg });
		}
	}, [manager, conversations, project.meta.name, generatedSummary, state.draft]);

	// View mode ---------------------------------------------------------------
	if (state.status === 'view') {
		const isEmpty = !state.saved;
		return (
			<>
				<button
					type="button"
					onClick={() => dispatch({ type: 'start-edit' })}
					className={`pkchat-projdesc-display${isEmpty ? ' pkchat-projdesc-display--empty' : ''}`}
					aria-label={strings.descriptionPlaceholder}
				>
					<span>{state.saved || strings.descriptionPlaceholder}</span>
					<span className="pkchat-projdesc-affordance">
						<Pencil aria-hidden />
						<small>{strings.editLabel}</small>
					</span>
				</button>
				<GeneratedSummaryLine text={generatedSummary} />
			</>
		);
	}

	// Editing / generating / saving / error -----------------------------------
	const busy = isDescriptionBusy(state);
	const dirty = isDescriptionDirty(state);

	return (
		<>
			<div className="pkchat-projdesc-editor">
				<label className="pkchat-projdesc-editor__label">{strings.descriptionEditorLabel}</label>
				<textarea
					ref={textareaRef}
					className="pkchat-projdesc-editor__input"
					value={state.draft}
					onChange={(e) => dispatch({ type: 'change', value: e.target.value })}
					onKeyDown={(e) => {
						if (e.key === 'Escape') { e.preventDefault(); dispatch({ type: 'cancel' }); }
						if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && dirty && !busy) {
							e.preventDefault();
							void persist(state.draft);
						}
					}}
					placeholder={strings.descriptionPlaceholder}
					rows={2}
					disabled={state.status === 'saving'}
				/>
				<div className="pkchat-projdesc-editor__foot">
					<span className="pkchat-projdesc-editor__hint">
						{state.status === 'generating'
							? <><Loader2 className="pktw-inline pktw-w-3 pktw-h-3 pktw-animate-spin pktw-mr-1" />{strings.descriptionAiDraftHint}</>
							: state.status === 'error' && state.errorMessage
								? state.errorMessage
								: strings.descriptionAiDraftHint}
					</span>
					<div className="pkchat-projdesc-editor__actions">
						<Button
							variant="ghost"
							className="pkchat-projdesc-btn pkchat-projdesc-ai"
							onClick={() => void draftWithAi()}
							disabled={busy}
							aria-label={strings.descriptionAiDraft}
						>
							<Sparkles />
							<span>{strings.descriptionAiDraft}</span>
						</Button>
						<Button
							variant="ghost"
							className="pkchat-projdesc-btn"
							onClick={() => dispatch({ type: 'cancel' })}
							disabled={state.status === 'saving'}
						>
							{strings.cancelLabel}
						</Button>
						<Button
							variant="primary"
							className="pkchat-projdesc-btn"
							onClick={() => void persist(state.draft)}
							disabled={busy || !dirty}
						>
							{state.status === 'saving'
								? <Loader2 className="pktw-w-3 pktw-h-3 pktw-animate-spin" />
								: strings.saveLabel}
						</Button>
					</div>
				</div>
			</div>
			<GeneratedSummaryLine text={generatedSummary} />
		</>
	);
};

const GeneratedSummaryLine: React.FC<{ text: string }> = ({ text }) => {
	if (!text) return null;
	return (
		<span className="pktw-block pktw-mt-1.5 pktw-text-pk-xs pktw-text-pk-text-tertiary pktw-leading-relaxed">
			<span className="pktw-uppercase pktw-tracking-wide pktw-mr-1">Generated summary:</span>
			{text}
		</span>
	);
};
