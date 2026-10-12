window.__portfolio = true;

/* Hero visual: a graph with glowing walkers that light up the edges they
   cover, like a synthetic caller walking every path of a conversation flow. */
(() => {
  const canvas = document.getElementById('graph');
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const hero = canvas.parentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  let w = 0, h = 0, dpr = 1;
  let nodes = [], edges = [], walkers = [];
  let colors = { accent: '#6EE7C8', pulse: '#FFB86B', muted: '#8793B2' };
  let raf = 0, last = 0, time = 0, visible = true;
  const mouse = { x: -9999, y: -9999 };

  const readColors = () => {
    const s = getComputedStyle(document.documentElement);
    colors = {
      accent: s.getPropertyValue('--accent').trim() || colors.accent,
      pulse: s.getPropertyValue('--pulse').trim() || colors.pulse,
      muted: s.getPropertyValue('--muted').trim() || colors.muted,
    };
  };

  const build = () => {
    const rect = hero.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.max(16, Math.min(64, Math.round((w * h) / 15000)));
    const minDist = Math.sqrt((w * h) / count) * 0.62;
    nodes = [];
    for (let tries = 0; nodes.length < count && tries < count * 40; tries++) {
      const x = 24 + Math.random() * (w - 48);
      const y = 24 + Math.random() * (h - 48);
      if (nodes.every(n => (n.hx - x) ** 2 + (n.hy - y) ** 2 > minDist * minDist)) {
        nodes.push({
          hx: x, hy: y, x, y,
          amp: 4 + Math.random() * 8,
          sp: 0.15 + Math.random() * 0.25,
          ph: Math.random() * Math.PI * 2,
          adj: [], seen: false,
        });
      }
    }

    // connect every node to its two nearest neighbours
    const seen = new Set();
    edges = [];
    nodes.forEach((n, i) => {
      nodes
        .map((m, j) => ({ j, d: (n.hx - m.hx) ** 2 + (n.hy - m.hy) ** 2 }))
        .filter(o => o.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .forEach(({ j }) => {
          const key = i < j ? i + '-' + j : j + '-' + i;
          if (seen.has(key)) return;
          seen.add(key);
          const e = { a: i, b: j, cov: 0, done: false };
          edges.push(e);
          nodes[i].adj.push(e);
          nodes[j].adj.push(e);
        });
    });

    const nWalkers = w > 700 ? 4 : 3;
    walkers = [];
    for (let i = 0; i < nWalkers; i++) {
      const start = Math.floor(Math.random() * nodes.length);
      walkers.push({ from: start, to: null, t: 0, e: null });
      pick(walkers[i]);
    }
  };

  // next hop: prefer the transition that is covered least
  const pick = (wk) => {
    const n = nodes[wk.from];
    if (!n || !n.adj.length) return;
    const best = n.adj.reduce((acc, e) => {
      const score = (e.done ? 1 : 0) + e.cov * 0.5 + Math.random() * 0.4;
      return score < acc.score ? { e, score } : acc;
    }, { e: null, score: Infinity }).e;
    wk.e = best;
    wk.to = best.a === wk.from ? best.b : best.a;
    wk.t = 0;
  };

  const step = (dt) => {
    time += dt;
    const reach = 150;
    nodes.forEach(n => {
      let x = n.hx + Math.cos(time * n.sp + n.ph) * n.amp;
      let y = n.hy + Math.sin(time * n.sp * 1.3 + n.ph) * n.amp;
      const dx = x - mouse.x, dy = y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < reach * reach && d2 > 1) {
        const d = Math.sqrt(d2), push = (1 - d / reach) * 14;
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
      n.x = x; n.y = y;
    });

    edges.forEach(e => { if (e.cov > 0) e.cov = Math.max(0, e.cov - dt * 0.07); });

    walkers.forEach(wk => {
      if (!wk.e) return;
      const a = nodes[wk.from], b = nodes[wk.to];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      wk.t += (dt * 85) / len;
      if (wk.t >= 1) {
        wk.e.cov = 1;
        wk.e.done = true;
        b.seen = true;
        a.seen = true;
        wk.from = wk.to;
        pick(wk);
      }
    });

    // a run ends when every transition has been walked, then a new one starts
    if (edges.length && edges.every(e => e.done)) {
      edges.forEach(e => { e.done = false; });
      nodes.forEach(n => { n.seen = false; });
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';

    edges.forEach(e => {
      const a = nodes[e.a], b = nodes[e.b];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (e.cov > 0 || e.done) {
        ctx.strokeStyle = colors.accent;
        ctx.globalAlpha = 0.22 + 0.6 * e.cov;
        ctx.lineWidth = 1.3;
      } else {
        ctx.strokeStyle = colors.muted;
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1;
      }
      ctx.stroke();
    });

    // edges from the pointer to nearby steps
    if (mouse.x > -999) {
      nodes.forEach(n => {
        const d = Math.hypot(n.x - mouse.x, n.y - mouse.y);
        if (d < 150) {
          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(n.x, n.y);
          ctx.strokeStyle = colors.accent;
          ctx.globalAlpha = (1 - d / 150) * 0.5;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    }

    nodes.forEach(n => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.seen ? 3 : 2.4, 0, Math.PI * 2);
      ctx.fillStyle = n.seen ? colors.accent : colors.muted;
      ctx.globalAlpha = n.seen ? 0.95 : 0.55;
      ctx.fill();
    });

    walkers.forEach(wk => {
      if (!wk.e) return;
      const a = nodes[wk.from], b = nodes[wk.to];
      const x = a.x + (b.x - a.x) * wk.t;
      const y = a.y + (b.y - a.y) * wk.t;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = colors.pulse;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  };

  const frame = (now) => {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (raf || reduced.matches) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const staticFrame = () => {
    // reduced motion: run the walk forward a few seconds and draw once
    for (let i = 0; i < 220; i++) step(0.05);
    draw();
  };

  const setup = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    time = 0;
    readColors();
    build();
    if (reduced.matches) staticFrame();
    else { draw(); start(); }
  };

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  }).observe(hero);

  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  reduced.addEventListener('change', setup);
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', setup);

  let resizeTimer = 0;
  let lastW = 0;
  new ResizeObserver(() => {
    const nw = hero.clientWidth;
    if (nw === lastW && nodes.length) return;
    lastW = nw;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setup, 150);
  }).observe(hero);

  setup();
})();

/* Nav: border once scrolled, highlight the section in view. */
(() => {
  const nav = document.querySelector('.nav');
  const links = [...document.querySelectorAll('.nav nav a')];
  const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));

  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const sections = ['hello', 'experience', 'education', 'projects', 'certifications', 'contact']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach(a => a.removeAttribute('aria-current'));
      const link = byId.get(entry.target.id);
      if (link) link.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(s => io.observe(s));
})();

/* Fade content in as it scrolls into view. */
(() => {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach(el => io.observe(el));
})();

/* Projects gallery: previous/next buttons, shown only when the cards overflow. */
(() => {
  const track = document.querySelector('.track');
  const ctrls = document.querySelector('.g-ctrls');
  if (!track || !ctrls) return;
  const prev = ctrls.querySelector('.prev');
  const next = ctrls.querySelector('.next');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  const update = () => {
    const max = track.scrollWidth - track.clientWidth;
    ctrls.hidden = max <= 2;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= max - 2;
  };
  const stepSize = () => {
    const card = track.firstElementChild;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return card.getBoundingClientRect().width + gap;
  };
  const go = (dir) => track.scrollBy({ left: dir * stepSize(), behavior: reduced.matches ? 'auto' : 'smooth' });

  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  track.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(track);
  update();
})();

/* Education tabs: one panel at a time, arrow keys move between them. */
(() => {
  const root = document.querySelector('.tabs');
  if (!root) return;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));

  const select = (i, focus) => {
    tabs.forEach((tab, j) => {
      const on = i === j;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[j].classList.toggle('is-active', on);
    });
    if (focus) tabs[i].focus();
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (e) => {
      const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (move) {
        e.preventDefault();
        select((i + move + tabs.length) % tabs.length, true);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        select(e.key === 'Home' ? 0 : tabs.length - 1, true);
      }
    });
  });
  select(0);
})();
