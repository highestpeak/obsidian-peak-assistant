import assert from 'assert';
import { readFileSync } from 'fs';

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const host = readFileSync(
	'src/ui/view/composer/candidates/ComposerCandidateHost.tsx',
	'utf8',
);
const frontmatter = readFileSync(
	'src/ui/view/composer/blocks/frontmatter/FrontmatterBlockView.tsx',
	'utf8',
);

assert.ok(
	root.includes('useDocumentCandidates(runtime.candidateRuntime)') &&
		root.includes('indexCandidatesByBlock(reviewCandidates)'),
	'the document root must own one candidate projection and index it by block',
);
const candidateHosts = root.match(/<ComposerCandidateHost/g)?.length ?? 0;
const projectedCandidateProps = root.match(/candidate=\{(?:visibleCandidate|candidate)\}/g)?.length ?? 0;
assert.ok(candidateHosts > 0, 'production root must render candidate hosts');
assert.equal(
	projectedCandidateProps,
	candidateHosts,
	'every production candidate host must consume the root-indexed candidate snapshot',
);
assert.ok(
	host.includes('if (projected) return;') && host.includes('return runtime.subscribe'),
	'the reusable candidate host must subscribe only when no root projection was supplied',
);
assert.equal(
	frontmatter.includes('port.runtime.subscribe'),
	false,
	'Frontmatter must consume the root candidate projection without a row-level subscription',
);

console.log('composer-root-candidate-projection: passed');
