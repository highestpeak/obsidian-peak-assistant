import { SLICE_CAPS } from '@/core/constant';
import React from 'react';
import { Save, MessageCircle, Copy, MessageSquare, ChevronDown, Check, ExternalLink, ClipboardList } from 'lucide-react';
import { KeyboardShortcut } from '../../../component/mine/KeyboardShortcut';
import { Button } from '@/ui/component/shared-ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { UsageBadge } from './ai-analysis-sections/UsageBadge';
import { createOpenSourceCallback } from '../callbacks/open-source-file';

/**
 * Footer hints section for AI search tab
 */
export const AISearchFooterHints: React.FC<{}> = ({}) => (
	<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
		<KeyboardShortcut keys="Esc" description="to close" prefix="Press" />
		<KeyboardShortcut keys="Enter" description="to analyze" prefix="Press" />
		<KeyboardShortcut warning="• Will consume AI tokens" />
	</div>
);

interface V1FooterProps {
	isV2Active: boolean;
	hasAnalyzed: boolean;
	isAnalyzing: boolean;
	analysisCompleted: boolean;
	isNewPipeline: boolean;
	copied: boolean;
	setCopied: (v: boolean) => void;
	debugCopied: boolean;
	showContinueAnalysis: boolean;
	setShowContinueAnalysis: (v: boolean) => void;
	fullAnalysisFollowUp: Array<{ title?: string; content: string }> | null;
	openAnalysisPath: string | null;
	onClose?: () => void;
	handleCopyAll: () => void;
	handleCopyDebugInfo: () => void;
	handleOpenInChat: (onClose?: () => void) => void;
	setShowSaveDialog: (v: boolean) => void;
	continueAnalysisBlockRef: React.RefObject<HTMLDivElement>;
}

export const V1Footer: React.FC<V1FooterProps> = ({
	isV2Active,
	hasAnalyzed,
	isAnalyzing,
	analysisCompleted,
	isNewPipeline,
	copied,
	setCopied,
	debugCopied,
	showContinueAnalysis,
	setShowContinueAnalysis,
	fullAnalysisFollowUp,
	openAnalysisPath,
	onClose,
	handleCopyAll,
	handleCopyDebugInfo,
	handleOpenInChat,
	setShowSaveDialog,
	continueAnalysisBlockRef,
}) => (
	<div className={`pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between pktw-flex-shrink-0 ${isV2Active ? 'pktw-hidden' : ''}`}>
		{!hasAnalyzed && !isAnalyzing ? <AISearchFooterHints /> : null}
		{hasAnalyzed ? <UsageBadge /> : null}
		<div className="pktw-flex pktw-items-center pktw-gap-3">
			{/* Debug copy: always show when new pipeline has data, even mid-stream */}
			{isNewPipeline && isAnalyzing && (
				<Button
					onClick={handleCopyDebugInfo}
					size="sm"
					variant="ghost"
					className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
					title={debugCopied ? 'Copied!' : 'Copy session debug info'}
				>
					{debugCopied ? <Check className="pktw-w-3.5 pktw-h-3.5" /> : <ClipboardList className="pktw-w-3.5 pktw-h-3.5" />}
				</Button>
			)}
			{analysisCompleted && !isAnalyzing && (
				<>
					{/* Copy + Save: icon-only, no border; Copy shows Check for 1s after click then back to Copy */}
					<div className="pktw-flex pktw-items-center pktw-gap-1">
						{isNewPipeline && (
							<Button
								onClick={handleCopyDebugInfo}
								size="sm"
								variant="ghost"
								className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
								title={debugCopied ? 'Copied!' : 'Copy session debug info'}
							>
								{debugCopied ? <Check className="pktw-w-3.5 pktw-h-3.5" /> : <ClipboardList className="pktw-w-3.5 pktw-h-3.5" />}
							</Button>
						)}
						<Button
							onClick={() => {
								handleCopyAll();
								setCopied(true);
								window.setTimeout(() => setCopied(false), 1000);
							}}
							size="sm"
							variant="ghost"
							className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
							title={copied ? 'Copied' : 'Copy All'}
						>
							{copied ? <Check className="pktw-w-3.5 pktw-h-3.5" /> : <Copy className="pktw-w-3.5 pktw-h-3.5" />}
						</Button>
						<Button
							onClick={() => setShowSaveDialog(true)}
							size="sm"
							variant="ghost"
							className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
							title="Save to File"
						>
							<Save className="pktw-w-3.5 pktw-h-3.5" />
						</Button>
						{openAnalysisPath ? (
							<Button
								onClick={() => void createOpenSourceCallback(onClose)(openAnalysisPath)}
								size="sm"
								variant="ghost"
								className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9] pktw-border-0 pktw-shadow-none focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
								title="Open saved analysis file in document"
							>
								<ExternalLink className="pktw-w-3.5 pktw-h-3.5" />
							</Button>
						) : null}
					</div>
					<Button
						onClick={() => {
							const next = !showContinueAnalysis;
							setShowContinueAnalysis(next);
							if (next) {
								setTimeout(() => {
									continueAnalysisBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
								}, 100);
							}
						}}
						size="sm"
						variant="outline"
						className={`pktw-px-4 pktw-py-1.5 pktw-gap-2 ${showContinueAnalysis ? 'pktw-bg-[#6d28d9]/10 pktw-border-[#6d28d9]/30' : 'pktw-border-[#e5e7eb] pktw-bg-white pktw-text-[#6c757d] hover:pktw-bg-[#6d28d9]'}`}
						title={showContinueAnalysis ? 'Hide Continue Analysis' : 'Continue analysis with follow-up questions'}
					>
						<MessageSquare className="pktw-w-3.5 pktw-h-3.5" />
						<span>Continue Analysis</span>
					</Button>
					<HoverCard openDelay={150} closeDelay={300}>
						<HoverCardTrigger asChild>
							<Button
								size="sm"
								className="pktw-px-4 pktw-py-1.5 pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] pktw-gap-2"
								title="Open in chat or full analysis view"
							>
								<MessageCircle className="pktw-w-3.5 pktw-h-3.5" />
								<span>Open in Chat</span>
								<ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-opacity-80" />
							</Button>
						</HoverCardTrigger>
						<HoverCardContent align="end" side="bottom" sideOffset={4} className="pktw-w-[200px] pktw-p-1 pktw-z-[10000]">
							<Button
								variant="ghost"
								style={{ cursor: 'pointer' }}
								className="pktw-shadow-none pktw-w-full pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-sm pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-text-left pktw-cursor-pointer"
								onClick={() => handleOpenInChat(onClose)}
							>
								<MessageCircle className="pktw-w-3.5 pktw-h-3.5" />
								<span>Open in Chat</span>
							</Button>
							{/* Full analysis view — removed pending dedicated full-screen implementation */}
						</HoverCardContent>
					</HoverCard>
				</>
			)}
		</div>
	</div>
);
