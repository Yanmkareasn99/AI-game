const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hud = {
  phase: document.getElementById('phaseLabel'),
  time: document.getElementById('timeLeft'),
  health: document.getElementById('healthLabel'),
  coins: document.getElementById('coinsLabel'),
  bullets: document.getElementById('bulletsLabel'),
  weapon: document.getElementById('weaponLabel'),
};

const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlayText');
const restartButton = document.getElementById('restartButton');

const W = canvas.width;
const H = canvas.height;
const GROUND_Y = 438;
const DAY_SECONDS = 42;
const NIGHT_SECONDS = 48;
const PLAYER_SPEED = 245;
const PLAYER_RADIUS = 18;

const keys = new Set();
let lastTime = 0;
let game;

function resetGame() {
  game = {
    phase: 'day',
    phaseTimer: DAY_SECONDS,
    health: 100,
    coins: 0,
    bullets: 0,
    weaponLevel: 1,
    dayCount: 1,
    spawnTimer: 0,
    pickupTimer: 0,
    shotCooldown: 0,
    dragging: null,
    gameOver: false,
    messageTimer: 4,
    message: 'Day 1: gather supplies and move cover before sunset.',
    player: { x: W / 2, y: GROUND_Y - PLAYER_RADIUS, vx: 0, vy: 0, facing: 1 },
    pickups: [],
    bulletsFired: [],
    monsters: [],
    obstacles: [
      { x: 220, y: GROUND_Y - 78, w: 50, h: 78 },
      { x: 455, y: GROUND_Y - 104, w: 64, h: 104 },
      { x: 700, y: GROUND_Y - 72, w: 54, h: 72 },
    ],
  };
  overlay.classList.add('hidden');
  updateHud();
}

function switchPhase(nextPhase) {
  game.phase = nextPhase;
  game.phaseTimer = nextPhase === 'day' ? DAY_SECONDS : NIGHT_SECONDS;
  game.pickups = [];
  game.dragging = null;

  if (nextPhase === 'day') {
    game.dayCount += 1;
    game.monsters = [];
    game.message = `Day ${game.dayCount}: monsters retreat. Restock and rebuild.`;
  } else {
    game.message = 'Night falls: obstacles lock in place. Survive until sunrise.';
  }
  game.messageTimer = 4;
}

function update(dt) {
  if (game.gameOver) return;

  game.phaseTimer -= dt;
  game.shotCooldown = Math.max(0, game.shotCooldown - dt);
  game.messageTimer = Math.max(0, game.messageTimer - dt);

  if (game.phaseTimer <= 0) {
    switchPhase(game.phase === 'day' ? 'night' : 'day');
  }

  movePlayer(dt);

  if (game.dragging) {
    game.dragging.x = clamp(game.player.x - game.dragging.w / 2, 20, W - game.dragging.w - 20);
    game.dragging.y = clamp(game.player.y - game.dragging.h / 2, 230, GROUND_Y - game.dragging.h);
  }

  if (game.phase === 'day') {
    spawnPickups(dt);
  } else {
    spawnMonsters(dt);
  }

  updatePickups();
  updateShots(dt);
  updateMonsters(dt);
  updateHud();
}

function movePlayer(dt) {
  const p = game.player;
  const previous = { x: p.x, y: p.y };
  let xDir = 0;
  let yDir = 0;
  if (keys.has('arrowleft') || keys.has('a')) xDir -= 1;
  if (keys.has('arrowright') || keys.has('d')) xDir += 1;
  if (keys.has('arrowup') || keys.has('w')) yDir -= 1;
  if (keys.has('arrowdown') || keys.has('s')) yDir += 1;

  const length = Math.hypot(xDir, yDir) || 1;
  p.vx = (xDir / length) * PLAYER_SPEED;
  p.vy = (yDir / length) * PLAYER_SPEED;
  if (xDir !== 0) p.facing = Math.sign(xDir);

  p.x = clamp(p.x + p.vx * dt, PLAYER_RADIUS + 10, W - PLAYER_RADIUS - 10);
  p.y = clamp(p.y + p.vy * dt, 250, GROUND_Y - PLAYER_RADIUS);

  if (!game.dragging) {
    for (const o of game.obstacles) {
      if (circleRectCollision(p.x, p.y, PLAYER_RADIUS, o)) {
        p.x = previous.x;
        p.y = previous.y;
        break;
      }
    }
  }
}

function spawnPickups(dt) {
  game.pickupTimer -= dt;
  if (game.pickupTimer > 0) return;

  const kind = Math.random() < 0.58 ? 'coin' : 'bullet';
  game.pickups.push({
    kind,
    x: rand(60, W - 60),
    y: rand(GROUND_Y - 150, GROUND_Y - 35),
    r: kind === 'coin' ? 10 : 8,
    bob: rand(0, Math.PI * 2),
  });
  game.pickupTimer = rand(1.2, 2.4);
}

function spawnMonsters(dt) {
  game.spawnTimer -= dt;
  if (game.spawnTimer > 0) return;

  const side = Math.random() < 0.5 ? -1 : 1;
  const nightPressure = 1 + game.dayCount * 0.08;
  game.monsters.push({
    x: side < 0 ? -35 : W + 35,
    y: GROUND_Y - 19,
    side,
    r: 20,
    speed: rand(48, 76) * nightPressure,
    hp: 2 + Math.floor(game.dayCount / 2),
    damageTimer: 0,
  });
  game.spawnTimer = Math.max(0.65, rand(1.35, 2.25) - game.dayCount * 0.08);
}

function updatePickups() {
  game.pickups = game.pickups.filter((pickup) => {
    if (distance(game.player.x, game.player.y, pickup.x, pickup.y) < PLAYER_RADIUS + pickup.r) {
      if (pickup.kind === 'coin') game.coins += 1;
      if (pickup.kind === 'bullet') game.bullets += 3;
      return false;
    }
    return true;
  });
}

function updateShots(dt) {
  for (const shot of game.bulletsFired) {
    shot.x += shot.vx * dt;
    shot.life -= dt;
  }

  for (const shot of game.bulletsFired) {
    for (const monster of game.monsters) {
      if (monster.dead) continue;
      if (distance(shot.x, shot.y, monster.x, monster.y) < monster.r + 5) {
        monster.hp -= shot.damage;
        shot.life = 0;
        if (monster.hp <= 0) monster.dead = true;
      }
    }
  }

  game.bulletsFired = game.bulletsFired.filter((shot) => shot.life > 0 && shot.x > -30 && shot.x < W + 30);
  game.monsters = game.monsters.filter((monster) => !monster.dead);
}

function updateMonsters(dt) {
  const p = game.player;

  for (const monster of game.monsters) {
    monster.damageTimer = Math.max(0, monster.damageTimer - dt);
    const targetDir = Math.sign(p.x - monster.x) || monster.side * -1;
    monster.x += targetDir * monster.speed * dt;

    for (const o of game.obstacles) {
      if (circleRectCollision(monster.x, monster.y, monster.r, o)) {
        monster.x -= targetDir * monster.speed * dt;
        monster.speed *= 0.985;
      }
    }

    const hiddenByObstacle = game.obstacles.some((o) => p.y > o.y - 18 && p.x > o.x - 10 && p.x < o.x + o.w + 10 && monster.x * targetDir < centerX(o) * targetDir);
    if (!hiddenByObstacle && distance(monster.x, monster.y, p.x, p.y) < monster.r + PLAYER_RADIUS + 5 && monster.damageTimer === 0) {
      game.health -= 10;
      monster.damageTimer = 0.75;
      game.message = 'A monster found you in the dark.';
      game.messageTimer = 2;
    }
  }

  if (game.health <= 0) endGame();
}

function shoot() {
  if (game.gameOver || game.phase !== 'night' || game.bullets <= 0 || game.shotCooldown > 0) return;

  game.bullets -= 1;
  game.shotCooldown = Math.max(0.16, 0.42 - game.weaponLevel * 0.055);
  game.bulletsFired.push({
    x: game.player.x + game.player.facing * 22,
    y: game.player.y - 10,
    vx: game.player.facing * (560 + game.weaponLevel * 40),
    damage: 1 + Math.floor(game.weaponLevel / 2),
    life: 1.5,
  });
}

function toggleDragObstacle() {
  if (game.phase !== 'day' || game.gameOver) return;

  if (game.dragging) {
    game.dragging = null;
    return;
  }

  const nearest = game.obstacles.find((o) => Math.abs(centerX(o) - game.player.x) < 62);
  if (nearest) game.dragging = nearest;
}

function upgradeWeapon() {
  if (game.gameOver) return;
  const cost = game.weaponLevel * 5;
  if (game.coins >= cost) {
    game.coins -= cost;
    game.weaponLevel += 1;
    game.message = `Pistol upgraded to level ${game.weaponLevel}.`;
  } else {
    game.message = `Need ${cost} coins for the next pistol upgrade.`;
  }
  game.messageTimer = 2.5;
}

function endGame() {
  game.gameOver = true;
  hud.health.textContent = '0';
  overlayText.textContent = `You survived until Day ${game.dayCount}. Collect better supplies and build stronger cover next time.`;
  overlay.classList.remove('hidden');
}

function draw() {
  const night = game.phase === 'night';
  drawBackdrop(night);
  drawPickups();
  drawObstacles();
  drawPlayer();
  drawShots();
  drawMonsters();
  drawForeground(night);
  drawMessage();
}

function drawBackdrop(night) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, night ? '#050507' : '#1b1b1b');
  sky.addColorStop(0.68, night ? '#090909' : '#101010');
  sky.addColorStop(1, '#020202');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = night ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.arc(night ? 800 : 150, 90, night ? 34 : 42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#050505';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(W, GROUND_Y);
  ctx.stroke();
}

function drawPickups() {
  if (game.phase !== 'day') return;
  for (const pickup of game.pickups) {
    const y = pickup.y + Math.sin(performance.now() / 240 + pickup.bob) * 4;
    ctx.save();
    ctx.shadowColor = pickup.kind === 'coin' ? '#d9d16b' : '#8fb4ff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = pickup.kind === 'coin' ? '#d9d16b' : '#8fb4ff';
    if (pickup.kind === 'coin') {
      ctx.beginPath();
      ctx.arc(pickup.x, y, pickup.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(pickup.x - 2, y - 6, 4, 12);
    } else {
      ctx.fillRect(pickup.x - 4, y - 12, 8, 24);
      ctx.fillStyle = '#d8e4ff';
      ctx.fillRect(pickup.x - 3, y - 14, 6, 5);
    }
    ctx.restore();
  }
}

function drawObstacles() {
  for (const o of game.obstacles) {
    ctx.fillStyle = game.dragging === o ? '#3a3a3a' : '#181818';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = game.dragging === o ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)';
    ctx.strokeRect(o.x, o.y, o.w, o.h);
  }
}

function drawPlayer() {
  const p = game.player;
  ctx.strokeStyle = '#eeeeee';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  drawStickFigure(p.x, p.y, PLAYER_RADIUS, p.facing);

  ctx.strokeStyle = '#bdbdbd';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(p.x + p.facing * 8, p.y - 18);
  ctx.lineTo(p.x + p.facing * 30, p.y - 16);
  ctx.stroke();
}

function drawStickFigure(x, y, r, facing) {
  ctx.beginPath();
  ctx.arc(x, y - 38, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 28);
  ctx.lineTo(x, y - 5);
  ctx.lineTo(x - 12, y + 18);
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x + 12, y + 18);
  ctx.moveTo(x, y - 20);
  ctx.lineTo(x + facing * 20, y - 10);
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x - facing * 16, y - 7);
  ctx.stroke();
}

function drawShots() {
  ctx.fillStyle = '#f7f0a2';
  for (const shot of game.bulletsFired) {
    ctx.fillRect(shot.x - 7, shot.y - 2, 14, 4);
  }
}

function drawMonsters() {
  for (const monster of game.monsters) {
    ctx.fillStyle = '#050505';
    ctx.strokeStyle = '#4b4b4b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(monster.x, monster.y - 26, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(monster.x, monster.y - 10);
    ctx.lineTo(monster.x - 20, monster.y + 18);
    ctx.lineTo(monster.x + 20, monster.y + 18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath();
    ctx.arc(monster.x - 6, monster.y - 28, 2, 0, Math.PI * 2);
    ctx.arc(monster.x + 6, monster.y - 28, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawForeground(night) {
  if (!night) return;
  const vignette = ctx.createRadialGradient(game.player.x, game.player.y - 20, 75, game.player.x, game.player.y - 20, 460);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.74)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

function drawMessage() {
  if (game.messageTimer <= 0) return;
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.fillRect(190, 24, W - 380, 44);
  ctx.fillStyle = '#ededed';
  ctx.font = '18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(game.message, W / 2, 52);
}

function updateHud() {
  hud.phase.textContent = game.phase === 'day' ? `Day ${game.dayCount}` : `Night ${game.dayCount}`;
  hud.time.textContent = Math.max(0, Math.ceil(game.phaseTimer));
  hud.health.textContent = Math.max(0, Math.ceil(game.health));
  hud.coins.textContent = game.coins;
  hud.bullets.textContent = game.bullets;
  hud.weapon.textContent = `Lv. ${game.weaponLevel}`;
}

function loop(timestamp) {
  const dt = Math.min(0.033, (timestamp - lastTime) / 1000 || 0);
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function centerX(rect) {
  return rect.x + rect.w / 2;
}

function circleRectCollision(cx, cy, radius, rect) {
  const nearestX = clamp(cx, rect.x, rect.x + rect.w);
  const nearestY = clamp(cy, rect.y, rect.y + rect.h);
  return distance(cx, cy, nearestX, nearestY) < radius;
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (key === ' ') {
    event.preventDefault();
    shoot();
  }
  if (key === 'e') toggleDragObstacle();
  if (key === 'u') upgradeWeapon();
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
});

restartButton.addEventListener('click', resetGame);

resetGame();
requestAnimationFrame(loop);
