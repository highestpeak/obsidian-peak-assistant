import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { PluginCommandGatewaySnapshot } from '@/core/types/plugin-command-gateway';
import { useSettingsStrings } from '../settingsStrings';
import { summarizePluginCommandItems } from '@/ui/view/command-gateway/pluginCommandGatewayReviewModel';

export function PluginCommandGatewaySection(props: {
	onOpenManager: () => void | Promise<void>;
}): React.ReactElement {
	const { pluginCommandGateway } = useServiceContext();
	const copy = useSettingsStrings().tools.pluginCommands;
	const [snapshot, setSnapshot] = useState<PluginCommandGatewaySnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!pluginCommandGateway) return;
		let cancelled = false;
		void pluginCommandGateway.getSnapshot()
			.then((next) => {
				if (!cancelled) setSnapshot(next);
			})
			.catch((reason) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
			});
		return () => {
			cancelled = true;
		};
	}, [pluginCommandGateway]);

	const summary = useMemo(
		() => summarizePluginCommandItems(snapshot?.commands ?? []),
		[snapshot],
	);

	return (
		<div className="pkset-section pk-command-gateway-settings-card">
			<div className="pk-command-gateway-settings-card__main">
				<span className="pk-command-gateway-settings-card__icon"><ShieldCheck aria-hidden="true" /></span>
				<span className="pk-command-gateway-settings-card__copy">
					<span className="pkset-section__title">{copy.sectionTitle}</span>
					<span className="pkset-section__sub">{copy.sectionSub}</span>
				</span>
				<Button
					size="sm"
					variant="primary"
					disabled={!pluginCommandGateway}
					onClick={() => void props.onOpenManager()}
				>
					{copy.openManager}
					<ArrowUpRight aria-hidden="true" />
				</Button>
			</div>
			{pluginCommandGateway ? (
				<div className="pk-command-gateway-settings-card__summary">
					<Summary label={copy.summary.approved} value={summary.approved} />
					<Summary label={copy.summary.notAllowed} value={summary.notAllowed} />
					<Summary label={copy.summary.systemExcluded} value={summary.unavailable} />
					<span className="pk-command-gateway-settings-card__scan">
						{snapshot?.lastScannedAt
							? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
								.format(new Date(snapshot.lastScannedAt))
							: copy.neverScanned}
					</span>
				</div>
			) : (
				<span className="pk-command-gateway-settings-card__status">{copy.runtimeUnavailable}</span>
			)}
			{error && <span className="pk-command-gateway-settings-card__error">{error}</span>}
		</div>
	);
}

function Summary(props: { label: string; value: number }): React.ReactElement {
	return <span><strong>{props.value}</strong>{props.label}</span>;
}
