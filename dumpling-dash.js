const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');

let width = canvas.width;
let height = canvas.height;

// player
const player = {
  x: 80,
  y: height - 60,
  w: 48,
  h: 36,
  vy: 0,
  gravity: 0.7,        // lighter gravity for easier jumps
  jumpForce: -18,      // stronger jump
  grounded: true,
  canDoubleJump: true  // allow one mid-air jump
};

let obstacles = [];
let frame = 0;
let speed = 3; // slightly slower to make timing easier
let score = 0;
let running = true;

// parallax background layers
const mountains = [];
const trees = [];
const bushes = [];

function initBackground() {
  // create repeating elements spaced across the screen
  for (let i = 0; i < 6; i++) mountains.push({ x: i * 220, y: height - 140, scale: 1 + Math.random() * 0.6 });
  for (let i = 0; i < 10; i++) trees.push({ x: i * 120, y: height - 80, h: 40 + Math.random() * 30 });
  for (let i = 0; i < 14; i++) bushes.push({ x: i * 80, y: height - 40, w: 40 + Math.random() * 30 });
}

initBackground();

function spawn() {
  const h = 18 + Math.random() * 28; // slightly smaller obstacles
  obstacles.push({ x: width + 20, y: height - h - 20, w: 20 + Math.random() * 28, h, passed:false });
}

function update() {
  frame++;
  if (frame % 120 === 0) spawn(); // spawn less often
  // increase difficulty more slowly
  if (frame % 900 === 0) speed += 0.5;

  // background movement (parallax)
  mountains.forEach(m => {
    m.x -= 0.3 * speed;
    if (m.x < -260) m.x = width + Math.random() * 80;
  });
  trees.forEach(t => {
    t.x -= 0.6 * speed;
    if (t.x < -140) t.x = width + Math.random() * 60;
  });
  bushes.forEach(b => {
    b.x -= 1.0 * speed;
    if (b.x < -100) b.x = width + Math.random() * 40;
  });

  // player physics
  player.vy += player.gravity;
  player.y += player.vy;
  if (player.y + player.h >= height - 20) {
    player.y = height - 20 - player.h;
    player.vy = 0;
    player.grounded = true;
    player.canDoubleJump = true;
  } else {
    player.grounded = false;
  }

  // obstacles
  for (let i = obstacles.length -1; i >=0; i--) {
    const o = obstacles[i];
    o.x -= speed;
    if (!o.passed && o.x + o.w < player.x) {
      o.passed = true;
      score += 1;
    }
    // remove offscreen
    if (o.x + o.w < -50) obstacles.splice(i,1);
    // collision
    if (rectsOverlap(player, o)) {
      running = false;
    }
  }

  scoreEl.textContent = score;
}

function rectsOverlap(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function drawBackground() {
  // sky
  const g = ctx.createLinearGradient(0,0,0,height);
  g.addColorStop(0, '#e6fbfa');
  g.addColorStop(1, '#dff7f6');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,width,height - 20);

  // mountains (distant)
  mountains.forEach((m, idx) => {
    const baseY = m.y;
    const mx = m.x;
    const s = m.scale;
    ctx.fillStyle = '#c7e7e4';
    ctx.beginPath();
    ctx.moveTo(mx, baseY + 80 * s);
    ctx.lineTo(mx + 60 * s, baseY - 30 * s);
    ctx.lineTo(mx + 140 * s, baseY + 80 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e6f7f6';
    ctx.beginPath();
    ctx.moveTo(mx + 60 * s, baseY - 30 * s);
    ctx.lineTo(mx + 75 * s, baseY + 5 * s);
    ctx.lineTo(mx + 95 * s, baseY - 10 * s);
    ctx.closePath();
    ctx.fill();
  });

  // trees (mid)
  trees.forEach(t => {
    ctx.fillStyle = '#245e4a';
    // trunk
    ctx.fillRect(t.x + 8, t.y + 18, 8, 22);
    // foliage
    ctx.beginPath();
    ctx.fillStyle = '#2f8b6a';
    ctx.moveTo(t.x + 16, t.y);
    ctx.lineTo(t.x, t.y + t.h);
    ctx.lineTo(t.x + 32, t.y + t.h);
    ctx.closePath();
    ctx.fill();
  });

  // bushes (front)
  bushes.forEach(b => {
    ctx.fillStyle = '#4aa17f';
    roundRect(ctx, b.x, b.y, b.w, 18, 10);
  });
}

function draw() {
  // background
  drawBackground();
  // ground
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, height-20, width, 20);
  // player (dumpling)
  ctx.fillStyle = '#FCA5A5';
  roundRect(ctx, player.x, player.y, player.w, player.h, 8);
  ctx.fillStyle = '#fff';
  ctx.fillRect(player.x + 8, player.y + 10, 8, 6);
  ctx.fillRect(player.x + 32, player.y + 10, 8, 6);

  // obstacles
  ctx.fillStyle = '#334155';
  obstacles.forEach(o => roundRect(ctx, o.x, o.y, o.w, o.h, 6));

  if (!running) {
    ctx.fillStyle = 'rgba(2,6,23,0.6)';
    ctx.fillRect(0,0,width,height);
    ctx.fillStyle = '#fff';
    ctx.font = '28px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over — Press R to restart', width/2, height/2);
  }
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
  ctx.fill();
}

function loop(){
  if (running) update();
  draw();
  requestAnimationFrame(loop);
}

function reset(){
  obstacles = [];
  frame = 0;
  speed = 3;
  score = 0;
  running = true;
  player.y = height - 60;
  player.vy = 0;
  player.canDoubleJump = true;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    if (running) {
      if (player.grounded) {
        player.vy = player.jumpForce;
        player.grounded = false;
      } else if (player.canDoubleJump) {
        // give a smaller second jump
        player.vy = player.jumpForce * 0.75;
        player.canDoubleJump = false;
      }
    }
  }
  if (!running && e.key.toLowerCase() === 'r') {
    reset();
  }
});

// make canvas responsive visually but keep internal resolution same
function fitCanvas() {
  const maxW = Math.min(window.innerWidth - 40, 900);
  const scale = maxW / width;
  canvas.style.width = maxW + 'px';
  canvas.style.height = (height * scale) + 'px';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
loop();
