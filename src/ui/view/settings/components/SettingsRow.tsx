import * as React from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Row } from '@/ui/components/primitives';

/**
 * Collapses the recurring `<Row><Row.Icon><Icon/></Row.Icon><Row.Body>
 * <Row.Title>…</Row.Title><Row.Desc>…</Row.Desc></Row.Body><Row.Right>…
 * </Row.Right></Row>` shape used throughout Settings tabs.
 *
 * Right slot is freeform (Switch / NumberInput / Pill / Chip / Button etc.).
 */
export interface SettingsRowProps {
	icon: LucideIcon;
	title: React.ReactNode;
	desc?: React.ReactNode;
	right?: React.ReactNode;
	compact?: boolean;
	iconSize?: number;
}

export function SettingsRow({
	icon: Icon,
	title,
	desc,
	right,
	compact,
	iconSize = 16,
}: SettingsRowProps) {
	return (
		<Row compact={compact}>
			<Row.Icon>
				<Icon size={iconSize} />
			</Row.Icon>
			<Row.Body>
				<Row.Title>{title}</Row.Title>
				{desc !== undefined && <Row.Desc>{desc}</Row.Desc>}
			</Row.Body>
			{right !== undefined && <Row.Right>{right}</Row.Right>}
		</Row>
	);
}

/**
 * Collapses `<details><summary><Row disclosure>icon+title+desc+(meta+chevron)
 * </Row></summary><div className="pk-disclosure-body">children</div></details>`.
 */
export interface SettingsDisclosureProps {
	icon: LucideIcon;
	title: React.ReactNode;
	desc?: React.ReactNode;
	meta?: React.ReactNode;
	children: React.ReactNode;
	defaultOpen?: boolean;
	iconSize?: number;
}

export function SettingsDisclosure({
	icon: Icon,
	title,
	desc,
	meta,
	children,
	defaultOpen,
	iconSize = 16,
}: SettingsDisclosureProps) {
	return (
		<details open={defaultOpen}>
			<summary>
				<Row disclosure>
					<Row.Icon>
						<Icon size={iconSize} />
					</Row.Icon>
					<Row.Body>
						<Row.Title>{title}</Row.Title>
						{desc !== undefined && <Row.Desc>{desc}</Row.Desc>}
					</Row.Body>
					<Row.Right>
						{meta !== undefined && <Row.Meta>{meta}</Row.Meta>}
						<ChevronDown
							size={14}
							style={{ color: 'var(--pk-text-tertiary)' }}
						/>
					</Row.Right>
				</Row>
			</summary>
			<div className="pk-disclosure-body">{children}</div>
		</details>
	);
}

/**
 * Renders a `<div className="pkset-section">` with optional title/sub head.
 */
export interface SettingsSectionProps {
	title?: React.ReactNode;
	sub?: React.ReactNode;
	children: React.ReactNode;
}

export function SettingsSection({ title, sub, children }: SettingsSectionProps) {
	return (
		<div className="pkset-section">
			{title !== undefined && (
				<div className="pkset-section__head">
					<span className="pkset-section__title">{title}</span>
					{sub !== undefined && (
						<span className="pkset-section__sub">{sub}</span>
					)}
				</div>
			)}
			{children}
		</div>
	);
}
