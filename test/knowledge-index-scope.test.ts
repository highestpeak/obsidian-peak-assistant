import assert from 'node:assert/strict';
import { isPathInKnowledgeScope } from '../src/core/document/loader/helper/DocumentLoaderManager';

assert.equal(isPathInKnowledgeScope('Notes/Today.md', []), true, 'empty scope means the whole Vault');
assert.equal(isPathInKnowledgeScope('Notes/Today.md', ['Notes']), true, 'files inside an included folder are accepted');
assert.equal(isPathInKnowledgeScope('Notes', ['Notes/']), true, 'the selected folder itself is accepted');
assert.equal(isPathInKnowledgeScope('Notes-old/Today.md', ['Notes']), false, 'folder matching is segment-aware');
assert.equal(isPathInKnowledgeScope('/Research/Papers/a.pdf', ['/Research/Papers/']), true, 'leading and trailing slashes are normalized');
assert.equal(isPathInKnowledgeScope('Projects/a.md', ['Research', 'Projects']), true, 'any included folder may match');

console.log('knowledge-index-scope tests passed');
