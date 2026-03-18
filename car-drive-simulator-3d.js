const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mainMenu = document.getElementById('mainMenu');
const menuHome = document.getElementById('menuHome');
const tasksPanel = document.getElementById('tasksPanel');
const startBtn = document.getElementById('startBtn');
const tasksBtn = document.getElementById('tasksBtn');
const tasksBackBtn = document.getElementById('tasksBackBtn');
const tasksList = document.getElementById('tasksList');
const tasksHint = document.getElementById('tasksHint');
console.log('car-drive-simulator-3d.js loaded');

let gameStarted = false;
const missionDefs = [
  { name: 'Drive to any shop', desc: 'Drive close to any shop building.' },
  { name: 'Evade police off-road for 15s', desc: 'Stay off-road while police are chasing you.' },
  { name: 'Return to parking', desc: 'Come back to the starting parking zone.' },
];
const missionState = {
  current: 0,
  done: missionDefs.map(() => false),
  evadeTimer: 0,
  finished: false,
};

function renderTasksPanel() {
  if (!tasksList) return;
  tasksList.innerHTML = '';
  for (let i = 0; i < missionDefs.length; i++) {
    const li = document.createElement('li');
    const state = missionState.done[i]
      ? 'DONE'
      : i === missionState.current && !missionState.finished
        ? 'ACTIVE'
        : 'TODO';
    li.textContent = `${i + 1}. ${missionDefs[i].name} - ${state}`;
    tasksList.appendChild(li);
  }
  if (tasksHint) {
    if (missionState.finished) tasksHint.textContent = 'All tasks completed.';
    else tasksHint.textContent = `Current: ${missionDefs[missionState.current].desc}`;
  }
}

function resetMissions() {
  missionState.current = 0;
  missionState.done = missionDefs.map(() => false);
  missionState.evadeTimer = 0;
  missionState.finished = false;
  renderTasksPanel();
}

function completeMission(index) {
  if (missionState.done[index]) return;
  missionState.done[index] = true;
  missionState.current = Math.min(missionDefs.length - 1, index + 1);
  if (index >= missionDefs.length - 1) missionState.finished = true;
  missionState.evadeTimer = 0;
  renderTasksPanel();
}

function carNearAnyShop() {
  for (const s of shops) {
    if (pointInRect(car.x, car.y, s.x - 18, s.y - 18, s.w + 36, s.h + 36)) return true;
  }
  return false;
}

function updateMissions(dt, carOnRoad, carInParking) {
  if (!gameStarted || gameOver || missionState.finished) return;
  if (missionState.current === 0) {
    if (carNearAnyShop()) completeMission(0);
    return;
  }
  if (missionState.current === 1) {
    const chasing = policeCars.some((pc) => pc.mode === 'chase');
    if (!carOnRoad && !carInParking && chasing) missionState.evadeTimer += dt;
    else missionState.evadeTimer = 0;
    if (missionState.evadeTimer >= 15) completeMission(1);
    return;
  }
  if (missionState.current === 2) {
    if (carInParking) completeMission(2);
  }
}

function currentMissionText() {
  if (missionState.finished) return 'Tasks: all completed';
  if (missionState.current === 1) return `Task 2: Evade police off-road ${Math.max(0, 15 - missionState.evadeTimer).toFixed(1)}s`;
  return `Task ${missionState.current + 1}: ${missionDefs[missionState.current].name}`;
}
if (startBtn) {
  startBtn.addEventListener('click', () => {
    resetMissions();
    gameStarted = true;
    document.body.classList.add('game-started');
    if (mainMenu) mainMenu.style.display = 'none';
    last = performance.now();
  });
}
if (tasksBtn) {
  tasksBtn.addEventListener('click', () => {
    if (menuHome) menuHome.style.display = 'none';
    if (tasksPanel) tasksPanel.style.display = 'block';
  });
}
if (tasksBackBtn) {
  tasksBackBtn.addEventListener('click', () => {
    if (tasksPanel) tasksPanel.style.display = 'none';
    if (menuHome) menuHome.style.display = 'block';
  });
}
renderTasksPanel();

// show runtime errors on the canvas so failures are visible
window.addEventListener('error', (ev) => {
  try {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#f55';
    ctx.font = '18px system-ui';
    ctx.fillText('Runtime error: ' + (ev && ev.message ? ev.message : String(ev)), 16, 40);
  } catch (e) {
    // swallow
  }
});

let W = 0, H = 0;
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Grid settings
const cellSize = 48;
const gridCells = 40; // bigger map: 40x40 cells
const gridSize = cellSize * gridCells;

// deterministic RNG (mulberry32) so roads are repeatable
function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

const ROAD_SEED = 1337;
const roads = (function buildRoads() {
  const rng = mulberry32(ROAD_SEED);
  const list = [];
  const desired = 5; // number of roads for a larger map
  // ensure at least one vertical and one horizontal road
  list.push({ orient: 'v', index: Math.floor(rng() * gridCells) });
  list.push({ orient: 'h', index: Math.floor(rng() * gridCells) });
  while (list.length < desired) {
    const orient = rng() < 0.5 ? 'v' : 'h';
    const idx = Math.floor(rng() * gridCells);
    if (!list.some(r => r.orient === orient && r.index === idx)) list.push({ orient, index: idx });
  }
  return list;
})();

const verticalRoads = roads.filter(r => r.orient === 'v');
const horizontalRoads = roads.filter(r => r.orient === 'h');
// build deterministic tree list (no trees on roads)
const trees = (function buildTrees() {
  const list = [];
  const rngCell = mulberry32(ROAD_SEED + 42);
  const startX = Math.round(-gridSize / 2);
  const startY = Math.round(-gridSize / 2);
  for (let r = 0; r < gridCells; r++) {
    for (let c = 0; c < gridCells; c++) {
      // decide whether to place a tree cluster here
      const p = rngCell();
      if (p > 0.55) continue;

      const cellX = startX + c * cellSize;
      const cellY = startY + r * cellSize;
      // deterministic jitter inside cell
      const jitterX = (rngCell() - 0.5) * (cellSize * 0.4);
      const jitterY = (rngCell() - 0.5) * (cellSize * 0.4);
      const tx = cellX + cellSize / 2 + jitterX;
      const ty = cellY + cellSize / 2 + jitterY;

      // check against road rectangles (use same calculations as drawRoads)
      let onRoad = false;
      for (const rd of roads) {
        if (rd.orient === 'v') {
          const rx = startX + rd.index * cellSize - cellSize * 0.6;
          const rw = cellSize * 1.2;
          if (tx >= rx && tx <= rx + rw) { onRoad = true; break; }
        } else {
          const ry = startY + rd.index * cellSize - cellSize * 0.6;
          const rh = cellSize * 1.2;
          if (ty >= ry && ty <= ry + rh) { onRoad = true; break; }
        }
      }
      if (onRoad) continue;

      list.push({ x: tx, y: ty, state: 'standing', fallT: 0, dir: Math.sign(rngCell() - 0.5) || 1 });
    }
  }
  return list;
})();

// helper: point or rect intersects any road
function pointIsOnRoad(x, y) {
  const startX = Math.round(-gridSize / 2);
  const startY = Math.round(-gridSize / 2);
  for (const rd of roads) {
    if (rd.orient === 'v') {
      const rx = startX + rd.index * cellSize - cellSize * 0.6;
      const rw = cellSize * 1.2;
      if (x >= rx && x <= rx + rw) return true;
    } else {
      const ry = startY + rd.index * cellSize - cellSize * 0.6;
      const rh = cellSize * 1.2;
      if (y >= ry && y <= ry + rh) return true;
    }
  }
  return false;
}

function rectIntersectsRoad(rx, ry, rw, rh) {
  const startX = Math.round(-gridSize / 2);
  const startY = Math.round(-gridSize / 2);
  for (const rd of roads) {
    if (rd.orient === 'v') {
      const rrx = startX + rd.index * cellSize - cellSize * 0.6;
      const rrw = cellSize * 1.2;
      const rry = startY;
      const rrh = gridSize;
      if (rx < rrx + rrw && rx + rw > rrx && ry < rry + rrh && ry + rh > rry) return true;
    } else {
      const rrx = startX;
      const rry = startY + rd.index * cellSize - cellSize * 0.6;
      const rrw = gridSize;
      const rrh = cellSize * 1.2;
      if (rx < rrx + rrw && rx + rw > rrx && ry < rry + rrh && ry + rh > rry) return true;
    }
  }
  return false;
}

function rectCircleCollide(rx, ry, rw, rh, cx, cy, cr) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx*dx + dy*dy <= cr*cr;
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function pointInRect(x, y, rx, ry, rw, rh) {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

function pathRoundRect(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
function minRoadCellDistance(col, row) {
  let minDist = Infinity;
  for (const rd of roads) {
    const dist = rd.orient === 'v'
      ? Math.abs(col - rd.index)
      : Math.abs(row - rd.index);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

// generate deterministic building sets away from roads
const buildings = (function buildBuildingsAwayFromRoads() {
  const list = [];
  const rngB = mulberry32(ROAD_SEED + 99);
  const startX = Math.round(-gridSize / 2);
  const startY = Math.round(-gridSize / 2);
  const occupied = new Set();
  const spawnSafeRadius = 140;

  const buildingTypes = [
    { kind: 'house', chance: 0.34, minRoadCells: 2, wCells: [1, 2], hCells: [1, 2], floors: [1, 2], color: '#9c755f', side: '#745344', roof: '#684736' },
    { kind: 'warehouse', chance: 0.24, minRoadCells: 3, wCells: [2, 3], hCells: [1, 2], floors: [1, 2], color: '#7b8794', side: '#5f6973', roof: '#4a5560' },
    { kind: 'tower', chance: 0.20, minRoadCells: 4, wCells: [1, 2], hCells: [1, 2], floors: [5, 9], color: '#8697a7', side: '#5f6f7f', roof: '#d7dee8' },
    { kind: 'shop', chance: 0.22, minRoadCells: 2, wCells: [2, 2], hCells: [1, 1], floors: [1, 1], color: '#8b7a66', side: '#625446', roof: '#5a4940' },
  ];

  function randInt(min, max) {
    return min + Math.floor(rngB() * (max - min + 1));
  }

  function chooseType() {
    const roll = rngB();
    let sum = 0;
    for (const t of buildingTypes) {
      sum += t.chance;
      if (roll <= sum) return t;
    }
    return buildingTypes[buildingTypes.length - 1];
  }

  function cellsAreFree(col, row, wCells, hCells) {
    for (let rr = row; rr < row + hCells; rr++) {
      for (let cc = col; cc < col + wCells; cc++) {
        if (occupied.has(`${cc},${rr}`)) return false;
      }
    }
    return true;
  }

  function markCells(col, row, wCells, hCells) {
    for (let rr = row; rr < row + hCells; rr++) {
      for (let cc = col; cc < col + wCells; cc++) {
        occupied.add(`${cc},${rr}`);
      }
    }
  }

  for (let row = 0; row < gridCells; row++) {
    for (let col = 0; col < gridCells; col++) {
      if (rngB() > 0.42) continue;
      const type = chooseType();
      if (minRoadCellDistance(col, row) < type.minRoadCells) continue;

      const wCells = randInt(type.wCells[0], type.wCells[1]);
      const hCells = randInt(type.hCells[0], type.hCells[1]);
      if (col + wCells > gridCells) continue;
      if (row + hCells > gridCells) continue;
      if (!cellsAreFree(col, row, wCells, hCells)) continue;

      const jitter = (rngB() - 0.5) * 5;
      const bx = startX + col * cellSize + 6 + jitter;
      const by = startY + row * cellSize + 6 + jitter;
      const bw = cellSize * wCells - 12;
      const bh = cellSize * hCells - 12;
      if (rectIntersectsRoad(bx, by, bw, bh)) continue;
      if (rectCircleCollide(bx, by, bw, bh, 0, 0, spawnSafeRadius)) continue;

      markCells(col, row, wCells, hCells);
      list.push({
        x: bx,
        y: by,
        w: bw,
        h: bh,
        floors: randInt(type.floors[0], type.floors[1]),
        color: type.color,
        sideColor: type.side,
        roofColor: type.roof,
        kind: type.kind,
      });
    }
  }

  return list;
})();

const spawnParking = {
  x: -88,
  y: -64,
  w: 176,
  h: 128,
};

const policeStation = (function buildPoliceStation() {
  const v = verticalRoads[0] || { index: Math.floor(gridCells / 2) };
  const h = horizontalRoads[0] || { index: Math.floor(gridCells / 2) };
  const ix = roadCoord('v', v.index);
  const iy = roadCoord('h', h.index);
  const w = 170;
  const hgt = 110;
  const half = gridSize / 2;
  const x = Math.max(-half + 24, Math.min(half - w - 24, ix + 26));
  const y = Math.max(-half + 24, Math.min(half - hgt - 24, iy + 26));
  const exitAnchor = nearestRoadAnchor(x + w / 2, y + hgt / 2);
  return { x, y, w, h: hgt, exitAnchor };
})();
const policeStationSlots = [
  { x: policeStation.x + 18, y: policeStation.y + policeStation.h + 22 },
  { x: policeStation.x + 54, y: policeStation.y + policeStation.h + 22 },
  { x: policeStation.x + 90, y: policeStation.y + policeStation.h + 22 },
  { x: policeStation.x + 126, y: policeStation.y + policeStation.h + 22 },
];

const cityPlaces = (function buildCityPlaces() {
  const rngP = mulberry32(ROAD_SEED + 777);
  const startX = Math.round(-gridSize / 2);
  const startY = Math.round(-gridSize / 2);
  const shops = [];
  const shoppingCenters = [];
  const pools = [];
  const usedRects = [
    { x: spawnParking.x, y: spawnParking.y, w: spawnParking.w, h: spawnParking.h },
    { x: policeStation.x, y: policeStation.y, w: policeStation.w, h: policeStation.h },
  ];

  function overlapsUsed(x, y, w, h) {
    for (const r of usedRects) {
      if (rectsOverlap(x, y, w, h, r.x, r.y, r.w, r.h)) return true;
    }
    return false;
  }

  function overlapsBuilding(x, y, w, h) {
    for (const b of buildings) {
      if (rectsOverlap(x, y, w, h, b.x, b.y, b.w, b.h)) return true;
    }
    return false;
  }

  function makePlace(kind, count, sizeGen) {
    const list = [];
    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 80 && !placed; attempt++) {
        const size = sizeGen(rngP);
        const x = startX + 30 + rngP() * (gridSize - size.w - 60);
        const y = startY + 30 + rngP() * (gridSize - size.h - 60);

        if (rectIntersectsRoad(x, y, size.w, size.h)) continue;
        if (rectCircleCollide(x, y, size.w, size.h, 0, 0, 190)) continue;
        if (overlapsUsed(x, y, size.w, size.h)) continue;
        if (overlapsBuilding(x, y, size.w, size.h)) continue;

        const place = { x, y, w: size.w, h: size.h, kind };
        list.push(place);
        usedRects.push({ x, y, w: size.w, h: size.h });
        placed = true;
      }
    }
    return list;
  }

  shoppingCenters.push(...makePlace('shopping-center', 1, () => ({ w: 220, h: 150 })));
  shops.push(...makePlace('shop', 7, () => ({ w: 78 + Math.floor(rngP() * 30), h: 56 + Math.floor(rngP() * 18) })));
  pools.push(...makePlace('pool', 4, () => ({ w: 120 + Math.floor(rngP() * 50), h: 76 + Math.floor(rngP() * 30) })));

  return { shops, shoppingCenters, pools };
})();

const shops = cityPlaces.shops;
const shoppingCenters = cityPlaces.shoppingCenters;
const pools = cityPlaces.pools;

// enforce: remove any trees or buildings that overlap roads
for (let i = trees.length - 1; i >= 0; i--) {
  const t = trees[i];
  if (pointIsOnRoad(t.x, t.y)) trees.splice(i, 1);
}
for (let i = buildings.length - 1; i >= 0; i--) {
  const b = buildings[i];
  if (rectIntersectsRoad(b.x, b.y, b.w, b.h)) buildings.splice(i, 1);
  else if (rectsOverlap(b.x, b.y, b.w, b.h, policeStation.x, policeStation.y, policeStation.w, policeStation.h)) buildings.splice(i, 1);
}

// remove trees that overlap any building footprint
for (let i = trees.length - 1; i >= 0; i--) {
  const t = trees[i];
  let hit = false;
  for (const b of buildings) {
    if (t.x >= b.x && t.x <= b.x + b.w && t.y >= b.y && t.y <= b.y + b.h) { hit = true; break; }
  }
  if (!hit) {
    if (
      t.x >= spawnParking.x &&
      t.x <= spawnParking.x + spawnParking.w &&
      t.y >= spawnParking.y &&
      t.y <= spawnParking.y + spawnParking.h
    ) {
      hit = true;
    }
  }
  if (!hit) {
    if (
      t.x >= policeStation.x &&
      t.x <= policeStation.x + policeStation.w &&
      t.y >= policeStation.y &&
      t.y <= policeStation.y + policeStation.h
    ) {
      hit = true;
    }
  }
  if (!hit) {
    for (const s of shops) {
      if (t.x >= s.x && t.x <= s.x + s.w && t.y >= s.y && t.y <= s.y + s.h) { hit = true; break; }
    }
  }
  if (!hit) {
    for (const sc of shoppingCenters) {
      if (t.x >= sc.x && t.x <= sc.x + sc.w && t.y >= sc.y && t.y <= sc.y + sc.h) { hit = true; break; }
    }
  }
  if (!hit) {
    for (const p of pools) {
      if (t.x >= p.x && t.x <= p.x + p.w && t.y >= p.y && t.y <= p.y + p.h) { hit = true; break; }
    }
  }
  if (hit) trees.splice(i, 1);
}


function drawRoadsAndTrees(centerX, centerY) {
  const startX = Math.round(centerX - gridSize / 2);
  const startY = Math.round(centerY - gridSize / 2);

  // draw roads
  const roadColor = '#2f2f2f';
  const lineColor = '#505050';
  for (const r of roads) {
    if (r.orient === 'v') {
      const x = startX + r.index * cellSize - cellSize * 0.6;
      ctx.fillStyle = roadColor;
      ctx.fillRect(x, startY, cellSize * 1.2, gridSize);
      // center dashed line
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.setLineDash([8, 8]);
      ctx.moveTo(startX + r.index * cellSize + 0.5, startY + 6);
      ctx.lineTo(startX + r.index * cellSize + 0.5, startY + gridSize - 6);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const y = startY + r.index * cellSize - cellSize * 0.6;
      ctx.fillStyle = roadColor;
      ctx.fillRect(startX, y, gridSize, cellSize * 1.2);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.setLineDash([8, 8]);
      ctx.moveTo(startX + 6, startY + r.index * cellSize + 0.5);
      ctx.lineTo(startX + gridSize - 6, startY + r.index * cellSize + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawTrees(centerX, centerY, dt) {
  for (const t of trees) {
    const sx = centerX + t.x;
    const sy = centerY + t.y;

    if (t.state === 'falling') {
      t.fallT += dt * 1.6;
      if (t.fallT >= 1) { t.fallT = 1; t.state = 'fallen'; }
    }

    ctx.save();
    ctx.translate(sx, sy + 6); // base of trunk
    const angle = (t.state === 'standing') ? 0 : (t.dir * t.fallT * (Math.PI * 0.9));
    ctx.rotate(angle);

    // trunk
    ctx.fillStyle = '#6b3e26';
    ctx.fillRect(-2, -4, 4, 12);
    // crown (simple layered circles)
    ctx.fillStyle = '#1b7a2f';
    ctx.beginPath(); ctx.arc(0, -8, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f5f22';
    ctx.beginPath(); ctx.arc(-4, -10, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -10, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawGrid(centerX, centerY) {
  const startX = Math.round(centerX - gridSize / 2);
  const startY = Math.round(centerY - gridSize / 2);

  for (let r = 0; r < gridCells; r++) {
    for (let c = 0; c < gridCells; c++) {
      const x = startX + c * cellSize;
      const y = startY + r * cellSize;
      const even = (r + c) % 2 === 0;
      ctx.fillStyle = even ? '#2a2a2a' : '#232323';
      ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
    }
  }

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 3;
  ctx.strokeRect(startX + 1.5, startY + 1.5, gridSize - 3, gridSize - 3);
}

function drawBuildings(centerX, centerY) {
  for (const b of buildings) {
    const sx = centerX + b.x;
    const sy = centerY + b.y;
    const heightPx = b.floors * 12;
    ctx.fillStyle = b.color || '#6f6f6f';
    ctx.fillRect(sx, sy - heightPx, b.w, b.h + heightPx);

    ctx.fillStyle = b.sideColor || '#565656';
    ctx.fillRect(sx + b.w, sy - heightPx + 6, 8, b.h + heightPx - 6);

    if (b.kind === 'house') {
      ctx.fillStyle = b.roofColor || '#684736';
      ctx.beginPath();
      ctx.moveTo(sx - 2, sy - heightPx + 4);
      ctx.lineTo(sx + b.w / 2, sy - heightPx - 10);
      ctx.lineTo(sx + b.w + 2, sy - heightPx + 4);
      ctx.closePath();
      ctx.fill();
    } else if (b.kind === 'warehouse') {
      ctx.fillStyle = b.roofColor || '#4a5560';
      ctx.fillRect(sx, sy - heightPx - 5, b.w, 5);
    } else if (b.kind === 'tower') {
      ctx.fillStyle = b.roofColor || '#d7dee8';
      ctx.fillRect(sx + b.w * 0.35, sy - heightPx - 12, b.w * 0.3, 12);
    } else if (b.kind === 'shop') {
      ctx.fillStyle = b.roofColor || '#5a4940';
      ctx.fillRect(sx, sy - heightPx - 4, b.w, 4);
      ctx.fillStyle = '#f0d36b';
      ctx.fillRect(sx + 4, sy - heightPx + b.h * 0.35, b.w - 8, 4);
    }

    ctx.fillStyle = '#e6f0ff';
    const cols = Math.max(1, Math.floor(b.w / 20));
    const rows = Math.max(1, Math.floor((b.h + heightPx) / 18));
    const gapX = b.w / (cols + 1);
    const gapY = (b.h + heightPx) / (rows + 1);
    for (let ry = 1; ry <= rows; ry++) {
      for (let cxWin = 1; cxWin <= cols; cxWin++) {
        const wx = sx + cxWin * gapX - 6;
        const wy = sy - heightPx + ry * gapY - 6;
        ctx.fillRect(wx, wy, 8, 6);
      }
    }
  }
}

function drawSpawnParking(centerX, centerY) {
  const px = centerX + spawnParking.x;
  const py = centerY + spawnParking.y;
  const pw = spawnParking.w;
  const ph = spawnParking.h;

  // asphalt pad
  ctx.fillStyle = '#262a30';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#3a4048';
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

  // parking slots
  ctx.strokeStyle = '#d7dde7';
  ctx.lineWidth = 2;
  const slotW = 28;
  const slotH = 42;
  const gap = 8;
  for (let i = 0; i < 4; i++) {
    const sx = px + 10 + i * (slotW + gap);
    const syTop = py + 10;
    const syBottom = py + ph - slotH - 10;
    ctx.strokeRect(sx, syTop, slotW, slotH);
    ctx.strokeRect(sx, syBottom, slotW, slotH);
  }

  // center lane
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = '#f3cf5a';
  ctx.beginPath();
  ctx.moveTo(px + 8, py + ph / 2);
  ctx.lineTo(px + pw - 8, py + ph / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // label
  ctx.fillStyle = '#f3cf5a';
  ctx.font = 'bold 10px system-ui,Segoe UI,Roboto';
  ctx.fillText('P', px + pw / 2 - 3, py + ph / 2 - 8);
}

function drawPoliceStation(centerX, centerY) {
  const x = centerX + policeStation.x;
  const y = centerY + policeStation.y;
  const w = policeStation.w;
  const h = policeStation.h;
  ctx.fillStyle = '#293242';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#425571';
  ctx.fillRect(x, y - 12, w, 12);
  ctx.fillStyle = '#c7d6ef';
  ctx.fillRect(x + 10, y + 12, w - 20, 14);
  ctx.fillStyle = '#1b2430';
  ctx.fillRect(x + w * 0.4, y + h - 36, w * 0.2, 36);
  ctx.fillStyle = '#ffdb6d';
  ctx.font = 'bold 12px system-ui,Segoe UI,Roboto';
  ctx.fillText('POLICE STATION', x + 12, y + 23);
}

function drawCityPlaces(centerX, centerY) {
  for (const sc of shoppingCenters) {
    const x = centerX + sc.x;
    const y = centerY + sc.y;
    ctx.fillStyle = '#4d5d6d';
    ctx.fillRect(x, y, sc.w, sc.h);
    ctx.fillStyle = '#75879a';
    ctx.fillRect(x, y - 16, sc.w, 16);
    ctx.fillStyle = '#cfe2ff';
    for (let i = 0; i < 6; i++) {
      const wx = x + 14 + i * ((sc.w - 28) / 6);
      ctx.fillRect(wx, y + 18, 12, 9);
    }
    ctx.fillStyle = '#f5d46a';
    ctx.font = 'bold 12px system-ui,Segoe UI,Roboto';
    ctx.fillText('SHOPPING CENTER', x + 10, y + sc.h / 2);
  }

  for (const s of shops) {
    const x = centerX + s.x;
    const y = centerY + s.y;
    ctx.fillStyle = '#8f6f56';
    ctx.fillRect(x, y, s.w, s.h);
    ctx.fillStyle = '#c45b47';
    ctx.fillRect(x, y - 7, s.w, 7);
    ctx.fillStyle = '#f5d46a';
    ctx.fillRect(x + 6, y + 6, s.w - 12, 6);
    ctx.fillStyle = '#dfecff';
    ctx.fillRect(x + 8, y + 18, s.w - 16, s.h - 28);
  }

  for (const p of pools) {
    const x = centerX + p.x;
    const y = centerY + p.y;
    ctx.fillStyle = '#90a5b9';
    ctx.fillRect(x - 5, y - 5, p.w + 10, p.h + 10);
    ctx.fillStyle = '#3ea6dc';
    ctx.fillRect(x, y, p.w, p.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + p.h * 0.35);
    ctx.quadraticCurveTo(x + p.w * 0.4, y + p.h * 0.2, x + p.w * 0.75, y + p.h * 0.4);
    ctx.stroke();
  }
}


// Simple car entity (green)
const car = {
  x: 0, // world coordinates (center is 0,0)
  y: 0,
  angle: 0, // radians
  speed: 0, // px/s
  width: 28,
  height: 14,
  maxSpeed: 220,
  accel: 360,
  braking: 420,
  friction: 220,
  rotSpeed: 3.6, // rad/s
}

const keys = { w:false, a:false, s:false, d:false };
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k === 'arrowup' || k === 'arrowleft' || k === 'arrowdown' || k === 'arrowright') {
    e.preventDefault();
  }
  if (k === 'w' || k === 'arrowup') keys.w = true;
  if (k === 'a' || k === 'arrowleft') keys.a = true;
  if (k === 's' || k === 'arrowdown') keys.s = true;
  if (k === 'd' || k === 'arrowright') keys.d = true;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keys.w = false;
  if (k === 'a' || k === 'arrowleft') keys.a = false;
  if (k === 's' || k === 'arrowdown') keys.s = false;
  if (k === 'd' || k === 'arrowright') keys.d = false;
});

const policeCars = [];
const policeCfg = {
  spawnDelayOffRoad: 1.2,
  spawnInterval: 1.8,
  maxCars: 4,
  speed: 185,
  returnSpeed: 165,
  catchDistance: 24,
  returnDelayOnRoad: 4.0,
  turnRate: 5.8,
};
let offRoadTime = 0;
let policeSpawnTimer = 0;
let onRoadTime = 0;
let gameOver = false;
let gameOverMessage = '';

function areaBlocked(x, y, radius) {
  if (rectCircleCollide(policeStation.x, policeStation.y, policeStation.w, policeStation.h, x, y, radius)) return true;
  if (Array.isArray(buildings)) {
    for (const b of buildings) {
      if (rectCircleCollide(b.x, b.y, b.w, b.h, x, y, radius)) return true;
    }
  }
  for (const s of shops) {
    if (rectCircleCollide(s.x, s.y, s.w, s.h, x, y, radius)) return true;
  }
  for (const sc of shoppingCenters) {
    if (rectCircleCollide(sc.x, sc.y, sc.w, sc.h, x, y, radius)) return true;
  }
  for (const p of pools) {
    if (rectCircleCollide(p.x, p.y, p.w, p.h, x, y, radius)) return true;
  }
  return false;
}

function roadCoord(orient, index) {
  const startX = Math.round(-gridSize / 2);
  const startY = Math.round(-gridSize / 2);
  return orient === 'v'
    ? startX + index * cellSize + 0.5
    : startY + index * cellSize + 0.5;
}

function nearestRoadAnchor(x, y) {
  let best = null;
  for (const rv of verticalRoads) {
    const rx = roadCoord('v', rv.index);
    const d = Math.abs(x - rx);
    if (!best || d < best.dist) {
      best = { orient: 'v', roadIndex: rv.index, x: rx, y, t: y, dist: d };
    }
  }
  for (const rh of horizontalRoads) {
    const ry = roadCoord('h', rh.index);
    const d = Math.abs(y - ry);
    if (!best || d < best.dist) {
      best = { orient: 'h', roadIndex: rh.index, x, y: ry, t: x, dist: d };
    }
  }
  return best || { orient: 'v', roadIndex: 0, x: 0, y: 0, t: 0, dist: 0 };
}

function spawnPoliceCar() {
  const a = policeStation.exitAnchor || nearestRoadAnchor(policeStation.x + policeStation.w / 2, policeStation.y + policeStation.h / 2);
  const slotIndex = policeCars.length % policeStationSlots.length;
  const park = policeStationSlots[slotIndex];
  const start = { x: a.x, y: a.y };
  if (areaBlocked(start.x, start.y, 14)) return;
  policeCars.push({
    x: start.x,
    y: start.y,
    angle: Math.atan2(car.y - start.y, car.x - start.x),
    speed: policeCfg.speed + Math.random() * 14,
    mode: 'chase',
    parkX: park.x,
    parkY: park.y,
  });
}

function policeObstacleAt(x, y, radius) {
  if (Array.isArray(buildings)) {
    for (const b of buildings) {
      if (rectCircleCollide(b.x, b.y, b.w, b.h, x, y, radius)) return true;
    }
  }
  for (const s of shops) {
    if (rectCircleCollide(s.x, s.y, s.w, s.h, x, y, radius)) return true;
  }
  for (const sc of shoppingCenters) {
    if (rectCircleCollide(sc.x, sc.y, sc.w, sc.h, x, y, radius)) return true;
  }
  for (const p of pools) {
    if (rectCircleCollide(p.x, p.y, p.w, p.h, x, y, radius)) return true;
  }
  if (rectCircleCollide(policeStation.x, policeStation.y, policeStation.w, policeStation.h, x, y, radius)) return true;
  return false;
}

function switchPoliceReturnRoad(pc, targetX, targetY, prevRoadT) {
  if (pc.roadOrient === 'v' && horizontalRoads.length > 0) {
    const fixedX = roadCoord('v', pc.roadIndex);
    if (Math.abs(fixedX - targetX) <= cellSize * 0.45) return;
    let best = null;
    for (const rh of horizontalRoads) {
      const interY = roadCoord('h', rh.index);
      const score = Math.abs(interY - pc.roadT) + Math.abs(interY - targetY) * 0.6;
      if (!best || score < best.score) best = { roadIndex: rh.index, y: interY, score };
    }
    const minT = Math.min(prevRoadT, pc.roadT) - 6;
    const maxT = Math.max(prevRoadT, pc.roadT) + 6;
    if (best && best.y >= minT && best.y <= maxT) {
      pc.roadOrient = 'h';
      pc.roadIndex = best.roadIndex;
      pc.roadT = fixedX;
      pc.x = fixedX;
      pc.y = best.y;
    }
  } else if (pc.roadOrient === 'h' && verticalRoads.length > 0) {
    const fixedY = roadCoord('h', pc.roadIndex);
    if (Math.abs(fixedY - targetY) <= cellSize * 0.45) return;
    let best = null;
    for (const rv of verticalRoads) {
      const interX = roadCoord('v', rv.index);
      const score = Math.abs(interX - pc.roadT) + Math.abs(interX - targetX) * 0.6;
      if (!best || score < best.score) best = { roadIndex: rv.index, x: interX, score };
    }
    const minT = Math.min(prevRoadT, pc.roadT) - 6;
    const maxT = Math.max(prevRoadT, pc.roadT) + 6;
    if (best && best.x >= minT && best.x <= maxT) {
      pc.roadOrient = 'v';
      pc.roadIndex = best.roadIndex;
      pc.roadT = fixedY;
      pc.x = best.x;
      pc.y = fixedY;
    }
  }
}

function movePoliceOnRoad(pc, dt, targetX, targetY, speed) {
  if (!pc.roadOrient) {
    const a = nearestRoadAnchor(pc.x, pc.y);
    pc.roadOrient = a.orient;
    pc.roadIndex = a.roadIndex;
    pc.roadT = a.t;
    // snap to nearest road so return path is road-only
    pc.x = a.x;
    pc.y = a.y;
  }

  const prevRoadT = pc.roadT;
  if (pc.roadOrient === 'v') {
    const fixedX = roadCoord('v', pc.roadIndex);
    const dir = Math.sign(targetY - pc.roadT) || 1;
    pc.roadT += dir * speed * dt;
    pc.x = fixedX;
    pc.y = pc.roadT;
    pc.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    const fixedY = roadCoord('h', pc.roadIndex);
    const dir = Math.sign(targetX - pc.roadT) || 1;
    pc.roadT += dir * speed * dt;
    pc.x = pc.roadT;
    pc.y = fixedY;
    pc.angle = dir > 0 ? 0 : Math.PI;
  }
  switchPoliceReturnRoad(pc, targetX, targetY, prevRoadT);

  const half = gridSize / 2 - 10;
  pc.roadT = Math.max(-half, Math.min(half, pc.roadT));
  pc.x = Math.max(-half, Math.min(half, pc.x));
  pc.y = Math.max(-half, Math.min(half, pc.y));
}

function movePoliceCar(pc, dt, targetX, targetY, speed) {
  const desired = Math.atan2(targetY - pc.y, targetX - pc.x);
  let d = desired - pc.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  pc.angle += d * Math.min(1, dt * policeCfg.turnRate);

  const totalStep = speed * dt;
  const radius = 10;
  const maxStep = 6;
  const slices = Math.max(1, Math.ceil(totalStep / maxStep));
  const step = totalStep / slices;

  for (let i = 0; i < slices; i++) {
    let nx = pc.x + Math.cos(pc.angle) * step;
    let ny = pc.y + Math.sin(pc.angle) * step;

    if (policeObstacleAt(nx, ny, radius)) {
      const a1 = pc.angle + 0.65;
      const a2 = pc.angle - 0.65;
      const c1x = pc.x + Math.cos(a1) * step;
      const c1y = pc.y + Math.sin(a1) * step;
      const c2x = pc.x + Math.cos(a2) * step;
      const c2y = pc.y + Math.sin(a2) * step;
      if (!policeObstacleAt(c1x, c1y, radius)) {
        pc.angle = a1;
        nx = c1x;
        ny = c1y;
      } else if (!policeObstacleAt(c2x, c2y, radius)) {
        pc.angle = a2;
        nx = c2x;
        ny = c2y;
      } else {
        break;
      }
    }

    const half = gridSize / 2 - 10;
    pc.x = Math.max(-half, Math.min(half, nx));
    pc.y = Math.max(-half, Math.min(half, ny));
  }
}

function updatePolice(dt, offRoad) {
  if (offRoad) {
    offRoadTime += dt;
    onRoadTime = 0;
    for (const pc of policeCars) {
      if (pc.mode !== 'chase') pc.mode = 'chase';
    }
    if (offRoadTime >= policeCfg.spawnDelayOffRoad && policeCars.length < policeCfg.maxCars) {
      policeSpawnTimer += dt;
      if (policeSpawnTimer >= policeCfg.spawnInterval) {
        policeSpawnTimer = 0;
        spawnPoliceCar();
      }
      if (policeCars.length === 0) spawnPoliceCar();
    }
  } else {
    offRoadTime = 0;
    policeSpawnTimer = 0;
    onRoadTime += dt;
    if (onRoadTime >= policeCfg.returnDelayOnRoad) {
      for (const pc of policeCars) {
        if (pc.mode !== 'parked') {
          pc.mode = 'return';
          pc.roadOrient = null;
        }
      }
    }
  }

  for (const pc of policeCars) {
    if (pc.mode === 'parked') continue;
    if (pc.mode === 'return') {
      const target = nearestRoadAnchor(pc.parkX, pc.parkY);
      movePoliceOnRoad(pc, dt, target.x, target.y, policeCfg.returnSpeed);
      const dx = pc.x - target.x;
      const dy = pc.y - target.y;
      if (dx * dx + dy * dy < 10 * 10) {
        pc.mode = 'parked';
        pc.angle = -Math.PI / 2;
        pc.x = target.x;
        pc.y = target.y;
      }
    } else {
      movePoliceCar(pc, dt, car.x, car.y, pc.speed);
    }
  }
}

function drawPoliceCars(cx, cy) {
  for (const pc of policeCars) {
    const sx = cx + pc.x;
    const sy = cy + pc.y;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(pc.angle);
    ctx.fillStyle = '#132f63';
    ctx.fillRect(-14, -7, 28, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, -7, 4, 14);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-6, -9, 5, 3);
    ctx.fillStyle = '#2f7dff';
    ctx.fillRect(1, -9, 5, 3);
    ctx.fillStyle = '#111';
    ctx.fillRect(-12, 5, 5, 3);
    ctx.fillRect(7, 5, 5, 3);
    ctx.restore();
  }
}

function drawGameOverOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffdddd';
  ctx.font = 'bold 44px system-ui,Segoe UI,Roboto';
  ctx.textAlign = 'center';
  ctx.fillText(gameOverMessage || 'Police have caught you!', W / 2, H / 2);
  ctx.font = '16px system-ui,Segoe UI,Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Refresh page to play again.', W / 2, H / 2 + 34);
  ctx.textAlign = 'left';
}

let last = performance.now();
function animate(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  ctx.clearRect(0, 0, W, H);

  // camera: follow car and clamp to map bounds
  const halfMap = gridSize / 2;
  const halfScreenX = W / 2;
  const halfScreenY = H / 2;
  const camXMin = -halfMap + halfScreenX;
  const camXMax = halfMap - halfScreenX;
  const camYMin = -halfMap + halfScreenY;
  const camYMax = halfMap - halfScreenY;
  // if map is smaller than viewport, keep camera centered on world origin
  const camX = camXMin <= camXMax
    ? Math.max(camXMin, Math.min(camXMax, car.x))
    : 0;
  const camY = camYMin <= camYMax
    ? Math.max(camYMin, Math.min(camYMax, car.y))
    : 0;
  // center screen coordinate for world origin
  const cx = W / 2 - camX;
  const cy = H / 2 - camY;

  if (gameStarted && !gameOver) {
    // update car rotation
    if (keys.a) car.angle -= car.rotSpeed * dt;
    if (keys.d) car.angle += car.rotSpeed * dt;

    // update car speed
    if (keys.w) {
      car.speed += car.accel * dt;
    } else if (keys.s) {
      car.speed -= car.braking * dt;
    } else {
      // friction toward 0
      if (car.speed > 0) car.speed = Math.max(0, car.speed - car.friction * dt);
      else car.speed = Math.min(0, car.speed + car.friction * dt);
    }
    car.speed = Math.max(-car.maxSpeed * 0.5, Math.min(car.maxSpeed, car.speed));
  } else {
    car.speed = 0;
  }

  // move car in world space (y down is positive)
  const prevX = car.x, prevY = car.y;
  if (gameStarted && !gameOver) {
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
  }

  // check collision with buildings; treat car as circle and revert on collision
  const carRadius = Math.max(car.width, car.height) * 0.6;
  let blocked = false;
  if (Array.isArray(buildings)) {
    for (const b of buildings) {
      if (rectCircleCollide(b.x, b.y, b.w, b.h, car.x, car.y, carRadius)) { blocked = true; break; }
    }
  }
  if (!blocked) {
    if (rectCircleCollide(policeStation.x, policeStation.y, policeStation.w, policeStation.h, car.x, car.y, carRadius)) { blocked = true; }
  }
  if (!blocked) {
    for (const s of shops) {
      if (rectCircleCollide(s.x, s.y, s.w, s.h, car.x, car.y, carRadius)) { blocked = true; break; }
    }
  }
  if (!blocked) {
    for (const sc of shoppingCenters) {
      if (rectCircleCollide(sc.x, sc.y, sc.w, sc.h, car.x, car.y, carRadius)) { blocked = true; break; }
    }
  }
  if (!blocked) {
    for (const p of pools) {
      if (rectCircleCollide(p.x, p.y, p.w, p.h, car.x, car.y, carRadius)) { blocked = true; break; }
    }
  }
  if (blocked) { car.x = prevX; car.y = prevY; car.speed = 0; }

  // clamp car inside the grid bounds
  const half = gridSize / 2 - Math.max(car.width, car.height);
  car.x = Math.max(-half, Math.min(half, car.x));
  car.y = Math.max(-half, Math.min(half, car.y));

  // check collisions with trees (car center vs tree)
  const carWorldX = car.x;
  const carWorldY = car.y;
  for (const t of trees) {
    if (t.state !== 'standing') continue;
    const dx = carWorldX - t.x;
    const dy = carWorldY - t.y;
    const distSq = dx*dx + dy*dy;
    const thresh = 18 * 18;
    if (distSq <= thresh) {
      t.state = 'falling';
      t.fallT = 0;
      // choose dir away from car impact
      t.dir = Math.sign(dx || 1);
    }
  }

  const carOnRoad = pointIsOnRoad(car.x, car.y);
  const carInParking = pointInRect(car.x, car.y, spawnParking.x, spawnParking.y, spawnParking.w, spawnParking.h);
  const policeOffRoad = !carOnRoad && !carInParking;
  if (gameStarted && !gameOver) {
    updatePolice(dt, policeOffRoad);

    // Parking zone is safe: police should return instead of chasing.
    if (carInParking) {
      for (const pc of policeCars) {
        if (pc.mode !== 'parked') {
          pc.mode = 'return';
          pc.roadOrient = null;
        }
      }
    } else {
      for (const pc of policeCars) {
        if (pc.mode !== 'chase') continue;
        const dx = car.x - pc.x;
        const dy = car.y - pc.y;
        if (dx * dx + dy * dy <= policeCfg.catchDistance * policeCfg.catchDistance) {
          gameOver = true;
          gameOverMessage = 'Police have caught you!';
          break;
        }
      }
    }
    updateMissions(dt, carOnRoad, carInParking);
  }

  // draw background grid (centered square)
  drawGrid(cx, cy);
  drawRoadsAndTrees(cx, cy);
  drawSpawnParking(cx, cy);
  drawPoliceStation(cx, cy);
  drawCityPlaces(cx, cy);
  if (Array.isArray(buildings)) drawBuildings(cx, cy);
  drawTrees(cx, cy, dt);
  drawPoliceCars(cx, cy);

  // draw car at world -> screen coordinates
  const carScreenX = cx + car.x;
  const carScreenY = cy + car.y;
  ctx.save();
  ctx.translate(carScreenX, carScreenY);
  ctx.rotate(car.angle);
  // car shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 9, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // main body
  ctx.fillStyle = '#d32626';
  pathRoundRect(-car.width / 2, -car.height / 2, car.width, car.height, 5);
  ctx.fill();
  // hood stripe
  ctx.fillStyle = '#f2d34d';
  ctx.fillRect(-3, -car.height / 2 + 1, 6, car.height - 2);
  // cabin
  ctx.fillStyle = '#84c7f4';
  pathRoundRect(-6, -4, 12, 8, 3);
  ctx.fill();
  // windows split
  ctx.strokeStyle = '#123a57';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0, 4);
  ctx.stroke();
  // headlights
  ctx.fillStyle = '#fff4b1';
  ctx.fillRect(car.width / 2 - 3, -car.height / 2 + 2, 2, 3);
  ctx.fillRect(car.width / 2 - 3, car.height / 2 - 5, 2, 3);
  // taillights
  ctx.fillStyle = '#ff6b6b';
  ctx.fillRect(-car.width / 2 + 1, -car.height / 2 + 2, 2, 3);
  ctx.fillRect(-car.width / 2 + 1, car.height / 2 - 5, 2, 3);
  // wheels
  ctx.fillStyle = '#0f0f0f';
  ctx.fillRect(-car.width / 2 + 3, -car.height / 2 - 1, 5, 2);
  ctx.fillRect(car.width / 2 - 8, -car.height / 2 - 1, 5, 2);
  ctx.fillRect(-car.width / 2 + 3, car.height / 2 - 1, 5, 2);
  ctx.fillRect(car.width / 2 - 8, car.height / 2 - 1, 5, 2);
  ctx.restore();

  // (jumping camera removed) — keep floor and car only

  // helpful debug/instruction text
  ctx.fillStyle = '#ddd';
  ctx.font = '13px system-ui,Segoe UI,Roboto';
  const roadState = carOnRoad ? 'ON ROAD' : 'OFF ROAD';
  ctx.fillText(`Use W/A/S/D or Arrow keys to move the red car. ${roadState}`, 12, H - 12);
  ctx.fillText(currentMissionText(), 12, 26);

  if (gameOver) drawGameOverOverlay();

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
