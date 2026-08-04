import * as React from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { findComposerMatches, type ComposerFindMatch } from '@/service/composer';
import { IconButton } from '@/ui/components/primitives';
import type { ComposerChromeConfig } from '../config/composerConfig';
import { domRangeForSource } from './selectionMapping';

export interface ComposerFindBarHandle {
	focusAndSelect(): void;
}

interface ComposerFindBarProps {
	open: boolean;
	sourceText: string;
	revision: string;
	rootRef: React.RefObject<HTMLDivElement>;
	strings: ComposerChromeConfig['find'];
	onClose(): void;
	onReveal(match: ComposerFindMatch): void;
}

interface HighlightRect {
	id: string;
	top: number;
	left: number;
	width: number;
	height: number;
	active: boolean;
}

export const ComposerFindBar = React.forwardRef<ComposerFindBarHandle, ComposerFindBarProps>(
	function ComposerFindBar(
		{ open, sourceText, revision, rootRef, strings, onClose, onReveal },
		ref,
	): React.ReactElement | null {
		const inputRef = React.useRef<HTMLInputElement | null>(null);
		const [query, setQuery] = React.useState('');
		const [activeIndex, setActiveIndex] = React.useState(0);
		const [highlightRects, setHighlightRects] = React.useState<HighlightRect[]>([]);
		const matches = React.useMemo(
			() => findComposerMatches(sourceText, query),
			[sourceText, query],
		);

		const focusAndSelect = React.useCallback(() => {
			const input = inputRef.current;
			if (!input) return;
			input.focus({ preventScroll: true });
			input.select();
		}, []);
		React.useImperativeHandle(ref, () => ({ focusAndSelect }), [focusAndSelect]);
		React.useEffect(() => {
			if (!open) return;
			const ownerWindow = rootRef.current?.ownerDocument.defaultView;
			if (!ownerWindow) return;
			const frame = ownerWindow.requestAnimationFrame(focusAndSelect);
			return () => ownerWindow.cancelAnimationFrame(frame);
		}, [focusAndSelect, open, rootRef]);
		React.useEffect(() => setActiveIndex(0), [query]);
		React.useEffect(() => {
			if (matches.length === 0) return;
			if (activeIndex < matches.length) return;
			setActiveIndex(matches.length - 1);
		}, [activeIndex, matches.length]);

		const navigate = (delta: number) => {
			if (matches.length === 0) return;
			setActiveIndex((current) => (current + delta + matches.length) % matches.length);
		};

		const measure = React.useCallback(() => {
			const root = rootRef.current;
			if (!open || !root) {
				setHighlightRects([]);
				return;
			}
			const rootRect = root.getBoundingClientRect();
			const next: HighlightRect[] = [];
			matches.forEach((match, matchIndex) => {
				const range = domRangeForSource(root, match);
				if (!range) return;
				Array.from(range.getClientRects()).forEach((rect, rectIndex) => {
					if (rect.width <= 0 || rect.height <= 0) return;
					next.push({
						id: `${match.from}:${match.to}:${rectIndex}`,
						top: rect.top - rootRect.top,
						left: rect.left - rootRect.left,
						width: rect.width,
						height: rect.height,
						active: matchIndex === activeIndex,
					});
				});
			});
			setHighlightRects(next);
		}, [activeIndex, matches, open, rootRef]);

		React.useLayoutEffect(() => {
			if (!open) {
				setHighlightRects([]);
				return;
			}
			const root = rootRef.current;
			const ownerWindow = root?.ownerDocument.defaultView;
			if (!root || !ownerWindow) return;
			const activeMatch = matches[activeIndex];
			if (activeMatch) onReveal(activeMatch);
			let secondFrame = 0;
			const firstFrame = ownerWindow.requestAnimationFrame(() => {
				secondFrame = ownerWindow.requestAnimationFrame(() => {
					const range = activeMatch ? domRangeForSource(root, activeMatch) : null;
					const owner = range?.startContainer.parentElement?.closest<HTMLElement>('[data-src-text-from]');
					owner?.scrollIntoView({ block: 'center', inline: 'nearest' });
					measure();
				});
			});
			const refresh = () => measure();
			ownerWindow.addEventListener('resize', refresh);
			root.ownerDocument.addEventListener('scroll', refresh, true);
			return () => {
				ownerWindow.cancelAnimationFrame(firstFrame);
				if (secondFrame) ownerWindow.cancelAnimationFrame(secondFrame);
				ownerWindow.removeEventListener('resize', refresh);
				root.ownerDocument.removeEventListener('scroll', refresh, true);
			};
		}, [activeIndex, matches, measure, onReveal, open, revision, rootRef]);

		if (!open) return null;
		return (
			<>
				<div className="pk-composer-find" role="search" data-chrome="true">
					<Search size={15} aria-hidden />
					<input
						ref={inputRef}
						className="pk-composer-find__input"
						value={query}
						placeholder={strings.placeholder}
						aria-label={strings.placeholder}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'f') {
								event.preventDefault();
								focusAndSelect();
								return;
							}
							if (event.key === 'Escape') {
								event.preventDefault();
								onClose();
								return;
							}
							if (event.key !== 'Enter') return;
							event.preventDefault();
							navigate(event.shiftKey ? -1 : 1);
						}}
					/>
					<span className="pk-composer-find__count" aria-live="polite">
						{matches.length === 0 ? '0/0' : `${activeIndex + 1}/${matches.length}`}
					</span>
					<IconButton label={strings.previous} onClick={() => navigate(-1)} disabled={matches.length === 0}>
						<ChevronUp size={15} />
					</IconButton>
					<IconButton label={strings.next} onClick={() => navigate(1)} disabled={matches.length === 0}>
						<ChevronDown size={15} />
					</IconButton>
					<IconButton label={strings.close} onClick={onClose}>
						<X size={15} />
					</IconButton>
				</div>
				<div className="pk-composer-find-highlights" aria-hidden>
					{highlightRects.map((rect) => (
						<span
							key={rect.id}
							className="pk-composer-find-highlight"
							data-active={rect.active || undefined}
							style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
						/>
					))}
				</div>
			</>
		);
	},
);
