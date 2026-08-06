(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");
  const root = document.documentElement;

  const revealTargets = document.querySelectorAll(
    ".section > *, .statement > *, .capability-node, .model-card, .graph-modes article, .workflow-steps li, .roadmap-lane, .trust-ledger article",
  );

  revealTargets.forEach((target) => target.setAttribute("data-reveal", ""));
  root.classList.add("reveal-ready");

  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    revealTargets.forEach((target) => target.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 },
    );
    revealTargets.forEach((target) => revealObserver.observe(target));
  }

  const tiltTargets = document.querySelectorAll(
    ".hero-art, .vision-showcase figure, .graph-visual, .surface-showcase, .sheet-feature",
  );

  if (!reducedMotion.matches && finePointer.matches) {
    window.addEventListener(
      "pointermove",
      (event) => {
        root.style.setProperty("--pointer-x", `${event.clientX}px`);
        root.style.setProperty("--pointer-y", `${event.clientY}px`);
      },
      { passive: true },
    );

    tiltTargets.forEach((target) => {
      target.classList.add("tilt-surface");
      target.addEventListener("pointermove", (event) => {
        const bounds = target.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        const range = target.classList.contains("hero-art") ? 2.2 : 1.35;
        target.style.setProperty("--tilt-x", `${(-y * range).toFixed(2)}deg`);
        target.style.setProperty("--tilt-y", `${(x * range).toFixed(2)}deg`);
        target.style.setProperty("--shine-x", `${((x + 0.5) * 100).toFixed(1)}%`);
        target.style.setProperty("--shine-y", `${((y + 0.5) * 100).toFixed(1)}%`);
      });
      target.addEventListener("pointerleave", () => {
        target.style.setProperty("--tilt-x", "0deg");
        target.style.setProperty("--tilt-y", "0deg");
      });
    });
  }

  const canvas = document.querySelector(".hero-field");
  const hero = document.querySelector(".hero");
  if (!(canvas instanceof HTMLCanvasElement) || !hero) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  let width = 0;
  let height = 0;
  let animationFrame = 0;
  let heroVisible = true;
  let particles = [];

  const createParticles = () => {
    const count = Math.max(18, Math.min(34, Math.round(width / 48)));
    particles = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.13,
      vy: (Math.random() - 0.5) * 0.13,
      radius: index % 7 === 0 ? 2.2 : 1.2 + Math.random() * 0.7,
      purple: index % 6 === 0,
      phase: Math.random() * Math.PI * 2,
    }));
  };

  const resizeCanvas = () => {
    const bounds = hero.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(bounds.width));
    height = Math.max(1, Math.round(bounds.height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    createParticles();
  };

  const drawField = (time = 0) => {
    context.clearRect(0, 0, width, height);

    particles.forEach((particle, index) => {
      if (!reducedMotion.matches) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < -20) particle.x = width + 20;
        if (particle.x > width + 20) particle.x = -20;
        if (particle.y < -20) particle.y = height + 20;
        if (particle.y > height + 20) particle.y = -20;
      }

      for (let otherIndex = index + 1; otherIndex < particles.length; otherIndex += 1) {
        const other = particles[otherIndex];
        const dx = particle.x - other.x;
        const dy = particle.y - other.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 155) continue;
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(other.x, other.y);
        context.strokeStyle = `rgba(210, 201, 229, ${0.075 * (1 - distance / 155)})`;
        context.lineWidth = 0.7;
        context.stroke();
      }

      const pulse = 0.72 + Math.sin(time * 0.0008 + particle.phase) * 0.18;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius * pulse, 0, Math.PI * 2);
      context.fillStyle = particle.purple ? "rgba(168, 130, 255, .58)" : "rgba(238, 231, 215, .38)";
      context.fill();
    });
  };

  const animate = (time) => {
    drawField(time);
    if (heroVisible && !reducedMotion.matches) animationFrame = requestAnimationFrame(animate);
  };

  resizeCanvas();
  drawField();

  if (!reducedMotion.matches) animationFrame = requestAnimationFrame(animate);

  if ("IntersectionObserver" in window) {
    const heroObserver = new IntersectionObserver((entries) => {
      heroVisible = entries[0]?.isIntersecting ?? false;
      if (!heroVisible) {
        cancelAnimationFrame(animationFrame);
        return;
      }
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(animate);
    });
    heroObserver.observe(hero);
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeCanvas();
      drawField();
    }, 120);
  });
})();
