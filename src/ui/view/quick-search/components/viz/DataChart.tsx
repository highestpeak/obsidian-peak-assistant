import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { BarChartData } from '@/core/schemas/report-viz-schemas';

export const DataChart: React.FC<{ data: BarChartData; title: string }> = ({ data, title }) => {
    const chartData = data.items.map((item) => ({
        name: item.name,
        value: item.value,
        ...(item.value2 !== undefined ? { value2: item.value2 } : {}),
    }));

    return (
        <div className="pktw-my-3">
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-mb-2 pktw-block">{title}</span>
            <div className="pktw-w-full" style={{ height: Math.min(300, 40 + chartData.length * 36) }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis
                            type="number"
                            tick={{ fontSize: 11, fill: '#9ca3af' }}
                            label={data.yLabel ? { value: data.yLabel, position: 'bottom', fontSize: 11 } : undefined}
                        />
                        <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fontSize: 11, fill: '#4b5563' }}
                            width={100}
                        />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                        <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} barSize={20} />
                        {chartData.some(d => d.value2 !== undefined) && <Bar dataKey="value2" fill="#60a5fa" radius={[0, 4, 4, 0]} barSize={20} />}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
