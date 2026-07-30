import assert from 'assert';
import { readFileSync } from 'fs';

const analysis = readFileSync('src/ui/view/composer/candidates/AnalysisCandidateCard.tsx', 'utf8');

assert.match(analysis, /analysisStreaming/, 'analysis must show a pre-first-token progress state');
assert.match(analysis, /animate-pulse/, 'analysis streaming must expose motion while work is active');
assert.match(analysis, /runtime\.cancel/, 'streaming analysis must be cancellable');
assert.match(analysis, /runtime\.regenerate/, 'failed or cancelled analysis must be retryable');
assert.match(analysis, /rerunStale/, 'stale analysis must rerun against the current revision');
assert.doesNotMatch(analysis, /runtime\.accept/, 'read-only explanations must never expose an accept writeback');

console.log('composer-analysis-candidate: passed');
