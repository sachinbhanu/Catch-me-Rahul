(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const scoreValueEl = document.getElementById('scoreValue');
  const bestValueEl = document.getElementById('bestValue');

  const ASSETS = {
    bird: 'bird.png',
    pole: 'pole.png',
    passSound: 'aahh.mp3',
    crashSound: 'ending.mp3',
    bgMusic: 'udatahifiru.mp3'
  };

  // Game constants
  let W = window.innerWidth;
  let H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;

  const BIRD_SCALE = Math.min(W, H) / 800;
  const BASE_SCREEN = 600; 
  const GRAVITY = 0.25 * (H / BASE_SCREEN); 
  const FLAP_STRENGTH = -3.5 * (H / BASE_SCREEN); 
  const BIRD_X = Math.round(W * 0.25);
  const PIPE_SPEED = 3 * (W / 1200);
  const PIPE_GAP_MIN = Math.round(H * 0.18);
  const PIPE_GAP_MAX = Math.round(H * 0.39);

  const PIPE_WIDTH = Math.round(W * 0.12);

  let birdImg = new Image();
  let poleImg = new Image();
  let passAudio = new Audio();
  let crashAudio = new Audio();
  let bgAudio = new Audio();

  let loaded = { bird: false, pole: false, audio: false };
  let gameRunning = false;
  let score = 0;
  let best = parseInt(localStorage.getItem('flappy_best') || '0', 10);

  bestValueEl.textContent = best;

  // Bird
  let bird = {
    x: BIRD_X,
    y: H / 2,
    width: 0,
    height: 0,
    vy: 0,
    rotation: 0
  };


  let pipes = []; // each: {x, topHeight, gap, width, passed}

  let spawnTimer = 0;
  const SPAWN_INTERVAL = 2100; // slower, more distance between poles

  let lastTime = 0;

  function loadAssets() {
    birdImg.src = ASSETS.bird;
    poleImg.src = ASSETS.pole;

    birdImg.onload = () => { loaded.bird = true; initSizes(); };
    poleImg.onload = () => { loaded.pole = true; };

    passAudio.src = ASSETS.passSound;
    crashAudio.src = ASSETS.crashSound;
    bgAudio.src = ASSETS.bgMusic;
    bgAudio.loop = true;
    bgAudio.volume = 0.6;
    passAudio.volume = 0.9;
    crashAudio.volume = 0.95;

    bgAudio.addEventListener('canplaythrough', () => {
      loaded.audio = true;
    });
  }

  function initSizes() {
    const base = Math.max(40, Math.min(120, Math.round(Math.min(W, H) * 0.08)));
    bird.width = birdImg.width > 0 ? Math.round(birdImg.width * (base / birdImg.height)) : base;
    bird.height = base;
  }

  // Resize handler
  function handleResize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    initSizes();
  }
  window.addEventListener('resize', handleResize);

  function startGame() {
    score = 0;
    scoreValueEl.textContent = score;
    pipes.length = 0;
    bird.x = BIRD_X;
    bird.y = H / 2;
    bird.vy = 0;
    spawnTimer = 0;
    lastTime = performance.now();
    gameRunning = true;
    overlay.style.display = 'none';

    try {
      bgAudio.currentTime = 0;
      bgAudio.play();
    } catch (err) {
      console.warn('Autoplay prevented, will play on next gesture.');
    }

    requestAnimationFrame(gameLoop);
  }

  // End game
  function endGame() {
    if (!gameRunning) return;
    gameRunning = false;

    crashAudio.currentTime = 0;
    crashAudio.play();

    try { bgAudio.pause(); } catch (e) {}

    if (score > best) {
      best = score;
      localStorage.setItem('flappy_best', best);
      bestValueEl.textContent = best;
    }

    overlay.style.display = 'flex';
    document.getElementById('title').textContent = `Game Over — Score: ${score}`;
    startBtn.textContent = 'Play Again';
  }

  // Spawn a pipe pair
  function spawnPipe() {
    const gap = Math.floor(Math.random() * (PIPE_GAP_MAX - PIPE_GAP_MIN + 1)) + PIPE_GAP_MIN;
    const minTop = Math.round(H * 0.08);
    const maxTop = H - gap - Math.round(H * 0.16);
    const topHeight = Math.floor(Math.random() * Math.max(1, (maxTop - minTop))) + minTop;
    const x = W + 40;
    pipes.push({
      x,
      topHeight,
      gap,
      width: PIPE_WIDTH,
      passed: false
    });
  }

  function update(dt) {
    // Bird physics
    bird.vy += GRAVITY * dt * 60; // multiply by ~60 to keep feel consistent
    bird.y += bird.vy * dt * 60;

    // rotation
    bird.rotation = Math.max(-0.8, Math.min(1.2, bird.vy / 18));

    // Spawn pipes
    spawnTimer += dt * 1000;
    const interval = Math.max(900, SPAWN_INTERVAL - score * 10);
    if (spawnTimer >= interval) {
      spawnTimer = 0;
      spawnPipe();
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= PIPE_SPEED * dt * 60;

      if (!p.passed && p.x + p.width < bird.x) {
        p.passed = true;
        score += 1;
        scoreValueEl.textContent = score;
        try { passAudio.currentTime = 0; passAudio.play(); } catch (e) {}
      }

      if (p.x + p.width < -100) pipes.splice(i, 1);

      // Collision detection: bird box slightly reduced
      const birdBox = {
        l: bird.x - bird.width * 0.4,
        r: bird.x + bird.width * 0.4,
        t: bird.y - bird.height * 0.45,
        b: bird.y + bird.height * 0.45
      };

      const pipeTop = { l: p.x, r: p.x + p.width, t: 0, b: p.topHeight };
      const pipeBottom = { l: p.x, r: p.x + p.width, t: p.topHeight + p.gap, b: H };

      if (rectIntersect(birdBox, pipeTop) || rectIntersect(birdBox, pipeBottom)) {
        endGame();
        return;
      }
    }

    // Ground collision
    if (bird.y + bird.height * 0.45 >= H - groundHeight()) {
      bird.y = H - groundHeight() - bird.height * 0.45;
      endGame();
    }
    // Ceiling clamp
    if (bird.y - bird.height * 0.45 <= 0) {
      bird.y = bird.height * 0.45;
      bird.vy = 0;
    }
  }

  function rectIntersect(a, b) {
    return !(a.l > b.r || a.r < b.l || a.t > b.b || a.b < b.t);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#8be3ff');
    skyGrad.addColorStop(0.6, '#66d9ff');
    skyGrad.addColorStop(1, '#9fe9ff');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    const sunX = W * 0.15;
    const sunY = H * 0.12;
    const sunRadius = Math.min(W, H) * 0.045;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 1, sunX, sunY, sunRadius * 1.6);
    sunGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    sunGrad.addColorStop(0.4, 'rgba(255,255,200,0.9)');
    sunGrad.addColorStop(1, 'rgba(255,255,200,0.0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius * 1.6, 0, Math.PI * 2);
    ctx.fill();

    drawCloud(W * 0.55, H * 0.15, 120);
    drawCloud(W * 0.78, H * 0.22, 90);

    drawGround();

    for (let p of pipes) {
      const topH = p.topHeight;
      const bottomY = p.topHeight + p.gap;

      ctx.save();
      ctx.translate(p.x + p.width / 2, topH / 2);
      ctx.scale(1, -1);
      ctx.drawImage(poleImg, -p.width / 2, -topH / 2, p.width, topH);
      ctx.restore();

      ctx.drawImage(poleImg, p.x, bottomY, p.width, H - bottomY - groundHeight() + 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 6;
      ctx.strokeRect(p.x, bottomY, p.width, H - bottomY - groundHeight() + 2);
    }

    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rotation);
    ctx.drawImage(birdImg, -bird.width / 2, -bird.height / 2, bird.width, bird.height);
    ctx.restore();
  }

  function drawCloud(cx, cy, size) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx - size * 0.35, cy, size * 0.4, 0, Math.PI * 2);
    ctx.arc(cx, cy - size * 0.15, size * 0.5, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.4, cy, size * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }

  function groundHeight() {
    return Math.round(H * 0.09);
  }

  function drawGround() {
    const gh = groundHeight();
    ctx.fillStyle = '#7bd65b';
    ctx.fillRect(0, H - gh, W, gh);

    ctx.fillStyle = '#5fb83f';
    ctx.fillRect(0, H - gh, W, gh * 0.25);

    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 16) {
      const y = H - gh + Math.sin(x * 0.06 + performance.now() / 600) * 2;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function gameLoop(ts) {
    if (!lastTime) lastTime = ts;
    const delta = Math.min(0.032, (ts - lastTime) / 1000);
    lastTime = ts;

    if (gameRunning) {
      update(delta);
      draw();
      requestAnimationFrame(gameLoop);
    } else {
      draw();
    }
  }

  function flap() {
    if (!gameRunning) {
      if (overlay.style.display !== 'none') startBtn.click();
      return;
    }
    bird.vy = FLAP_STRENGTH;
  }

  // Input handlers
  function onKeyDown(e) {
    if (e.code === 'ArrowUp' || e.code === 'Space') {
      e.preventDefault();
      flap();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // Mouse click / touch to flap
  function onPointerDown(e) {
    e.preventDefault();
    flap();
  }
  window.addEventListener('mousedown', onPointerDown);
  window.addEventListener('touchstart', onPointerDown, { passive: false });

  window.addEventListener('keydown', function(e) {
    if (['ArrowUp', 'ArrowDown', ' ', 'Space'].indexOf(e.key) > -1) {
      e.preventDefault();
    }
  }, { passive: false });

  // Start button
  startBtn.addEventListener('click', () => {
    document.getElementById('title').textContent = 'Flappy Bird — Keyboard / Click';
    startBtn.textContent = 'Start Game';
    try {
      bgAudio.currentTime = 0;
      bgAudio.play();
      bgAudio.pause();
    } catch (e) {}
    startGame();
  });

  // Preload assets
  loadAssets();

  function loadingLoop() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#66d9ff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '28px Arial';
    ctx.fillText('Loading assets...', 24, 42);

    if (loaded.bird && loaded.pole) {
      ctx.drawImage(birdImg, 80, 80, birdImg.width * 0.8, birdImg.height * 0.8);
      ctx.drawImage(poleImg, 220, 40, 120, 360);
    }

    requestAnimationFrame(loadingLoop);
  }
  loadingLoop();

})();
