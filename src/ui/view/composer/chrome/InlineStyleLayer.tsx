/**
 * Direct interaction for already-rendered bold/italic/HTML style tokens.
 *
 * The token carries the parser-derived wrapper range, so removal selects the
 * original `**...**` / `<u>...</u>` source span rather than wrapping its visible
 * text again. AI polish is selection-scoped and creates the normal review card;
 * it never writes a suggested style straight into the document.
 */

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import type { ComposerContextSnapshot, ComposerInlineMark } from '@/core/composer';
import { POLISH_CAPABILITY_ID, removeInlineMarkWrapper } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { useOwnerDocumentListener } from '@/ui/hooks/useOwnerWindow';
import { useComposerChrome } from './ComposerChromeContext';

type StyleToken = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'text-color' | 'highlight';
type MarkRanges = Partial<Record<StyleToken, { from: number; to: number }>>;

interface ActiveToken {
	blockId: string;
	visibleFrom: number;
	visibleTo: number;
	tokens: StyleToken[];
	ranges: MarkRanges;
	top: number;
	left: number;
}

const MARKS: Record<StyleToken, ComposerInlineMark> = {
	bold: 'bold',
	italic: 'italic',
	underline: 'underline',
	strikethrough: 'strikethrough',
	'text-color': 'text-color',
	highlight: 'highlight',
};

export function InlineStyleLayer({
	containerRef,
	enabled,
}: {
	containerRef: React.RefObject<HTMLElement | null>;
	enabled: boolean;
}): React.ReactElement | null {
	const chrome = useComposerChrome();
	const { runtime, projection, snapshot, config } = chrome;
	const [active, setActive] = React.useState<ActiveToken | null>(null);

	const closeOnOutside = React.useCallback((event: MouseEvent) => {
		const target = event.target as HTMLElement | null;
		if (target?.closest('.pk-inline-style-popover, [data-inline-style]')) return;
		setActive(null);
	}, []);
	useOwnerDocumentListener(containerRef, 'mousedown', closeOnOutside);

	const onClick = React.useCallback((event: MouseEvent) => {
		if (!enabled || !snapshot) return;
		const token = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-inline-style]');
		if (!token || token.closest('.pk-composer-link')) return;
		const root = containerRef.current;
		const blockId = token.closest<HTMLElement>('[data-block-id]')?.dataset.blockId;
		const visibleFrom = Number(token.dataset.srcTextFrom);
		const visibleTo = Number(token.dataset.inlineVisibleTo);
		const tokens = parseTokens(token.dataset.inlineStyle);
		const ranges = parseRanges(token.dataset.inlineMarkRanges);
		if (!root || !blockId || !Number.isFinite(visibleFrom) || !Number.isFinite(visibleTo) || tokens.length === 0) return;
		event.preventDefault();
		const rect = token.getBoundingClientRect();
		const rootRect = root.getBoundingClientRect();
		setActive({
			blockId,
			visibleFrom,
			visibleTo,
			tokens,
			ranges,
			top: rect.bottom - rootRect.top + root.scrollTop + 6,
			left: Math.max(4, rect.left - rootRect.left),
		});
	}, [containerRef, enabled, snapshot]);
	useOwnerDocumentListener(containerRef, 'click', onClick);

	const removeMark = async (token: StyleToken) => {
		if (!active || !snapshot || !runtime.hub) return;
		const range = active.ranges[token];
		if (!range) return;
		const operation = removeInlineMarkWrapper(snapshot.sourceText, MARKS[token], range);
		if (!operation) return;
		try {
			await runtime.hub.commit({
				origin: 'direct',
				label: styleLabel(config.chrome.inlineStyle, token),
				operations: [operation],
			});
			setActive(null);
		} catch {
			// The transaction hub owns conflict presentation and leaves source intact.
		}
	};

	const polish = () => {
		if (!active || !snapshot) return;
		const target = {
			kind: 'selection' as const,
			blockId: active.blockId,
			from: active.visibleFrom,
			to: active.visibleTo,
		};
		const context: ComposerContextSnapshot = {
			documentId: snapshot.documentId,
			revision: snapshot.revision,
			target,
			targetSource: snapshot.sourceText.slice(target.from, target.to),
			selectionText: snapshot.sourceText.slice(target.from, target.to),
		};
		const action = projection.actionsFor(context, 'selection-toolbar').find((item) => item.capabilityId === POLISH_CAPABILITY_ID);
		if (!action || action.disabledReason) return;
		projection.invoke(action.capabilityId, context, { instruction: config.chrome.inlineStyle.polishSelection });
		setActive(null);
	};
	const suggestStyle = () => {
		if (!active || !snapshot) return;
		const token = active.tokens[0];
		if (!token) return;
		const target = { kind: 'selection' as const, blockId: active.blockId, from: active.visibleFrom, to: active.visibleTo };
		const context: ComposerContextSnapshot = {
			documentId: snapshot.documentId,
			revision: snapshot.revision,
			target,
			targetSource: snapshot.sourceText.slice(target.from, target.to),
			selectionText: snapshot.sourceText.slice(target.from, target.to),
		};
		const action = projection.actionsFor(context, 'selection-toolbar').find((item) => item.capabilityId === POLISH_CAPABILITY_ID);
		if (!action || action.disabledReason) return;
		projection.invoke(action.capabilityId, context, { instruction: styleSuggestionInstruction(config.chrome.inlineStyle, token) });
		setActive(null);
	};

	if (!active) return null;
	const directDisabled = !runtime.hub ? config.chrome.inlineStyle.unavailable : undefined;
	const polishContext: ComposerContextSnapshot = {
		documentId: snapshot?.documentId ?? '',
		revision: snapshot?.revision ?? '',
		target: { kind: 'selection', blockId: active.blockId, from: active.visibleFrom, to: active.visibleTo },
		targetSource: snapshot?.sourceText.slice(active.visibleFrom, active.visibleTo) ?? '',
		selectionText: snapshot?.sourceText.slice(active.visibleFrom, active.visibleTo) ?? '',
	};
	const polishAction = snapshot
		? projection.actionsFor(polishContext, 'selection-toolbar').find((item) => item.capabilityId === POLISH_CAPABILITY_ID)
		: undefined;
	const polishDisabled = polishAction?.disabledReason ?? (!polishAction ? config.chrome.inlineStyle.unavailable : undefined);

	return (
		<div
			className="pk-inline-style-popover pk-composer-panel"
			data-chrome="true"
			role="dialog"
			style={{ top: active.top, left: active.left }}
		>
			<div className="pk-inline-style-popover__actions">
				{active.tokens.map((token) => (
					<Button
						key={token}
						variant="ghost"
						size="sm"
						disabled={Boolean(directDisabled) || !active.ranges[token]}
						title={directDisabled}
						onClick={() => void removeMark(token)}
					>
						{styleLabel(config.chrome.inlineStyle, token)}
					</Button>
				))}
			</div>
			<Button variant="ghost" size="sm" disabled={Boolean(polishDisabled)} title={polishDisabled} onClick={polish}>
				<Sparkles size={13} />
				{config.chrome.inlineStyle.polishSelection}
			</Button>
			<Button variant="ghost" size="sm" disabled={Boolean(polishDisabled)} title={polishDisabled} onClick={suggestStyle}>
				<Sparkles size={13} />
				{config.chrome.inlineStyle.suggestStyle}
			</Button>
		</div>
	);
}

function parseTokens(value: string | undefined): StyleToken[] {
	const allowed: StyleToken[] = ['bold', 'italic', 'underline', 'strikethrough', 'text-color', 'highlight'];
	return (value ?? '').split(/\s+/).filter((token): token is StyleToken => allowed.includes(token as StyleToken));
}

function parseRanges(value: string | undefined): MarkRanges {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value) as Record<string, unknown>;
		const out: MarkRanges = {};
		for (const token of parseTokens(Object.keys(parsed).join(' '))) {
			const range = parsed[token];
			if (!range || typeof range !== 'object') continue;
			const from = (range as { from?: unknown }).from;
			const to = (range as { to?: unknown }).to;
			if (typeof from === 'number' && typeof to === 'number' && from < to) out[token] = { from, to };
		}
		return out;
	} catch {
		return {};
	}
}

function styleLabel(
	strings: ReturnType<typeof useComposerChrome>['config']['chrome']['inlineStyle'],
	token: StyleToken,
): string {
	if (token === 'bold') return strings.removeBold;
	if (token === 'italic') return strings.removeItalic;
	if (token === 'underline') return strings.removeUnderline;
	if (token === 'strikethrough') return strings.removeStrikethrough;
	if (token === 'text-color') return strings.removeTextColor;
	return strings.removeHighlight;
}

function styleSuggestionInstruction(
	strings: ReturnType<typeof useComposerChrome>['config']['chrome']['inlineStyle'],
	token: StyleToken,
): string {
	if (token === 'bold') return strings.suggestBoldInstruction;
	if (token === 'italic') return strings.suggestItalicInstruction;
	if (token === 'underline') return strings.suggestUnderlineInstruction;
	if (token === 'strikethrough') return strings.suggestStrikethroughInstruction;
	if (token === 'text-color') return strings.suggestTextColorInstruction;
	return strings.suggestHighlightInstruction;
}
