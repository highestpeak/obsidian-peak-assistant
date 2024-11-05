import React, { useEffect, useState } from 'react';
import { G2 } from '@antv/g2';
import { Card, Typography, Button } from 'antd';

const { Title, Paragraph } = Typography;

// todo 比较后觉得 echat 太丑了 d3太复杂了 antv 还行 维护度也ok
// 我喜欢这个 https://g2.antv.antgroup.com/examples/general/cell#cell-heatmap
// 喜欢这个 https://g2.antv.antgroup.com/examples 的 热力图
const DailyAnalysis = ({ data }: { data: ProcessOneDayResult }) => {
    const [emotionalData, setEmotionalData] = useState<any[]>([]);
    const [activeDocs, setActiveDocs] = useState<any[]>([]);

    // Sample data processing function for emotional scores
    useEffect(() => {
        const processEmotionalScores = () => {
            // Assuming data has emotional scores structured appropriately
            // Transform data into a format suitable for the radar chart
            setEmotionalData(data.emotionalScores); // Update with actual score extraction logic
        };
        processEmotionalScores();
    }, [data]);

    // Sample G2 chart initialization for heatmap
    const renderHeatmap = (data: any[]) => {
        const chart = new G2.Chart({
            container: 'heatmap-container',
            height: 300,
            width: 600,
        });

        chart.data(data);
        chart.scale('time', {
            type: 'time',
            nice: true,
        });

        chart
            .heatmap()
            .position('time*activity')
            .color('value')
            .style({ fillOpacity: 0.85 });

        chart.render();
    };

    // Sample G2 chart initialization for radar chart
    const renderRadarChart = (data: any[]) => {
        const chart = new G2.Chart({
            container: 'radar-container',
            height: 300,
            width: 600,
        });

        chart.data(data);
        chart.coord('polar');
        chart.scale('value', {
            min: 0,
            max: 10,
        });

        chart
            .point()
            .position('category*value')
            .size(4)
            .color('category');

        chart.render();
    };

    useEffect(() => {
        // Call render functions after the component mounts
        renderHeatmap(activeDocs); // Replace with actual data
        renderRadarChart(emotionalData); // Replace with actual data
    }, [activeDocs, emotionalData]);

    return (
        <div>
            <Card>
                <Title level={3}>Copilot Previous Day Analysis</Title>
                <Paragraph>
                    <strong>Daily Focus Points:</strong>
                    {/* Display valuable articles/topics */}
                    <ul>
                        {data.focusPoints.map((point) => (
                            <li key={point}>{point}</li>
                        ))}
                    </ul>
                </Paragraph>
                <Paragraph>
                    <strong>Daily Dispersal:</strong>
                    {/* Display other distractions */}
                    <ul>
                        {data.dispersalPoints.map((point) => (
                            <li key={point}>{point}</li>
                        ))}
                    </ul>
                </Paragraph>
                <Paragraph>
                    <strong>Emotional State and Status:</strong>
                    <div id="radar-container"></div>
                </Paragraph>
                <Paragraph>
                    <strong>成长和收获提示:</strong>
                    {/* Growth insights */}
                    <ul>
                        {data.growthInsights.map((insight) => (
                            <li key={insight}>{insight}</li>
                        ))}
                    </ul>
                </Paragraph>
                <Paragraph>
                    <strong>总体评价:</strong>
                    {/* General evaluation from Copilot */}
                    <p>{data.overallEvaluation}</p>
                </Paragraph>
                <Button type="primary">Export Report</Button>
            </Card>
            <Card>
                <Title level={3}>Obsidian App Metrics</Title>
                <Paragraph>Total Stay Duration: {data.totalStayDuration} seconds</Paragraph>
                <div id="heatmap-container"></div>
            </Card>
            <Card>
                <Title level={3}>Active Documents</Title>
                <ul>
                    {activeDocs.map((doc) => (
                        <li key={doc.document}>
                            {doc.document} - {doc.stayDuration} seconds
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
};

export default DailyAnalysis;
