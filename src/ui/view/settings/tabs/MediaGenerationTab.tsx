/**
 * Media Generation tab (Task E1, 2026-07-21).
 *
 * Sections:
 *   1. Default route (Auto / Native / fal)
 *   2. fal.ai — API key + attachment folder
 *   3. Default presets — per-kind default preset id + narrow field overrides
 *   4. Native (OpenAI) — profile picker + supported kinds
 *   5. Availability & validation — per-route×kind status matrix + "Validate
 *      configuration" (LOCAL checks only, honest disclaimer).
 *
 * Storage decision (see mediaSettingsOverlay.ts):
 *   - Big tables stay in `templates/config/media-generation.json`.
 *   - This tab writes ONLY to `settings.ai.mediaDefaults` +
 *     `settings.ai.falApiKey` + `settings.ai.mediaAttachmentFolder`.
 *   - `composeMediaRuntime.loadConfig` merges the overlay in one place, so
 *     downstream readers see a single shape.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Film, Image as ImageIcon, KeyRound, Music as MusicIcon, RefreshCw, Route, Sparkle, Volume2 } from 'lucide-react';
import { Button, Chip, FormRow, Segmented } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { MyPluginSettings, MediaSettingsOverride } from '@/core/config/settingsTypes';
import type { MediaExecutionRoute, MediaKind, MediaOperation } from '@/core/types/media-generation';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import {
	DEFAULT_MEDIA_GENERATION_CONFIG,
	loadMediaGenerationConfig,
	type MediaGenerationConfig,
} from '@/service/media/mediaGenerationConfig';
import {
	applyMediaSettingsOverlay,
	listOpenAiProfilesForNative,
	validateMediaConfiguration,
	type MediaConfigurationProblem,
	type ValidateMediaResult,
} from '@/service/media/mediaSettingsOverlay';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import { SettingsRow, SettingsSection } from '../components/SettingsRow';
import { useSettingsStrings } from '../settingsStrings';
import type { TabId } from '../types';
import { useSubscribeUIEvent } from '@/ui/store/uiEventStore';

interface MediaGenerationTabProps {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
	onSwitchTab?: (tab: TabId) => void;
}

const KIND_LIST: readonly MediaKind[] = ['image', 'video', 'music', 'tts'];
const ROUTE_ORDER: readonly Array<'native' | 'fal'> = ['native', 'fal'];

export function MediaGenerationTab({ settings, settingsUpdates, onSwitchTab }: MediaGenerationTabProps) {
	const strings = useSettingsStrings().mediaGeneration;
	const { manager } = useServiceContext();

	// Resolved config with overlay applied. Refreshed when settings.mediaDefaults changes.
	const [config, setConfig] = useState<MediaGenerationConfig>(DEFAULT_MEDIA_GENERATION_CONFIG);
	useEffect(() => {
		let cancelled = false;
		void loadMediaGenerationConfig()
			.then((base) => {
				if (cancelled) return;
				setConfig(applyMediaSettingsOverlay(base, settings.ai.mediaDefaults));
			})
			.catch(() => {
				if (cancelled) return;
				setConfig(applyMediaSettingsOverlay(DEFAULT_MEDIA_GENERATION_CONFIG, settings.ai.mediaDefaults));
			});
		return () => { cancelled = true; };
	}, [settings.ai.mediaDefaults]);

	// Per-kind sync availability (mirrors what Composer sees).
	const [syncSnapshot, setSyncSnapshot] = useState<ReturnType<typeof buildEmptySnapshot>>(buildEmptySnapshot());
	const refreshSyncSnapshot = useCallback(() => {
		try {
			const svc = manager.conv.getMediaGenerationService();
			if (svc) setSyncSnapshot(svc.probeSyncAvailability());
		} catch { /* service unavailable in tests */ }
	}, [manager]);
	useEffect(() => {
		refreshSyncSnapshot();
	}, [refreshSyncSnapshot, settings.ai.mediaDefaults, settings.ai.falApiKey, settings.profileSettings]);
	// E2 R2#4 (E1 M-3): the runner publishes `media-job-updated` whenever a
	// job transitions (awaiting → running → completed/failed/cancelled) —
	// receipt state changes can flip a kind's route-ready badge (e.g. after
	// the runner marks a fal job failed for a reason that outlives this
	// session). Subscribing here keeps the Availability & validation matrix
	// honest without the user having to close+reopen Settings.
	useSubscribeUIEvent('media-job-updated', refreshSyncSnapshot);

	// Validation state — local-only, never spends money.
	const lastValidated = settings.ai.mediaDefaults?.lastValidatedAt;
	const [validation, setValidation] = useState<ValidateMediaResult | null>(null);
	const [validating, setValidating] = useState(false);
	const runValidation = useCallback(() => {
		setValidating(true);
		try {
			const result = validateMediaConfiguration({
				settings: settings.ai,
				config,
				profileLookup: {
					getAllProfiles: () => ProfileRegistry.getInstance().getAllProfiles(),
					getProfileById: (id: string) => ProfileRegistry.getInstance().getProfileById(id),
				},
			});
			setValidation(result);
			void settingsUpdates.updateAI('mediaDefaults', {
				...(settings.ai.mediaDefaults ?? {}),
				lastValidatedAt: result.validatedAt,
			});
		} finally {
			setValidating(false);
		}
	}, [settings.ai, config, settingsUpdates]);

	// ─── Section 1: route ────────────────────────────────────────────────
	const currentRoute: MediaExecutionRoute = settings.ai.mediaDefaults?.defaultRoute ?? config.defaultRoute;
	const setRoute = (next: MediaExecutionRoute) => {
		void settingsUpdates.updateAI('mediaDefaults', mergeOverride(settings.ai.mediaDefaults, { defaultRoute: next }));
	};

	// ─── Section 2: fal fields ────────────────────────────────────────────
	const falKey = settings.ai.falApiKey ?? '';
	const setFalKey = (v: string) => { void settingsUpdates.updateAI('falApiKey', v); };
	const mediaFolder = settings.ai.mediaAttachmentFolder ?? '';
	const setMediaFolder = (v: string) => { void settingsUpdates.updateAI('mediaAttachmentFolder', v); };

	// ─── Section 3: preset overrides ──────────────────────────────────────
	const setDefaultPreset = (kind: MediaKind, presetId: string) => {
		const nextIds = {
			...(settings.ai.mediaDefaults?.defaultPresetIds ?? {}),
			[kind]: presetId,
		};
		void settingsUpdates.updateAI('mediaDefaults', mergeOverride(settings.ai.mediaDefaults, { defaultPresetIds: nextIds }));
	};
	const setPresetOverride = (kind: MediaKind, patch: NonNullable<MediaSettingsOverride['presetOverrides']>[MediaKind]) => {
		const nextOverrides = { ...(settings.ai.mediaDefaults?.presetOverrides ?? {}) };
		if (!patch || Object.keys(patch).length === 0) {
			delete nextOverrides[kind];
		} else {
			nextOverrides[kind] = { ...(nextOverrides[kind] ?? {}), ...patch };
		}
		void settingsUpdates.updateAI('mediaDefaults', mergeOverride(settings.ai.mediaDefaults, { presetOverrides: nextOverrides }));
	};

	// ─── Section 4: native profile ────────────────────────────────────────
	const openAiProfiles = useMemo(
		() => listOpenAiProfilesForNative({
			getAllProfiles: () => ProfileRegistry.getInstance().getAllProfiles(),
			getProfileById: (id: string) => ProfileRegistry.getInstance().getProfileById(id),
		}),
		// settings.profileSettings changes trigger a re-render implicitly via
		// the outer settings prop; keep deps empty so the memo stays cheap.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[settings.profileSettings],
	);
	const currentNativeProfileId = settings.ai.mediaDefaults?.nativeProfileId ?? '';
	const setNativeProfileId = (id: string) => {
		void settingsUpdates.updateAI('mediaDefaults', mergeOverride(settings.ai.mediaDefaults, { nativeProfileId: id || undefined }));
	};

	// ─── Rendering ────────────────────────────────────────────────────────
	return (
		<div className="pkset-panel">
			<SettingsSection title={strings.tabIntro.sectionTitle} sub={strings.tabIntro.sectionSub}>
				<span />
			</SettingsSection>

			<SettingsSection title={strings.route.sectionTitle} sub={strings.route.sectionSub}>
				<div className="pkset-row-list">
					<SettingsRow
						icon={Route}
						title={strings.route.sectionTitle}
						desc={
							currentRoute === 'auto'
								? strings.route.optionAutoDesc
								: currentRoute === 'native'
									? strings.route.optionNativeDesc
									: strings.route.optionFalDesc
						}
						right={
							<Segmented<MediaExecutionRoute>
								value={currentRoute}
								onValueChange={setRoute}
								options={[
									{ value: 'auto', label: strings.route.optionAuto },
									{ value: 'native', label: strings.route.optionNative },
									{ value: 'fal', label: strings.route.optionFal },
								]}
								aria-label={strings.route.sectionTitle}
							/>
						}
					/>
				</div>
			</SettingsSection>

			<SettingsSection title={strings.fal.sectionTitle} sub={strings.fal.sectionSub}>
				<FormRow>
					<FormRow.Label>{strings.fal.keyLabel}</FormRow.Label>
					<FormRow.ControlHint>{strings.fal.keyDesc}</FormRow.ControlHint>
					<FormRow.Control>
						<FormRow.Input
							type="password"
							value={falKey}
							onChange={(e) => setFalKey(e.target.value)}
							placeholder={strings.fal.keyPlaceholder}
							autoComplete="off"
							spellCheck={false}
						/>
					</FormRow.Control>
				</FormRow>
				<FormRow>
					<FormRow.Label>{strings.fal.attachmentFolderLabel}</FormRow.Label>
					<FormRow.ControlHint>
						{strings.fal.attachmentFolderDesc}
						{' '}
						{strings.fal.attachmentFolderDefaultHint.replace('{default}', config.attachmentSubfolder)}
					</FormRow.ControlHint>
					<FormRow.Control>
						<FormRow.Input
							type="text"
							value={mediaFolder}
							onChange={(e) => setMediaFolder(e.target.value)}
							placeholder={strings.fal.attachmentFolderPlaceholder}
							sans
						/>
					</FormRow.Control>
				</FormRow>
			</SettingsSection>

			<SettingsSection title={strings.presets.sectionTitle} sub={strings.presets.sectionSub}>
				<div className="pkset-row-list">
					{KIND_LIST.map((kind) => (
						<PresetRow
							key={kind}
							kind={kind}
							strings={strings.presets}
							config={config}
							overlay={settings.ai.mediaDefaults}
							onChangePreset={(pid) => setDefaultPreset(kind, pid)}
							onOverride={(patch) => setPresetOverride(kind, patch)}
						/>
					))}
				</div>
			</SettingsSection>

			<SettingsSection title={strings.native.sectionTitle} sub={strings.native.sectionSub}>
				<div className="pkset-row-list">
					{openAiProfiles.length === 0 ? (
						<SettingsRow
							icon={KeyRound}
							title={strings.native.sectionTitle}
							desc={strings.native.noProfilesHint}
							right={
								<Button variant="secondary" size="sm" onClick={() => onSwitchTab?.('aiModels')}>
									{strings.native.gotoProfilesLabel}
								</Button>
							}
						/>
					) : (
						<SettingsRow
							icon={KeyRound}
							title={strings.native.profileLabel}
							desc={strings.native.sectionSub}
							right={
								<select
									className="pk-form-select"
									value={currentNativeProfileId}
									onChange={(e) => setNativeProfileId(e.target.value)}
									aria-label={strings.native.profileLabel}
								>
									<option value="">{strings.native.profileAutoOption}</option>
									{openAiProfiles.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name}
											{p.enabled ? '' : strings.native.profileDisabledSuffix}
											{p.hasKey ? '' : strings.native.profileNoKeySuffix}
										</option>
									))}
								</select>
							}
						/>
					)}
					<SettingsRow
						icon={ImageIcon}
						title={strings.native.supportedKindsLabel}
						desc={
							(syncSnapshot.perKind.image.routes.native.supportedKinds.length > 0
								? syncSnapshot.perKind.image.routes.native.supportedKinds.join(', ')
								: strings.native.supportedKindNone)
						}
					/>
				</div>
			</SettingsSection>

			<SettingsSection title={strings.status.sectionTitle} sub={strings.status.sectionSub}>
				<StatusMatrix
					strings={strings.status}
					snapshot={syncSnapshot}
				/>
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-2">
					<Button variant="primary" size="sm" onClick={runValidation} disabled={validating}>
						{validating ? strings.status.validateRunning : strings.status.validateButton}
					</Button>
					<span className="pktw-text-pk-xs pktw-text-pk-text-tertiary">
						{lastValidated
							? `${strings.status.validateLastAtLabel} ${new Date(lastValidated).toLocaleString()}`
							: strings.status.validateNeverHint}
					</span>
				</div>
				<span className="pktw-block pktw-mt-2 pktw-text-pk-xs pktw-text-pk-text-tertiary">
					{strings.status.validateDisclaimer}
				</span>
				{validation && <ValidationReport strings={strings.status} result={validation} />}
			</SettingsSection>
		</div>
	);
}

// ─── PresetRow ─────────────────────────────────────────────────────────────

interface PresetRowProps {
	kind: MediaKind;
	strings: ReturnType<typeof useSettingsStrings>['mediaGeneration']['presets'];
	config: MediaGenerationConfig;
	overlay: MediaSettingsOverride | undefined;
	onChangePreset: (presetId: string) => void;
	onOverride: (patch: NonNullable<MediaSettingsOverride['presetOverrides']>[MediaKind]) => void;
}

function PresetRow({ kind, strings, config, overlay, onChangePreset, onOverride }: PresetRowProps) {
	const presetsForKind = config.presets[kind] ?? {};
	const presetIds = Object.keys(presetsForKind);
	const overlayId = overlay?.defaultPresetIds?.[kind];
	const currentPresetId = overlayId && presetsForKind[overlayId] ? overlayId : 'default';
	const currentPreset = presetsForKind[currentPresetId] ?? presetsForKind.default;
	const patch = overlay?.presetOverrides?.[kind];

	const kindLabel = kind === 'image'
		? strings.kindImage
		: kind === 'video'
			? strings.kindVideo
			: kind === 'music'
				? strings.kindMusic
				: strings.kindTts;
	const KindIcon = kind === 'image'
		? ImageIcon
		: kind === 'video'
			? Film
			: kind === 'music'
				? MusicIcon
				: Volume2;

	if (!currentPreset) {
		return (
			<SettingsRow
				icon={KindIcon}
				title={kindLabel}
				desc={strings.emptyOverridesHint}
			/>
		);
	}

	return (
		<div className="pkset-section" data-media-kind={kind}>
			<div className="pkset-section__head">
				<span className="pkset-section__title pktw-flex pktw-items-center pktw-gap-2">
					<KindIcon size={14} />
					{kindLabel}
				</span>
			</div>
			<FormRow>
				<FormRow.Label>{strings.defaultPresetLabel}</FormRow.Label>
				<FormRow.Control>
					<select
						className="pk-form-select"
						value={currentPresetId}
						onChange={(e) => onChangePreset(e.target.value)}
					>
						{presetIds.map((pid) => (
							<option key={pid} value={pid}>{pid}</option>
						))}
					</select>
				</FormRow.Control>
			</FormRow>
			<FormRow>
				<FormRow.Label>{strings.modelLabel}</FormRow.Label>
				<FormRow.Control>
					<FormRow.Input
						sans
						type="text"
						value={patch?.model ?? currentPreset.model}
						onChange={(e) => onOverride({ ...(patch ?? {}), model: e.target.value || undefined })}
						placeholder={currentPreset.model}
					/>
				</FormRow.Control>
			</FormRow>
			{kind === 'image' && (
				<>
					<FormRow>
						<FormRow.Label>{strings.aspectRatioLabel}</FormRow.Label>
						<FormRow.Control>
							<FormRow.Input
								sans
								type="text"
								value={patch?.aspectRatio ?? currentPreset.aspectRatio ?? ''}
								onChange={(e) => onOverride({ ...(patch ?? {}), aspectRatio: e.target.value || undefined })}
								placeholder={currentPreset.aspectRatio ?? '1:1'}
							/>
						</FormRow.Control>
					</FormRow>
					<FormRow>
						<FormRow.Label>{strings.quantityLabel}</FormRow.Label>
						<FormRow.Control>
							<FormRow.Number
								min={1}
								max={16}
								step={1}
								value={patch?.quantity ?? currentPreset.quantity ?? 1}
								onChange={(e) => {
									const n = Number(e.target.value);
									onOverride({ ...(patch ?? {}), quantity: Number.isFinite(n) && n > 0 ? Math.max(1, Math.floor(n)) : undefined });
								}}
							/>
						</FormRow.Control>
					</FormRow>
				</>
			)}
			{(kind === 'video' || kind === 'music' || kind === 'tts') && (
				<>
					<FormRow>
						<FormRow.Label>{strings.durationLabel}</FormRow.Label>
						<FormRow.Control>
							<FormRow.Number
								unit={strings.durationUnit}
								min={1}
								step={1}
								value={patch?.durationSeconds ?? currentPreset.durationSeconds ?? ''}
								onChange={(e) => {
									const n = Number(e.target.value);
									onOverride({ ...(patch ?? {}), durationSeconds: Number.isFinite(n) && n > 0 ? n : undefined });
								}}
							/>
						</FormRow.Control>
					</FormRow>
					<FormRow>
						<FormRow.Label>{strings.maxDurationLabel}</FormRow.Label>
						<FormRow.Control>
							<FormRow.Number
								unit={strings.durationUnit}
								min={1}
								step={1}
								value={patch?.maxDurationSeconds ?? currentPreset.maxDurationSeconds ?? ''}
								onChange={(e) => {
									const n = Number(e.target.value);
									onOverride({ ...(patch ?? {}), maxDurationSeconds: Number.isFinite(n) && n > 0 ? n : undefined });
								}}
							/>
						</FormRow.Control>
					</FormRow>
				</>
			)}
			{kind === 'tts' && (
				<FormRow>
					<FormRow.Label>{strings.voiceLabel}</FormRow.Label>
					<FormRow.Control>
						<FormRow.Input
							sans
							type="text"
							value={patch?.voice ?? currentPreset.voice ?? ''}
							onChange={(e) => onOverride({ ...(patch ?? {}), voice: e.target.value || undefined })}
							placeholder={currentPreset.voice ?? ''}
						/>
					</FormRow.Control>
				</FormRow>
			)}
			{patch && Object.keys(patch).length > 0 && (
				<div className="pktw-flex pktw-justify-end pktw-mt-1">
					<Button variant="ghost" size="sm" onClick={() => onOverride(undefined)}>
						{strings.resetLabel}
					</Button>
				</div>
			)}
			{kind === 'music' && (
				<div className="pktw-mt-2" data-testid="music-licensing-note">
					<span className="pktw-block pktw-text-pk-sm pktw-font-medium pktw-text-foreground">
						{strings.musicLicensingTitle}
					</span>
					<span className="pktw-block pktw-text-pk-sm pktw-text-muted-foreground pktw-mt-1">
						{strings.musicLicensingBody}
					</span>
					<a
						className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-sm pktw-text-accent pktw-mt-1"
						href={strings.musicLicensingUrl}
						target="_blank"
						rel="noreferrer"
					>
						<ExternalLink size={12} />
						{strings.musicLicensingLinkLabel}
					</a>
				</div>
			)}
		</div>
	);
}

// ─── Status matrix ─────────────────────────────────────────────────────────

const OPERATION_ORDER: readonly MediaOperation[] = ['generate', 'edit'];

function StatusMatrix({
	strings,
	snapshot,
}: {
	strings: ReturnType<typeof useSettingsStrings>['mediaGeneration']['status'];
	snapshot: ReturnType<typeof buildEmptySnapshot>;
}) {
	const rows: Array<{ route: 'native' | 'fal'; kind: MediaKind; operation: MediaOperation }> = [];
	for (const route of ROUTE_ORDER) {
		for (const kind of KIND_LIST) {
			for (const operation of OPERATION_ORDER) {
				// Skip TTS × native (adapter doesn't cover TTS today).
				if (route === 'native' && kind === 'tts') continue;
				// Edit is only defined for image today — showing "unsupported"
				// on every non-image row would be noise. Restrict edit to image.
				if (operation === 'edit' && kind !== 'image') continue;
				rows.push({ route, kind, operation });
			}
		}
	}
	return (
		<table className="pkset-media-status-matrix pktw-w-full pktw-text-pk-xs">
			<thead>
				<tr>
					<th className="pktw-text-left pktw-py-1 pktw-pr-3">{strings.routeColumnLabel}</th>
					<th className="pktw-text-left pktw-py-1 pktw-pr-3">{strings.kindColumnLabel}</th>
					<th className="pktw-text-left pktw-py-1 pktw-pr-3">op</th>
					<th className="pktw-text-left pktw-py-1 pktw-pr-3">{strings.statusColumnLabel}</th>
					<th className="pktw-text-left pktw-py-1">{strings.reasonColumnLabel}</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => {
					const routeInfo = buildMatrixRowInfo(row, snapshot);
					const ready = routeInfo.configured && routeInfo.supported;
					const label = !routeInfo.supported
						? strings.statusUnsupported
						: ready
							? strings.statusReady
							: strings.statusNotReady;
					return (
						<tr key={`${row.route}-${row.kind}-${row.operation}`}>
							<td className="pktw-py-1 pktw-pr-3">{row.route}</td>
							<td className="pktw-py-1 pktw-pr-3">{row.kind}</td>
							<td className="pktw-py-1 pktw-pr-3">{row.operation}</td>
							<td className="pktw-py-1 pktw-pr-3">
								{ready ? (
									<Chip variant="success">
										<Check size={11} className="pktw-mr-1" />
										{label}
									</Chip>
								) : (
									<Chip variant="warning">
										<AlertTriangle size={11} className="pktw-mr-1" />
										{label}
									</Chip>
								)}
							</td>
							<td className="pktw-py-1 pktw-text-pk-text-tertiary">
								{routeInfo.reason ?? (ready ? '' : '—')}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

// ─── Validation report ─────────────────────────────────────────────────────

function ValidationReport({
	strings,
	result,
}: {
	strings: ReturnType<typeof useSettingsStrings>['mediaGeneration']['status'];
	result: ValidateMediaResult;
}) {
	if (result.ok) {
		return (
			<div className="pktw-mt-2 pktw-flex pktw-items-center pktw-gap-2 pktw-text-pk-xs">
				<Check size={12} className="pktw-text-pk-success" />
				<span>{strings.validateOkLabel}</span>
			</div>
		);
	}
	return (
		<div className="pktw-mt-2 pktw-text-pk-xs">
			<span className="pktw-block pktw-mb-1 pktw-text-pk-text-secondary">{strings.validateProblemsLabel}</span>
			<ul className="pktw-list-disc pktw-pl-4 pktw-space-y-0.5">
				{result.problems.map((p: MediaConfigurationProblem, i: number) => (
					<li key={`${p.code}-${i}`}>
						<Chip variant="warning">
							<AlertTriangle size={10} className="pktw-mr-1" />
							{p.code}
						</Chip>
						<span className="pktw-ml-2 pktw-text-pk-text-tertiary">{p.detail}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Derive the display-ready info for one row in the Availability matrix.
 *
 * Extracted as a pure function so unit tests can cover both defect fixes
 * without spinning up React:
 *   V1 fix — fal route derives reason='missing-key' when !configured
 *            (previously fell through to '—' because reason was always undefined)
 *   V2 fix — fal×tts row uses the real fal supportedKinds (which include 'tts')
 *            instead of hardcoding {configured:false, supported:false,
 *            reason:'unsupported-kind'}. TTS via fal (kokoro) is a shipping
 *            capability exposed through `peak-media-tts-active-note`.
 *
 * @internal — exported only for unit testing (media-status-matrix.test.ts).
 */
export function buildMatrixRowInfo(
	row: { route: 'native' | 'fal'; kind: MediaKind; operation?: MediaOperation },
	snapshot: ReturnType<typeof buildEmptySnapshot>,
): { configured: boolean; supported: boolean; reason: string | undefined } {
	const operation: MediaOperation = row.operation ?? 'generate';
	const falSnapshot = snapshot.perKind.image.routes.fal;
	if (row.kind === 'tts' && row.route === 'fal') {
		// V2: tts is not in perKind (snapshot only covers Chat tool kinds:
		// image/video/music). Use the shared fal state borrowed from image entry.
		// Edit operation is not defined for TTS today — treat as unsupported.
		if (operation === 'edit') {
			return { configured: falSnapshot.configured, supported: false, reason: 'unsupported-operation' };
		}
		return {
			configured: falSnapshot.configured,
			supported: falSnapshot.supportedKinds.includes('tts'),
			reason: falSnapshot.configured ? undefined : 'missing-key',
		};
	}
	const perKind = row.kind === 'tts'
		? null
		: snapshot.perKind[row.kind as 'image' | 'video' | 'music'];
	if (!perKind) {
		return { configured: false, supported: false, reason: 'unsupported-kind' };
	}
	if (row.route === 'native') {
		const nativeOps = perKind.routes.native.supportedOperations ?? ['generate'];
		const supportsOp = nativeOps.includes(operation);
		return {
			configured: perKind.routes.native.configured,
			supported: perKind.routes.native.supportedKinds.includes(row.kind) && supportsOp,
			reason: !supportsOp
				? 'unsupported-operation'
				: perKind.routes.native.reason,
		};
	}
	// fal route — V1: derive reason from configured state
	const falOps = perKind.routes.fal.supportedOperations ?? ['generate'];
	const falSupportsOp = falOps.includes(operation);
	return {
		configured: perKind.routes.fal.configured,
		supported: perKind.routes.fal.supportedKinds.includes(row.kind) && falSupportsOp,
		reason: !falSupportsOp
			? 'unsupported-operation'
			: (perKind.routes.fal.configured ? undefined : 'missing-key'),
	};
}

function mergeOverride(
	base: MediaSettingsOverride | undefined,
	patch: Partial<MediaSettingsOverride>,
): MediaSettingsOverride {
	return {
		...(base ?? {}),
		...patch,
	};
}

function buildEmptySnapshot(): {
	perKind: Record<'image' | 'video' | 'music', {
		anyRouteReady: boolean;
		routes: {
			native: { configured: boolean; supportedKinds: readonly MediaKind[]; supportedOperations?: readonly MediaOperation[]; reason?: string };
			fal: { configured: boolean; supportedKinds: readonly MediaKind[]; supportedOperations?: readonly MediaOperation[] };
		};
	}>;
} {
	const emptyEntry = () => ({
		anyRouteReady: false,
		routes: {
			native: { configured: false, supportedKinds: [] as readonly MediaKind[], reason: undefined as string | undefined },
			fal: { configured: false, supportedKinds: [] as readonly MediaKind[] },
		},
	});
	return { perKind: { image: emptyEntry(), video: emptyEntry(), music: emptyEntry() } };
}
