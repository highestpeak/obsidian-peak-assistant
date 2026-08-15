import * as React from 'react';
import {
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	FileText,
	Layers3,
	X,
} from 'lucide-react';
import type {
	ComposerCandidate,
	ComposerCandidateRuntimePort,
} from '@/core/composer';
import type {
	ComposerTaskSession,
	ComposerWorkspaceIntelligenceProjection,
	ComposerWorkspaceIntelligenceRuntime,
	FrozenComposerRunEnvelope,
} from '@/service/composer';
import {
	Button,
	IconButton,
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverItem,
} from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

export interface ComposerReviewNavigationProps {
	candidates: readonly ComposerCandidate[];
	candidateRuntime?: ComposerCandidateRuntimePort;
	acceptAllLabel: string;
	acceptAllFailedLabel: string;
	workspaceRuntime?: ComposerWorkspaceIntelligenceRuntime;
	documentId: string;
	documentPath: string;
	onLocateCandidate(candidate: ComposerCandidate): void;
	onOpenDocument?(path: string): void;
}

/**
 * Task-level review controller. Candidate navigation is document-local; file
 * navigation is task-local. The document popover is a separate target so
 * hovering Accept/Reject never covers the page the user is reviewing.
 */
export function ComposerReviewNavigation({
	candidates,
	candidateRuntime,
	acceptAllLabel,
	acceptAllFailedLabel,
	workspaceRuntime,
	documentId,
	documentPath,
	onLocateCandidate,
	onOpenDocument,
}: ComposerReviewNavigationProps): React.ReactElement {
	const workspace = useWorkspaceProjection(workspaceRuntime);
	const reviewable = candidates.filter(isReviewableCandidate);
	const [candidateIndex, setCandidateIndex] = React.useState(() => Math.max(0, reviewable.length - 1));
	React.useEffect(() => {
		setCandidateIndex((current) => clampIndex(current, reviewable.length));
	}, [reviewable.length]);
	const currentCandidate = reviewable[candidateIndex] ?? null;
	const readyCandidates = reviewable.filter((candidate) => candidate.status === 'ready');
	const [acceptingGroup, setAcceptingGroup] = React.useState(false);
	const [groupError, setGroupError] = React.useState(false);
	const groupCandidateIds = readyCandidates.map((candidate) => candidate.candidateId);
	const groupAcceptable = Boolean(
		candidateRuntime?.acceptMany
		&& (candidateRuntime.canAcceptMany?.(groupCandidateIds) ?? true),
	);
	React.useEffect(() => {
		if (currentCandidate) onLocateCandidate(currentCandidate);
	}, [currentCandidate?.candidateId]);

	const activeTask = workspace?.tasks.find((task) => task.taskId === workspace.activeTaskId) ?? null;
	const pendingDocuments = taskPendingDocumentIds(workspace, activeTask);
	const taskDocumentIds = activeTask?.documentIds ?? [documentId];
	const navigableDocumentIds = pendingDocuments.length > 0 ? pendingDocuments : taskDocumentIds;
	const documentIndex = Math.max(0, navigableDocumentIds.indexOf(documentId));
	const openDocumentAt = (index: number): void => {
		if (!workspace || navigableDocumentIds.length === 0) return;
		const nextId = navigableDocumentIds[wrapIndex(index, navigableDocumentIds.length)];
		const path = workspace.documents[nextId];
		if (path && path !== documentPath) onOpenDocument?.(path);
	};
	const moveCandidate = (delta: number): void => {
		if (reviewable.length === 0) return;
		setCandidateIndex((current) => wrapIndex(current + delta, reviewable.length));
	};
	const reject = (): void => {
		if (!currentCandidate || !candidateRuntime) return;
		candidateRuntime.discard(currentCandidate.candidateId);
	};
	const accept = (): void => {
		if (!currentCandidate || !candidateRuntime || currentCandidate.status !== 'ready') return;
		void candidateRuntime.accept(currentCandidate.candidateId);
	};
	const acceptAll = async (): Promise<void> => {
		if (!candidateRuntime?.acceptMany || !groupAcceptable || readyCandidates.length < 2 || acceptingGroup) return;
		setAcceptingGroup(true);
		setGroupError(false);
		try {
			await candidateRuntime.acceptMany(groupCandidateIds);
		} catch {
			setGroupError(true);
		} finally {
			setAcceptingGroup(false);
		}
	};

	return (
		<div className="pk-composer-review-navigation" data-has-review={reviewable.length > 0 || undefined}>
			{reviewable.length > 0 ? (
				<>
					<div className="pk-composer-review-group" role="group" aria-label="文件内待审改动">
						<IconButton
							className="pk-composer-review-control"
							label="上一个待审改动"
							onClick={() => moveCandidate(-1)}
						>
							<ChevronUp size={14} />
						</IconButton>
						<span className="pk-composer-review-index">
							{candidateIndex + 1}<i>/</i>{reviewable.length}
						</span>
						<IconButton
							className="pk-composer-review-control"
							label="下一个待审改动"
							onClick={() => moveCandidate(1)}
						>
							<ChevronDown size={14} />
						</IconButton>
					</div>
					<div className="pk-composer-review-group pk-composer-review-decisions" role="group" aria-label="审阅当前改动">
						<Button variant="ghost" size="sm" className="pk-composer-review-decision" onClick={reject}>
							<X size={13} aria-hidden />
							<span>拒绝</span>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="pk-composer-review-decision pk-composer-review-decision--accept"
							disabled={currentCandidate?.status !== 'ready'}
							onClick={accept}
						>
							<Check size={13} aria-hidden />
							<span>接受</span>
						</Button>
					</div>
					{groupAcceptable && readyCandidates.length > 1 ? (
						<Button
							variant="ghost"
							size="sm"
							className="pk-composer-review-decision pk-composer-review-decision--accept-all"
							disabled={acceptingGroup}
							title={groupError ? acceptAllFailedLabel : undefined}
							onClick={() => void acceptAll()}
						>
							<Check size={13} aria-hidden />
							<span>{acceptAllLabel.replace('{count}', String(readyCandidates.length))}</span>
						</Button>
					) : null}
					{groupError ? (
						<span className="pk-composer-review-error" role="status">
							{acceptAllFailedLabel}
						</span>
					) : null}
					<div className="pk-composer-review-group" role="group" aria-label="任务文件间导航">
						<IconButton
							className="pk-composer-review-control"
							label="上一个有待审改动的文档"
							disabled={navigableDocumentIds.length < 2}
							onClick={() => openDocumentAt(documentIndex - 1)}
						>
							<ChevronLeft size={14} />
						</IconButton>
						<span className="pk-composer-review-index">
							{Math.min(documentIndex + 1, navigableDocumentIds.length)}<i>/</i>{navigableDocumentIds.length}
						</span>
						<IconButton
							className="pk-composer-review-control"
							label="下一个有待审改动的文档"
							disabled={navigableDocumentIds.length < 2}
							onClick={() => openDocumentAt(documentIndex + 1)}
						>
							<ChevronRight size={14} />
						</IconButton>
					</div>
				</>
			) : null}
			<TaskDocumentsPopover
				workspace={workspace}
				runtime={workspaceRuntime}
				activeTask={activeTask}
				documentId={documentId}
				documentPath={documentPath}
				onOpenDocument={onOpenDocument}
			/>
		</div>
	);
}

function TaskDocumentsPopover({
	workspace,
	runtime,
	activeTask,
	documentId,
	documentPath,
	onOpenDocument,
}: {
	workspace: ComposerWorkspaceIntelligenceProjection | null;
	runtime?: ComposerWorkspaceIntelligenceRuntime;
	activeTask: ComposerTaskSession | null;
	documentId: string;
	documentPath: string;
	onOpenDocument?: (path: string) => void;
}): React.ReactElement {
	const [open, setOpen] = React.useState(false);
	const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const cancelClose = (): void => {
		if (closeTimer.current === null) return;
		clearTimeout(closeTimer.current);
		closeTimer.current = null;
	};
	const scheduleClose = (): void => {
		cancelClose();
		closeTimer.current = setTimeout(() => setOpen(false), 180);
	};
	React.useEffect(() => () => cancelClose(), []);

	const rows = buildTaskDocumentRows(workspace, activeTask, documentId, documentPath);
	const changeRows = rows.filter((row) => row.pendingCount > 0);
	const contextRows = rows.filter((row) => row.pendingCount === 0);
	const taskCount = activeTask?.documentIds.length ?? 1;
	const currentInTask = activeTask?.documentIds.includes(documentId) ?? false;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>
				<Button
					variant="ghost"
					size="sm"
					className="pk-composer-task-documents-trigger"
					aria-label={`任务文档 ${taskCount}`}
					aria-expanded={open}
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.reviewDocuments}
					onPointerEnter={() => {
						cancelClose();
						setOpen(true);
					}}
					onPointerLeave={scheduleClose}
					onFocus={() => setOpen(true)}
					onClick={() => setOpen((current) => !current)}
				>
					<Layers3 size={14} aria-hidden />
					<span>任务文档</span>
					<strong>{taskCount}</strong>
				</Button>
			</PopoverAnchor>
			<PopoverContent
				className="pk-composer-task-documents-popover"
				align="center"
				side="bottom"
				sideOffset={6}
				onOpenAutoFocus={(event) => event.preventDefault()}
				onPointerEnter={cancelClose}
				onPointerLeave={scheduleClose}
				onInteractOutside={(event) => {
					const target = event.target;
					if (target instanceof Element && target.closest('.pk-composer-task-documents-trigger')) {
						event.preventDefault();
					}
				}}
			>
				<div className="pk-composer-task-documents-head">
					<span>当前 Change Set</span>
					<strong>{changeRows.reduce((count, row) => count + row.pendingCount, 0)} 个待审改动</strong>
				</div>
				{changeRows.length > 0 ? changeRows.map((row) => (
					<TaskDocumentRow key={row.documentId} row={row} onOpenDocument={onOpenDocument} />
				)) : (
					<span className="pk-composer-task-documents-empty">当前任务没有待审改动</span>
				)}
				{contextRows.length > 0 ? (
					<>
						<span className="pk-composer-task-documents-section">任务上下文 · 未在当前 Change Set 中</span>
						{contextRows.map((row) => (
							<TaskDocumentRow key={row.documentId} row={row} onOpenDocument={onOpenDocument} />
						))}
					</>
				) : null}
				{!currentInTask ? (
					<PopoverItem
						className="pk-composer-task-documents-add"
						onClick={() => runtime?.addDocumentToActiveTask(documentId)}
					>
						<Layers3 aria-hidden />
						<span>加入当前文档</span>
					</PopoverItem>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

export interface TaskDocumentRowProjection {
	documentId: string;
	path: string;
	pendingCount: number;
	added: number;
	removed: number;
	current: boolean;
	deleted: boolean;
	created: boolean;
}

function TaskDocumentRow({
	row,
	onOpenDocument,
}: {
	row: TaskDocumentRowProjection;
	onOpenDocument?: (path: string) => void;
}): React.ReactElement {
	return (
		<PopoverItem
			className={cn(
				'pk-composer-task-document-row',
				row.current && 'pk-composer-task-document-row--current',
				row.deleted && 'pk-composer-task-document-row--deleted',
				row.created && 'pk-composer-task-document-row--created',
			)}
			onClick={() => onOpenDocument?.(row.path)}
		>
			<FileText aria-hidden />
			<span className="pk-composer-task-document-row__name">
				{fileName(row.path)}
				{row.current ? <small>当前</small> : null}
			</span>
			<span className="pk-composer-task-document-row__stats" aria-label={`增加 ${row.added}，删除 ${row.removed}`}>
				{row.added > 0 ? <b>+{row.added}</b> : <b aria-hidden>+0</b>}
				{row.removed > 0 ? <i>−{row.removed}</i> : <i aria-hidden>−0</i>}
			</span>
		</PopoverItem>
	);
}

function useWorkspaceProjection(
	runtime?: ComposerWorkspaceIntelligenceRuntime,
): ComposerWorkspaceIntelligenceProjection | null {
	const [projection, setProjection] = React.useState<ComposerWorkspaceIntelligenceProjection | null>(
		runtime?.projection() ?? null,
	);
	React.useEffect(() => {
		if (!runtime) {
			setProjection(null);
			return;
		}
		return runtime.subscribe(setProjection);
	}, [runtime]);
	return projection;
}

function taskPendingDocumentIds(
	workspace: ComposerWorkspaceIntelligenceProjection | null,
	task: ComposerTaskSession | null,
): string[] {
	if (!workspace || !task) return [];
	const ids = new Set(latestPendingRuns(workspace.runs).map((run) => run.originDocumentId));
	return task.documentIds.filter((documentId) => ids.has(documentId));
}

export function buildTaskDocumentRows(
	workspace: ComposerWorkspaceIntelligenceProjection | null,
	task: ComposerTaskSession | null,
	currentDocumentId: string,
	currentPath: string,
): TaskDocumentRowProjection[] {
	if (!workspace || !task) {
		return [{
			documentId: currentDocumentId,
			path: currentPath,
			pendingCount: 0,
			added: 0,
			removed: 0,
			current: true,
			deleted: false,
			created: false,
		}];
	}
	const pendingByDocument = new Map<string, FrozenComposerRunEnvelope[]>();
	for (const run of latestPendingRuns(workspace.runs)) {
		if (!task.documentIds.includes(run.originDocumentId)) continue;
		const runs = pendingByDocument.get(run.originDocumentId) ?? [];
		runs.push(run);
		pendingByDocument.set(run.originDocumentId, runs);
	}
	return task.documentIds.map((taskDocumentId) => {
		const runs = pendingByDocument.get(taskDocumentId) ?? [];
		let added = 0;
		let removed = 0;
		let deleted = false;
		let created = false;
		for (const run of runs) {
			const stats = candidateStats(run);
			added += stats.added;
			removed += stats.removed;
			deleted ||= stats.deleted;
			created ||= stats.created;
		}
		return {
			documentId: taskDocumentId,
			path: workspace.documents[taskDocumentId] ?? runs[0]?.originPathAtStart ?? taskDocumentId,
			pendingCount: runs.length,
			added,
			removed,
			current: taskDocumentId === currentDocumentId,
			deleted,
			created,
		};
	}).sort((left, right) => {
		if (left.pendingCount !== right.pendingCount) return right.pendingCount - left.pendingCount;
		if (left.current !== right.current) return left.current ? -1 : 1;
		return left.path.localeCompare(right.path);
	});
}

function latestPendingRuns(runs: readonly FrozenComposerRunEnvelope[]): FrozenComposerRunEnvelope[] {
	const latest = new Map<string, FrozenComposerRunEnvelope>();
	for (const run of [...runs].sort((left, right) => right.startedAt - left.startedAt)) {
		if (latest.has(run.candidateId)) continue;
		if (run.disposition !== 'pending' || !run.review) continue;
		if (!isReviewableCandidate(run.review.candidate)) continue;
		latest.set(run.candidateId, run);
	}
	return [...latest.values()];
}

function candidateStats(run: FrozenComposerRunEnvelope): {
	added: number;
	removed: number;
	deleted: boolean;
	created: boolean;
} {
	let added = 0;
	let removed = 0;
	const operations = run.review?.candidate.proposedChange.operations ?? [];
	for (const operation of operations) {
		if (operation.kind === 'replaceRange') {
			added += operation.text.length;
			removed += operation.to - operation.from;
			continue;
		}
		if (operation.kind === 'insertBlock') {
			added += operation.text.length;
			continue;
		}
		if (operation.kind === 'removeBlock') {
			removed += operation.to - operation.from;
			continue;
		}
		removed += operation.to - operation.from;
		added += operation.to - operation.from;
	}
	return {
		added,
		removed,
		deleted: run.target.kind === 'document' && operations.length > 0 && added === 0 && removed > 0,
		created: run.target.kind === 'document' && operations.length > 0 && added > 0 && removed === 0,
	};
}

function isReviewableCandidate(candidate: ComposerCandidate): boolean {
	return candidate.status === 'streaming'
		|| candidate.status === 'ready'
		|| candidate.status === 'stale';
}

function fileName(path: string): string {
	return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1) || path;
}

function clampIndex(index: number, length: number): number {
	if (length <= 0) return 0;
	return Math.min(Math.max(index, 0), length - 1);
}

function wrapIndex(index: number, length: number): number {
	if (length <= 0) return 0;
	return (index % length + length) % length;
}
