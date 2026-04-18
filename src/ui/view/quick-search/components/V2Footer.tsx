import React, { useState } from 'react';
import { Save, Copy, MessageSquare, Check, ExternalLink, Sparkles, Activity, Eye, FileText, List } from 'lucide-react';
import { V2TableOfContents } from './V2TableOfContents';
import { Button } from '@/ui/component/shared-ui/button';
import { useSearchSessionStore } from '../store/searchSessionStore';

/** V2 Footer — rendered by tab-AISearch at modal bottom when V2 is active */
export const V2Footer: React.FC<{
	onContinue: () => void;
	onSynthesize: () => void;
	showContinueAnalysis: boolean;
	onCopy: () => void;
	copied: boolean;
	onSave: () => void;
	onOpenInChat: () => void;
}> = ({ onContinue, onSynthesize, showContinueAnalysis, onCopy, copied, onSave, onOpenInChat }) => {
	const v2View = useSearchSessionStore((s) => s.v2View);
	const usage = useSearchSessionStore((s) => s.usage);
	const duration = useSearchSessionStore((s) => s.duration);
	const setV2View = useSearchSessionStore((s) => s.setV2View);
	const rounds = useSearchSessionStore((s) => s.rounds);
	const v2PlanSections = useSearchSessionStore((s) => s.v2PlanSections);
	const [showToc, setShowToc] = useState(false);

	const reportMarkdown = v2PlanSections
		.filter((sec) => sec.content)
		.map((sec) => '## ' + sec.title + '\n\n' + sec.content)
		.join('\n\n');

	const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
	const durationStr = duration ? `${(duration / 1000).toFixed(0)}s` : '';

	const views = [
		{ id: 'process' as const, icon: Activity, label: 'Process' },
		{ id: 'report' as const, icon: Eye, label: 'Report' },
		{ id: 'sources' as const, icon: FileText, label: 'Sources' },
	];

	return (
		<div className="pktw-relative pktw-border-t pktw-border-[#e5e7eb] pktw-bg-white pktw-px-3 pktw-py-2 pktw-flex pktw-items-center pktw-justify-between pktw-flex-shrink-0">
			{/* TOC popover — rendered above the footer, anchored bottom-left of this container */}
			{showToc && reportMarkdown.length > 0 && (
				<V2TableOfContents
					markdown={reportMarkdown}
					initialCollapsed={false}
					className="pktw-absolute pktw-bottom-full pktw-left-3 pktw-mb-1 pktw-z-50"
					onNavigate={() => setShowToc(false)}
				/>
			)}
			{/* Left: View tabs */}
			<div className="pktw-flex pktw-items-center pktw-gap-1">
				{views.slice(0, 2).map(({ id, icon: Icon, label }) => (
					<div
						key={id}
						onClick={() => setV2View(id)}
						className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-transition-all pktw-cursor-pointer ${
							id === 'report' ? 'pktw-rounded-l-lg' : 'pktw-rounded-lg'
						} ${
							v2View === id
								? 'pktw-bg-[#7c3aed] pktw-text-white'
								: 'pktw-text-[#6b7280] hover:pktw-bg-gray-100'
						}`}
					>
						<Icon className="pktw-w-3.5 pktw-h-3.5" />
						{label}
					</div>
				))}
				{/* TOC toggle — icon only, visually grouped with Report button */}
				{reportMarkdown.length > 0 && (
					<div
						onClick={() => setShowToc((prev) => !prev)}
						className={`pktw-flex pktw-items-center pktw-px-1.5 pktw-py-1.5 pktw-rounded-r-lg pktw-transition-all pktw-cursor-pointer pktw-border-l pktw-border-[#e5e7eb] ${
							showToc
								? 'pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed]'
								: 'pktw-text-[#6b7280] hover:pktw-bg-gray-100'
						}`}
						title="Table of Contents"
					>
						<List className="pktw-w-3.5 pktw-h-3.5" />
					</div>
				)}
				{views.slice(2).map(({ id, icon: Icon, label }) => (
					<div
						key={id}
						onClick={() => setV2View(id)}
						className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-rounded-lg pktw-transition-all pktw-cursor-pointer ${
							v2View === id
								? 'pktw-bg-[#7c3aed] pktw-text-white'
								: 'pktw-text-[#6b7280] hover:pktw-bg-gray-100'
						}`}
					>
						<Icon className="pktw-w-3.5 pktw-h-3.5" />
						{label}
					</div>
				))}
			</div>

			{/* Center: Stats */}
			{usage && (
				<span className="pktw-text-xs pktw-text-[#9ca3af] pktw-tabular-nums">
					{fmt(usage.inputTokens ?? 0)} in / {fmt(usage.outputTokens ?? 0)} out{durationStr ? ` · ${durationStr}` : ''}
				</span>
			)}

			{/* Right: Actions */}
			<div className="pktw-flex pktw-items-center pktw-gap-1">
				<div
					onClick={onCopy}
					className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-gray-100 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors"
					title={copied ? 'Copied!' : 'Copy Report'}
				>
					{copied ? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600" /> : <Copy className="pktw-w-3.5 pktw-h-3.5" />}
				</div>
				<div
					onClick={onSave}
					className="pktw-p-1.5 pktw-text-[#6c757d] hover:pktw-bg-gray-100 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors"
					title="Save to Vault"
				>
					<Save className="pktw-w-3.5 pktw-h-3.5" />
				</div>
				{rounds.length >= 2 && (
					<Button
						variant="outline"
						size="sm"
						onClick={onSynthesize}
						className="pktw-text-xs"
					>
						<Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
						Synthesize All
					</Button>
				)}
				<div
					onClick={onContinue}
					className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-rounded-lg pktw-transition-all pktw-cursor-pointer ${
						showContinueAnalysis
							? 'pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed]'
							: 'pktw-text-[#6b7280] hover:pktw-bg-gray-100'
					}`}
				>
					<MessageSquare className="pktw-w-3.5 pktw-h-3.5" />
					Continue
				</div>
				<div
					onClick={onOpenInChat}
					className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-text-white pktw-bg-[#7c3aed] hover:pktw-bg-[#6d28d9] pktw-rounded-lg pktw-transition-colors pktw-cursor-pointer"
				>
					Open in Chat
					<ExternalLink className="pktw-w-3.5 pktw-h-3.5" />
				</div>
			</div>
		</div>
	);
};
