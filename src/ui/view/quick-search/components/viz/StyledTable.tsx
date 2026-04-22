import React from 'react';
import type { ComparisonTableData } from '@/core/schemas/report-viz-schemas';

export const StyledTable: React.FC<{ data: ComparisonTableData; title: string }> = ({ data, title }) => {
    return (
        <div className="pktw-overflow-x-auto pktw-my-3">
            <span className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted pktw-mb-1.5 pktw-block">{title}</span>
            <table className="pktw-w-full pktw-text-sm pktw-border-collapse">
                <thead>
                    <tr>
                        {data.headers.map((h, i) => (
                            <th
                                key={i}
                                className={`pktw-px-3 pktw-py-2 pktw-text-left pktw-font-semibold pktw-text-pk-foreground pktw-border-b-2 pktw-border-pk-border pktw-bg-[#f3f4f6] ${
                                    data.highlightColumn === i ? 'pktw-bg-[#ede9fe]' : ''
                                }`}
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.rows.map((row, ri) => (
                        <tr key={ri} className="pktw-border-b pktw-border-[#f3f4f6] hover:pktw-bg-pk-background">
                            {row.map((cell, ci) => (
                                <td
                                    key={ci}
                                    className={`pktw-px-3 pktw-py-2 pktw-text-pk-foreground-muted ${
                                        data.highlightColumn === ci ? 'pktw-bg-[#f5f3ff] pktw-font-medium' : ''
                                    }`}
                                >
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
