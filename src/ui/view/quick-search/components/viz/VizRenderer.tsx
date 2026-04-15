import React from 'react';
import type { VizSpec } from '@/core/schemas/report-viz-schemas';
import { StyledTable } from './StyledTable';
import { TimelineViz } from './TimelineViz';
import { DataChart } from './DataChart';
import { RelationshipGraph } from './RelationshipGraph';

export const VizRenderer: React.FC<{ spec: VizSpec }> = ({ spec }) => {
    switch (spec.vizType) {
        case 'graph':
            return <RelationshipGraph data={spec.data} title={spec.title} />;
        case 'bar':
            return <DataChart data={spec.data} title={spec.title} />;
        case 'table':
            return <StyledTable data={spec.data} title={spec.title} />;
        case 'timeline':
            return <TimelineViz data={spec.data} title={spec.title} />;
        default:
            return null;
    }
};
