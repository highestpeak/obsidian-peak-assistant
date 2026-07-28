import * as React from 'react';
import {
	Check,
	Globe2,
	Lock,
	MessageSquare,
	Reply,
	RotateCcw,
	Sparkles,
	Trash2,
} from 'lucide-react';
import { Button, Chip, IconButton } from '@/ui/components/primitives';
import {
	LOCAL_COMMENT_ACTOR,
	makeCommentAnchor,
	type ComposerComment,
} from '@/service/composer';
import { useComposerChrome } from './ComposerChromeContext';
import { domRangeForSource } from './selectionMapping';
import {
	commentConnectorPath,
	resolveCommentRailMode,
	stackCommentCards,
	type CommentRailMode,
} from './commentLayout';

export interface CommentDraftTarget {
	blockId: string;
	range?: { from: number; to: number };
}

export interface CommentRailProps {
	shellRef: React.RefObject<HTMLDivElement | null>;
	workspaceRef: React.RefObject<HTMLDivElement | null>;
	draftTarget: CommentDraftTarget | null;
	activeCommentId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDraftClose: () => void;
	onActiveComment: (commentId: string | null) => void;
	onLocate: (blockId: string) => void;
	onAskCopilot?: (comment: ComposerComment) => void;
}

/**
 * Document-adjacent comment rail. Wide hosts align cards with their source
 * anchors; constrained hosts keep the same threads in a right-edge drawer.
 * Neither mode enters the Markdown flow or changes document height.
 */
export function CommentRail({
	shellRef,
	workspaceRef,
	draftTarget,
	activeCommentId,
	open,
	onOpenChange,
	onDraftClose,
	onActiveComment,
	onLocate,
	onAskCopilot,
}: CommentRailProps): React.ReactElement | null {
	const { runtime, config, snapshot } = useComposerChrome();
	const store = runtime.comments;
	const c = config.chrome.comment;
	const [comments, setComments] = React.useState<readonly ComposerComment[]>([]);
	const [mode, setMode] = React.useState<CommentRailMode>('rail');
	const [positions, setPositions] = React.useState<Record<string, number>>({});
	const [connectors, setConnectors] = React.useState<Array<{
		id: string;
		path: string;
		sourceX: number;
		sourceY: number;
	}>>([]);
	const cardRefs = React.useRef(new Map<string, HTMLDivElement>());

	React.useEffect(() => {
		if (!store) return;
		return store.subscribe(setComments);
	}, [store]);

	React.useLayoutEffect(() => {
		const workspace = workspaceRef.current;
		const host = workspace?.parentElement;
		if (!workspace || !host) return;
		const win = workspace.ownerDocument.defaultView;
		if (!win) return;
		const update = () => {
			setMode(resolveCommentRailMode(host.clientWidth, c.railBreakpointPx));
		};
		update();
		const observer = win.ResizeObserver ? new win.ResizeObserver(update) : null;
		observer?.observe(host);
		win.addEventListener('resize', update);
		return () => {
			observer?.disconnect();
			win.removeEventListener('resize', update);
		};
	}, [workspaceRef, c.railBreakpointPx]);

	React.useEffect(() => {
		if (draftTarget || activeCommentId) onOpenChange(true);
	}, [draftTarget, activeCommentId, onOpenChange]);

	const recalculate = React.useCallback(() => {
		if (mode !== 'rail' || !open) {
			setConnectors((current) => current.length === 0 ? current : []);
			return;
		}
		const shell = shellRef.current;
		const workspace = workspaceRef.current;
		if (!shell || !workspace) return;
		const workspaceRect = workspace.getBoundingClientRect();
		const metrics = comments.map((comment) => ({
			id: comment.commentId,
			desiredTop: Math.max(
				0,
				(anchorPoint(
					shell,
					workspaceRect,
					comment.anchor.blockId,
					comment.anchor.range,
				)?.y ?? 18) - 18,
			),
			height: cardRefs.current.get(comment.commentId)?.getBoundingClientRect().height ?? 148,
		}));
		if (draftTarget) {
			metrics.push({
				id: 'draft',
				desiredTop: Math.max(
					0,
					(anchorPoint(
						shell,
						workspaceRect,
						draftTarget.blockId,
						draftTarget.range,
					)?.y ?? 18) - 18,
				),
				height: cardRefs.current.get('draft')?.getBoundingClientRect().height ?? 176,
			});
		}
		const next = Object.fromEntries(stackCommentCards(metrics).map((card) => [card.id, card.top]));
		setPositions((current) => samePositions(current, next) ? current : next);

		const targets = comments.map((comment) => ({
			id: comment.commentId,
			blockId: comment.anchor.blockId,
			range: comment.anchor.range,
		}));
		if (draftTarget) targets.push({ id: 'draft', blockId: draftTarget.blockId, range: draftTarget.range });
		const nextConnectors = targets.flatMap((target) => {
			const card = cardRefs.current.get(target.id);
			const source = anchorPoint(shell, workspaceRect, target.blockId, target.range);
			if (!card || !source) return [];
			const cardRect = card.getBoundingClientRect();
			const cardX = cardRect.left - workspaceRect.left;
			const cardY = (next[target.id] ?? 0) + 18;
			return [{
				id: target.id,
				sourceX: source.x,
				sourceY: source.y,
				path: commentConnectorPath({
					sourceX: source.x,
					sourceY: source.y,
					cardX,
					cardY,
				}),
			}];
		});
		setConnectors(nextConnectors);
	}, [mode, open, shellRef, workspaceRef, comments, draftTarget]);

	React.useLayoutEffect(() => {
		recalculate();
		const shell = shellRef.current;
		const win = shell?.ownerDocument.defaultView;
		if (!shell || !win) return;
		const observer = win.ResizeObserver ? new win.ResizeObserver(recalculate) : null;
		observer?.observe(shell);
		for (const card of cardRefs.current.values()) observer?.observe(card);
		const frame = win.requestAnimationFrame(recalculate);
		win.addEventListener('resize', recalculate);
		return () => {
			win.cancelAnimationFrame(frame);
			observer?.disconnect();
			win.removeEventListener('resize', recalculate);
		};
	}, [recalculate, shellRef]);

	if (!store || !snapshot || (comments.length === 0 && !draftTarget)) return null;

	const setCardRef = (id: string) => (node: HTMLDivElement | null) => {
		if (node) cardRefs.current.set(id, node);
		else cardRefs.current.delete(id);
	};

	if (!open) {
		return null;
	}

	return (
		<>
			{mode === 'rail' && connectors.length > 0 && (
				<svg className="pk-comment-connectors" aria-hidden="true">
					{connectors.map((connector) => (
						<g key={connector.id}>
							<path d={connector.path} />
							<circle cx={connector.sourceX} cy={connector.sourceY} r="2.5" />
						</g>
					))}
				</svg>
			)}
			<aside
				className="pk-comment-rail"
				data-mode={mode}
				data-chrome="true"
				aria-label={c.railTitle}
			>
				<div className="pk-comment-rail__cards">
					{draftTarget && (
						<CommentDraftCard
							ref={setCardRef('draft')}
							target={draftTarget}
							style={mode === 'rail' ? { top: positions.draft ?? 0 } : undefined}
							onCancel={onDraftClose}
							onSaved={(commentId) => {
								onDraftClose();
								onActiveComment(commentId);
							}}
						/>
					)}
					{comments.map((comment) => (
						<CommentThreadCard
							key={comment.commentId}
							ref={setCardRef(comment.commentId)}
							comment={comment}
							active={comment.commentId === activeCommentId}
							style={mode === 'rail' ? { top: positions[comment.commentId] ?? 0 } : undefined}
							onActivate={() => {
								onActiveComment(comment.commentId);
								onLocate(comment.anchor.blockId);
							}}
							onAskCopilot={onAskCopilot}
							onRemoved={() => {
								if (comment.commentId === activeCommentId) onActiveComment(null);
							}}
						/>
					))}
				</div>
			</aside>
		</>
	);
}

export function CommentHighlightLayer({
	shellRef,
	activeCommentId,
	draftTarget,
	visible,
}: {
	shellRef: React.RefObject<HTMLDivElement | null>;
	activeCommentId: string | null;
	draftTarget: CommentDraftTarget | null;
	visible: boolean;
}): React.ReactElement | null {
	const { runtime } = useComposerChrome();
	const store = runtime.comments;
	const [comments, setComments] = React.useState<readonly ComposerComment[]>([]);
	const [rects, setRects] = React.useState<Array<{
		key: string;
		top: number;
		left: number;
		width: number;
		height: number;
		active: boolean;
	}>>([]);

	React.useEffect(() => {
		if (!store) return;
		return store.subscribe(setComments);
	}, [store]);

	const recalculate = React.useCallback(() => {
		if (!visible) {
			setRects((current) => current.length === 0 ? current : []);
			return;
		}
		const shell = shellRef.current;
		if (!shell) return;
		const shellRect = shell.getBoundingClientRect();
		const next: typeof rects = [];
		for (const comment of comments) {
			if (!comment.anchor.range) continue;
			appendRangeRects(next, shell, shellRect, comment.commentId, comment.anchor.range, comment.commentId === activeCommentId);
		}
		if (draftTarget?.range) {
			appendRangeRects(next, shell, shellRect, 'draft', draftTarget.range, true);
		}
		setRects(next);
	}, [visible, shellRef, comments, activeCommentId, draftTarget]);

	React.useLayoutEffect(() => {
		recalculate();
		const shell = shellRef.current;
		const win = shell?.ownerDocument.defaultView;
		if (!shell || !win) return;
		const observer = win.ResizeObserver ? new win.ResizeObserver(recalculate) : null;
		observer?.observe(shell);
		const frame = win.requestAnimationFrame(recalculate);
		win.addEventListener('resize', recalculate);
		return () => {
			win.cancelAnimationFrame(frame);
			observer?.disconnect();
			win.removeEventListener('resize', recalculate);
		};
	}, [recalculate, shellRef]);

	if (!visible || rects.length === 0) return null;
	return (
		<div className="pk-comment-highlights" aria-hidden="true">
			{rects.map((rect) => (
				<span
					key={rect.key}
					className="pk-comment-highlight"
					data-active={rect.active || undefined}
					style={{
						top: rect.top,
						left: rect.left,
						width: rect.width,
						height: rect.height,
					}}
				/>
			))}
		</div>
	);
}

export function CommentAnchorMarker({
	blockId,
	activeCommentId,
	onActivate,
}: {
	blockId: string;
	activeCommentId: string | null;
	onActivate: (commentId: string) => void;
}): React.ReactElement | null {
	const { runtime, config } = useComposerChrome();
	const store = runtime.comments;
	const [comments, setComments] = React.useState<readonly ComposerComment[]>([]);
	React.useEffect(() => {
		if (!store) return;
		return store.subscribe((all) => setComments(all.filter((comment) => comment.anchor.blockId === blockId)));
	}, [store, blockId]);
	if (comments.length === 0) return null;
	const active = comments.some((comment) => comment.commentId === activeCommentId);
	return (
		<Button
			variant="ghost"
			size="sm"
			className="pk-comment-anchor-marker"
			data-active={active || undefined}
			aria-label={`${config.chrome.comment.openRail} (${comments.length})`}
			onClick={() => onActivate(comments[0].commentId)}
		>
			<MessageSquare size={12} />
			<span>{comments.length}</span>
		</Button>
	);
}

const CommentDraftCard = React.forwardRef<HTMLDivElement, {
	target: CommentDraftTarget;
	style?: React.CSSProperties;
	onCancel: () => void;
	onSaved: (commentId: string) => void;
}>(function CommentDraftCard({ target, style, onCancel, onSaved }, ref) {
	const { runtime, config, snapshot } = useComposerChrome();
	const store = runtime.comments;
	const c = config.chrome.comment;
	const [draft, setDraft] = React.useState('');
	const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

	React.useEffect(() => {
		inputRef.current?.focus();
	}, [target.blockId, target.range?.from, target.range?.to]);

	if (!store || !snapshot) return null;
	const quote = target.range
		? snapshot.sourceText.slice(target.range.from, target.range.to)
		: snapshot.sourceText.slice(
			snapshot.blocks.find((block) => block.blockId === target.blockId)?.source.from ?? 0,
			snapshot.blocks.find((block) => block.blockId === target.blockId)?.source.to ?? 0,
		);
	const save = () => {
		const body = draft.trim();
		if (!body) return;
		const anchor = makeCommentAnchor(snapshot, target.blockId, target.range);
		if (!anchor) return;
		const comment = store.add({
			anchor,
			body,
			sourceRevision: snapshot.revision,
		});
		setDraft('');
		onSaved(comment.commentId);
	};

	return (
		<div ref={ref} className="pk-comment-card pk-comment-card--draft" style={style}>
			<div className="pk-comment-card__anchor">
				<span>{target.range ? c.selectionAnchor : c.blockAnchor}</span>
				<Lock size={11} />
				<span>{c.privateLabel}</span>
			</div>
			<span className="pk-comment-card__quote">{compactQuote(quote)}</span>
			<textarea
				ref={inputRef}
				className="pk-comment-card__input"
				placeholder={c.placeholder}
				value={draft}
				rows={3}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === 'Escape') onCancel();
					if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save();
				}}
			/>
			<div className="pk-comment-card__footer">
				<Button variant="ghost" size="sm" onClick={onCancel}>{c.cancel}</Button>
				<Button variant="primary" size="sm" disabled={!draft.trim()} onClick={save}>{c.save}</Button>
			</div>
		</div>
	);
});

const CommentThreadCard = React.forwardRef<HTMLDivElement, {
	comment: ComposerComment;
	active: boolean;
	style?: React.CSSProperties;
	onActivate: () => void;
	onAskCopilot?: (comment: ComposerComment) => void;
	onRemoved: () => void;
}>(function CommentThreadCard({
	comment,
	active,
	style,
	onActivate,
	onAskCopilot,
	onRemoved,
}, ref) {
	const { runtime, config } = useComposerChrome();
	const store = runtime.comments;
	const c = config.chrome.comment;
	const [replyOpen, setReplyOpen] = React.useState(false);
	const [reply, setReply] = React.useState('');
	if (!store) return null;
	const actor = comment.actor?.kind === 'owner'
		? c.ownerLabel
		: comment.actor?.displayName || c.externalLabel;
	const resolved = comment.threadState === 'resolved';
	const shared = comment.visibility === 'shared';
	const visibleReplies = (comment.replies ?? []).filter((item) => item.deletedAt === undefined);

	return (
		<div
			ref={ref}
			className="pk-comment-card"
			data-active={active || undefined}
			data-resolved={resolved || undefined}
			data-stale={comment.status === 'stale' || undefined}
			style={style}
			onMouseDown={(event) => event.stopPropagation()}
			onClick={onActivate}
		>
			<div className="pk-comment-card__meta">
				<span className="pk-comment-card__actor">{actor}</span>
				<span className="pk-comment-card__time">{formatCommentTime(comment.updatedAt)}</span>
				{comment.status === 'stale' && <Chip variant="warning">{c.stale}</Chip>}
			</div>
			<div className="pk-comment-card__anchor">
				<span>{comment.anchor.range ? c.selectionAnchor : c.blockAnchor}</span>
				<Button
					variant="ghost"
					size="sm"
					className="pk-comment-visibility"
					onClick={(event) => {
						event.stopPropagation();
						store.setVisibility(comment.commentId, shared ? 'private' : 'shared');
					}}
				>
					{shared ? <Globe2 size={11} /> : <Lock size={11} />}
					{shared ? c.sharedLabel : c.privateLabel}
				</Button>
			</div>
			<span className="pk-comment-card__quote">{compactQuote(comment.anchor.quote)}</span>
			<span className="pk-comment-card__body">{comment.body}</span>
			{visibleReplies.length > 0 && (
				<div className="pk-comment-card__replies">
					{visibleReplies.map((item) => (
						<div key={item.replyId} className="pk-comment-reply">
							<span className="pk-comment-reply__actor">
								{item.actor.kind === 'owner' ? c.ownerLabel : item.actor.displayName || c.externalLabel}
							</span>
							<span>{item.body}</span>
						</div>
					))}
				</div>
			)}
			{replyOpen && (
				<div className="pk-comment-reply-editor">
					<textarea
						className="pk-comment-card__input"
						placeholder={c.replyPlaceholder}
						value={reply}
						rows={2}
						autoFocus
						onChange={(event) => setReply(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Escape') setReplyOpen(false);
							if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
							store.reply(comment.commentId, reply, LOCAL_COMMENT_ACTOR);
							setReply('');
							setReplyOpen(false);
						}}
					/>
					<div className="pk-comment-card__footer">
						<Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)}>{c.cancel}</Button>
						<Button
							variant="primary"
							size="sm"
							disabled={!reply.trim()}
							onClick={() => {
								store.reply(comment.commentId, reply, LOCAL_COMMENT_ACTOR);
								setReply('');
								setReplyOpen(false);
							}}
						>
							{c.reply}
						</Button>
					</div>
				</div>
			)}
			<div className="pk-comment-card__actions">
				<Button
					variant="ghost"
					size="sm"
					onClick={(event) => {
						event.stopPropagation();
						setReplyOpen(true);
					}}
				>
					<Reply size={12} /> {c.reply}
				</Button>
				{onAskCopilot && (
					<Button
						variant="ghost"
						size="sm"
						onClick={(event) => {
							event.stopPropagation();
							onAskCopilot(comment);
						}}
					>
						<Sparkles size={12} /> {c.askCopilot}
					</Button>
				)}
				<IconButton
					label={resolved ? c.reopen : c.resolve}
					onClick={(event) => {
						event.stopPropagation();
						if (resolved) store.reopen(comment.commentId);
						else store.resolve(comment.commentId);
					}}
				>
					{resolved ? <RotateCcw size={12} /> : <Check size={12} />}
				</IconButton>
				<IconButton
					label={c.remove}
					onClick={(event) => {
						event.stopPropagation();
						store.remove(comment.commentId);
						onRemoved();
					}}
				>
					<Trash2 size={12} />
				</IconButton>
			</div>
		</div>
	);
});

function anchorPoint(
	shell: HTMLElement,
	workspaceRect: DOMRect,
	blockId: string,
	range?: { from: number; to: number },
): { x: number; y: number } | null {
	if (range) {
		const domRange = domRangeForSource(shell, range);
		const rects = domRange ? Array.from(domRange.getClientRects()) : [];
		const rect = rects.reverse().find((candidate) => candidate.width > 0 && candidate.height > 0);
		if (rect) {
			return {
				x: Math.max(0, rect.right - workspaceRect.left),
				y: Math.max(0, rect.top - workspaceRect.top + rect.height / 2),
			};
		}
	}
	const block = shell.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
	if (!block) return null;
	const marker = block.querySelector<HTMLElement>('.pk-comment-anchor-marker');
	const rect = (marker ?? block).getBoundingClientRect();
	return {
		x: Math.max(0, rect.right - workspaceRect.left),
		y: Math.max(0, rect.top - workspaceRect.top + rect.height / 2),
	};
}

function appendRangeRects(
	out: Array<{ key: string; top: number; left: number; width: number; height: number; active: boolean }>,
	shell: HTMLElement,
	shellRect: DOMRect,
	id: string,
	range: { from: number; to: number },
	active: boolean,
): void {
	const domRange = domRangeForSource(shell, range);
	if (!domRange) return;
	Array.from(domRange.getClientRects()).forEach((rect, index) => {
		if (rect.width <= 0 || rect.height <= 0) return;
		out.push({
			key: `${id}:${index}`,
			top: rect.top - shellRect.top + shell.scrollTop,
			left: rect.left - shellRect.left + shell.scrollLeft,
			width: rect.width,
			height: rect.height,
			active,
		});
	});
}

function compactQuote(value: string): string {
	const compact = value.replace(/\s+/g, ' ').trim();
	return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
}

function formatCommentTime(value: number): string {
	if (!Number.isFinite(value)) return '';
	return new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(value);
}

function samePositions(a: Record<string, number>, b: Record<string, number>): boolean {
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	return aKeys.every((key) => a[key] === b[key]);
}
