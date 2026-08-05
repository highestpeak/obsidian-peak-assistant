import React from 'react';
import { AlertTriangle, FileText, LockKeyhole, PlugZap } from 'lucide-react';
import { Button, Chip } from '@/ui/components/primitives';
import type { PluginCommandReviewItem } from '@/core/types/plugin-command-gateway';
import type { SettingsStrings } from '@/ui/view/settings/settingsStrings';
import {
	formatPluginCommandCopy,
	isPluginCommandContextual,
	isPluginCommandUnavailable,
	pluginCommandAttentionKind,
	type PluginCommandReviewGroup,
} from './pluginCommandGatewayReviewModel';

type PluginCommandCopy = SettingsStrings['tools']['pluginCommands'];

export function PluginCommandGatewayReviewList(props: {
	groups: readonly PluginCommandReviewGroup[];
	copy: PluginCommandCopy;
	busyKey: string | null;
	scanning: boolean;
	selectedCommandId: string | null;
	onSelect: (item: PluginCommandReviewItem) => void;
	onToggle: (item: PluginCommandReviewItem) => void;
}): React.ReactElement {
	return (
		<div className="pk-command-gateway-list" aria-busy={props.scanning}>
			{props.groups.map((group) => (
				<CommandPluginGroup
					key={group.pluginId}
					group={group}
					copy={props.copy}
					busy={props.busyKey !== null}
					selectedCommandId={props.selectedCommandId}
					onSelect={props.onSelect}
					onToggle={props.onToggle}
				/>
			))}
		</div>
	);
}

function CommandPluginGroup(props: {
	group: PluginCommandReviewGroup;
	copy: PluginCommandCopy;
	busy: boolean;
	selectedCommandId: string | null;
	onSelect: (item: PluginCommandReviewItem) => void;
	onToggle: (item: PluginCommandReviewItem) => void;
}): React.ReactElement {
	const { group, copy } = props;
	return (
		<div className="pk-command-plugin-group">
			<div className="pk-command-plugin-group__head">
				<div className="pk-command-plugin-group__identity">
					<PlugZap size={14} aria-hidden="true" />
					<span className="pk-command-plugin-group__name">{group.pluginName}</span>
					<span className="pk-command-plugin-group__meta">
						{group.pluginVersion}
					</span>
				</div>
				<div className="pk-command-plugin-group__counts">
					<span>{formatPluginCommandCopy(copy.batch.shown, { count: group.items.length })}</span>
					{group.eligibleCount > 0 && (
						<Chip variant="accent">
							{formatPluginCommandCopy(copy.batch.eligible, { count: group.eligibleCount })}
						</Chip>
					)}
				</div>
			</div>
			<div className="pk-command-plugin-group__list">
				{group.items.map((item) => (
					<CommandReviewRow
						key={item.descriptor.commandId}
						item={item}
						copy={copy}
						busy={props.busy}
						selected={props.selectedCommandId === item.descriptor.commandId}
						onSelect={props.onSelect}
						onToggle={props.onToggle}
					/>
				))}
			</div>
		</div>
	);
}

function CommandReviewRow(props: {
	item: PluginCommandReviewItem;
	copy: PluginCommandCopy;
	busy: boolean;
	selected: boolean;
	onSelect: (item: PluginCommandReviewItem) => void;
	onToggle: (item: PluginCommandReviewItem) => void;
}): React.ReactElement {
	const { item, copy } = props;
	const unavailable = isPluginCommandUnavailable(item);
	return (
		<div
			className="pk-command-review-row"
			data-command-id={item.descriptor.commandId}
			data-selected={props.selected}
			data-attention={pluginCommandAttentionKind(item) ?? undefined}
		>
			<Button
				variant="ghost"
				className="pk-command-review-row__main-action"
				aria-pressed={props.selected}
				aria-expanded={props.selected}
				onClick={() => props.onSelect(item)}
			>
				<FileText aria-hidden="true" />
				<span className="pk-command-review-row__main-copy">
					<span className="pk-command-review-row__title-line">
						<span className="pk-command-review-row__title">{item.descriptor.commandName}</span>
						{item.stale && <Chip variant="warning">{copy.badges.reviewAgain}</Chip>}
					</span>
					<span className="pk-command-review-row__id">{item.descriptor.commandId}</span>
				</span>
			</Button>
			<div className="pk-command-review-row__risk">
				<span
					className="pk-command-risk"
					data-risk={item.effectiveRisk}
					title={copy.riskDescriptions[item.effectiveRisk]}
				>
					{copy.risks[item.effectiveRisk]}
				</span>
			</div>
			<CommandAccessCell
				item={item}
				copy={copy}
				unavailable={unavailable}
				disabled={props.busy}
				onToggle={props.onToggle}
			/>
			{props.selected && (
				<CommandRowDetails item={item} copy={copy} unavailable={unavailable} />
			)}
		</div>
	);
}

function CommandRowDetails(props: {
	item: PluginCommandReviewItem;
	copy: PluginCommandCopy;
	unavailable: boolean;
}): React.ReactElement {
	const { item, copy } = props;
	return (
		<div className="pk-command-review-row__details">
			<span className="pk-command-review-row__detail-copy">
				{item.finding?.summary ?? copy.details.metadataFallback}
			</span>
			<span className="pk-command-review-row__detail-meta">
				<span>{copy.riskDescriptions[item.effectiveRisk]}</span>
				{isPluginCommandContextual(item) && !props.unavailable && (
					<span className="pk-command-review-row__context">
						{copy.badges.requiresEditor} · {copy.warnings.editorRequired}
					</span>
				)}
				{props.unavailable && (
					<span className="pk-command-review-row__context" data-tone="attention">
						<AlertTriangle aria-hidden="true" />
						{unavailableReason(item, copy)}
					</span>
				)}
			</span>
		</div>
	);
}

function CommandAccessCell(props: {
	item: PluginCommandReviewItem;
	copy: PluginCommandCopy;
	unavailable: boolean;
	disabled: boolean;
	onToggle: (item: PluginCommandReviewItem) => void;
}): React.ReactElement {
	const { item, copy } = props;
	if (props.unavailable) {
		const attention = pluginCommandAttentionKind(item) ?? 'unavailable';
		return (
			<div className="pk-command-access-cell">
				<span className="pk-command-access-unavailable" data-attention={attention}>
					<LockKeyhole aria-hidden="true" />
					<span>{copy.attention[attention].label}</span>
				</span>
			</div>
		);
	}
	return (
		<div className="pk-command-access-cell">
			<Button
				size="sm"
				variant="ghost"
				className="pk-command-access-toggle"
				role="switch"
				aria-checked={item.approved}
				aria-label={formatPluginCommandCopy(copy.access.toggleLabel, {
					command: item.descriptor.commandName,
				})}
				data-on={item.approved}
				disabled={props.disabled}
				onClick={() => props.onToggle(item)}
			>
				<span className="pk-command-access-toggle__track" aria-hidden="true">
					<span className="pk-command-access-toggle__knob" />
				</span>
				<span className="pk-command-access-toggle__label">
					{item.approved ? copy.access.allowed : copy.access.notAllowed}
				</span>
			</Button>
		</div>
	);
}

export function unavailableReason(
	item: PluginCommandReviewItem,
	copy: PluginCommandCopy,
): string {
	const attention = pluginCommandAttentionKind(item);
	if (attention) return copy.attention[attention].description;
	if (item.descriptor.availabilityReason === 'active-editor-required') return copy.warnings.editorRequired;
	return formatPluginCommandCopy(copy.warnings.unavailable, {
		reason: item.descriptor.availabilityReason ?? item.descriptor.availability,
	});
}
