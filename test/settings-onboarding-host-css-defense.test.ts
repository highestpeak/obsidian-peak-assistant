import assert from 'assert';
import { readFileSync } from 'fs';

const providerForm = readFileSync('src/ui/view/modals/onboarding/ProviderForm.tsx', 'utf8');
const profilesTab = readFileSync('src/ui/view/settings/ProfilesTab.tsx', 'utf8');
const profileCard = readFileSync('src/ui/view/settings/components/ProfileCard.tsx', 'utf8');
const addProfileGrid = readFileSync('src/ui/view/settings/components/AddProfileGrid.tsx', 'utf8');
const modelCombobox = readFileSync('src/ui/view/settings/components/ModelCombobox.tsx', 'utf8');
const mcpSection = readFileSync('src/ui/view/settings/components/MCPServerSection.tsx', 'utf8');
const mcpCard = readFileSync('src/ui/view/settings/components/MCPServerCard.tsx', 'utf8');
const css = readFileSync('src/styles/peak-components.css', 'utf8');

assert.match(providerForm, /className="pk-onboarding-provider-chooser"/);
assert.match(providerForm, /className="pk-onboarding-connection-card"/);
assert.match(providerForm, /className="pk-onboarding-connection-field"/);
assert.match(providerForm, /className="pk-onboarding-connection-card__footer"/);
assert.doesNotMatch(
	providerForm,
	/pktw-/,
	'onboarding connection states must not depend on Tailwind utilities for host geometry',
);
assert.doesNotMatch(
	providerForm,
	/className="pk-onboarding-provider-form"/,
	'provider chooser and connection card must not share one geometry class',
);

assert.match(profilesTab, /className="pk-profile-manager pktw-space-y-4"/);
assert.match(profileCard, /pk-profile-card/);
assert.match(profileCard, /pk-profile-control/);
assert.match(addProfileGrid, /pk-profile-add-grid__option/);
assert.doesNotMatch(profileCard, /<button\b/);
assert.doesNotMatch(addProfileGrid, /<button\b/);
assert.match(modelCombobox, /pk-profile-model-combobox__trigger/);
assert.match(modelCombobox, /pk-profile-model-combobox__option/);
assert.doesNotMatch(modelCombobox, /<button\b/);
assert.match(mcpSection, /pk-mcp-manager__add/);
assert.match(mcpCard, /pk-mcp-control/);
assert.match(mcpCard, /pk-mcp-card__action/);

assert.match(
	css,
	/\.pk-onboarding-connection-field input,[\s\S]*?\.pk-onboarding-saved-profile__field input\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?height:\s*36px !important;[\s\S]*?min-height:\s*36px !important;[\s\S]*?max-height:\s*36px !important;[\s\S]*?padding:\s*0 11px !important;[\s\S]*?border:\s*1px solid var\(--pk-border-strong\) !important;/,
	'onboarding inputs must defeat Obsidian modal input geometry',
);

for (const className of [
	'pk-onboarding-connection-back',
	'pk-onboarding-connection-submit',
	'pk-onboarding-saved-profile__action',
	'pk-onboarding-saved-profile__footer-action',
	'pk-profile-manager__add',
	'pk-profile-card__test',
	'pk-profile-card__menu-trigger',
	'pk-profile-card__menu-item',
	'pk-profile-model-combobox__trigger',
	'pk-profile-model-combobox__option',
	'pk-profile-add-grid__cancel',
	'pk-profile-add-grid__option',
	'pk-profile-add-grid__show-all',
	'pk-mcp-manager__add',
	'pk-mcp-card__action',
]) {
	const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const rule = new RegExp(`button\\.${escaped}[^\\{]*\\{[\\s\\S]*?height:\\s*[^;]+!important;[\\s\\S]*?min-height:\\s*[^;]+!important;[\\s\\S]*?max-height:\\s*[^;]+!important;[\\s\\S]*?padding:\\s*[^;]+!important;`);
	assert.match(css, rule, `${className} must retain fixed geometry under the Obsidian button reset`);
}

assert.match(
	css,
	/\.pk-profile-control\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?height:\s*36px !important;[\s\S]*?min-height:\s*36px !important;[\s\S]*?max-height:\s*36px !important;[\s\S]*?border:\s*1px solid var\(--pk-border\) !important;/,
	'Settings connection controls must own their modal geometry',
);

assert.match(
	css,
	/\.pk-mcp-control\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?height:\s*36px !important;[\s\S]*?min-height:\s*36px !important;[\s\S]*?max-height:\s*36px !important;[\s\S]*?border:\s*1px solid var\(--pk-border\) !important;/,
	'MCP connection controls must own their modal geometry',
);

console.log('PASS settings-onboarding-host-css-defense');
