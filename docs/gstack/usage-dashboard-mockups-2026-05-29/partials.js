/* Mock-only: builds shared nav. Each screen includes <script src="partials.js"></script>
   then calls renderNav('<current-id>'). No build pipeline. */

const SCREENS = [
	{ id: 'overview',     file: '1-overview.html',     num: '01', label: 'Usage Intelligence' },
	{ id: 'provider',     file: '2-provider-model.html', num: '02', label: 'Provider & Model' },
	{ id: 'outcome',      file: '3-outcome-value.html', num: '03', label: 'Outcome Value' },
	{ id: 'budget',       file: '4-budget-alerts.html', num: '04', label: 'Budget & Alerts' },
	{ id: 'history',      file: '5-history.html',       num: '05', label: 'Usage History' },
	{ id: 'optimization', file: '6-optimization.html',  num: '06', label: 'Optimization' },
];

/* Make stateful mock affordances actually respond to clicks.
   Scope: <button class="tog">, segmented controls, sub-tabs, scenario radios. */
document.addEventListener('click', (e) => {
	// 1. Toggle switches
	const tog = e.target.closest('.tog');
	if (tog) {
		const pressed = tog.getAttribute('aria-pressed') === 'true';
		tog.setAttribute('aria-pressed', String(!pressed));
		return;
	}

	// 2. Segmented control & sub-tabs (single-select within parent)
	const seg = e.target.closest('.seg__btn, .subtabs__btn');
	if (seg) {
		const parent = seg.parentElement;
		parent.querySelectorAll('[aria-pressed]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
		seg.setAttribute('aria-pressed', 'true');
		return;
	}

	// 3. Scenario radios (Optimization screen)
	const scen = e.target.closest('.scenario');
	if (scen) {
		const group = scen.parentElement;
		group.querySelectorAll('.scenario').forEach((s) => s.classList.remove('scenario--active'));
		scen.classList.add('scenario--active');
		return;
	}
});

function renderNav(currentId) {
	const root = document.getElementById('nav-root');
	if (!root) return;
	const links = SCREENS.map((s) => {
		const active = s.id === currentId ? ' aria-current="page"' : '';
		return `<a class="mock-nav__link" href="${s.file}"${active}>
			<span class="num">${s.num}</span>
			<span>${s.label}</span>
		</a>`;
	}).join('');
	root.innerHTML = `
		<nav class="mock-nav" aria-label="Mock screens">
			<div class="mock-nav__inner">
				<a class="mock-nav__brand" href="index.html">
					Peak Assistant <small>· Usage rework mock · 2026-05-29</small>
				</a>
				<div class="mock-nav__links">${links}</div>
			</div>
		</nav>
	`;
}
