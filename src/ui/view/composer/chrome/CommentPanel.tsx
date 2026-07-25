import * as React from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { Button, Chip, IconButton } from '@/ui/components/primitives';
import type { ComposerComment } from '@/service/composer';
import { makeCommentAnchor } from '@/service/composer';
import { useComposerChrome } from './ComposerChromeContext';

/**
 * Comment editor + thread strip for one block (WP4, §7.8). Comments bind to a
 * block (or a selection sub-range) through the comment store's persistence port
 * and never enter the Markdown body. Visually distinct from AI suggestions
 * (neutral chrome, comment icon, no sparkle) while reusing the shared panel
 * family. A stale anchor is flagged, never silently dropped.
 */
export function CommentPanel({
	blockId,
	range,
	onClose,
}: {
	blockId: string;
	/** Selection sub-range when the comment was opened from the toolbar. */
	range?: { from: number; to: number };
	onClose: () => void;
}): React.ReactElement | null {
	const { runtime, config, snapshot } = useComposerChrome();
	const store = runtime.comments;
	const c = config.chrome.comment;
	const [draft, setDraft] = React.useState('');
	const [comments, setComments] = React.useState<readonly ComposerComment[]>([]);
	const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

	React.useEffect(() => {
		if (!store) return;
		return store.subscribe((all) => setComments(all.filter((x) => x.anchor.blockId === blockId)));
	}, [store, blockId]);

	React.useEffect(() => {
		inputRef.current?.focus();
	}, []);

	if (!store || !snapshot) return null;

	const save = () => {
		if (!draft.trim()) return;
		const anchor = makeCommentAnchor(snapshot, blockId, range);
		if (!anchor) return;
		store.add({ anchor, body: draft.trim() });
		setDraft('');
		onClose();
	};

	return (
		<div className="pk-comment-panel pk-composer-panel" data-chrome="true" aria-label={c.addTitle}>
			{comments.length > 0 && (
				<div className="pk-comment-panel__list">
					{comments.map((cm) => (
						<div key={cm.commentId} className="pk-comment-panel__item" data-stale={cm.status === 'stale'}>
							<MessageSquare size={13} className="pk-comment-panel__icon" />
							<span className="pk-comment-panel__body">{cm.body}</span>
							{cm.status === 'stale' && <Chip variant="warning">{c.stale}</Chip>}
							<IconButton label={c.cancel} className="pk-comment-panel__remove" onClick={() => store.remove(cm.commentId)}>
								<Trash2 size={12} />
							</IconButton>
						</div>
					))}
				</div>
			)}
			<textarea
				ref={inputRef}
				className="pk-comment-panel__input"
				placeholder={c.placeholder}
				value={draft}
				rows={2}
				onChange={(ev) => setDraft(ev.target.value)}
				onKeyDown={(ev) => {
					if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) save();
					if (ev.key === 'Escape') onClose();
				}}
			/>
			<div className="pk-comment-panel__actions">
				<Button variant="ghost" size="sm" data-action="cancel-comment" onClick={onClose}>
					{c.cancel}
				</Button>
				<Button variant="primary" size="sm" disabled={!draft.trim()} onClick={save}>
					{c.save}
				</Button>
			</div>
		</div>
	);
}

/** Small pill count shown in the block chrome when comments exist. */
export function CommentCountChip({ blockId }: { blockId: string }): React.ReactElement | null {
	const { runtime } = useComposerChrome();
	const store = runtime.comments;
	const [count, setCount] = React.useState(0);
	React.useEffect(() => {
		if (!store) return;
		return store.subscribe((all) => setCount(all.filter((x) => x.anchor.blockId === blockId).length));
	}, [store, blockId]);
	if (count === 0) return null;
	return (
		<Chip variant="neutral" className="pk-comment-count">
			<MessageSquare size={11} /> {count}
		</Chip>
	);
}
