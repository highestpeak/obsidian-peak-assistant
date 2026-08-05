import assert from 'assert';
import { readFileSync } from 'fs';

const source = readFileSync('src/ui/view/my-content/MyContent.tsx', 'utf8');
const styles = readFileSync('src/styles/my-content.css', 'utf8');

assert.doesNotMatch(source, /Popover(Content|Trigger)?/, 'My Content filters must not inherit the generic action-menu Popover');
assert.match(source, /<span>Filters<\/span>/, 'the trigger must explain its purpose instead of showing only an icon');
assert.match(source, /<FilterSet label="Output type">[\s\S]*?All types/, 'output types must remain visible as selectable chips');
assert.match(source, /<FilterSet label="Created in">[\s\S]*?All locations/, 'locations must remain visible as selectable chips');
assert.match(source, /Created or saved from/, 'the custom date range must retain an accessible From field');
assert.match(source, /Created or saved to/, 'the custom date range must retain an accessible To field');
assert.match(source, /onRange\('all'\)/, 'entering a custom date must clear the quick-range state');
assert.match(source, />Reset<\/Button>[\s\S]*?>Done<\/Button>/, 'the panel needs explicit Reset and Done controls');
assert.match(styles, /position:\s*absolute;[\s\S]*?left:\s*12px;[\s\S]*?right:\s*12px;/, 'the panel must span the list width rather than use a generic fixed popover');
assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) 12px minmax\(0, 1fr\) auto;/, 'date inputs need a bounded inline range layout');
assert.match(styles, /height:\s*29px !important;/, 'date and footer controls need protected compact geometry in Obsidian');

console.log('PASS: My Content filter surface keeps list-scoped controls and date range layout');
