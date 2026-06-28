import * as React from 'react';
import type { UsageLogRow } from '@/core/storage/sqlite/ddl';
import { Chip } from '@/ui/components/primitives';
import { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import { UsageOutcomeService } from '@/service/usage/UsageOutcomeService';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { WhatWasThisAbout } from './WhatWasThisAbout';
import type { DetailPanelStrings, DashboardStrings } from '../UsageDashboard';
import type { MessageReceiptSlotProps } from '@/ui/view/chat-view/integration/messageReceiptSlot';

/**
 * Inline message receipt (Dashboard carrier A — spec §6.1).
 *
 * Mounts under each assistant message in the chat view. Looks up the
 * matching `usage_log` row and renders a compact horizontal strip:
 *
 *   1.2k in · 800 out   ·   $0.04   ·   [chip: ✓ Useful / → Saved / etc.]
 *
 * Click expands the existing "What was this about" detail Modal (re-used
 * from PR-Dash-3) so the user can see the full per-feature payload.
 *
 * Renders nothing when:
 *   - usage_log row is not found (chat path didn't stamp message_id yet, or
 *     `usagePreviewEnabled` was off when the call ran);
 *   - `usagePreviewEnabled === false` and we cannot find a row to attribute.
 *     (We do still show tokens/cost when the row exists — those are not
 *     "preview" content, just metering. The privacy setting only hides the
 *     Modal's prompt/response previews; the receipt itself stays.)
 */
export function InlineReceipt(props: MessageReceiptSlotProps) {
	const { messageId, sessionId, usageLogId } = props;
	const [row, setRow] = React.useState<UsageLogRow | null>(null);
	const [outcomeKinds, setOutcomeKinds] = React.useState<Set<string>>(new Set());
	const [open, setOpen] = React.useState(false);
	const [strings, setStrings] = React.useState<InlineReceiptStrings>(FALLBACK_STRINGS);
	const [detailStrings, setDetailStrings] = React.useState<DetailPanelStrings | null>(null);

	// Load i18n strings — fall back to English baked-in if TemplateManager not ready.
	React.useEffect(() => {
		let cancelled = false;
		const load = async () => {
			try {
				const tm = TemplateManager.getInstance();
				const loaded = await tm.loadJson<DashboardStrings & { inlineReceipt?: InlineReceiptStrings }>(
					ConfigTemplateId.Dashboard,
				);
				if (cancelled) return;
				if (loaded?.inlineReceipt) {
					setStrings({ ...FALLBACK_STRINGS, ...loaded.inlineReceipt, chips: { ...FALLBACK_STRINGS.chips, ...(loaded.inlineReceipt.chips ?? {}) } });
				}
				if (loaded?.detailPanel) {
					setDetailStrings({
						...DEFAULT_DETAIL_STRINGS,
						...loaded.detailPanel,
						sections: { ...DEFAULT_DETAIL_STRINGS.sections, ...(loaded.detailPanel.sections ?? {}) },
						verbs: { ...DEFAULT_DETAIL_STRINGS.verbs, ...(loaded.detailPanel.verbs ?? {}) },
					});
				} else {
					setDetailStrings(DEFAULT_DETAIL_STRINGS);
				}
			} catch {
				setDetailStrings(DEFAULT_DETAIL_STRINGS);
			}
		};
		void load();
		return () => { cancelled = true; };
	}, []);

	// Look up usage_log row.
	React.useEffect(() => {
		let cancelled = false;
		const lookup = async () => {
			try {
				const tracking = UsageTrackingService.getInstance();
				const found = usageLogId != null
					? await tracking.getLogById(usageLogId)
					: await tracking.getLogByMessageId(messageId, sessionId);
				if (!cancelled) setRow(found ?? null);
			} catch {
				if (!cancelled) setRow(null);
			}
		};
		void lookup();
		return () => { cancelled = true; };
	}, [messageId, sessionId, usageLogId]);

	// Look up outcomes for this message — drives the status chip.
	React.useEffect(() => {
		let cancelled = false;
		const lookup = async () => {
			try {
				const outcomes = await UsageOutcomeService.getInstance().outcomesForMessage(messageId);
				if (cancelled) return;
				setOutcomeKinds(new Set(outcomes.map(o => o.event_type)));
			} catch {
				if (!cancelled) setOutcomeKinds(new Set());
			}
		};
		void lookup();
		return () => { cancelled = true; };
	}, [messageId]);

	const { settings } = useServiceContext();
	const previewEnabled = settings.usagePreviewEnabled ?? true;

	if (!row) return null;
	if (!previewEnabled && row.input_tokens === 0 && row.output_tokens === 0) return null;

	const chip = pickStatusChip(outcomeKinds, strings);

	return (
		<>
			<button
				type="button"
				className="pk-inline-receipt"
				onClick={() => setOpen(true)}
				aria-label={strings.openDetail}
			>
				<span className="pk-inline-receipt__tokens">
					{formatTokens(row.input_tokens)} {strings.inLabel}
					{' · '}
					{formatTokens(row.output_tokens)} {strings.outLabel}
				</span>
				<span className="pk-inline-receipt__sep">·</span>
				<span className="pk-inline-receipt__cost">{formatCost(row.cost_usd)}</span>
				{chip && (
					<>
						<span className="pk-inline-receipt__sep">·</span>
						<Chip variant={chip.variant}>{chip.label}</Chip>
					</>
				)}
			</button>
			{detailStrings && (
				<WhatWasThisAbout
					open={open}
					onClose={() => setOpen(false)}
					row={row}
					strings={detailStrings}
					previewEnabled={previewEnabled}
				/>
			)}
		</>
	);
}

// ── helpers ─────────────────────────────────────────────────────────────────

interface InlineReceiptStrings {
	inLabel: string;
	outLabel: string;
	openDetail: string;
	chips: {
		saved: string;
		accepted: string;
		clicked: string;
		emitted: string;
		useful: string;
	};
}

const FALLBACK_STRINGS: InlineReceiptStrings = {
	inLabel: 'in',
	outLabel: 'out',
	openDetail: 'Show usage detail',
	chips: {
		saved: 'Saved',
		accepted: 'Accepted',
		clicked: 'Clicked',
		emitted: 'Emitted',
		useful: 'Useful',
	},
};

// Tiny mirror of the dashboard.json detailPanel block — keeps InlineReceipt
// self-contained when the wider DashboardStrings has not been loaded yet.
const DEFAULT_DETAIL_STRINGS: DetailPanelStrings = {
	title: 'What was this about',
	subtitle: 'Context first — usage numbers below',
	close: 'Close',
	privacyDisabled: 'Preview hidden by privacy settings.',
	missingMetadata: 'No metadata captured for this call.',
	unknownFeature: 'No detail renderer registered for feature "{feature}".',
	sections: {
		prompt: 'User prompt',
		response: 'Assistant response',
		attachedFiles: 'Attached files',
		toolsUsed: 'Tools used',
		query: 'Query',
		topResults: 'Top results',
		clicked: 'Clicked',
		taskGoal: 'Task goal',
		stepName: 'Step',
		stepTools: 'Tools in step',
		previousStep: 'Previous step summary',
		filePath: 'File',
		selectionBefore: 'Before',
		selectionAfter: 'After',
		accepted: 'Accepted',
		rejected: 'Rejected',
		document: 'Document',
		chunks: 'Chunks',
		embeddingModel: 'Embedding model',
		showFullPrompt: 'Show full prompt',
	},
	verbs: {
		openChat: 'Open in chat',
		openSearch: 'Open in search',
		openTrace: 'Open trace',
		openEditor: 'Open in editor',
		openDocument: 'Open document',
	},
};

interface ChipDescriptor {
	variant: 'success' | 'info' | 'neutral' | 'accent';
	label: string;
}

/**
 * Status chip ordering — strongest signal wins:
 *   vault_save > copilot_accept > agent_file_emit > search_click > continuation
 * Falls back to "Useful" when there is any outcome but none of the strong ones,
 * and renders no chip at all when the set is empty.
 */
function pickStatusChip(
	kinds: Set<string>,
	strings: InlineReceiptStrings,
): ChipDescriptor | null {
	if (kinds.has('vault_save')) return { variant: 'success', label: strings.chips.saved };
	if (kinds.has('copilot_accept')) return { variant: 'success', label: strings.chips.accepted };
	if (kinds.has('agent_file_emit')) return { variant: 'success', label: strings.chips.emitted };
	if (kinds.has('search_click')) return { variant: 'info', label: strings.chips.clicked };
	if (kinds.size > 0) return { variant: 'accent', label: strings.chips.useful };
	return null;
}

function formatTokens(n: number): string {
	if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
	return String(n);
}

function formatCost(cost: number): string {
	if (cost === 0) return '$0';
	if (cost < 0.01) return '<$0.01';
	if (cost < 1) return `$${cost.toFixed(3)}`;
	return `$${cost.toFixed(2)}`;
}
