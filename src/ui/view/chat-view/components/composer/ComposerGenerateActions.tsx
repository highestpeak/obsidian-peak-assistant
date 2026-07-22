import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import { useComposerStore } from '../../store/composerStore';
import { useComposerEditImageStore } from '../../store/composerEditImageStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { resolveConfigureTab } from '@/service/media/mediaSettingsOverlay';
import type {
	MediaGenerationSyncSnapshot,
	MediaKindSyncSnapshot,
} from '@/service/media/MediaGenerationService';
import type {
	MediaGenerationRequest,
	MediaPreflight,
	MediaReferenceInput,
} from '@/core/types/media-generation';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import { Notice } from 'obsidian';
import {
	buildEditImageOptions,
	buildEditRequest,
	buildEditFailedReceipt,
	type EditImageOption,
	EDIT_PRESET_IDS,
	type EditPresetId,
} from './composerEditImageLogic';

/**
 * Generation actions surface (chat-studio §8.3 / COMP-03).
 *
 * Owner of the inline "Generate {image|video|music}" AND "Edit image" forms.
 * Opened from the `/` slash palette (workflow/action surface), NOT from the
 * `+` menu (which only handles input-side resources). All preflight/route/
 * quantity/aspect/duration wiring is preserved.
 *
 * Generate mode pushes a natural-language draft into the Composer (so the
 * agent calls `media_generate` on next Send); Edit mode calls the service
 * DIRECTLY (`service.produce({operation:'edit', ...}, {bypassConfirmation:
 * true})`) because reference selection is a user pick that must never be
 * re-inferred by the LLM.
 */

export type GenerateKind = 'image' | 'video' | 'music';
export type GenerateMode = 'generate' | 'edit';

const ASPECT_RATIOS: Array<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'> = ['1:1', '16:9', '9:16', '4:3', '3:4'];

export interface ComposerGenerateActionsProps {
	kind: GenerateKind;
	onClose: () => void;
	mode?: GenerateMode;
}

export const ComposerGenerateActions: React.FC<ComposerGenerateActionsProps> = ({ kind, onClose, mode = 'generate' }) => {
	if (mode === 'edit' && kind === 'image') {
		return <ComposerEditImageForm onClose={onClose} />;
	}
	return <ComposerGenerateForm kind={kind} onClose={onClose} />;
};

// ── Generate form (existing behaviour, unchanged) ──────────────────────────

const ComposerGenerateForm: React.FC<{ kind: GenerateKind; onClose: () => void }> = ({ kind, onClose }) => {
	const strings = useChatStudioStrings();
	const { manager, settingsActions } = useServiceContext();
	const dialogRef = useRef<HTMLDivElement>(null);
	// A11Y-01/02 — restore focus to the trigger on close so keyboard users don't
	// land at the top of the document.
	const triggerRef = useRef<Element | null>(null);
	useEffect(() => {
		const doc = dialogRef.current?.ownerDocument;
		triggerRef.current = doc?.activeElement ?? null;
		return () => {
			const el = triggerRef.current as HTMLElement | null;
			if (el && typeof el.focus === 'function') el.focus();
		};
	}, []);

	const [prompt, setPrompt] = useState('');
	const [quantity, setQuantity] = useState(1);
	const [aspect, setAspect] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
	const [route, setRoute] = useState<'auto' | 'native' | 'fal'>('auto');
	const [duration, setDuration] = useState<number>(8);

	// Availability snapshot — refreshed on open.
	const [snapshot, setSnapshot] = useState<MediaGenerationSyncSnapshot | null>(null);
	useEffect(() => {
		try {
			const svc = manager.conv.getMediaGenerationService();
			setSnapshot(svc ? svc.probeSyncAvailability() : null);
		} catch {
			setSnapshot(null);
		}
	}, [manager, kind]);

	const activeSnapshot: MediaKindSyncSnapshot | null = snapshot?.perKind[kind] ?? null;
	const nativeRouteReady = Boolean(
		activeSnapshot?.routes.native.configured
			&& activeSnapshot?.routes.native.supportedKinds.includes(kind),
	);
	const falRouteReady = Boolean(
		activeSnapshot?.routes.fal.configured
			&& activeSnapshot?.routes.fal.supportedKinds.includes(kind),
	);
	const nativeRouteReason = nativeRouteReady
		? undefined
		: (activeSnapshot?.routes.native.reason
			?? strings.composer.generateImageRouteNativeUnavailableReason);
	const falRouteReason = falRouteReady
		? undefined
		: strings.composer.generateImageRouteFalUnavailableReason;

	// Snap back to Auto if the current route becomes unusable.
	useEffect(() => {
		if (route === 'native' && !nativeRouteReady) setRoute('auto');
		if (route === 'fal' && !falRouteReady) setRoute('auto');
	}, [route, nativeRouteReady, falRouteReady]);

	// Duration bounds via service — no hardcoded max.
	const [durationMax, setDurationMax] = useState<number>(60);
	useEffect(() => {
		if (kind !== 'video' && kind !== 'music') return;
		const svc = manager.conv.getMediaGenerationService();
		if (!svc) return;
		let cancelled = false;
		void svc.resolveDurationLimits(kind)
			.then((limits) => {
				if (cancelled) return;
				setDurationMax(limits.maxSeconds);
				setDuration((prev) => {
					const clamped = Math.min(Math.max(1, prev), limits.maxSeconds);
					return clamped === prev ? prev : clamped;
				});
			})
			.catch(() => { /* keep last known bound */ });
		return () => { cancelled = true; };
	}, [kind, manager]);

	// Preflight — cost hint. Prompt-agnostic to avoid keystroke thrashing.
	const [preflight, setPreflight] = useState<MediaPreflight | null>(null);
	const [preflightStatus, setPreflightStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
	useEffect(() => {
		const svc = manager.conv.getMediaGenerationService();
		if (!svc) {
			setPreflight(null);
			setPreflightStatus('unavailable');
			return;
		}
		let cancelled = false;
		setPreflightStatus('loading');
		const request: MediaGenerationRequest = {
			kind,
			prompt: prompt.trim() || 'preflight-preview',
			route,
			presetId: 'default',
			quantity,
			aspectRatio: aspect,
			durationSeconds: kind === 'image' ? undefined : duration,
		};
		void svc.preflight(request)
			.then((result) => {
				if (cancelled) return;
				setPreflight(result);
				setPreflightStatus('ready');
			})
			.catch(() => {
				if (cancelled) return;
				setPreflight(null);
				setPreflightStatus('unavailable');
			});
		return () => { cancelled = true; };
		// `prompt` intentionally omitted — see original ComposerPlusMenu comment.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [kind, quantity, aspect, route, duration, manager]);

	const costHint = useMemo<{ text: string } | null>(() => {
		if (preflightStatus !== 'ready' || !preflight) return null;
		const est = preflight.estimate;
		if (!est) return null;
		const prefix = strings.composer.generateImageCostHintPrefix;
		const confidence = est.confidence === 'estimated'
			? strings.composer.generateImageCostHintConfidenceEstimated
			: strings.composer.generateImageCostHintConfidenceReported;
		if (typeof est.amountUsd === 'number') {
			const amount = est.amountUsd < 0.01
				? `$${est.amountUsd.toFixed(4)}`
				: `$${est.amountUsd.toFixed(2)}`;
			return { text: `${prefix} ${amount} / ${est.billingUnit} (${confidence})` };
		}
		return { text: `${prefix} — / ${est.billingUnit} (${confidence})` };
	}, [preflight, preflightStatus, strings.composer]);

	const confirmBlocked =
		preflightStatus === 'unavailable'
		|| preflight?.state === 'needs-configuration'
		|| preflight?.state === 'unsupported'
		|| !prompt.trim();

	const insertGenerate = () => {
		const p = prompt.trim();
		if (!p) return;
		const template = kind === 'image'
			? strings.composer.generateImageInsertTemplate
			: kind === 'video'
				? strings.composer.generateVideoInsertTemplate
				: strings.composer.generateMusicInsertTemplate;
		let text = template
			.replace(/\{quantity\}/g, String(quantity))
			.replace(/\{prompt\}/g, p)
			.replace(/\{durationSeconds\}/g, String(duration));
		const hints: string[] = [];
		if (kind === 'image' && aspect !== '1:1') hints.push(`aspect=${aspect}`);
		if (route !== 'auto') hints.push(`route=${route}`);
		if (kind !== 'image') hints.push(`kind=${kind}`);
		if (hints.length > 0) text += ` [${hints.join(' ')}]`;
		useComposerStore.getState().fillDraftText(text);
		onClose();
	};

	// Escape closes the panel. Detached-window safe (§5.3): listen on the
	// dialog's ownerDocument so popouts route their own keydown events.
	useEffect(() => {
		const doc = dialogRef.current?.ownerDocument ?? document;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
			}
		};
		doc.addEventListener('keydown', handler);
		return () => doc.removeEventListener('keydown', handler);
	}, [onClose]);

	const promptPlaceholder = kind === 'video'
		? strings.composer.generateVideoPromptPlaceholder
		: kind === 'music'
			? strings.composer.generateMusicPromptPlaceholder
			: strings.composer.generateImagePromptPlaceholder;

	const kindLabel = kind === 'video'
		? strings.composer.generateVideoLabel
		: kind === 'music'
			? strings.composer.generateMusicLabel
			: strings.composer.generateImageLabel;

	return (
		<div ref={dialogRef} className="pkchat-generate-panel" role="dialog" aria-modal="true" aria-label={kindLabel}>
			<div className="pkchat-generate-panel__head">
				<span className="pkchat-generate-panel__title">{kindLabel}</span>
				<IconButton label={strings.composer.stopLabel} title={strings.composer.stopLabel} onClick={onClose}>
					<X />
				</IconButton>
			</div>
			<textarea
				autoFocus
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
				placeholder={promptPlaceholder}
				className="pktw-w-full pktw-min-h-[64px] pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded pktw-px-2 pktw-py-1 pktw-text-xs pktw-outline-none pktw-resize-y"
			/>
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-pk-xs pktw-flex-wrap">
				{kind === 'image' && (
					<label className="pktw-flex pktw-items-center pktw-gap-1">
						<span className="pktw-text-pk-text-tertiary">{strings.composer.generateImageQuantityLabel}</span>
						<select
							value={quantity}
							onChange={(e) => setQuantity(Number(e.target.value))}
							className="pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded pktw-px-1 pktw-py-0.5"
						>
							{[1, 2, 3, 4].map((n) => (
								<option key={n} value={n}>{n}</option>
							))}
						</select>
					</label>
				)}
				{kind === 'image' && (
					<label className="pktw-flex pktw-items-center pktw-gap-1">
						<span className="pktw-text-pk-text-tertiary">{strings.composer.generateImageAspectRatioLabel}</span>
						<select
							value={aspect}
							onChange={(e) => setAspect(e.target.value as any)}
							className="pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded pktw-px-1 pktw-py-0.5"
						>
							{ASPECT_RATIOS.map((r) => (
								<option key={r} value={r}>{r}</option>
							))}
						</select>
					</label>
				)}
				{(kind === 'video' || kind === 'music') && (
					<label className="pktw-flex pktw-items-center pktw-gap-1">
						<span className="pktw-text-pk-text-tertiary">{strings.composer.generateDurationLabel}</span>
						<input
							type="number"
							min={1}
							max={durationMax}
							value={duration}
							onChange={(e) => setDuration(Math.max(1, Math.min(durationMax, Number(e.target.value) || 1)))}
							className="pktw-w-14 pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded pktw-px-1 pktw-py-0.5"
						/>
						<span className="pktw-text-pk-text-tertiary">s</span>
					</label>
				)}
				<label className="pktw-flex pktw-items-center pktw-gap-1">
					<span className="pktw-text-pk-text-tertiary">{strings.composer.generateImageRouteLabel}</span>
					<select
						value={route}
						onChange={(e) => setRoute(e.target.value as any)}
						className="pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded pktw-px-1 pktw-py-0.5"
					>
						<option value="auto">{strings.composer.generateImageRouteAutoOption}</option>
						<option
							value="native"
							disabled={!nativeRouteReady}
							title={nativeRouteReason}
						>
							{nativeRouteReady
								? strings.composer.generateImageRouteNativeOption
								: `${strings.composer.generateImageRouteNativeOption} — ${nativeRouteReason ?? ''}`}
						</option>
						<option
							value="fal"
							disabled={!falRouteReady}
							title={falRouteReason}
						>
							{falRouteReady
								? strings.composer.generateImageRouteFalOption
								: `${strings.composer.generateImageRouteFalOption} — ${falRouteReason ?? ''}`}
						</option>
					</select>
				</label>
				{(!nativeRouteReady || !falRouteReady) && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							const action = !nativeRouteReady && route === 'native' ? 'profiles' : 'media';
							settingsActions.openSettings({ tab: resolveConfigureTab(action) });
							onClose();
						}}
						title={strings.composer.generateImageRouteConfigureLabel}
					>
						{strings.composer.generateImageRouteConfigureLabel}
					</Button>
				)}
			</div>
			<div className="pktw-text-pk-xs pktw-text-pk-text-tertiary" aria-live="polite">
				{preflightStatus === 'loading' && (
					<span>{strings.composer.generateImageCostHintLoading}</span>
				)}
				{preflightStatus === 'unavailable' && (
					<span>{strings.composer.generateImageCostHintUnavailable}</span>
				)}
				{preflightStatus === 'ready' && costHint && (
					<span>{costHint.text}</span>
				)}
				{preflightStatus === 'ready' && !costHint && (
					<span>{strings.composer.generateImageCostHintUnavailable}</span>
				)}
				{preflightStatus === 'ready' && (kind === 'video' || kind === 'music') && (
					<div className="pktw-mt-0.5">
						{kind === 'video'
							? strings.composer.generateImageCostHintConfirmHintVideo
							: strings.composer.generateImageCostHintConfirmHintMusic}
					</div>
				)}
			</div>
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-1.5">
				<Button variant="ghost" size="sm" onClick={onClose}>
					{strings.projectHome.cancelLabel}
				</Button>
				<Button
					variant="secondary"
					size="sm"
					onClick={insertGenerate}
					disabled={confirmBlocked}
					title={
						preflightStatus === 'unavailable'
							? strings.composer.generateImageConfirmDisabledPreflightReason
							: undefined
					}
				>
					{strings.composer.generateImageInsertLabel}
				</Button>
			</div>
		</div>
	);
};

// ── Edit form (zero-gap §4 A1 — Edit image) ────────────────────────────────

const ComposerEditImageForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
	const strings = useChatStudioStrings();
	const { manager } = useServiceContext();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const dialogRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<Element | null>(null);
	// A11Y-01/02 — capture the trigger on mount, restore focus on unmount so
	// keyboard users don't get dumped at the top of the document.
	useEffect(() => {
		const doc = dialogRef.current?.ownerDocument;
		triggerRef.current = doc?.activeElement ?? null;
		return () => {
			const el = triggerRef.current as HTMLElement | null;
			if (el && typeof el.focus === 'function') el.focus();
		};
	}, []);

	const [prompt, setPrompt] = useState('');
	const [presetId, setPresetId] = useState<EditPresetId>('edit-default');
	const [baseRefId, setBaseRefId] = useState<string>('');
	const [maskRefId, setMaskRefId] = useState<string>('');

	// Populate options from the current conversation.
	const [options, setOptions] = useState<EditImageOption[]>([]);
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const conv = activeConversation;
				if (!conv) {
					setOptions([]);
					return;
				}
				const receipts = await manager.conv.listArtifactReceiptsByConversation(conv.meta.id);
				const built = buildEditImageOptions({
					receipts,
					messages: conv.messages,
				});
				if (!cancelled) setOptions(built);
			} catch {
				if (!cancelled) setOptions([]);
			}
		})();
		return () => { cancelled = true; };
	}, [activeConversation, manager]);

	// Consume any pending intent (Insert-as-reference from an artifact card).
	useEffect(() => {
		const intent = useComposerEditImageStore.getState().consumeIntent();
		if (intent && !baseRefId) {
			// Match into an option — prefer receipt id, then vault path.
			const matched = options.find((o) => o.value === refKey(intent.base));
			if (matched) setBaseRefId(matched.value);
		}
		// re-run when options load so a late-arriving intent can bind
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [options]);

	const baseOption = options.find((o) => o.value === baseRefId) ?? null;
	const maskOption = options.find((o) => o.value === maskRefId) ?? null;

	// Preflight — cost hint.
	const [preflight, setPreflight] = useState<MediaPreflight | null>(null);
	const [preflightStatus, setPreflightStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable' | 'needs-base'>('needs-base');
	useEffect(() => {
		const svc = manager.conv.getMediaGenerationService();
		if (!svc) {
			setPreflight(null);
			setPreflightStatus('unavailable');
			return;
		}
		if (!baseOption) {
			setPreflight(null);
			setPreflightStatus('needs-base');
			return;
		}
		let cancelled = false;
		setPreflightStatus('loading');
		const request = buildEditRequest({
			prompt: prompt.trim() || 'preflight-preview',
			presetId,
			base: baseOption.ref,
			mask: maskOption?.ref,
		});
		void svc.preflight(request)
			.then((result) => {
				if (cancelled) return;
				setPreflight(result);
				setPreflightStatus('ready');
			})
			.catch(() => {
				if (cancelled) return;
				setPreflight(null);
				setPreflightStatus('unavailable');
			});
		return () => { cancelled = true; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [presetId, baseRefId, maskRefId, manager]);

	const costHint = useMemo<{ text: string } | null>(() => {
		if (preflightStatus !== 'ready' || !preflight) return null;
		const est = preflight.estimate;
		if (!est) return null;
		const prefix = strings.composer.generateImageCostHintPrefix;
		const confidence = est.confidence === 'estimated'
			? strings.composer.generateImageCostHintConfidenceEstimated
			: strings.composer.generateImageCostHintConfidenceReported;
		if (typeof est.amountUsd === 'number') {
			const amount = est.amountUsd < 0.01 ? `$${est.amountUsd.toFixed(4)}` : `$${est.amountUsd.toFixed(2)}`;
			return { text: `${prefix} ${amount} / ${est.billingUnit} (${confidence})` };
		}
		return { text: `${prefix} — / ${est.billingUnit} (${confidence})` };
	}, [preflight, preflightStatus, strings.composer]);

	const [running, setRunning] = useState(false);
	const confirmBlocked =
		running
		|| !baseOption
		|| !prompt.trim()
		|| preflightStatus === 'unavailable'
		|| preflight?.state === 'needs-configuration'
		|| preflight?.state === 'unsupported';

	// Escape closes. Detached-window safe (§5.3).
	useEffect(() => {
		const doc = dialogRef.current?.ownerDocument ?? document;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !running) {
				e.preventDefault();
				onClose();
			}
		};
		doc.addEventListener('keydown', handler);
		return () => doc.removeEventListener('keydown', handler);
	}, [onClose, running]);

	const runEdit = async () => {
		if (confirmBlocked) return;
		const svc = manager.conv.getMediaGenerationService();
		if (!svc || !baseOption) return;
		setRunning(true);
		const conv = activeConversation;
		const conversationId = conv?.meta.id ?? '';
		const runId = `ui-edit-${Date.now()}`;
		const request = buildEditRequest({
			prompt: prompt.trim(),
			presetId,
			base: baseOption.ref,
			mask: maskOption?.ref,
		});
		try {
			await svc.produce({
				request,
				runId,
				conversationId: conversationId || undefined,
			}, { bypassConfirmation: true });
			new Notice(strings.composer.editImageSuccessNoticeTemplate);
			onClose();
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			// Persist a failed receipt so the message thread shows the error.
			try {
				const receipt = buildEditFailedReceipt({
					runId,
					conversationId,
					request,
					reason,
					createdAt: Date.now(),
				});
				await svc.saveReceiptDirect(receipt);
			} catch { /* keep the Notice as the surface of last resort */ }
			new Notice(strings.composer.editImageFailedNoticeTemplate.replace('{reason}', reason));
		} finally {
			setRunning(false);
		}
	};

	// Mask restriction: `edit-fill` requires a mask (spec) — disable other
	// preset picks when a mask is set only for feedback consistency; the
	// preflight is the real authority.
	const fillDisabled = presetId === 'edit-fill' && !maskOption;

	return (
		<div ref={dialogRef} className="pkchat-generate-panel" role="dialog" aria-modal="true" aria-label={strings.composer.editImageLabel}>
			<div className="pkchat-generate-panel__head">
				<span className="pkchat-generate-panel__title">{strings.composer.editImageLabel}</span>
				<IconButton label={strings.composer.stopLabel} title={strings.composer.stopLabel} onClick={onClose}>
					<X />
				</IconButton>
			</div>
			<textarea
				autoFocus
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
				placeholder={strings.composer.editImagePromptPlaceholder}
				className="pktw-w-full pktw-min-h-[64px] pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded pktw-px-2 pktw-py-1 pktw-text-xs pktw-outline-none pktw-resize-y"
			/>
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-pk-xs pktw-flex-wrap">
				<label className="pktw-flex pktw-items-center pktw-gap-1">
					<span className="pktw-text-pk-text-tertiary">{strings.composer.editImageBaseSectionLabel}</span>
					<select
						value={baseRefId}
						onChange={(e) => setBaseRefId(e.target.value)}
						className="pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded pktw-px-1 pktw-py-0.5"
					>
						<option value="">—</option>
						{options.map((o) => (
							<option key={o.value} value={o.value}>{o.label}</option>
						))}
					</select>
				</label>
				<label className="pktw-flex pktw-items-center pktw-gap-1">
					<span className="pktw-text-pk-text-tertiary">{strings.composer.editImageMaskSectionLabel}</span>
					<select
						value={maskRefId}
						onChange={(e) => setMaskRefId(e.target.value)}
						className="pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded pktw-px-1 pktw-py-0.5"
					>
						<option value="">{strings.composer.editImageMaskNoneOption}</option>
						{options.map((o) => (
							<option key={o.value} value={o.value}>{o.label}</option>
						))}
					</select>
				</label>
				<label className="pktw-flex pktw-items-center pktw-gap-1">
					<span className="pktw-text-pk-text-tertiary">{strings.composer.editImagePresetLabel}</span>
					<select
						value={presetId}
						onChange={(e) => setPresetId(e.target.value as EditPresetId)}
						className="pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded pktw-px-1 pktw-py-0.5"
					>
						<option value={EDIT_PRESET_IDS.default}>{strings.composer.editImagePresetDefaultOption}</option>
						<option
							value={EDIT_PRESET_IDS.fill}
							title={!maskOption ? strings.composer.editImagePresetFillDisabledReason : undefined}
						>
							{strings.composer.editImagePresetFillOption}
						</option>
						<option value={EDIT_PRESET_IDS.native}>{strings.composer.editImagePresetNativeOption}</option>
					</select>
				</label>
			</div>
			{options.length === 0 && (
				<div className="pktw-text-pk-xs pktw-text-pk-text-tertiary">
					{strings.composer.editImageNoImagesHint}
				</div>
			)}
			<div className="pktw-text-pk-xs pktw-text-pk-text-tertiary" aria-live="polite">
				{preflightStatus === 'needs-base' && (
					<span>{strings.composer.editImageBaseMissingReason}</span>
				)}
				{preflightStatus === 'loading' && (
					<span>{strings.composer.generateImageCostHintLoading}</span>
				)}
				{preflightStatus === 'unavailable' && (
					<span>{strings.composer.generateImageCostHintUnavailable}</span>
				)}
				{preflightStatus === 'ready' && costHint && <span>{costHint.text}</span>}
				{preflightStatus === 'ready' && !costHint && (
					<span>{strings.composer.generateImageCostHintUnavailable}</span>
				)}
				{preflight?.state === 'needs-configuration' && preflight.problems[0]?.message && (
					<div className="pktw-mt-0.5">{preflight.problems[0].message}</div>
				)}
			</div>
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-1.5">
				<Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
					{strings.projectHome.cancelLabel}
				</Button>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => { void runEdit(); }}
					disabled={confirmBlocked || fillDisabled}
					title={
						fillDisabled
							? strings.composer.editImagePresetFillDisabledReason
							: (preflightStatus === 'unavailable' ? strings.composer.generateImageConfirmDisabledPreflightReason : undefined)
					}
				>
					{running ? strings.composer.editImageRunningLabel : strings.composer.editImageInsertLabel}
				</Button>
			</div>
		</div>
	);
};

function refKey(ref: MediaReferenceInput): string {
	return `${ref.sourceType}:${ref.ref}`;
}
