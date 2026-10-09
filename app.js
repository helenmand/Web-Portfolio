(function () {
  'use strict';

  const AUTOPLAY = ['about'];
  const STORAGE_KEY = 'asked';

  const convo = document.getElementById('convo');
  const typed = document.getElementById('typed');
  const sendBtn = document.getElementById('send');
  const hint = document.getElementById('hint');
  if (!convo || !typed || !sendBtn || !hint) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const turns = new Map();
  convo.querySelectorAll('.turn').forEach(function (t) {
    turns.set(t.dataset.id, t);
    t.remove();
  });

  let asked = readAsked();
  let queue = [];
  let running = false;
  let skipping = false;
  let typeToken = 0;

  function readAsked() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      return saved.filter(function (id, i) { return turns.has(id) && saved.indexOf(id) === i; });
    } catch (e) {
      return [];
    }
  }

  function saveAsked() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(asked)); } catch (e) { /* storage unavailable */ }
  }

  function show(id) {
    const turn = turns.get(id);
    turn.classList.add('shown');
    convo.appendChild(turn);
    return turn;
  }

  function wait(ms) {
    return skipping || reduceMotion ? Promise.resolve() : new Promise(function (r) { setTimeout(r, ms); });
  }

  /* Keep the newest text in view, but never fight the reader. Scrolling up stops the
     following, and it never scrolls while a finger or wheel is moving the page. */
  let stick = true;
  let handsOn = false;
  let handsTimer = 0;
  let touching = false;
  let touchY = 0;
  let lastAuto = 0;
  let lastY = window.scrollY;
  let lastHeight = document.documentElement.scrollHeight;
  let scheduled = false;

  function nearBottom(px) {
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - px;
  }

  function follow() {
    if (!stick || scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      if (!stick || handsOn || touching) return;
      const top = document.documentElement.scrollHeight - window.innerHeight;
      if (top - window.scrollY > 1) {
        lastAuto = performance.now();
        window.scrollTo(0, top);
      }
    });
  }

  function readerMoved() {
    handsOn = true;
    clearTimeout(handsTimer);
    handsTimer = setTimeout(function () {
      handsOn = false;
      follow();
    }, 500);
  }

  window.addEventListener('scroll', function () {
    const y = window.scrollY;
    const height = document.documentElement.scrollHeight;
    const own = performance.now() - lastAuto < 150;
    if (!own) {
      readerMoved();
      if (y < lastY - 2 && height >= lastHeight) stick = false;
      else if (nearBottom(80)) stick = true;
    }
    lastY = y;
    lastHeight = height;
  }, { passive: true });
  window.addEventListener('wheel', function (e) {
    readerMoved();
    if (e.deltaY < 0) stick = false;
  }, { passive: true });
  window.addEventListener('touchstart', function (e) {
    touching = true;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (e.touches[0].clientY > touchY + 4) stick = false;
  }, { passive: true });
  function touchDone() {
    touching = false;
    readerMoved();
  }
  window.addEventListener('touchend', touchDone, { passive: true });
  window.addEventListener('touchcancel', touchDone, { passive: true });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') stick = false;
  });

  function textNodes(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function stream(el, perTick) {
    const nodes = textNodes(el);
    const full = nodes.map(function (n) { return n.data; });
    nodes.forEach(function (n) { n.data = ''; });
    return new Promise(function (resolve) {
      let n = 0, c = 0;
      (function tick() {
        if (skipping) {
          nodes.forEach(function (node, i) { node.data = full[i]; });
          resolve();
          return;
        }
        for (let k = 0; k < perTick && n < nodes.length; k++) {
          c++;
          nodes[n].data = full[n].slice(0, c);
          if (c >= full[n].length) { n++; c = 0; }
        }
        follow();
        if (n < nodes.length) setTimeout(tick, 28);
        else resolve();
      })();
    });
  }

  async function reveal(block) {
    block.hidden = false;
    if (block.classList.contains('stream')) {
      block.classList.add('rise');
      await stream(block, 4);
    } else if (block.classList.contains('tool')) {
      const result = block.querySelector('.result');
      block.classList.add('rise');
      if (result) result.hidden = true;
      follow();
      await wait(500);
      if (result) result.hidden = false;
    } else if (block.tagName === 'UL') {
      const cards = block.classList.contains('tiles');
      for (const item of Array.from(block.children)) {
        item.hidden = false;
        item.classList.add('rise');
        if (!cards) await stream(item, 10);
        follow();
        await wait(cards ? 240 : 120);
      }
    } else {
      block.classList.add('rise');
      await stream(block, 4);
    }
    follow();
    await wait(200);
  }

  async function play(id) {
    asked.push(id);
    saveAsked();
    const turn = show(id);
    if (reduceMotion) { follow(); return; }

    const blocks = Array.from(turn.querySelector('.a').children);
    blocks.forEach(function (b) {
      b.hidden = true;
      if (b.tagName === 'UL') Array.from(b.children).forEach(function (li) { li.hidden = true; });
    });
    follow();
    await wait(300);

    const dots = document.createElement('div');
    dots.className = 'thinking';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = '<span></span><span></span><span></span>';
    turn.appendChild(dots);
    follow();
    await wait(500);
    dots.remove();

    for (const block of blocks) await reveal(block);
  }

  function nextId() {
    return Array.from(turns.keys()).find(function (id) { return asked.indexOf(id) < 0; });
  }

  function setSend(mode) {
    const stop = mode === 'stop';
    sendBtn.setAttribute('aria-disabled', mode === 'wait' ? 'true' : 'false');
    sendBtn.setAttribute('aria-label', stop ? 'Skip' : 'Send');
    sendBtn.querySelector('.i-send').hidden = stop;
    sendBtn.querySelector('.i-stop').hidden = !stop;
  }

  function enterRunning() {
    typeToken++;
    typed.textContent = '';
    hint.textContent = 'Answering…';
    setSend('stop');
  }

  async function fillBox(animate) {
    const token = ++typeToken;
    const id = nextId();
    const text = id ? turns.get(id).querySelector('.q').textContent : 'Start over';
    hint.textContent = id ? 'Typing is off. Press send to ask.' : 'That is everything. Press send to start over.';
    setSend('wait');
    typed.textContent = '';
    if (animate && !reduceMotion) {
      for (let i = 1; i <= text.length; i++) {
        await new Promise(function (r) { setTimeout(r, 22); });
        if (token !== typeToken) return;
        typed.textContent = text.slice(0, i);
      }
    } else {
      typed.textContent = text;
    }
    if (token === typeToken) setSend('ready');
  }

  async function run() {
    if (running) return;
    running = true;
    enterRunning();
    while (queue.length) await play(queue.shift());
    running = false;
    skipping = false;
    fillBox(true);
  }

  function enqueue(id) {
    if (asked.indexOf(id) >= 0 || queue.indexOf(id) >= 0) return;
    queue.push(id);
    run();
  }

  function startOver() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }
    window.location.reload();
  }

  sendBtn.addEventListener('click', function () {
    if (sendBtn.getAttribute('aria-disabled') === 'true') return;
    if (running) { skipping = true; return; }
    const id = nextId();
    if (!id) { startOver(); return; }
    typed.textContent = '';
    setSend('wait');
    stick = true;
    enqueue(id);
  });

  if (asked.length) {
    asked.forEach(show);
    fillBox(false);
  } else {
    AUTOPLAY.forEach(enqueue);
  }
})();
