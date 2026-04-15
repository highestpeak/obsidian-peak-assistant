import React from 'react';
import type { TimelineData } from '@/core/schemas/report-viz-schemas';

export const TimelineViz: React.FC<{ data: TimelineData; title: string }> = ({ data, title }) => {
    return (
        <div className="pktw-my-3">
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-mb-2 pktw-block">{title}</span>
            <div className="pktw-relative pktw-pl-6">
                <div className="pktw-absolute pktw-left-2 pktw-top-1 pktw-bottom-1 pktw-w-0.5 pktw-bg-[#e5e7eb] pktw-rounded-full" />
                {data.events.map((evt, i) => (
                    <div key={i} className="pktw-relative pktw-pb-4 last:pktw-pb-0">
                        <div className="pktw-absolute pktw-left-[-18px] pktw-top-1.5 pktw-w-2.5 pktw-h-2.5 pktw-rounded-full pktw-bg-[#7c3aed] pktw-border-2 pktw-border-white pktw-shadow-sm" />
                        <span className="pktw-text-xs pktw-font-mono pktw-text-[#9ca3af]">{evt.date}</span>
                        <span className="pktw-block pktw-text-sm pktw-font-semibold pktw-text-[#374151] pktw-mt-0.5">{evt.title}</span>
                        {evt.description && (
                            <span className="pktw-block pktw-text-xs pktw-text-[#6b7280] pktw-mt-0.5">{evt.description}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
