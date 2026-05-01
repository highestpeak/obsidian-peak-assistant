import React from 'react';
import { ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';
import type { LintFinding, LintScanResult, LintSeverity, LintSignalId } from '@/service/lint/types';
import { SIGNAL_LABELS, SEVERITY_CONFIG, SEVERITY_ORDER } from '../constants';
import { FindingDetail } from './FindingDetail';

interface SignalGroup {
	signalId: LintSignalId;
	severity: LintSeverity;
	findings: LintFinding[];
}

function groupFindings(findings: LintFinding[]): SignalGroup[] {
	const map = new Map<LintSignalId, LintFinding[]>();
	for (const f of findings) {
		if (f.status === 'dismissed') continue;
		const list = map.get(f.signalId) ?? [];
		list.push(f);
		map.set(f.signalId, list);
	}

	const groups: SignalGroup[] = [];
	for (const [signalId, groupFindings] of map) {
		const severity = groupFindings[0].severity;
		groups.push({ signalId, severity, findings: groupFindings });
	}

	groups.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
	return groups;
}

interface PriorityActionsListProps {
	scan: LintScanResult;
}

export function PriorityActionsList({ scan }: PriorityActionsListProps) {
	const showInfoFindings = useVaultLintStore((s) => s.showInfoFindings);
	const toggleShowInfoFindings = useVaultLintStore((s) => s.toggleShowInfoFindings);

	const allGroups = groupFindings(scan.findings);
	const infoGroups = allGroups.filter((g) => g.severity === 'info');
	const nonInfoGroups = allGroups.filter((g) => g.severity !== 'info');

	const infoCount = infoGroups.reduce((sum, g) => sum + g.findings.length, 0);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1">
			<span className="pktw-text-xs pktw-font-medium pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-mb-1">
				Priority Actions
			</span>

			{nonInfoGroups.length === 0 && infoCount === 0 && (
				<span className="pktw-text-sm pktw-text-muted-foreground pktw-py-4 pktw-text-center">
					No issues found. Your vault is in great shape.
				</span>
			)}

			{nonInfoGroups.map((group) => (
				<SignalGroupRow key={group.signalId} group={group} />
			))}

			{infoCount > 0 && (
				<>
					{!showInfoFindings ? (
						<Button
							variant="ghost"
							size="xs"
							className="pktw-mt-1 pktw-text-muted-foreground"
							onClick={toggleShowInfoFindings}
						>
							<Eye className="pktw-h-3 pktw-w-3 pktw-mr-1" />
							Show {infoCount} info item{infoCount !== 1 ? 's' : ''}
						</Button>
					) : (
						<>
							<Button
								variant="ghost"
								size="xs"
								className="pktw-mt-1 pktw-text-muted-foreground"
								onClick={toggleShowInfoFindings}
							>
								Hide info items
							</Button>
							{infoGroups.map((group) => (
								<SignalGroupRow key={group.signalId} group={group} />
							))}
						</>
					)}
				</>
			)}
		</div>
	);
}

function SignalGroupRow({ group }: { group: SignalGroup }) {
	const expandedSignal = useVaultLintStore((s) => s.expandedSignal);
	const setExpandedSignal = useVaultLintStore((s) => s.setExpandedSignal);
	const selectedFilePath = useVaultLintStore((s) => s.selectedFilePath);
	const setSelectedFilePath = useVaultLintStore((s) => s.setSelectedFilePath);

	const isExpanded = expandedSignal === group.signalId;
	const config = SEVERITY_CONFIG[group.severity];
	const SevIcon = config.icon;
	const Chevron = isExpanded ? ChevronDown : ChevronRight;

	return (
		<div>
			<div
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-2 pktw-rounded-md hover:pktw-bg-accent pktw-cursor-pointer pktw-select-none"
				onClick={() => setExpandedSignal(group.signalId)}
			>
				<Chevron className="pktw-h-3.5 pktw-w-3.5 pktw-text-muted-foreground pktw-shrink-0" />
				<SevIcon className={`pktw-h-4 pktw-w-4 pktw-shrink-0 ${config.color}`} />
				<span className="pktw-text-sm pktw-flex-1">
					{SIGNAL_LABELS[group.signalId] ?? group.signalId}
				</span>
				<span className="pktw-text-xs pktw-tabular-nums pktw-text-muted-foreground">
					{group.findings.length}
				</span>
			</div>

			{isExpanded && (
				<div className="pktw-ml-6 pktw-space-y-1 pktw-mb-1">
					{group.findings.map((finding) => (
						<FindingRow
							key={finding.id}
							finding={finding}
							isSelected={selectedFilePath === finding.filePath}
							onSelect={() =>
								setSelectedFilePath(
									selectedFilePath === finding.filePath ? null : (finding.filePath ?? null)
								)
							}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function FindingRow({
	finding,
	isSelected,
	onSelect,
}: {
	finding: LintFinding;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const shortPath = finding.filePath
		? finding.filePath.split('/').slice(-2).join('/')
		: null;

	return (
		<div>
			<div
				className={`pktw-flex pktw-items-center pktw-gap-2 pktw-py-1 pktw-px-2 pktw-rounded pktw-text-xs pktw-cursor-pointer hover:pktw-bg-accent ${
					isSelected ? 'pktw-bg-accent' : ''
				}`}
				onClick={onSelect}
			>
				<span className="pktw-flex-1 pktw-truncate" title={finding.filePath ?? finding.title}>
					{finding.title}
				</span>
				{shortPath && (
					<span className="pktw-text-muted-foreground pktw-truncate pktw-max-w-[120px]" title={finding.filePath!}>
						{shortPath}
					</span>
				)}
			</div>

			{isSelected && <FindingDetail finding={finding} />}
		</div>
	);
}
