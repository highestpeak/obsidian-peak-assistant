import React, { useState, useCallback } from 'react';
import { Plus, MoreHorizontal, ListTree, CheckSquare } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import {
	Popover,
	PopoverContent,
	PopoverItem,
	PopoverTrigger,
} from '@/ui/components/primitives/Popover';
import { InputModal } from '@/ui/component/shared-ui/InputModal';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import { ProjectSectionHead } from './ProjectSectionHead';
import type { ChatConversation } from '@/service/chat/types';
import type { ProjectPlanRef } from '@/core/types/chat-studio';
import { PROJECT_PLAN_STATUSES } from '@/core/types/chat-studio';
import { formatRelativeDate } from '@/core/utils/date-utils';
import { nextStatus, sortPlans, statusLabel } from './planHelpers';

interface ProjectPlansTabProps {
	projectId: string;
	plans: ProjectPlanRef[];
	conversations: ChatConversation[];
	onReload: () => void | Promise<void>;
}

/**
 * Plans tab (chat-studio §9.1 / PROJ-04, audit new-3). Section head + single
 * bordered list of plan rows: icon seat + title/meta + progress bar, with the
 * status/rename/delete menu preserved as the row's trailing icon-button.
 */
export const ProjectPlansTab: React.FC<ProjectPlansTabProps> = ({
	projectId, plans, conversations, onReload,
}) => {
	const strings = useChatStudioStrings().projectHome;
	const [creating, setCreating] = useState(false);

	const sorted = sortPlans(plans);

	return (
		<section className="pkchat-projsection">
			<ProjectSectionHead
				title={strings.plansSectionTitle}
				desc={strings.plansSectionDesc}
				action={{
					label: strings.planNewLabel,
					icon: <Plus />,
					onClick: () => setCreating(true),
				}}
			/>
			{sorted.length === 0 ? (
				<div className="pkchat-projempty">{strings.plansEmpty}</div>
			) : (
				<div className="pkchat-projlist">
					{sorted.map(plan => (
						<PlanRow key={plan.id} plan={plan} onChanged={onReload} />
					))}
				</div>
			)}
			{creating && (
				<NewPlanModal
					projectId={projectId}
					conversations={conversations}
					onClose={() => setCreating(false)}
					onCreated={onReload}
				/>
			)}
		</section>
	);
};

// ─────────────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────────────

interface PlanRowProps {
	plan: ProjectPlanRef;
	onChanged: () => void | Promise<void>;
}

const PlanRow: React.FC<PlanRowProps> = ({ plan, onChanged }) => {
	const studio = useChatStudioStrings();
	const strings = studio.projectHome;
	const planStrings = studio.projectPlans;
	const { manager, vaultNavigation, chatNavigation } = useServiceContext();
	const [renaming, setRenaming] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	const openSource = useCallback(async () => {
		if (plan.source.kind === 'conversation') {
			await chatNavigation.openConversationByIdInChat(plan.source.conversationId);
			return;
		}
		void vaultNavigation.openLink(plan.source.path);
	}, [plan.source, chatNavigation, vaultNavigation]);

	const changeStatus = useCallback(async (raw: string) => {
		const status = nextStatus(plan.status, raw);
		if (status === plan.status) { setMenuOpen(false); return; }
		await manager.proj.updatePlan({ ...plan, status });
		setMenuOpen(false);
		await onChanged();
	}, [manager, plan, onChanged]);

	const rename = useCallback(async (value: string | null) => {
		if (!value || !value.trim() || value.trim() === plan.title) { setRenaming(false); return; }
		await manager.proj.updatePlan({ ...plan, title: value.trim() });
		setRenaming(false);
		await onChanged();
	}, [manager, plan, onChanged]);

	const remove = useCallback(async (e: React.MouseEvent) => {
		// Popout-safe confirm: resolve the window from the trigger's
		// ownerDocument, never the global window (FIX 5).
		const win = (e.currentTarget as HTMLElement)?.ownerDocument?.defaultView ?? window;
		const message = planStrings.deleteConfirm.replace('{name}', plan.title);
		if (!win.confirm(message)) { setMenuOpen(false); return; }
		await manager.proj.deletePlan(plan.id);
		setMenuOpen(false);
		await onChanged();
	}, [manager, plan, onChanged, planStrings.deleteConfirm]);

	const percent = plan.progress && plan.progress.total > 0
		? Math.max(0, Math.min(100, Math.round((plan.progress.completed / plan.progress.total) * 100)))
		: null;
	const progressText = plan.progress ? `${plan.progress.completed}/${plan.progress.total}` : null;

	const metaParts = [statusLabel(plan.status, strings), formatRelativeDate(plan.updatedAt)];
	if (progressText) metaParts.push(progressText);

	const SeatIcon = percent !== null && percent >= 100 ? CheckSquare : ListTree;

	return (
		<div className="pkchat-projrow pkchat-projrow--plan">
			<span className="pkchat-projrow__icon" aria-hidden>
				<SeatIcon />
			</span>
			<button
				type="button"
				onClick={() => void openSource()}
				className="pkchat-projrow__copy pktw-text-left pktw-bg-transparent pktw-border-0 pktw-p-0 pktw-cursor-pointer"
				aria-label={plan.title}
			>
				<span className="pkchat-projrow__title">{plan.title}</span>
				<span className="pkchat-projrow__meta">{metaParts.join(' · ')}</span>
				{percent !== null && (
					<span className="pkchat-projprogress" aria-hidden>
						<i style={{ width: `${percent}%` }} />
					</span>
				)}
			</button>
			<Popover open={menuOpen} onOpenChange={setMenuOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="pkchat-projrow__iconbtn"
						aria-label={planStrings.rowMenuLabel}
					>
						<MoreHorizontal />
					</button>
				</PopoverTrigger>
				<PopoverContent align="end" className="pktw-min-w-[160px]">
					<PopoverItem onClick={() => { setMenuOpen(false); setRenaming(true); }}>
						{planStrings.rowRename}
					</PopoverItem>
					<PopoverItem onClick={() => { setMenuOpen(false); void openSource(); }}>
						{planStrings.rowOpenSource}
					</PopoverItem>
					<div className="pktw-my-1 pktw-h-px pktw-bg-pk-border" />
					{PROJECT_PLAN_STATUSES.map(s => (
						<PopoverItem
							key={s}
							onClick={() => void changeStatus(s)}
							disabled={s === plan.status}
						>
							{statusLabel(s, strings)}
						</PopoverItem>
					))}
					<div className="pktw-my-1 pktw-h-px pktw-bg-pk-border" />
					<PopoverItem onClick={(e) => void remove(e)}>
						{planStrings.rowDelete}
					</PopoverItem>
				</PopoverContent>
			</Popover>
			{renaming && (
				<InputModal
					open={renaming}
					onOpenChange={setRenaming}
					message={planStrings.renameTitle}
					initialValue={plan.title}
					placeholderText={planStrings.titlePlaceholder}
					submitButtonText={planStrings.renameSubmit}
					onSubmit={(v) => void rename(v)}
				/>
			)}
		</div>
	);
};

// ─────────────────────────────────────────────────────────────────────────────
// New Plan modal
// ─────────────────────────────────────────────────────────────────────────────

interface NewPlanModalProps {
	projectId: string;
	conversations: ChatConversation[];
	onClose: () => void;
	onCreated: () => void | Promise<void>;
}

const NewPlanModal: React.FC<NewPlanModalProps> = ({
	projectId, conversations, onClose, onCreated,
}) => {
	const planStrings = useChatStudioStrings().projectPlans;
	const { manager } = useServiceContext();
	const [title, setTitle] = useState('');
	const [sourceKind, setSourceKind] = useState<'conversation' | 'vault'>('conversation');
	const [conversationId, setConversationId] = useState(conversations[0]?.meta.id ?? '');
	const [vaultPath, setVaultPath] = useState('');
	const [saving, setSaving] = useState(false);

	const canSave = title.trim().length > 0 && (
		(sourceKind === 'conversation' && !!conversationId)
		|| (sourceKind === 'vault' && vaultPath.trim().length > 0)
	);

	const submit = async () => {
		if (!canSave) return;
		setSaving(true);
		try {
			await manager.proj.createPlan({
				projectId,
				title: title.trim(),
				source: sourceKind === 'conversation'
					? { kind: 'conversation', conversationId }
					: { kind: 'vault', path: vaultPath.trim() },
			});
			await onCreated();
			onClose();
		} finally {
			setSaving(false);
		}
	};

	// Portal-friendly overlay — lives inside the chat surface's peak-design-root
	// so tokens apply; keyboard: Esc cancels, Enter (in title) submits.
	return (
		<div
			role="dialog"
			aria-modal="true"
			className="pktw-fixed pktw-inset-0 pktw-z-50 pktw-flex pktw-items-center pktw-justify-center pktw-bg-black/40"
			onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
			onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
		>
			<div className="peak-design-root pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-lg pktw-p-4 pktw-w-[480px] pktw-max-w-[90vw] pktw-flex pktw-flex-col pktw-gap-3">
				<span className="pktw-text-sm pktw-font-semibold">{planStrings.newPlanTitle}</span>
				<label className="pktw-flex pktw-flex-col pktw-gap-1">
					<span className="pktw-text-xs pktw-text-pk-muted-foreground">{planStrings.fieldTitleLabel}</span>
					<input
						autoFocus
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={(e) => { if (e.key === 'Enter' && canSave) void submit(); }}
						className="pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded"
						placeholder={planStrings.titlePlaceholder}
					/>
				</label>
				<div className="pktw-flex pktw-gap-1">
					<Button
						variant={sourceKind === 'conversation' ? 'default' : 'ghost'}
						onClick={() => setSourceKind('conversation')}
					>
						{planStrings.sourceConversation}
					</Button>
					<Button
						variant={sourceKind === 'vault' ? 'default' : 'ghost'}
						onClick={() => setSourceKind('vault')}
					>
						{planStrings.sourceVault}
					</Button>
				</div>
				{sourceKind === 'conversation'
					? (
						<label className="pktw-flex pktw-flex-col pktw-gap-1">
							<span className="pktw-text-xs pktw-text-pk-muted-foreground">{planStrings.fieldConversationLabel}</span>
							<select
								value={conversationId}
								onChange={(e) => setConversationId(e.target.value)}
								className="pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded"
							>
								{conversations.length === 0 && <option value="">{planStrings.conversationsEmptyOption}</option>}
								{conversations.map(c => (
									<option key={c.meta.id} value={c.meta.id}>{c.meta.title}</option>
								))}
							</select>
						</label>
					)
					: (
						<label className="pktw-flex pktw-flex-col pktw-gap-1">
							<span className="pktw-text-xs pktw-text-pk-muted-foreground">{planStrings.fieldVaultPathLabel}</span>
							<input
								value={vaultPath}
								onChange={(e) => setVaultPath(e.target.value)}
								placeholder={planStrings.vaultPathPlaceholder}
								className="pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded"
							/>
						</label>
					)
				}
				<div className="pktw-flex pktw-justify-end pktw-gap-1 pktw-mt-1">
					<Button variant="ghost" onClick={onClose} disabled={saving}>{planStrings.cancel}</Button>
					<Button variant="default" onClick={() => void submit()} disabled={!canSave || saving}>
						{planStrings.create}
					</Button>
				</div>
			</div>
		</div>
	);
};
