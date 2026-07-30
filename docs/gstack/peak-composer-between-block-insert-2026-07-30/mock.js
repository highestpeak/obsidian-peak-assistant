const frame = document.querySelector(".review-frame");
const activeGap = document.querySelector(".insertion-gap--active");
const stateButtons = [...document.querySelectorAll("[data-preview-state]")];
const allGaps = [...document.querySelectorAll(".insertion-gap")];

let previewState = "open";
let closeTimer = null;

function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}

function placeAnchor(gap, clientX) {
	const rect = gap.getBoundingClientRect();
	const nextX = clamp(clientX - rect.left, 18, rect.width - 18);
	const popover = gap.querySelector(".insert-popover");
	const menuWidth = popover?.offsetWidth || 820;
	const menuLeft = clamp(nextX - menuWidth / 2, 8, rect.width - menuWidth - 8);
	gap.style.setProperty("--anchor-x", `${nextX}px`);
	gap.style.setProperty("--menu-left", `${menuLeft}px`);
}

function placeOpenMenu(gap) {
	requestAnimationFrame(() => {
		const rect = gap.getBoundingClientRect();
		const anchor = Number.parseFloat(getComputedStyle(gap).getPropertyValue("--anchor-x")) || rect.width / 2;
		placeAnchor(gap, rect.left + anchor);
	});
}

function updateStateButtons(nextState) {
	for (const button of stateButtons) {
		button.setAttribute("aria-pressed", button.dataset.previewState === nextState ? "true" : "false");
	}
}

function clearCloseTimer() {
	if (!closeTimer) return;
	clearTimeout(closeTimer);
	closeTimer = null;
}

function openGap(gap) {
	clearCloseTimer();
	for (const candidate of allGaps) {
		candidate.classList.remove("is-hovered", "is-open");
		candidate.querySelector(".insertion-plus")?.setAttribute("aria-expanded", "false");
	}
	gap.classList.add("is-open");
	gap.querySelector(".insertion-plus")?.setAttribute("aria-expanded", "true");
	previewState = "open";
	frame.dataset.state = "open";
	updateStateButtons("open");
	placeOpenMenu(gap);
}

function scheduleClose(gap) {
	clearCloseTimer();
	closeTimer = setTimeout(() => {
		closeTimer = null;
		if (gap.matches(":hover") || gap.contains(document.activeElement)) return;
		gap.classList.remove("is-open");
		gap.querySelector(".insertion-plus")?.setAttribute("aria-expanded", "false");
		previewState = "hover";
		frame.dataset.state = "hover";
		updateStateButtons("hover");
	}, 180);
}

function setState(nextState) {
	clearCloseTimer();
	previewState = nextState;
	frame.dataset.state = nextState;
	updateStateButtons(nextState);

	for (const gap of allGaps) {
		gap.classList.remove("is-hovered", "is-open");
		const plus = gap.querySelector(".insertion-plus");
		plus?.setAttribute("aria-expanded", "false");
	}

	if (nextState === "hover") {
		activeGap.classList.add("is-hovered");
		return;
	}

	if (nextState === "open") {
		openGap(activeGap);
	}
}

for (const gap of allGaps) {
	gap.addEventListener("pointermove", (event) => {
		if (previewState === "idle") return;
		if (gap.classList.contains("is-open")) return;
		placeAnchor(gap, event.clientX);
	});

	gap.addEventListener("pointerenter", (event) => {
		clearCloseTimer();
		if (previewState === "idle") return;
		allGaps.forEach((candidate) => {
			if (candidate === gap) return;
			candidate.classList.remove("is-hovered", "is-open");
			candidate.querySelector(".insertion-plus")?.setAttribute("aria-expanded", "false");
		});
		gap.classList.add("is-hovered");
		placeAnchor(gap, event.clientX);
	});

	gap.addEventListener("pointerleave", () => {
		if (gap.classList.contains("is-open")) {
			scheduleClose(gap);
			return;
		}
		gap.classList.remove("is-hovered");
	});

	const plus = gap.querySelector(".insertion-plus");
	plus?.addEventListener("pointerenter", () => openGap(gap));
	plus?.addEventListener("focus", () => openGap(gap));
	gap.querySelector(".insert-popover")?.addEventListener("pointerenter", clearCloseTimer);
	gap.querySelector(".insert-popover")?.addEventListener("pointerleave", () => scheduleClose(gap));
}

for (const button of stateButtons) {
	button.addEventListener("click", () => setState(button.dataset.previewState));
}

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	setState("hover");
});

window.addEventListener("resize", () => {
	const rect = activeGap.getBoundingClientRect();
	placeAnchor(activeGap, rect.left + rect.width * 0.61);
});

const initialRect = activeGap.getBoundingClientRect();
placeAnchor(activeGap, initialRect.left + initialRect.width * 0.61);
setState("open");
