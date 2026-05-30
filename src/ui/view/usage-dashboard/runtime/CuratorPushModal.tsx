import * as React from 'react';
import { Modal, Pill } from '@/ui/components/primitives';
import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { useCuratorPushStore } from './curatorPushStore';
import type { DashboardStrings } from '../UsageDashboard';

/**
 * Mounted once at plugin init via a hidden React root. Reads
 * `useCuratorPushStore.current` and renders the Modal when set.
 *
 * The actual triggers live in `CuratorRuntimePushService`; this is the
 * presentation layer. Three buttons:
 *
 *   - Apply       — runs `payload.apply()` then dismisses
 *   - Dismiss     — clears current
 *   - Not now (this session) — clears + remembers dismissKey
 */
export function CuratorPushModal() {
	const current = useCuratorPushStore((s) => s.current);
	const dismiss = useCuratorPushStore((s) => s.dismiss);
	const [strings, setStrings] = React.useState<CuratorPushStrings>(FALLBACK_STRINGS);

	React.useEffect(() => {
		let cancelled = false;
		const load = async () => {
			try {
				const tm = TemplateManager.getInstance();
				const loaded = await tm.loadJson<DashboardStrings & { curatorPush?: CuratorPushStrings }>(
					ConfigTemplateId.Dashboard,
				);
				if (!cancelled && loaded?.curatorPush) {
					setStrings({ ...FALLBACK_STRINGS, ...loaded.curatorPush });
				}
			} catch { /* fallback */ }
		};
		void load();
		return () => { cancelled = true; };
	}, []);

	const handleApply = React.useCallback(async () => {
		if (current?.apply) {
			try { await current.apply(); } catch (e) {
				console.warn('[CuratorPushModal] Apply action failed:', e);
			}
		}
		dismiss(false);
	}, [current, dismiss]);

	if (!current) return null;

	return (
		<Modal
			open={true}
			onOpenChange={(v) => { if (!v) dismiss(false); }}
		>
			<Modal.Content
				width="narrow"
				aria-label={strings.heading}
				portalClassName="peak-design-root usage-dashboard"
			>
				<Modal.Header>
					<div className="pk-curator-push__head">
						<span className="pk-curator-push__badge" data-reason={current.reason}>
							{strings.heading}
						</span>
						<Modal.Title>{current.title}</Modal.Title>
					</div>
					<Modal.Close label={strings.close} />
				</Modal.Header>
				<Modal.Body>
					<p className="pk-curator-push__body">{current.body}</p>
				</Modal.Body>
				<Modal.Footer>
					<div className="pk-curator-push__actions">
						<Pill onClick={() => dismiss(true)}>{strings.dismissSession}</Pill>
						<Pill onClick={() => dismiss(false)}>{strings.dismiss}</Pill>
						{current.apply && (
							<button
								type="button"
								className="pk-curator-push__apply"
								onClick={handleApply}
							>
								{strings.apply}
							</button>
						)}
					</div>
				</Modal.Footer>
			</Modal.Content>
		</Modal>
	);
}

interface CuratorPushStrings {
	heading: string;
	apply: string;
	dismiss: string;
	dismissSession: string;
	close: string;
}

const FALLBACK_STRINGS: CuratorPushStrings = {
	heading: 'Curator suggestion',
	apply: 'Apply',
	dismiss: 'Dismiss',
	dismissSession: "Don't show this session",
	close: 'Close',
};
