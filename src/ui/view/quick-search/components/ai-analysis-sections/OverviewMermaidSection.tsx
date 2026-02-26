import React, { useState } from "react";
import { StreamdownIsolated } from "@/ui/component/mine";
import { Copy, Check, RefreshCw } from "lucide-react";
import { Button } from "@/ui/component/shared-ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/ui/component/shared-ui/hover-card";
import { copyText } from "@/ui/view/shared/common-utils";
import { wrapMermaidCode } from "@/core/utils/mermaid-utils";

export interface OverviewMermaidSectionProps {
	/** Current overview text (mermaid or markdown) to display. */
	overviewProp: string;
	/** All versions for "Current / Previous" switcher. */
	overviewMermaidVersions?: string[];
	/** Index into overviewMermaidVersions for the active version. */
	overviewMermaidActiveIndex?: number;
	setOverviewMermaidActiveIndex: (index: number) => void;
	regenerateOverview: () => void;
	isRegenerating: boolean;
}

/** Overview (Mermaid) block: copy, version switcher, regenerate, and content. */
export const OverviewMermaidSection: React.FC<OverviewMermaidSectionProps> = ({
	overviewProp,
	overviewMermaidVersions,
	overviewMermaidActiveIndex,
	setOverviewMermaidActiveIndex,
	regenerateOverview,
	isRegenerating,
}) => {
	const [overviewCopied, setOverviewCopied] = useState(false);
	const versions = overviewMermaidVersions ?? [];
	const activeIndex = overviewMermaidActiveIndex ?? 0;

	const displayMermaid = wrapMermaidCode(overviewProp);

	return (

		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border-0 pktw-flex pktw-flex-col pktw-gap-2">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-2">
				<span className="pktw-text-xs pktw-font-semibold pktw-text-[#6b7280]">Overview</span>
				<div className="pktw-flex pktw-items-center pktw-gap-1">
					{overviewProp?.trim() ? (
						<Button
							variant="ghost"
							size="icon"
							className="pktw-h-7 pktw-w-7 pktw-shadow-none"
							title={overviewCopied ? "Copied" : "Copy overview"}
							onClick={async () => {
								await copyText(overviewProp);
								setOverviewCopied(true);
								setTimeout(() => setOverviewCopied(false), 1500);
							}}
						>
							{overviewCopied ? (
								<Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600" />
							) : (
								<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
							)}
						</Button>
					) : null}
					{(versions.length > 1 || overviewProp?.trim()) && (
						<HoverCard openDelay={100} closeDelay={150}>
							<HoverCardTrigger asChild>
								<Button variant="ghost" size="sm" className="pktw-h-7 pktw-px-2 pktw-text-xs">
									{activeIndex === (versions.length || 1) - 1
										? "Current"
										: `Previous ${(versions.length || 0) - 1 - activeIndex}`}
								</Button>
							</HoverCardTrigger>
							<HoverCardContent
								align="end"
								className="pktw-w-48 pktw-p-1 pktw-z-[10000] pktw-max-h-[min(60vh,420px)] pktw-overflow-y-auto"
							>
								{versions.map((_, idx) => {
									const len = versions.length;
									const targetIndex = len - 1 - idx;
									const isCurrent = idx === 0;
									const label = isCurrent ? "Current" : `Previous ${idx}`;
									return (
										<Button
											key={idx}
											variant="ghost"
											style={{ cursor: "pointer" }}
											onClick={() => setOverviewMermaidActiveIndex(targetIndex)}
											className={`pktw-w-full pktw-justify-start pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-font-normal pktw-shadow-none ${activeIndex === targetIndex ? "pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed]" : ""}`}
										>
											{label}
										</Button>
									);
								})}
							</HoverCardContent>
						</HoverCard>
					)}
					<Button
						variant="ghost"
						size="sm"
						className="pktw-h-7 pktw-px-2 pktw-text-xs"
						onClick={regenerateOverview}
						disabled={isRegenerating}
					>
						<RefreshCw
							className={`pktw-w-3.5 pktw-h-3.5 pktw-mr-1 ${isRegenerating ? "pktw-animate-spin" : ""}`}
						/>
						{isRegenerating ? "Generating…" : "Regenerate"}
					</Button>
				</div>
			</div>
			{displayMermaid?.trim() ? (
				<StreamdownIsolated
					className="pktw-w-full pktw-min-w-0 pktw-text-left pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none pktw-select-text"
					isAnimating={false}
				>
					{displayMermaid}
				</StreamdownIsolated>
			) : isRegenerating ? (
				<span className="pktw-text-xs pktw-text-[#6b7280]">Generating overview diagram…</span>
			) : null}
		</div>
	);
};
