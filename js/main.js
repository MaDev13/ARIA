/* ARIA Scrollytelling — Main JavaScript (narrativa reestructurada) */

(function () {
  'use strict';

  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({
    lerp: 0.08,
    wheelMultiplier: 0.85,
    smoothWheel: true,
  });

  lenis.on('scroll', ScrollTrigger.update);

  ScrollTrigger.scrollerProxy(document.documentElement, {
    scrollTop(value) {
      if (arguments.length) {
        lenis.scrollTo(value, { immediate: true });
      }
      return lenis.scroll;
    },
    getBoundingClientRect() {
      return {
        top: 0,
        left: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    },
    pinType: document.documentElement.style.transform ? 'transform' : 'fixed',
  });

  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // ─── Ambiente de fábrica (Web Audio API) ───
  let audioCtx = null;
  let factoryGain = null;
  let factoryStarted = false;

  function startFactoryAmbience() {
    if (factoryStarted) return;
    factoryStarted = true;

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      factoryGain = audioCtx.createGain();
      factoryGain.gain.value = 0;
      factoryGain.connect(audioCtx.destination);

      const bufferSize = audioCtx.sampleRate * 2;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.08;
      }

      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 280;

      const hum = audioCtx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 62;

      const humGain = audioCtx.createGain();
      humGain.gain.value = 0.04;

      noise.connect(lowpass);
      lowpass.connect(factoryGain);
      hum.connect(humGain);
      humGain.connect(factoryGain);

      noise.start();
      hum.start();

      gsap.to(factoryGain.gain, { value: 0.12, duration: 4, ease: 'power2.inOut' });
    } catch (_) { /* audio no disponible */ }
  }

  function fadeFactoryAmbience(out) {
    if (!factoryGain) return;
    gsap.to(factoryGain.gain, {
      value: out ? 0 : 0.12,
      duration: out ? 2.5 : 3,
      ease: 'power2.inOut',
    });
  }

  document.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }, { once: true });

  // ─── Progress & Navbar ───
  const sections = document.querySelectorAll('.section[data-section]');
  const progressNav = document.getElementById('progressNav');

  sections.forEach((section) => {
    const dot = document.createElement('button');
    dot.className = 'progress-dot';
    dot.setAttribute('data-label', section.dataset.section);
    dot.setAttribute('aria-label', section.dataset.section);
    dot.addEventListener('click', () => lenis.scrollTo(section, { offset: 0, duration: 1.5 }));
    progressNav.appendChild(dot);
  });

  const dots = progressNav.querySelectorAll('.progress-dot');
  const finalSection = document.getElementById('final');
  let activeSectionIndex = 0;

  function setActiveDot(index) {
    if (index < 0 || index >= dots.length) return;
    activeSectionIndex = index;
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
  }

  function updateNavVisibility() {
    const scrollY = lenis.scroll;
    const vh = window.innerHeight;
    const heroEl = document.getElementById('hero');
    const pastHero = heroEl ? scrollY > heroEl.offsetHeight * 0.4 : scrollY > vh * 0.3;
    const onFinal = finalSection && scrollY >= finalSection.offsetTop - vh * 0.15;

    progressNav.classList.toggle('progress-nav-hidden', !pastHero || onFinal);
  }

  sections.forEach((section, i) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 45%',
      onEnter: () => setActiveDot(i),
      onEnterBack: () => setActiveDot(i),
    });
  });

  function syncActiveDotFromScroll() {
    const vh = window.innerHeight;
    const marker = lenis.scroll + vh * 0.55;
    let idx = 0;
    sections.forEach((section, i) => {
      if (marker >= section.offsetTop) idx = i;
    });
    setActiveDot(idx);
  }

  syncActiveDotFromScroll();
  updateNavVisibility();
  lenis.on('scroll', updateNavVisibility);

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) lenis.scrollTo(target, { offset: 0, duration: 1.5 });
    });
  });

  // ─── SECCIÓN 1: HERO ───
  gsap.to('.hero-title', { opacity: 1, y: 0, duration: 1.2, delay: 0.4, ease: 'power2.out' });
  gsap.from('.hero-title', { y: 24, duration: 0.01 });
  gsap.to('.hero-subtitle', { opacity: 1, y: 0, duration: 1, delay: 0.9, ease: 'power2.out' });
  gsap.from('.hero-subtitle', { y: 20, duration: 0.01 });
  gsap.to('.hero-cta', { opacity: 1, y: 0, duration: 0.8, delay: 1.4, ease: 'power2.out' });
  gsap.from('.hero-cta', { y: 16, duration: 0.01 });

  document.getElementById('heroCta')?.addEventListener('click', () => {
    const target = document.getElementById('sopa-letras');
    if (target) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
  });

  // ─── SECCIÓN 2: SOPA DE LETRAS (revelación con scroll) ───
  const SOPA_WORD = 'DECIDIR';
  const SOPA_SIZE = 10;
  const SOPA_STEPS = 3;
  const sopaGrid = document.getElementById('sopaGrid');
  const sopaSuccess = document.getElementById('sopaSuccess');
  let sopaAnswerEls = [];

  function buildSopaGrid() {
    if (!sopaGrid) return;
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const grid = Array.from({ length: SOPA_SIZE }, () =>
      Array.from({ length: SOPA_SIZE }, () => letters[Math.floor(Math.random() * letters.length)])
    );
    const row = 4;
    const col = 1;
    for (let i = 0; i < SOPA_WORD.length; i++) grid[row][col + i] = SOPA_WORD[i];

    sopaGrid.innerHTML = '';
    grid.forEach((r, ri) => {
      r.forEach((letter, ci) => {
        const cell = document.createElement('span');
        cell.className = 'sopa-cell';
        cell.textContent = letter;
        cell.dataset.row = ri;
        cell.dataset.col = ci;
        if (ri === row && ci >= col && ci < col + SOPA_WORD.length) {
          cell.dataset.answer = String(ci - col);
        }
        sopaGrid.appendChild(cell);
      });
    });

    sopaAnswerEls = Array.from(sopaGrid.querySelectorAll('[data-answer]'))
      .sort((a, b) => parseInt(a.dataset.answer, 10) - parseInt(b.dataset.answer, 10));
  }

  function resetSopaReveal() {
    sopaAnswerEls.forEach((c) => c.classList.remove('found'));
    gsap.set(sopaSuccess, { opacity: 0 });
  }

  buildSopaGrid();
  resetSopaReveal();

  gsap.to('.sopa-title', {
    scrollTrigger: { trigger: '#sopa-letras', start: 'top 70%' },
    opacity: 1, duration: 0.7,
  });
  gsap.to('.sopa-desc', {
    scrollTrigger: { trigger: '#sopa-letras', start: 'top 65%' },
    opacity: 1, duration: 0.7, delay: 0.08,
  });
  gsap.to('#sopaGridWrap', {
    scrollTrigger: { trigger: '#sopa-letras', start: 'top 60%' },
    opacity: 1, duration: 0.8, delay: 0.12, ease: 'power2.out',
  });

  function syncSopaReveal(progress) {
    const wordVisible = progress >= 0.35;
    const done = progress >= 0.72;

    sopaAnswerEls.forEach((cell) => cell.classList.toggle('found', wordVisible));
    gsap.set(sopaSuccess, { opacity: done ? 1 : 0 });
  }

  const sopaTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#sopa-letras',
      start: 'top top',
      end: () => `+=${SOPA_STEPS * 100}%`,
      pin: true,
      pinSpacing: true,
      scrub: true,
      anticipatePin: 1,
      onUpdate: (self) => syncSopaReveal(self.progress),
      onLeaveBack: resetSopaReveal,
      invalidateOnRefresh: true,
    },
  });

  sopaTl.to({}, { duration: SOPA_STEPS });

  const sopaST = sopaTl.scrollTrigger;

  // ─── SECCIÓN 3: PREGUNTA DE IMPACTO ───
  gsap.to('.impact-question', {
    scrollTrigger: { trigger: '#pregunta-impacto', start: 'top 55%' },
    opacity: 1,
    duration: 2,
    ease: 'power2.inOut',
  });
  gsap.to('.impact-scroll-hint', {
    scrollTrigger: { trigger: '#pregunta-impacto', start: 'top 50%' },
    opacity: 0.6,
    duration: 1,
    delay: 1.2,
    ease: 'power2.out',
  });

  // ─── SECCIÓN 4: TESTIMONIO ───
  const testimonioVideo = document.getElementById('testimonioVideo');
  const testimonioPlay = document.getElementById('testimonioPlay');

  testimonioPlay?.addEventListener('click', () => {
    if (!testimonioVideo) return;
    testimonioVideo.play().catch(() => {});
    testimonioPlay.classList.add('hidden');
  });

  testimonioVideo?.addEventListener('ended', () => {
    testimonioPlay?.classList.remove('hidden');
  });

  testimonioVideo?.addEventListener('pause', () => {
    if (testimonioVideo.currentTime > 0 && !testimonioVideo.ended) {
      testimonioPlay?.classList.remove('hidden');
    }
  });

  gsap.to('.testimonio-title', {
    scrollTrigger: { trigger: '#testimonio', start: 'top 65%' },
    opacity: 1, duration: 0.8,
  });
  gsap.to('.testimonio-sub', {
    scrollTrigger: { trigger: '#testimonio', start: 'top 62%' },
    opacity: 1, duration: 0.8, delay: 0.1,
  });
  gsap.to('#testimonioWrap', {
    scrollTrigger: { trigger: '#testimonio', start: 'top 55%' },
    opacity: 1, duration: 0.9, delay: 0.2, ease: 'power3.out',
  });

  // ─── SECCIÓN 5: CONTEXTO / PROBLEMA (imágenes) ───
  const cards = ['#card-factory', '#card-materials', '#card-dispatch', '#card-workers'];
  const CONTEXTO_STEPS = 5;

  function resetContexto() {
    gsap.set(cards.join(','), { opacity: 0, scale: 0.92, y: 28, filter: 'none' });
    gsap.set('#sceneOverlay', { opacity: 0 });
    gsap.set('#sceneAlert', { opacity: 0, scale: 0.85 });
  }

  resetContexto();

  const contextoTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#contexto',
      start: 'top top',
      end: () => `+=${CONTEXTO_STEPS * 100}%`,
      pin: true,
      pinSpacing: true,
      scrub: true,
      anticipatePin: 1,
      onLeaveBack: resetContexto,
      invalidateOnRefresh: true,
    },
  });

  cards.forEach((card, i) => {
    contextoTl.addLabel(`step${i}`, i);
    contextoTl.fromTo(card,
      { opacity: 0, scale: 0.92, y: 28 },
      { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: 'power2.out', immediateRender: false },
      i + 0.02
    );
  });

  contextoTl.addLabel('step4', 4);
  contextoTl.to('#sceneOverlay', { opacity: 1, duration: 0.35 }, 4.02);
  contextoTl.to(cards.join(','), { filter: 'grayscale(1) brightness(0.3)', duration: 0.35 }, 4.02);
  contextoTl.to('#sceneAlert', { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.4)' }, 4.08);
  contextoTl.to({}, { duration: 0.92 }, 4.08);

  const contextoST = contextoTl.scrollTrigger;

  ScrollTrigger.create({
    trigger: '#contexto',
    start: 'top 80%',
    onEnter: () => {
      startFactoryAmbience();
      fadeFactoryAmbience(false);
    },
    onLeaveBack: () => fadeFactoryAmbience(true),
  });

  // ─── SECCIÓN 6: FLUJO DEL PROBLEMA ───
  const flowItems = document.querySelectorAll('#problemFlow .flow-item');
  const flowArrows = document.querySelectorAll('#problemFlow .flow-arrow');
  const PROBLEMA_STEPS = flowItems.length;

  function resetProblema() {
    gsap.set(flowItems, { opacity: 0, y: 28 });
    gsap.set(flowArrows, { opacity: 0 });
  }

  resetProblema();

  const problemTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#problema',
      start: 'top top',
      end: () => `+=${PROBLEMA_STEPS * 100}%`,
      pin: true,
      pinSpacing: true,
      scrub: true,
      anticipatePin: 1,
      onLeaveBack: resetProblema,
      invalidateOnRefresh: true,
    },
  });

  flowItems.forEach((item, i) => {
    problemTl.addLabel(`pstep${i}`, i);
    problemTl.fromTo(item,
      { opacity: 0, y: 28 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', immediateRender: false },
      i + 0.02
    );
    if (flowArrows[i]) {
      problemTl.to(flowArrows[i], { opacity: 1, duration: 0.2 }, i + 0.12);
    }
  });

  problemTl.to({}, { duration: 0.88 }, PROBLEMA_STEPS - 1 + 0.15);

  const problemaST = problemTl.scrollTrigger;

  // ─── SECCIÓN 4: PREGUNTA IA ───
  gsap.to('.ia-question', {
    scrollTrigger: { trigger: '#pregunta-ia', start: 'top 55%' },
    opacity: 1,
    duration: 1.5,
    ease: 'power3.out',
  });

  // ─── SECCIÓN 5: REVELACIÓN ARIA ───
  const revealTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#aria-reveal',
      start: 'top 45%',
      toggleActions: 'play none none reverse',
    },
  });

  revealTl
    .to('.reveal-logo', { opacity: 1, scale: 1, duration: 1.4, ease: 'power3.out' })
    .from('.reveal-logo', { scale: 0.7, filter: 'blur(12px)', duration: 1.4, ease: 'power3.out' }, '<')
    .to('.reveal-subtitle', { opacity: 1, duration: 0.8, ease: 'power2.out' }, '-=0.5')
    .to('.reveal-tagline', { opacity: 1, duration: 1, ease: 'power2.out' }, '-=0.3');

  gsap.to('.hero-glow', {
    scrollTrigger: { trigger: '#aria-reveal', start: 'top top', end: 'bottom top', scrub: 1 },
    scale: 1.6,
    opacity: 0,
  });

  // ─── SECCIÓN 6: SOLUCIÓN (3 bloques) ───
  gsap.to('#solucion .section-label', {
    scrollTrigger: { trigger: '#solucion', start: 'top 70%' },
    opacity: 1,
    duration: 0.8,
  });

  const flowGroupInput = document.querySelector('.h-flow-group-input');
  const flowGroupOutput = document.querySelector('.h-flow-group-output');
  const flowCenter = document.querySelector('.h-flow-center');
  const flowBridges = document.querySelectorAll('.h-flow-bridge');
  const flowNodes = document.querySelectorAll('#solutionFlow .h-flow-node[data-step]');
  const flowPulse = document.getElementById('flowPulse');

  gsap.set(flowPulse, { opacity: 0, left: '10%' });

  const solutionFlowTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#solucion',
      start: 'top 55%',
      toggleActions: 'play none none reverse',
    },
  });

  // 1. Bloque Entrada
  solutionFlowTl.to(flowGroupInput, {
    opacity: 1, y: 0, duration: 0.55, ease: 'power3.out',
    onStart: () => flowGroupInput.classList.add('active'),
  }, 0);

  solutionFlowTl.to(flowGroupInput.querySelectorAll('.h-flow-node'), {
    opacity: 1, scale: 1, duration: 0.4, stagger: 0.18, ease: 'back.out(1.5)',
    onStart: function () { this.targets().forEach((n) => n.classList.add('active')); },
  }, 0.15);

  // 2. Puente → ARIA
  solutionFlowTl.to(flowBridges[0], {
    opacity: 1, scaleX: 1, duration: 0.35, ease: 'power2.out',
  }, 0.55);

  // 3. ARIA grande
  solutionFlowTl.to(flowCenter, {
    opacity: 1, scale: 1, duration: 0.65, ease: 'back.out(1.6)',
    onStart: () => flowCenter.classList.add('active'),
  }, 0.75);

  // 4. Puente → Salida
  solutionFlowTl.to(flowBridges[1], {
    opacity: 1, scaleX: 1, duration: 0.35, ease: 'power2.out',
  }, 1.15);

  // 5. Bloque Salida
  solutionFlowTl.to(flowGroupOutput, {
    opacity: 1, y: 0, duration: 0.55, ease: 'power3.out',
    onStart: () => flowGroupOutput.classList.add('active'),
  }, 1.35);

  solutionFlowTl.to(flowGroupOutput.querySelectorAll('.h-flow-node'), {
    opacity: 1, scale: 1, duration: 0.4, stagger: 0.15, ease: 'back.out(1.4)',
    onStart: function () { this.targets().forEach((n) => n.classList.add('active')); },
  }, 1.5);

  solutionFlowTl.to(flowPulse, { opacity: 1, duration: 0.3 }, 1.2);

  let flowPulseTween = null;
  ScrollTrigger.create({
    trigger: '#solucion',
    start: 'top 55%',
    onEnter: () => {
      if (flowPulseTween) return;
      flowPulseTween = gsap.to(flowPulse, {
        left: '88%',
        duration: 2.8,
        ease: 'power1.inOut',
        repeat: -1,
        yoyo: true,
      });
    },
    onLeaveBack: () => {
      if (flowPulseTween) { flowPulseTween.kill(); flowPulseTween = null; }
      gsap.set(flowPulse, { opacity: 0, left: '10%' });
      [flowGroupInput, flowGroupOutput, flowCenter].forEach((el) => el && el.classList.remove('active'));
      flowNodes.forEach((n) => n.classList.remove('active'));
      gsap.set([flowGroupInput, flowGroupOutput, flowCenter, ...flowBridges], {
        opacity: 0, y: 20, scale: 1, scaleX: 0.3,
      });
      gsap.set(flowCenter, { scale: 0.7 });
      gsap.set(flowNodes, { opacity: 0, scale: 0.85 });
    },
  });

  // ─── SECCIÓN 7: CÓMO FUNCIONA (bento cards) ───
  gsap.to('#como-funciona .section-label', {
    scrollTrigger: { trigger: '#como-funciona', start: 'top 70%' },
    opacity: 1,
    duration: 0.8,
  });

  const techTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#como-funciona',
      start: 'top 58%',
      toggleActions: 'play none none reverse',
    },
  });

  const order = ['0', '1', 'aria', '2', '3', '4'];

  order.forEach((id, i) => {
    const card = document.querySelector(`#techHub .tech-card[data-card="${id}"]`);
    if (!card) return;
    techTl.fromTo(card,
      { opacity: 0, y: 28, scale: 0.96 },
      {
        opacity: 1, y: 0, scale: 1,
        duration: 0.5,
        ease: id === 'aria' ? 'back.out(1.5)' : 'power2.out',
        onStart: () => card.classList.add('visible'),
        onReverseComplete: () => card.classList.remove('visible'),
      },
      i * 0.1
    );
  });

  // ─── SECCIÓN 8: DEMO MVP (video) ───
  const mvpVideo = document.getElementById('mvpVideo');

  function playMvpVideo() {
    if (!mvpVideo) return;
    mvpVideo.currentTime = 0;
    mvpVideo.play().catch(() => {});
  }

  function pauseMvpVideo(reset) {
    if (!mvpVideo) return;
    mvpVideo.pause();
    if (reset) mvpVideo.currentTime = 0;
  }

  gsap.to('#mvp .section-label', {
    scrollTrigger: { trigger: '#mvp', start: 'top 70%' },
    opacity: 1,
    duration: 0.8,
  });

  gsap.to('.mvp-demo-title', {
    scrollTrigger: { trigger: '#mvp', start: 'top 65%' },
    opacity: 1,
    duration: 0.8,
    delay: 0.1,
  });

  gsap.from('#mvpVideoWrap', { y: 36, opacity: 0, duration: 0.01 });
  gsap.to('#mvpVideoWrap', {
    scrollTrigger: { trigger: '#mvp', start: 'top 58%' },
    opacity: 1,
    y: 0,
    duration: 1,
    ease: 'power3.out',
  });

  gsap.from('#mvpHighlights', { y: 24, opacity: 0, duration: 0.01 });
  gsap.to('#mvpHighlights', {
    scrollTrigger: { trigger: '#mvp', start: 'top 50%' },
    opacity: 1,
    y: 0,
    duration: 0.8,
    delay: 0.3,
    ease: 'power2.out',
  });

  ScrollTrigger.create({
    trigger: '#mvp',
    start: 'top 55%',
    end: 'bottom 20%',
    onEnter: playMvpVideo,
    onEnterBack: playMvpVideo,
    onLeave: () => pauseMvpVideo(false),
    onLeaveBack: () => pauseMvpVideo(true),
  });

  if (mvpVideo) {
    mvpVideo.addEventListener('click', () => {
      mvpVideo.muted = !mvpVideo.muted;
    });
  }

  // ─── SECCIÓN 9: BENEFICIOS ───
  gsap.utils.toArray('.benefit-item').forEach((item, i) => {
    gsap.from(item, { y: 40, opacity: 0, duration: 0.01 });
    gsap.to(item, {
      scrollTrigger: { trigger: '#beneficios', start: 'top 55%' },
      opacity: 1,
      y: 0,
      duration: 0.8,
      delay: i * 0.2,
      ease: 'power3.out',
    });
  });

  let countersStarted = false;
  ScrollTrigger.create({
    trigger: '#beneficios',
    start: 'top 45%',
    onEnter: () => {
      if (countersStarted) return;
      countersStarted = true;

      document.querySelectorAll('.counter').forEach((el) => {
        gsap.to({ val: 0 }, {
          val: parseInt(el.dataset.target),
          duration: 2.5,
          ease: 'power2.out',
          onUpdate: function () { el.textContent = Math.round(this.targets()[0].val); },
        });
      });

      const weeksEl = document.querySelector('.counter-weeks');
      gsap.to({ val: 0 }, {
        val: parseInt(weeksEl.dataset.target),
        duration: 2,
        ease: 'power2.out',
        onUpdate: function () {
          const v = Math.round(this.targets()[0].val);
          weeksEl.textContent = v <= 1 ? '1' : '1-' + v;
        },
      });
    },
  });

  // ─── SECCIÓN 11: MERCADO ───
  gsap.to('#mercado .section-label', {
    scrollTrigger: { trigger: '#mercado', start: 'top 70%' },
    opacity: 1,
    duration: 0.8,
  });

  gsap.to('.market-headline', {
    scrollTrigger: { trigger: '#mercado', start: 'top 65%' },
    opacity: 1,
    duration: 0.8,
    delay: 0.08,
  });

  gsap.to('.market-sub', {
    scrollTrigger: { trigger: '#mercado', start: 'top 62%' },
    opacity: 1,
    duration: 0.8,
    delay: 0.15,
  });

  gsap.to('.market-traditional', {
    scrollTrigger: { trigger: '#mercado', start: 'top 58%' },
    opacity: 1,
    duration: 0.6,
    delay: 0.2,
  });

  document.querySelectorAll('.market-competitors .market-card').forEach((card, i) => {
    gsap.to(card, {
      scrollTrigger: { trigger: '#mercado', start: 'top 55%' },
      opacity: 1,
      y: 0,
      duration: 0.55,
      delay: 0.25 + i * 0.1,
      ease: 'power3.out',
      onStart: () => card.classList.add('visible'),
    });
  });

  gsap.from('.market-bridge', { scaleX: 0, opacity: 0, duration: 0.01 });
  gsap.to('.market-bridge', {
    scrollTrigger: { trigger: '#mercado', start: 'top 48%' },
    scaleX: 1,
    opacity: 1,
    duration: 0.7,
    ease: 'power2.out',
  });

  gsap.from('.market-card-aria', { y: 32, opacity: 0, scale: 0.97, duration: 0.01 });
  gsap.to('.market-card-aria', {
    scrollTrigger: { trigger: '#mercado', start: 'top 42%' },
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.85,
    ease: 'power3.out',
  });

  // ─── SECCIÓN 12: VIABILIDAD TÉCNICA ───
  gsap.to('#viabilidad-tecnica .section-label', {
    scrollTrigger: { trigger: '#viabilidad-tecnica', start: 'top 70%' },
    opacity: 1,
    duration: 0.8,
  });

  document.querySelectorAll('.viab-card-tech').forEach((card, i) => {
    gsap.to(card, {
      scrollTrigger: { trigger: '#viabilidad-tecnica', start: 'top 58%' },
      opacity: 1,
      y: 0,
      duration: 0.6,
      delay: 0.15 + i * 0.12,
      ease: 'power3.out',
    });
  });

  gsap.from('#viabilidad-tecnica .viab-footnote', { y: 20, opacity: 0, duration: 0.01 });
  gsap.to('#viabilidad-tecnica .viab-footnote', {
    scrollTrigger: { trigger: '#viabilidad-tecnica', start: 'top 45%' },
    opacity: 1,
    y: 0,
    duration: 0.8,
    delay: 0.55,
    ease: 'power2.out',
  });

  // ─── SECCIÓN 13: VIABILIDAD FINANCIERA ───
  gsap.to('#viabilidad-financiera .section-label', {
    scrollTrigger: { trigger: '#viabilidad-financiera', start: 'top 70%' },
    opacity: 1,
    duration: 0.8,
  });

  document.querySelectorAll('.finance-kpi').forEach((kpi, i) => {
    gsap.from(kpi, { y: 32, opacity: 0, duration: 0.01 });
    gsap.to(kpi, {
      scrollTrigger: { trigger: '#viabilidad-financiera', start: 'top 58%' },
      opacity: 1,
      y: 0,
      duration: 0.65,
      delay: 0.12 + i * 0.1,
      ease: 'power3.out',
    });
  });

  let financeCountersStarted = false;

  function animateFinanceCounters() {
    document.querySelectorAll('#viabilidad-financiera .finance-counter').forEach((el) => {
      const target = parseFloat(el.dataset.target);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      gsap.to({ val: 0 }, {
        val: target,
        duration: 2.2,
        ease: 'power2.out',
        onUpdate: function () {
          el.textContent = prefix + Math.round(this.targets()[0].val) + suffix;
        },
      });
    });
  }

  ScrollTrigger.create({
    trigger: '#viabilidad-financiera',
    start: 'top 50%',
    onEnter: () => {
      if (financeCountersStarted) return;
      financeCountersStarted = true;
      animateFinanceCounters();
    },
  });

  gsap.from('#viabilidad-financiera .viab-footnote', { y: 20, opacity: 0, duration: 0.01 });
  gsap.to('#viabilidad-financiera .viab-footnote', {
    scrollTrigger: { trigger: '#viabilidad-financiera', start: 'top 42%' },
    opacity: 1,
    y: 0,
    duration: 0.8,
    delay: 0.5,
    ease: 'power2.out',
  });

  // ─── SECCIÓN 14: RIESGOS ───
  gsap.to('#riesgos-etica .section-label', {
    scrollTrigger: { trigger: '#riesgos-etica', start: 'top 70%' },
    opacity: 1,
    duration: 0.8,
  });

  gsap.from('.risk-headline', { y: 20, opacity: 0, duration: 0.01 });
  gsap.to('.risk-headline', {
    scrollTrigger: { trigger: '#riesgos-etica', start: 'top 65%' },
    opacity: 1,
    y: 0,
    duration: 0.8,
    delay: 0.08,
  });

  gsap.from('#riskMajorCard', { y: 32, opacity: 0, scale: 0.96, duration: 0.01 });
  gsap.to('#riskMajorCard', {
    scrollTrigger: { trigger: '#riesgos-etica', start: 'top 55%' },
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.85,
    delay: 0.15,
    ease: 'power3.out',
  });

  gsap.from('#riesgos-etica .ethics-banner', { opacity: 0, scale: 0.88, y: 28, duration: 0.01 });
  gsap.to('#riesgos-etica .ethics-banner', {
    scrollTrigger: {
      trigger: '#riesgos-etica',
      start: 'top 38%',
      end: 'top 15%',
      scrub: 1,
    },
    opacity: 1,
    scale: 1,
    y: 0,
    ease: 'power2.out',
  });

  // ─── SECCIÓN 15: VALOR ───
  function resetValueTexts() {
    gsap.set('#valueText1', { opacity: 0, y: 56 });
    gsap.set('#valueText2', { opacity: 0, y: 56 });
  }

  resetValueTexts();

  gsap.timeline({
    scrollTrigger: {
      trigger: '#valor',
      start: 'top 50%',
      toggleActions: 'play none none reverse',
      onLeave: resetValueTexts,
      onLeaveBack: resetValueTexts,
    },
  })
    // 1. Entra "No mostramos datos."
    .to('#valueText1', { opacity: 1, y: 0, duration: 0.75, ease: 'power3.out' })
    // 2. Se mantiene visible
    .to({}, { duration: 1.6 })
    // 3. Sale hacia arriba mientras entra "Transformamos datos en decisiones."
    .to('#valueText1', { opacity: 0, y: -64, duration: 0.6, ease: 'power2.in' })
    .fromTo('#valueText2',
      { opacity: 0, y: 64 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' },
      '-=0.45'
    );

  // ─── SECCIÓN 16: ROADMAP ───
  gsap.to('#roadmap .section-label', {
    scrollTrigger: { trigger: '#roadmap', start: 'top 70%' },
    opacity: 1,
    duration: 0.8,
  });

  gsap.to('.roadmap-headline', {
    scrollTrigger: { trigger: '#roadmap', start: 'top 65%' },
    opacity: 1,
    duration: 0.8,
    delay: 0.08,
  });

  gsap.to('.roadmap-intro', {
    scrollTrigger: { trigger: '#roadmap', start: 'top 60%' },
    opacity: 1,
    duration: 0.9,
    delay: 0.15,
    ease: 'power2.out',
  });

  document.querySelectorAll('.roadmap-step').forEach((step, i) => {
    gsap.to(step, {
      scrollTrigger: { trigger: '#roadmap', start: 'top 52%' },
      opacity: 1,
      y: 0,
      duration: 0.55,
      delay: 0.3 + i * 0.15,
      ease: 'power3.out',
    });
  });

  document.querySelectorAll('.roadmap-connector').forEach((conn, i) => {
    gsap.to(conn, {
      scrollTrigger: { trigger: '#roadmap', start: 'top 50%' },
      opacity: 1,
      duration: 0.35,
      delay: 0.45 + i * 0.15,
      ease: 'power2.out',
    });
  });

  // ─── Fotos equipo (fallback iniciales) ───
  document.querySelectorAll('.team-photo img').forEach((img) => {
    const wrap = img.closest('.team-photo');
    const showFallback = () => wrap?.classList.add('no-photo');
    img.addEventListener('error', showFallback);
    if (img.complete && img.naturalHeight === 0) showFallback();
  });

  // ─── SECCIÓN FINAL: CIERRE + EQUIPO ───
  const finalLines = document.querySelectorAll('.final-line');
  const finalTeamMembers = document.querySelectorAll('.final-team-wrap .team-member');
  const FINAL_STEPS = 4;

  function resetFinal() {
    gsap.set('.final-line', { opacity: 0, y: 18, filter: 'blur(8px)' });
    gsap.set('.final-team-wrap', { opacity: 0, scale: 0.92 });
    gsap.set('#finalGlow', { opacity: 0, scale: 0.9 });
    gsap.set(finalTeamMembers, { opacity: 0, y: 20, scale: 0.92 });
  }

  resetFinal();

  const finalTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#final',
      start: 'top top',
      end: () => `+=${FINAL_STEPS * 100}%`,
      pin: true,
      pinSpacing: true,
      scrub: true,
      anticipatePin: 1,
      onEnter: () => {
        progressNav.classList.add('progress-nav-hidden');
      },
      onLeaveBack: () => {
        resetFinal();
        updateNavVisibility();
        syncActiveDotFromScroll();
      },
      invalidateOnRefresh: true,
    },
  });

  finalLines.forEach((line, i) => {
    finalTl.addLabel(`step${i}`, i);
    if (i > 0) {
      finalTl.to(finalLines[i - 1], {
        opacity: 0,
        y: -14,
        filter: 'blur(10px)',
        duration: 0.22,
      }, i);
    }
    finalTl.fromTo(line,
      { opacity: 0, y: 18, filter: 'blur(8px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.38, ease: 'power2.out', immediateRender: false },
      i + 0.04
    );
    finalTl.to({}, { duration: 0.72 }, i + 0.04);
  });

  finalTl.addLabel('step3', 3);
  finalTl.to(finalLines[2], {
    opacity: 0,
    y: -14,
    filter: 'blur(10px)',
    duration: 0.25,
  }, 3);
  finalTl.fromTo('.final-team-wrap',
    { opacity: 0, scale: 0.9 },
    { opacity: 1, scale: 1, duration: 0.55, ease: 'back.out(1.4)', immediateRender: false },
    3.08
  );
  finalTl.fromTo('#finalGlow',
    { opacity: 0, scale: 0.85 },
    { opacity: 1, scale: 1, duration: 0.65, ease: 'power2.out' },
    3.1
  );
  finalTl.fromTo(finalTeamMembers,
    { opacity: 0, y: 24, scale: 0.9 },
    { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.1, ease: 'power3.out', immediateRender: false },
    3.22
  );
  finalTl.to({}, { duration: 0.85 }, 3.22);

  const finalST = finalTl.scrollTrigger;

  // ─── Helpers ───
  function animatePipeline(sectionId, pipelineId) {
    const steps = document.querySelectorAll(`${pipelineId} .pipeline-step`);
    const arrows = document.querySelectorAll(`${pipelineId} .pipeline-arrow`);

    steps.forEach((step, i) => {
      gsap.to(step, {
        scrollTrigger: {
          trigger: sectionId,
          start: `top+=${i * 50} 55%`,
          toggleActions: 'play none none reverse',
        },
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: 'power3.out',
      });

      if (arrows[i]) {
        gsap.to(arrows[i], {
          scrollTrigger: {
            trigger: sectionId,
            start: `top+=${i * 50 + 25} 55%`,
            toggleActions: 'play none none reverse',
          },
          opacity: 1,
          duration: 0.3,
        });
      }
    });
  }

  gsap.utils.toArray('.section-label').forEach((label) => {
    gsap.from(label, { y: 20, opacity: 0, duration: 0.01 });
  });

  window.addEventListener('load', () => {
    ScrollTrigger.refresh();
    lenis.resize();
    syncActiveDotFromScroll();
    updateNavVisibility();
  });

  ScrollTrigger.addEventListener('refresh', () => {
    lenis.resize();
    syncActiveDotFromScroll();
  });

  // ─── Navegación con teclado ───
  const sectionEls = Array.from(document.querySelectorAll('.section'));
  let keyboardLock = false;

  function getCurrentSectionIndex() {
    return activeSectionIndex;
  }

  function scrollToStep(st, steps, stepIndex) {
    const progress = stepIndex / (steps - 1);
    const y = st.start + (st.end - st.start) * progress;
    lenis.scrollTo(y, { duration: 0.85 });
  }

  function getPinnedStep(st, steps) {
    if (!st || !st.isActive) return -1;
    return Math.round(st.progress * (steps - 1));
  }

  function goToSection(index) {
    if (index < 0 || index >= sectionEls.length || keyboardLock) return;
    keyboardLock = true;
    lenis.scrollTo(sectionEls[index], {
      offset: 0,
      duration: 1.3,
      onComplete: () => { keyboardLock = false; },
    });
  }

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const down = ['ArrowDown', 'PageDown', ' '].includes(e.key) && !(e.key === ' ' && e.shiftKey);
    const up = ['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);

    if (!down && !up) return;

    e.preventDefault();

    // Avanzar paso a paso dentro de sopa de letras
    if (sopaST && sopaST.isActive) {
      const step = getPinnedStep(sopaST, SOPA_STEPS);
      if (down && step < SOPA_STEPS - 1) {
        scrollToStep(sopaST, SOPA_STEPS, step + 1);
        return;
      }
      if (up && step > 0) {
        scrollToStep(sopaST, SOPA_STEPS, step - 1);
        return;
      }
      if (down && step >= SOPA_STEPS - 1) {
        lenis.scrollTo(document.getElementById('pregunta-impacto'), { duration: 1.1 });
        return;
      }
      if (up && step === 0) {
        lenis.scrollTo(sopaST.start - 1, { duration: 1.1 });
        return;
      }
    }

    // Avanzar paso a paso dentro de sección 5 (contexto)
    if (contextoST && contextoST.isActive) {
      const step = getPinnedStep(contextoST, CONTEXTO_STEPS);
      if (down && step < CONTEXTO_STEPS - 1) {
        scrollToStep(contextoST, CONTEXTO_STEPS, step + 1);
        return;
      }
      if (up && step > 0) {
        scrollToStep(contextoST, CONTEXTO_STEPS, step - 1);
        return;
      }
      if (down && step >= CONTEXTO_STEPS - 1) {
        lenis.scrollTo(problemaST.start, { duration: 1.1 });
        return;
      }
      if (up && step === 0) {
        lenis.scrollTo(contextoST.start - 1, { duration: 1.1 });
        return;
      }
    }

    // Avanzar paso a paso dentro de sección 6 (flujo)
    if (problemaST && problemaST.isActive) {
      const step = getPinnedStep(problemaST, PROBLEMA_STEPS);
      if (down && step < PROBLEMA_STEPS - 1) {
        scrollToStep(problemaST, PROBLEMA_STEPS, step + 1);
        return;
      }
      if (up && step > 0) {
        scrollToStep(problemaST, PROBLEMA_STEPS, step - 1);
        return;
      }
      if (down && step >= PROBLEMA_STEPS - 1) {
        const nextIdx = sectionEls.findIndex((s) => s.id === 'pregunta-ia');
        if (nextIdx >= 0) lenis.scrollTo(sectionEls[nextIdx], { duration: 1.1 });
        return;
      }
      if (up && step === 0) {
        lenis.scrollTo(problemaST.start - 1, { duration: 1.1 });
        return;
      }
    }

    // Avanzar paso a paso dentro del cierre
    if (finalST && finalST.isActive) {
      const step = getPinnedStep(finalST, FINAL_STEPS);
      if (down && step < FINAL_STEPS - 1) {
        scrollToStep(finalST, FINAL_STEPS, step + 1);
        return;
      }
      if (up && step > 0) {
        scrollToStep(finalST, FINAL_STEPS, step - 1);
        return;
      }
      if (up && step === 0) {
        lenis.scrollTo(finalST.start - 1, { duration: 1.1 });
        return;
      }
      if (down && step >= FINAL_STEPS - 1) return;
    }

    const current = getCurrentSectionIndex();
    goToSection(down ? current + 1 : current - 1);
  });

})();
