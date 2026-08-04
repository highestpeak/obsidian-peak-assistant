import React from 'react';
import { FileText, LockKeyhole, PlugZap } from 'lucide-react';
import { Button, Chip } from '@/ui/components/primitives';
import type { PluginCommandReviewItem } from '@/core/types/plugin-command-gateway';
import type { SettingsStrings } from '@/ui/view/settings/settingsStrings';
import {
	formatPluginCommandCopy,
	isPluginCommandContextual,
	isPluginCommandUnavailable,
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
		>
			<Button
				variant="ghost"
				className="pk-command-review-row__main-action"
				aria-pressed={props.selected}
				onClick={() => props.onSelect(item)}
			>
				<FileText aria-hidden="true" />
				<span className="pk-command-review-row__main-copy">
					<span className="pk-command-review-row__title-line">
						<span className="pk-command-review-row__title">{item.descriptor.commandName}</span>
						{isPluginCommandContextual(item) && (
							<Chip variant="neutral">{copy.badges.requiresEditor}</Chip>
						)}
						{item.stale && <Chip variant="warning">{copy.badges.reviewAgain}</Chip>}
					</span>
					<span className="pk-command-review-row__id">{item.descriptor.commandId}</span>
				</span>
			</Button>
			<div className="pk-command-review-row__risk">
				<span className="pk-command-risk" data-risk={item.effectiveRisk}>
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
		return (
			<div className="pk-command-access-cell">
				<div className="pk-command-access-state">
					<span className="pk-command-access-unavailable">
						<LockKeyhole aria-hidden="true" />
						<span>{copy.access.unavailable}</span>
					</span>
					<span className="pk-command-access-reason">{unavailableReason(item, copy)}</span>
				</div>
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
	if (item.descriptor.availabilityReason === 'active-editor-required') {
		return copy.warnings.editorRequired;
	}
	if (item.descriptor.availability !== 'available' && item.descriptor.availability !== 'conditional') {
		return formatPluginCommandCopy(copy.warnings.unavailable, {
			reason: item.descriptor.availabilityReason ?? item.descriptor.availability,
		});
	}
	if (item.descriptor.interaction === 'modal') return copy.warnings.modal;
	if (item.effectiveRisk === 'destructive') return copy.warnings.destructive;
	return copy.warnings.unknown;
}
