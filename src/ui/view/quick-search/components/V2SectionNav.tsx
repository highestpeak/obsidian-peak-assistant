import React, { useCallback } from 'react';
import { CheckCircle, Loader2, Clock, AlertCircle } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';

const STATUS_ICON: Record<string, React.ReactNode> = {
	done: <CheckCircle className="pktw-w-3 pktw-h-3 pktw-text-green-500" />,
	generating: <Loader2 className="pktw-w-3 pktw-h-3 pktw-text-[#7c3aed] pktw-animate-spin" />,
	pending: <Clock className="pktw-w-3 pktw-h-3 pktw-text-[#d1d5db]" />,
	error: <AlertCircle className="pktw-w-3 pktw-h-3 pktw-text-red-500" />,
};

interface V2SectionNavProps {
	containerRef: React.RefObject<HTMLDivElement>;
}

export const V2SectionNav: React.FC<V2SectionNavProps> = ({ containerRef }) => {
	const sections = useSearchSessionStore((s) => s.v2PlanSections);
	const planApproved = useSearchSessionStore((s) => s.v2PlanApproved);

	const scrollToSection = useCallback((index: number) => {
		const container = containerRef.current;
		if (!container) return;
		// Section blocks are rendered as direct children of a pktw-space-y-4 div
		const blocks = container.querySelectorAll('[data-section-id]');
		const target = blocks[index] as HTMLElement | undefined;
		target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, [containerRef]);

	if (!planApproved || sections.length === 0) return null;

	return (
		<div className="pktw-flex-shrink-0 pktw-border-t pktw-border-[#e5e7eb] pktw-bg-white pktw-px-2 pktw-py-1.5">
			<div className="pktw-flex pktw-gap-1 pktw-overflow-x-auto pktw-scrollbar-none">
				{sections.map((sec, i) => (
					<div
						key={sec.id}
						onClick={() => scrollToSection(i)}
						className={`pktw-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-1 pktw-rounded-md pktw-text-[11px] pktw-whitespace-nowrap pktw-cursor-pointer pktw-transition-colors pktw-shrink-0 ${
							sec.status === 'done'
								? 'pktw-bg-green-50 pktw-text-green-700 hover:pktw-bg-green-100'
								: sec.status === 'generating'
									? 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed] hover:pktw-bg-[#ede9fe]'
									: 'pktw-bg-[#f9fafb] pktw-text-[#9ca3af] hover:pktw-bg-[#f3f4f6]'
						}`}
						title={sec.title}
					>
						{STATUS_ICON[sec.status] ?? STATUS_ICON.pending}
						<span className="pktw-max-w-[120px] pktw-truncate">{sec.title}</span>
					</div>
				))}
			</div>
		</div>
	);
};
