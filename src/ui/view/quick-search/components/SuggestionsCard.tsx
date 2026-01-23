import React from 'react';
import { Lightbulb } from 'lucide-react';
import { Suggestion } from '@/service/agents/AISearchAgent';

/**
 * Suggestions card component - displays suggestions in card format
 */
export const SuggestionsCard: React.FC<{
	suggestions: Suggestion[];
}> = ({ suggestions }) => {
	if (suggestions.length === 0) {
		return null;
	}

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<Lightbulb className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Suggestions</span>
			</div>
			<div className="pktw-space-y-3">
				{suggestions.map((suggestion) => (
					<div key={suggestion.id} className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-p-3 pktw-shadow-sm">
						<div className="pktw-flex pktw-items-start pktw-gap-3">
							<div className="pktw-w-8 pktw-h-8 pktw-rounded-full pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0" style={{ backgroundColor: suggestion.color + '20' }}>
								<span className="pktw-text-sm">{suggestion.icon}</span>
							</div>
							<div className="pktw-flex-1 pktw-min-w-0">
								<div className="pktw-font-medium pktw-text-[#2e3338] pktw-text-sm pktw-mb-1">
									{suggestion.title}
								</div>
								<div className="pktw-text-[#6c757d] pktw-text-xs pktw-leading-relaxed">
									{suggestion.description}
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};