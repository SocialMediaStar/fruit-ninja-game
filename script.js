const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const overlayTitleImg = document.querySelector('.overlay .title');
const startBtn = document.getElementById('startBtn');
const introTextEl = document.getElementById('introText');
const scoreMsgEl = document.getElementById('scoreMsg');
const finalWrapEl = document.getElementById('final');
const finalScoreEl = document.getElementById('finalScore');
const scoreEl = document.getElementById('score');
const livesIconsEl = document.getElementById('livesIcons');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const getAllSoundToggleBtns = () => Array.from(document.querySelectorAll('.sound-toggle'));

// Reduce rendering scale on mobile for performance/battery
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let devicePixelRatioTarget = Math.max(isMobile ? 1.5 : 2, window.devicePixelRatio || 1);
let canvasScale = 1;
let cssWidth = 0;
let cssHeight = 0;

function resizeCanvas() {
  cssWidth = window.innerWidth;
  cssHeight = window.innerHeight;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  canvasScale = devicePixelRatioTarget;
  canvas.width = Math.floor(cssWidth * canvasScale);
  canvas.height = Math.floor(cssHeight * canvasScale);
  ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const TAU = Math.PI * 2;

function rand(min, max) { return Math.random() * (max - min) + min; }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Weighted choice helper: returns an element from arr based on weights
function weightedChoice(arr, weightFn) {
  const weights = arr.map(weightFn);
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += Math.max(0, weights[i]);
  if (total <= 0) return choice(arr);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

// Sprites
const fruitSpriteNames = [
  '1.png','2.png','3.png','b1.png','b2.png','b3.png','c1.png','c2.png','c3.png','c4.png'
];
const imageCache = new Map();
function getImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const img = new Image();
  img.src = `fruits/${src}`;
  imageCache.set(src, img);
  return img;
}

// Bomb image
const bombImg = new Image();
bombImg.src = 'bomb.png';

// Tuning
const GRAVITY_FRUIT = 900;
const GRAVITY_BOMB = 900;
const GRAVITY_PARTICLE = 1200;

// Difficulty-based scaling helpers (progressively speed up gameplay)
function difficultyScale(perUnit = 0.12, cap = 2.0) {
  // Returns a multiplier that grows with difficulty but stays bounded
  return Math.min(1 + difficulty * perUnit, cap);
}
function currentFruitGravity() { return GRAVITY_FRUIT * difficultyScale(0.12, 2.0); }
function currentBombGravity() { return GRAVITY_BOMB * difficultyScale(0.12, 2.0); }
function currentParticleGravity() { return GRAVITY_PARTICLE * difficultyScale(0.10, 1.8); }

// Audio
const bgm = new Audio('sounds/BACKGROUND/Revenge and Thunder.mp3');
bgm.loop = true;
bgm.volume = 0.25;
let bgmStarted = false;
function ensureBgm() {
  if (bgmStarted) return;
  bgmStarted = true;
  bgm.currentTime = 0;
  bgm.play().catch(() => {});
}

const sliceSounds = [
  'sounds/SLICE/Axe Slash 1/Axe Slash 1.mp3',
  'sounds/SLICE/Quick Slice-Sharp .mp3',
  'sounds/SLICE/GunBullet 6084_27_2.wav',
  'sounds/SLICE/FruitVegetableImpacts_RDEHk_12.wav'
];

const splashSounds = [
  'sounds/SPLASH/Big Splash in Water SFX/Splash_big.wav'
];

function playRandom(arr, vol = 0.7, rateMin = 0.95, rateMax = 1.08) {
  if (!arr.length) return;
  const src = choice(arr);
  const a = new Audio(src);
  a.volume = muted ? 0 : vol;
  a.playbackRate = rand(rateMin, rateMax);
  a.currentTime = 0;
  a.play().catch(() => {});
}

let muted = false;
function setMuted(next) {
  muted = next;
  bgm.muted = muted;
  for (const btn of getAllSoundToggleBtns()) {
    btn.setAttribute('aria-pressed', String(muted));
    btn.textContent = muted ? 'Sound on' : 'Sound off';
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = rand(-2, 2);
    this.vy = rand(-2, 0);
    this.life = rand(0.35, 0.65);
    this.color = color;
    this.size = rand(2, 4);
  }
  update(dt) {
    this.vy += currentParticleGravity() * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, TAU);
    ctx.fill();
  }
}

class BladeTrail {
  constructor() {
    this.points = [];
    this.maxPoints = 20;
  }
  add(x, y) {
    this.points.push({ x, y, t: performance.now() });
    if (this.points.length > this.maxPoints) this.points.shift();
  }
  reset() {
    this.points.length = 0;
  }
  draw() {
    if (this.points.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < this.points.length; i++) {
      const p0 = this.points[i - 1];
      const p1 = this.points[i];
      const age = (performance.now() - p1.t) / 300;
      const alpha = Math.max(0, 1 - age);
      if (alpha <= 0) continue;
      ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
      ctx.lineWidth = 8 * alpha + 2;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }
}

class Fruit {
  constructor(x, y, vx, vy, spriteName) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.radius = rand(44, 72);
    this.spriteName = spriteName;
    this.image = getImage(spriteName);
    this.split = false;
    this.alive = true;
    this.hasEnteredScreen = false;
    this.rotation = rand(-Math.PI, Math.PI);
    this.spin = rand(-2, 2);
    this.scale = 1;
    this.particleColor = this.pickParticleColor(spriteName);
  }
  pickParticleColor(name) {
    if (name.startsWith('b')) return '#ffe066'; // banana-ish
    if (name.startsWith('c')) return '#ff922b'; // citrus-ish
    return '#ff6b6b'; // berries/red default
  }
  update(dt) {
    if (!this.alive) return;
    this.vy += currentFruitGravity() * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.spin * dt;
    if (!this.hasEnteredScreen && this.y + this.radius < cssHeight) {
      this.hasEnteredScreen = true;
    }
    if (this.hasEnteredScreen && this.y - this.radius > cssHeight) {
      this.alive = false;
      if (!this.split) loseLife();
    }
  }
  draw() {
    if (!this.alive) return;
    const img = this.image;
    const r = this.radius;
    if (img && img.complete) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      const size = r * 2 * this.scale;
      ctx.drawImage(img, -size/2, -size/2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, TAU);
      ctx.fill();
    }
  }
}

class Bomb {
  constructor(x, y, vx, vy) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.radius = 66;
    this.alive = true;
    this.spin = rand(-3, 3);
    this.angle = 0;
  }
  update(dt) {
    if (!this.alive) return;
    this.vy += currentBombGravity() * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.spin * dt;
    if (this.y - this.radius > cssHeight) this.alive = false;
  }
  draw() {
    if (!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (bombImg.complete && bombImg.naturalWidth > 0 && bombImg.naturalHeight > 0) {
      // Preserve intrinsic aspect ratio of bomb.png
      const targetHeight = this.radius * 2;
      const aspect = bombImg.naturalWidth / bombImg.naturalHeight;
      const targetWidth = targetHeight * aspect;
      ctx.drawImage(bombImg, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
    } else {
      ctx.fillStyle = '#2b2f3a';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e84e4e';
      ctx.fillRect(-4, -this.radius - 8, 8, 12);
    }
    ctx.restore();
  }
}

let fruits = [];
let bombs = [];
let particles = [];
let score = 0;
let lives = 3;
let running = false;
let spawnTimer = 0;
let difficulty = 1;
const defaultIntro = 'Mis ei mahu pitsale ega kokteili peale, peab jõudma gini sisse! Slici koriandrid, greibid ja basiilikud ribadeks enne, kui pizzakokk need komposti saadab. Aga ole valvel – suure tükeldamise hoos võib lauale sattuda ka mõni ginipudel.';

const blade = new BladeTrail();
let isPointerDown = false;
let lastPointer = { x: 0, y: 0 };
let pointerAngle = 0;
let pointerX = 0;
let pointerY = 0;
const katanaImg = new Image();
katanaImg.src = 'katana.png';

function resetGame() {
  fruits = [];
  bombs = [];
  particles = [];
  score = 0;
  lives = 3;
  difficulty = 1;
  scoreEl.textContent = String(score);
  renderLives();
  if (introTextEl) introTextEl.textContent = defaultIntro;
  if (scoreMsgEl) scoreMsgEl.textContent = '';
  if (finalWrapEl) finalWrapEl.style.display = 'none';
}

function loseLife() {
  lives -= 1;
  renderLives(true);
  canvas.classList.remove('shake');
  void canvas.offsetWidth;
  canvas.classList.add('shake');
  if (lives <= 0) {
    playRandom(splashSounds, 0.6, 0.95, 1.05);
    gameOver();
  }
}

function renderLives(blinkLast = false) {
  if (!livesIconsEl) return;
  livesIconsEl.innerHTML = '';
  const count = Math.max(0, Math.min(3, lives));
  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.src = 'solar_heart-bold.svg';
    img.alt = 'life';
    img.className = 'life-icon' + (blinkLast && i === count - 1 ? ' life-blink' : '');
    livesIconsEl.appendChild(img);
  }
}

function gameOver() {
  running = false;
  overlay.style.display = 'flex';
  if (introTextEl) introTextEl.textContent = 'Gin on valmis ja kõik köögijäägid on ajaloos – legend räägib, et baarmen nimetas sind ‘ginisamuraiks’';
  if (scoreMsgEl) scoreMsgEl.textContent = '';
  if (finalWrapEl) finalWrapEl.style.display = 'flex';
  if (finalScoreEl) finalScoreEl.textContent = String(score);
  startBtn.textContent = 'one more round ?';
}

function spawnWave() {
  const base = 1;
  const maxExtra = 2; // fewer at start
  // Increase count slowly with difficulty
  const count = Math.floor(rand(base, base + Math.min(maxExtra, 1 + difficulty * 0.6)));
  for (let i = 0; i < count; i++) {
    // 1:1 ratio with fruit: 50% chance to spawn a bomb
    const isBomb = Math.random() < 0.5;
    const margin = 100;
    const x = rand(margin, Math.max(margin + 1, cssWidth - margin));
    const y = cssHeight + rand(40, 120);
    // Target an apex between ~20% and ~55% of screen height
    const apexY = rand(cssHeight * 0.2, cssHeight * 0.55);
    const rise = Math.max(80, (y - apexY));
    // v^2 = u^2 + 2as → u = -sqrt(2 * g * rise)
    const vy = -Math.sqrt(2 * currentFruitGravity() * rise);
    // Horizontal velocity scales with screen width; keep relatively calm
    const widthScale = Math.max(0.9, Math.min(1.8, cssWidth / 430));
    const vx = rand(-180, 180) * widthScale * difficultyScale(0.08, 1.6);
    if (isBomb) {
      bombs.push(new Bomb(x, y, vx, vy));
    } else {
      // Prefer apples more often (assume '1.png' is apple)
      const spriteName = weightedChoice(fruitSpriteNames, (name) => name === '1.png' ? 4 : 1);
      fruits.push(new Fruit(x, y, vx, vy, spriteName));
    }
  }
}

function lineIntersectsCircle(p0, p1, cx, cy, r) {
  const acx = cx - p0.x;
  const acy = cy - p0.y;
  const abx = p1.x - p0.x;
  const aby = p1.y - p0.y;
  const ab2 = abx*abx + aby*aby;
  const acab = acx*abx + acy*aby;
  let t = acab / ab2;
  t = Math.max(0, Math.min(1, t));
  const hx = p0.x + abx * t - cx;
  const hy = p0.y + aby * t - cy;
  return hx*hx + hy*hy <= r*r;
}

function handleSlice(p0, p1) {
  for (const fruit of fruits) {
    if (!fruit.alive || fruit.split) continue;
    if (lineIntersectsCircle(p0, p1, fruit.x, fruit.y, fruit.radius)) {
      fruit.split = true;
      fruit.alive = false;
      playRandom(sliceSounds, 0.55, 0.95, 1.1);
      score += 1;
      scoreEl.textContent = String(score);
      for (let i = 0; i < 20; i++) {
        particles.push(new Particle(fruit.x, fruit.y, fruit.particleColor));
      }
    }
  }
  for (const bomb of bombs) {
    if (!bomb.alive) continue;
    if (lineIntersectsCircle(p0, p1, bomb.x, bomb.y, bomb.radius)) {
      bomb.alive = false;
      for (let i = 0; i < 35; i++) particles.push(new Particle(bomb.x, bomb.y, '#ff8a8a'));
      // Cutting a bomb costs one life instead of instant game over
      loseLife();
    }
  }
}

function onPointerDown(x, y) {
  isPointerDown = true;
  lastPointer.x = x; lastPointer.y = y;
  blade.reset();
  blade.add(x, y);
  pointerX = x; pointerY = y;
}
function onPointerMove(x, y) {
  if (!isPointerDown) return;
  blade.add(x, y);
  handleSlice(lastPointer, { x, y });
  pointerAngle = Math.atan2(y - lastPointer.y, x - lastPointer.x);
  pointerX = x; pointerY = y;
  lastPointer.x = x; lastPointer.y = y;
}
function onPointerUp() { isPointerDown = false; }

canvas.addEventListener('mousedown', (e) => { ensureBgm(); onPointerDown(e.offsetX, e.offsetY); });
canvas.addEventListener('mousemove', (e) => {
  if (!isPointerDown) return;
  onPointerMove(e.offsetX, e.offsetY);
});
canvas.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('mouseleave', onPointerUp);

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  ensureBgm();
  const t = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  onPointerDown(t.clientX - rect.left, t.clientY - rect.top);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  onPointerMove(t.clientX - rect.left, t.clientY - rect.top);
}, { passive: false });
canvas.addEventListener('touchend', (e) => { e.preventDefault(); onPointerUp(); }, { passive: false });
canvas.addEventListener('touchcancel', (e) => { e.preventDefault(); onPointerUp(); }, { passive: false });

startBtn.addEventListener('click', () => {
  resetGame();
  overlay.style.display = 'none';
  running = true;
  // Preload a few images to avoid first-frame blanks
  for (const n of fruitSpriteNames) getImage(n);
  // Preload bomb image
  void bombImg.width;
  // Start background music (after user gesture)
  ensureBgm();
});

// If a sound toggle exists (older UI), keep it working; otherwise, ignore
// Wire up any sound toggle buttons present on the page
function wireSoundButtons() {
  const buttons = getAllSoundToggleBtns();
  for (const btn of buttons) {
    const handler = (e) => {
      e.stopPropagation();
      setMuted(!muted);
      ensureBgm();
    };
    btn.addEventListener('click', handler);
  }
}
wireSoundButtons();

let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - prev) / 1000);
  prev = now;

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (running) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnWave();
      // Spawn faster as difficulty scales
      const spawnSpeed = Math.sqrt(0.7 + difficulty * 0.16);
      spawnTimer = rand(0.8, 1.35) / spawnSpeed;
      // Increase difficulty slightly faster over time
      difficulty += 0.02;
    }

    for (const f of fruits) f.update(dt);
    for (const b of bombs) b.update(dt);
    for (const p of particles) p.update(dt);
    particles = particles.filter(p => p.life > 0);
    fruits = fruits.filter(f => f.alive);
    bombs = bombs.filter(b => b.alive);
  }

  for (const f of fruits) f.draw();
  for (const b of bombs) b.draw();
  for (const p of particles) p.draw();
  blade.draw();

  // Draw katana following the pointer (preserve aspect ratio)
  if (isPointerDown && katanaImg.complete && katanaImg.naturalWidth > 0 && katanaImg.naturalHeight > 0) {
    const targetHeight = 160; // visual height in CSS px
    const aspectRatio = katanaImg.naturalWidth / katanaImg.naturalHeight;
    const drawWidth = targetHeight * aspectRatio;
    const drawHeight = targetHeight;
    ctx.save();
    ctx.translate(pointerX, pointerY);
    ctx.rotate(pointerAngle);
    ctx.drawImage(katanaImg, -drawWidth * 0.1, -drawHeight * 0.5, drawWidth, drawHeight);
    ctx.restore();
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);


// Also start BGM on early user interaction on the title screen
['pointerdown','touchstart','keydown'].forEach((evt) => {
  document.addEventListener(evt, ensureBgm, { once: true, passive: true });
});

// Parallax effect for title image on the start screen
if (overlay && overlayTitleImg) {
  let parallaxX = 0;
  let parallaxY = 0;
  let targetX = 0;
  let targetY = 0;
  const strength = 14; // px offset at edges
  const damp = 0.12; // smoothing

  function updateParallax() {
    parallaxX += (targetX - parallaxX) * damp;
    parallaxY += (targetY - parallaxY) * damp;
    overlayTitleImg.style.transform = `translate3d(${parallaxX}px, ${parallaxY}px, 0)`;
    if (overlay.style.display !== 'none') requestAnimationFrame(updateParallax);
  }

  function setTargetFromPos(x, y) {
    const rect = overlay.getBoundingClientRect();
    const nx = (x - rect.left) / rect.width - 0.5; // -0.5..0.5
    const ny = (y - rect.top) / rect.height - 0.5;
    targetX = -nx * strength;
    targetY = -ny * strength;
  }

  overlay.addEventListener('mousemove', (e) => {
    setTargetFromPos(e.clientX, e.clientY);
  });
  overlay.addEventListener('touchmove', (e) => {
    const t = e.changedTouches[0];
    setTargetFromPos(t.clientX, t.clientY);
  }, { passive: true });
  overlay.addEventListener('mouseenter', (e) => {
    setTargetFromPos(e.clientX, e.clientY);
    requestAnimationFrame(updateParallax);
  });
  overlay.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    setTargetFromPos(t.clientX, t.clientY);
    requestAnimationFrame(updateParallax);
  }, { passive: true });
  // Reset when starting the game
  startBtn.addEventListener('click', () => {
    targetX = targetY = parallaxX = parallaxY = 0;
    overlayTitleImg.style.transform = 'translate3d(0,0,0)';
  });
}


