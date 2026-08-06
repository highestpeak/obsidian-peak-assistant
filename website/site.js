(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const revealTargets = document.querySelectorAll(
    ".section-intro, .capability-lanes, .graph-story, .work-modes, .product-tour, .roadmap-columns, .trust-lines, .support-line",
  );

  document.documentElement.classList.add("reveal-ready");
  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    revealTargets.forEach((target) => target.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10%", threshold: 0.08 },
    );
    revealTargets.forEach((target) => observer.observe(target));
  }

  const tour = document.querySelector(".product-tour");
  if (tour) {
    const tabs = [...tour.querySelectorAll('[role="tab"]')];
    const visual = tour.querySelector(".tour-visual");
    const image = visual?.querySelector("img");
    const title = visual?.querySelector("figcaption b");
    const copy = visual?.querySelector("figcaption span");

    const selectTour = (tab, moveFocus = false) => {
      if (!visual || !image || !title || !copy) return;
      tabs.forEach((candidate) => candidate.setAttribute("aria-selected", String(candidate === tab)));
      if (moveFocus) tab.focus();
      visual.classList.add("is-changing");
      window.setTimeout(() => {
        image.src = tab.dataset.image || image.src;
        image.alt = tab.dataset.alt || "";
        image.width = Number(tab.dataset.width) || image.width;
        image.height = Number(tab.dataset.height) || image.height;
        title.textContent = tab.dataset.title || tab.textContent || "";
        copy.textContent = tab.dataset.copy || "";
        visual.classList.remove("is-changing");
      }, reducedMotion.matches ? 0 : 180);
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectTour(tab));
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(index + direction + tabs.length) % tabs.length];
        selectTour(next, true);
      });
    });
  }

  const canvas = document.querySelector(".knowledge-field");
  const stage = document.querySelector(".semantic-map");
  if (!(canvas instanceof HTMLCanvasElement) || !stage) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const nodes = [
    { x: .48, y: .49, r: 8, type: "current" },
    { x: .82, y: .25, r: 6, type: "hub" },
    { x: .18, y: .26, r: 5, type: "gap" },
    { x: .8, y: .78, r: 5, type: "source" },
    { x: .68, y: .15, r: 3 }, { x: .91, y: .16, r: 3 }, { x: .92, y: .34, r: 3 },
    { x: .7, y: .34, r: 3 }, { x: .76, y: .05, r: 2.5 },
    { x: .08, y: .15, r: 3 }, { x: .28, y: .12, r: 3 }, { x: .32, y: .31, r: 3 },
    { x: .08, y: .38, r: 2.5 },
    { x: .69, y: .7, r: 3 }, { x: .91, y: .67, r: 3 }, { x: .92, y: .88, r: 3 },
    { x: .68, y: .9, r: 3 }, { x: .57, y: .79, r: 2.5 },
    { x: .36, y: .66, r: 3 }, { x: .23, y: .77, r: 3 }, { x: .13, y: .65, r: 2.5 },
    { x: .42, y: .86, r: 2.5 }, { x: .55, y: .23, r: 2.5 },
  ];

  const edges = [
    [0, 1], [0, 3], [0, 7], [0, 12], [0, 18], [0, 22],
    [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [4, 8], [5, 6], [6, 7],
    [2, 9], [2, 10], [2, 11], [2, 12], [9, 10], [10, 11],
    [3, 13], [3, 14], [3, 15], [3, 16], [3, 17], [13, 17], [15, 16],
    [18, 19], [19, 20], [18, 21], [18, 0], [21, 17],
  ];

  let width = 0;
  let height = 0;
  let frame = 0;
  let visible = true;

  const resize = () => {
    const bounds = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(bounds.width));
    height = Math.max(1, Math.round(bounds.height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const point = (node, time, index) => ({
    x: node.x * width + Math.sin(time * .00018 + index * 1.7) * 3,
    y: node.y * height + Math.cos(time * .00015 + index * 1.2) * 3,
  });

  const draw = (time = 0) => {
    context.clearRect(0, 0, width, height);
    const points = nodes.map((node, index) => point(node, time, index));

    edges.forEach(([from, to]) => {
      const start = points[from];
      const end = points[to];
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.strokeStyle = from === 3 || to === 3 ? "rgba(123,197,158,.24)" : "rgba(235,226,211,.17)";
      context.lineWidth = .8;
      context.stroke();
    });

    const gap = points[2];
    const current = points[0];
    context.save();
    context.setLineDash([5, 8]);
    context.beginPath();
    context.moveTo(gap.x, gap.y);
    context.quadraticCurveTo(width * .3, height * .43, current.x, current.y);
    context.strokeStyle = "rgba(214,170,103,.38)";
    context.lineWidth = 1;
    context.stroke();
    context.restore();

    nodes.forEach((node, index) => {
      const currentPoint = points[index];
      const pulse = reducedMotion.matches ? 1 : 1 + Math.sin(time * .00065 + index) * .08;
      context.beginPath();
      context.arc(currentPoint.x, currentPoint.y, node.r * pulse, 0, Math.PI * 2);
      context.fillStyle = node.type === "source"
        ? "rgba(123,197,158,.92)"
        : node.type === "gap"
          ? "rgba(8,8,10,.95)"
          : node.type
            ? "rgba(180,145,247,.96)"
            : "rgba(218,211,200,.66)";
      context.fill();
      context.strokeStyle = node.type === "gap" ? "rgba(214,170,103,.9)" : "rgba(255,255,255,.2)";
      context.lineWidth = 1;
      context.stroke();
    });

    if (!reducedMotion.matches) {
      const progress = (time * .000035) % 1;
      [[0, 1], [0, 3]].forEach(([from, to], index) => {
        const start = points[from];
        const end = points[to];
        const t = (progress + index * .47) % 1;
        context.beginPath();
        context.arc(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t, 2.2, 0, Math.PI * 2);
        context.fillStyle = index ? "rgba(123,197,158,.95)" : "rgba(196,168,248,.95)";
        context.fill();
      });
    }
  };

  const animate = (time) => {
    draw(time);
    if (visible && !reducedMotion.matches) frame = requestAnimationFrame(animate);
  };

  resize();
  draw();
  if (!reducedMotion.matches) frame = requestAnimationFrame(animate);

  if ("IntersectionObserver" in window) {
    const fieldObserver = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      cancelAnimationFrame(frame);
      if (visible && !reducedMotion.matches) frame = requestAnimationFrame(animate);
    });
    fieldObserver.observe(stage);
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resize();
      draw();
    }, 140);
  });
})();
