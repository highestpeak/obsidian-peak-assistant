import assert from 'assert';
import { calculatePromptMenuPosition } from '@/ui/component/prompt-input/promptMenuPosition';

function testBottomComposerFlipsMenuAbove(): void {
	const position = calculatePromptMenuPosition(
		{ top: 680, bottom: 702, left: 220 },
		{ top: 0, left: 0, width: 1000, height: 720 },
	);
	assert.strictEqual(position.placement, 'top');
	assert.strictEqual(position.top, 674);
	assert.strictEqual(position.maxHeight, 300);
}

function testTopComposerUsesAvailableSpaceBelow(): void {
	const position = calculatePromptMenuPosition(
		{ top: 40, bottom: 62, left: 24 },
		{ top: 0, left: 0, width: 900, height: 700 },
	);
	assert.strictEqual(position.placement, 'bottom');
	assert.strictEqual(position.top, 68);
	assert.strictEqual(position.maxHeight, 300);
}

function testPopoutViewportClampsRightEdge(): void {
	const position = calculatePromptMenuPosition(
		{ top: 500, bottom: 522, left: 950 },
		{ top: 0, left: 0, width: 1000, height: 720 },
	);
	assert.strictEqual(position.left, 592);
	assert.ok(position.left + 400 <= 992, 'menu stays inside the owning popout viewport');
}

testBottomComposerFlipsMenuAbove();
testTopComposerUsesAvailableSpaceBelow();
testPopoutViewportClampsRightEdge();
console.log('chat-studio-prompt-menu-position: all guards passed');
