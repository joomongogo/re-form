import { canCraft, craft, equipmentMultipliers, ownsAccessory, toggleEquip } from "./crafting.js";
import { ITEMS, MONSTERS, RECIPES, SKILL_ORDER, SKILLS } from "./data.js";
import { DEBUG_MODE, logLootRoll, strengthLabel } from "./debug.js";
import { rollLoot } from "./drops.js";
import { drawAura, drawStrengthOutline, updateAura } from "./effects.js";
import { addItem, createInventory, hasSkill, itemCount, learnSkill } from "./inventory.js";
import { applyStrength, resolveStrength } from "./strength.js";

const WORLD_W = 2400;
const WORLD_H = 1600;
const BASIC_RANGE = 62;
const BASIC_DOT = 0.4;
const BASIC_COOLDOWN = 0.45;
const PICKUP_RANGE = 42;
const DROP_LIFE = 22;
const INK = "#1c140f";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const hudHpFill = document.querySelector("#hp-fill");
const hudHpText = document.querySelector("#hp-text");
const statLine = document.querySelector("#stat-line");
const gearLine = document.querySelector("#gear-line");
const skillRow = document.querySelector("#skill-row");
const inventoryEl = document.querySelector("#inventory");
const craftEl = document.querySelector("#craft");
const toastWrap = document.querySelector("#toast-wrap");
const debugBar = document.querySelector("#debug-bar");

const keys = new Set();
const inventory = createInventory();
const decor = createDecor();
const dust = [];
const floaters = [];
const toasts = [];

let monsters = [];
let fieldDrops = [];
let viewW = window.innerWidth;
let viewH = window.innerHeight;
let dpr = 1;
let time = 0;
let lastStamp = 0;
let respawnIn = 8;
let pointerAim = false;
let uiDirty = true;
let lastRolls = [];
let nextId = 1;

const player = {
  id: 0,
  x: WORLD_W / 2,
  y: WORLD_H / 2,
  facingX: 1,
  facingY: 0,
  radius: 18,
  baseMaxHp: 100,
  baseAttack: 20,
  baseSpeed: 165,
  hp: 100,
  moving: false,
  attackCd: 0,
  swing: 0,
  swingKind: "basic",
  swingHit: new Set(),
  iframe: 0,
  hurt: 0,
  ironArm: 0,
  dashTime: 0,
  dashX: 0,
  dashY: 0,
  skillCd: {
    flash_cut: 0,
    gale_step: 0,
    iron_arm: 0
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createDecor() {
  const rng = mulberry32(19);
  const pieces = [];
  for (let index = 0; index < 48; index += 1) {
    pieces.push({
      x: 80 + rng() * (WORLD_W - 160),
      y: 80 + rng() * (WORLD_H - 160),
      kind: rng() < 0.62 ? "grass" : "stone",
      scale: 0.7 + rng() * 0.7,
      tilt: rng() * Math.PI
    });
  }
  return pieces;
}

function playerStats() {
  const mods = equipmentMultipliers(inventory);
  const iron = player.ironArm > 0 ? SKILLS.iron_arm.attackMultiplier : 1;
  return {
    maxHp: Math.round(player.baseMaxHp * mods.maxHp),
    attack: Math.round(player.baseAttack * mods.attack * iron * 10) / 10,
    speed: player.baseSpeed * mods.speed
  };
}

function syncHp(previousMax) {
  const maxHp = playerStats().maxHp;
  if (previousMax > 0) {
    player.hp = Math.min(maxHp, player.hp * (maxHp / previousMax));
  }
  if (player.hp <= 0) {
    player.hp = 1;
  }
}

function spawnPointAwayFromPlayer() {
  const angle = Math.random() * Math.PI * 2;
  const distance = 280 + Math.random() * 220;
  return {
    x: clamp(player.x + Math.cos(angle) * distance, 80, WORLD_W - 80),
    y: clamp(player.y + Math.sin(angle) * distance, 80, WORLD_H - 80)
  };
}

function createMonster(typeId, options = {}) {
  const base = MONSTERS[typeId];
  if (!base) {
    console.warn(`unknown monster: ${typeId}`);
    return null;
  }
  const strengthRoll = resolveStrength(options);
  const stats = applyStrength(base, strengthRoll);
  const point = options.x == null || options.y == null ? spawnPointAwayFromPlayer() : options;
  const monster = {
    id: nextId,
    typeId,
    name: base.name,
    body: base.body,
    x: clamp(point.x, base.radius, WORLD_W - base.radius),
    y: clamp(point.y, base.radius, WORLD_H - base.radius),
    facingX: 1,
    facingY: 0,
    radius: base.radius,
    strengthRoll,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    attackDamage: stats.attackDamage,
    speed: stats.speed,
    attackInterval: base.attackInterval,
    attackCd: Math.random() * base.attackInterval,
    hitFlash: 0,
    moving: false,
    dead: false,
    motes: []
  };
  nextId += 1;
  updateAura(monster, 0, time);
  return monster;
}

function spawnMonster(typeId, options = {}) {
  const monster = createMonster(typeId, options);
  if (monster) {
    monsters.push(monster);
  }
  return monster;
}

function toast(text) {
  toasts.push({ text, life: 2.1 });
  if (toasts.length > 3) {
    toasts.shift();
  }
}

function panelsOpen() {
  return !inventoryEl.classList.contains("hidden") || !craftEl.classList.contains("hidden");
}

function inArc(origin, target, range, minDot) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist > range + target.radius) {
    return false;
  }
  if (dist < 1) {
    return true;
  }
  return (dx / dist) * origin.facingX + (dy / dist) * origin.facingY >= minDot;
}

function spawnFloater(x, y, amount, color = INK) {
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
  floaters.push({ x, y, text, life: 0.7, color });
}

function hurtMonster(monster, damage) {
  if (monster.dead) {
    return;
  }
  const amount = Math.round(damage * 10) / 10;
  monster.hp -= amount;
  monster.hitFlash = 0.12;
  const dx = monster.x - player.x;
  const dy = monster.y - player.y;
  const dist = Math.hypot(dx, dy) || 1;
  monster.x = clamp(monster.x + (dx / dist) * 8, monster.radius, WORLD_W - monster.radius);
  monster.y = clamp(monster.y + (dy / dist) * 8, monster.radius, WORLD_H - monster.radius);
  spawnFloater(monster.x, monster.y - 40, amount);
  if (monster.hp <= 0) {
    monster.hp = 0;
    defeatMonster(monster);
  }
}

function defeatMonster(monster) {
  if (monster.dead) {
    return;
  }
  monster.dead = true;
  const rolls = rollLoot(MONSTERS[monster.typeId].drops, monster.strengthRoll);
  for (const roll of rolls) {
    if (roll.kind === "skill" && roll.hit && hasSkill(inventory, roll.skillId)) {
      roll.skipped = "already-learned";
    }
  }
  logLootRoll(monster, rolls);
  lastRolls = rolls;

  let placed = 0;
  for (const roll of rolls) {
    if (!roll.hit || roll.skipped) {
      continue;
    }
    const angle = placed * 0.9 - 0.4;
    placed += 1;
    fieldDrops.push({
      kind: roll.kind,
      itemId: roll.itemId || null,
      skillId: roll.skillId || null,
      x: clamp(monster.x + Math.cos(angle) * 28, 36, WORLD_W - 36),
      y: clamp(monster.y + Math.sin(angle) * 18, 36, WORLD_H - 36),
      life: DROP_LIFE
    });
  }
  toast(`${monster.name} 처치`);
  uiDirty = true;
}

function downPlayer() {
  const stats = playerStats();
  player.hp = stats.maxHp;
  player.x = WORLD_W / 2;
  player.y = WORLD_H / 2;
  player.iframe = 1.6;
  player.dashTime = 0;
  player.swing = 0;
  toast("쓰러졌다. 호흡을 고친다.");
}

function startSwing(kind, duration) {
  if (player.swing > 0 || (player.dashTime > 0 && kind === "basic")) {
    return false;
  }
  if (kind === "basic" && player.attackCd > 0) {
    return false;
  }
  player.swing = duration;
  player.swingKind = kind;
  player.swingHit = new Set();
  if (kind === "basic") {
    player.attackCd = BASIC_COOLDOWN;
  }
  return true;
}

function useSkill(skillId) {
  if (panelsOpen()) {
    return;
  }
  if (!hasSkill(inventory, skillId)) {
    toast("아직 익히지 못했다");
    return;
  }
  if (player.skillCd[skillId] > 0) {
    return;
  }
  const skill = SKILLS[skillId];
  if (skillId === "flash_cut") {
    if (!startSwing("flash", 0.18)) {
      return;
    }
  } else if (skillId === "gale_step") {
    player.dashTime = skill.dashTime;
    player.dashX = player.facingX * (skill.dashDistance / skill.dashTime);
    player.dashY = player.facingY * (skill.dashDistance / skill.dashTime);
    player.iframe = Math.max(player.iframe, skill.iframe);
    spawnDashDust();
  } else {
    player.ironArm = skill.duration;
    toast("철완");
  }
  player.skillCd[skillId] = skill.cooldown;
}

function spawnDashDust() {
  for (let index = 0; index < 6; index += 1) {
    dust.push({
      x: player.x,
      y: player.y + 10,
      vx: -player.facingX * 50 + (Math.random() - 0.5) * 40,
      vy: -player.facingY * 50 + (Math.random() - 0.5) * 40,
      life: 0.32
    });
  }
}

function updatePlayer(dt) {
  const stats = playerStats();
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.swing = Math.max(0, player.swing - dt);
  player.iframe = Math.max(0, player.iframe - dt);
  player.hurt = Math.max(0, player.hurt - dt);
  player.ironArm = Math.max(0, player.ironArm - dt);
  for (const skillId of SKILL_ORDER) {
    player.skillCd[skillId] = Math.max(0, player.skillCd[skillId] - dt);
  }

  if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.x += player.dashX * dt;
    player.y += player.dashY * dt;
    player.moving = true;
  } else {
    let moveX = 0;
    let moveY = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) moveY -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) moveY += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) moveX -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) moveX += 1;
    const magnitude = Math.hypot(moveX, moveY);
    if (magnitude > 0) {
      moveX /= magnitude;
      moveY /= magnitude;
      if (!pointerAim) {
        player.facingX = moveX;
        player.facingY = moveY;
      }
      player.x += moveX * stats.speed * dt;
      player.y += moveY * stats.speed * dt;
      player.moving = true;
    } else {
      player.moving = false;
    }
  }

  player.x = clamp(player.x, player.radius, WORLD_W - player.radius);
  player.y = clamp(player.y, player.radius, WORLD_H - player.radius);

  if (player.swing > 0) {
    const flash = player.swingKind === "flash";
    const range = flash ? SKILLS.flash_cut.range : BASIC_RANGE;
    const minDot = flash ? SKILLS.flash_cut.minDot : BASIC_DOT;
    const damage = flash ? stats.attack * SKILLS.flash_cut.damageMultiplier : stats.attack;
    for (const monster of monsters) {
      if (monster.dead || player.swingHit.has(monster.id)) {
        continue;
      }
      if (!inArc(player, monster, range, minDot)) {
        continue;
      }
      player.swingHit.add(monster.id);
      hurtMonster(monster, damage);
    }
  }
}

function separateMonsters() {
  for (let i = 0; i < monsters.length; i += 1) {
    for (let j = i + 1; j < monsters.length; j += 1) {
      const a = monsters[i];
      const b = monsters[j];
      if (a.dead || b.dead) {
        continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const minDist = a.radius + b.radius + 6;
      if (dist >= minDist) {
        continue;
      }
      const push = (minDist - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x = clamp(a.x - nx * push, a.radius, WORLD_W - a.radius);
      a.y = clamp(a.y - ny * push, a.radius, WORLD_H - a.radius);
      b.x = clamp(b.x + nx * push, b.radius, WORLD_W - b.radius);
      b.y = clamp(b.y + ny * push, b.radius, WORLD_H - b.radius);
    }
  }
}

function updateMonsters(dt) {
  for (const monster of monsters) {
    if (monster.dead) {
      continue;
    }
    monster.hitFlash = Math.max(0, monster.hitFlash - dt);
    monster.attackCd -= dt;
    updateAura(monster, dt, time);
    const dx = player.x - monster.x;
    const dy = player.y - monster.y;
    const dist = Math.hypot(dx, dy) || 1;
    monster.facingX = dx / dist;
    monster.facingY = dy / dist;
    const stop = monster.radius + player.radius + 6;
    monster.moving = dist > stop;
    if (monster.moving) {
      monster.x = clamp(monster.x + (dx / dist) * monster.speed * dt, monster.radius, WORLD_W - monster.radius);
      monster.y = clamp(monster.y + (dy / dist) * monster.speed * dt, monster.radius, WORLD_H - monster.radius);
    }
    if (dist < stop + 10 && monster.attackCd <= 0 && player.hp > 0) {
      monster.attackCd = monster.attackInterval;
      monster.x = clamp(monster.x - monster.facingX * 8, monster.radius, WORLD_W - monster.radius);
      monster.y = clamp(monster.y - monster.facingY * 8, monster.radius, WORLD_H - monster.radius);
      if (player.iframe <= 0 && player.dashTime <= 0) {
        player.hp -= monster.attackDamage;
        player.hurt = 0.16;
        player.iframe = Math.max(player.iframe, 0.32);
        if (player.dashTime <= 0) {
          player.x = clamp(player.x + monster.facingX * 16, player.radius, WORLD_W - player.radius);
          player.y = clamp(player.y + monster.facingY * 16, player.radius, WORLD_H - player.radius);
        }
        spawnFloater(player.x, player.y - 36, monster.attackDamage, "#a12622");
        if (player.hp <= 0) {
          downPlayer();
        }
      }
    }
  }
  separateMonsters();
  monsters = monsters.filter((monster) => !monster.dead);
}

function collectDrop(drop) {
  if (drop.kind === "item") {
    addItem(inventory, drop.itemId, 1);
    toast(`${ITEMS[drop.itemId].name} 획득`);
  } else if (learnSkill(inventory, drop.skillId)) {
    toast(`${SKILLS[drop.skillId].name} 습득`);
  } else {
    toast(`이미 익힌 기술: ${SKILLS[drop.skillId].name}`);
  }
  uiDirty = true;
}

function updateDrops(dt) {
  for (const drop of fieldDrops) {
    drop.life -= dt;
    if (drop.life <= 0) {
      continue;
    }
    if (Math.hypot(player.x - drop.x, player.y - drop.y) < PICKUP_RANGE + player.radius) {
      drop.life = -1;
      collectDrop(drop);
    }
  }
  fieldDrops = fieldDrops.filter((drop) => drop.life > 0);
}

function updateRespawn(dt) {
  if (monsters.length >= 6) {
    respawnIn = 8;
    return;
  }
  respawnIn -= dt;
  if (respawnIn > 0) {
    return;
  }
  respawnIn = 8;
  const ids = Object.keys(MONSTERS);
  spawnMonster(ids[Math.floor(Math.random() * ids.length)]);
}

function updateDust(dt) {
  for (const speck of dust) {
    speck.life -= dt;
    speck.x += speck.vx * dt;
    speck.y += speck.vy * dt;
  }
  for (let index = dust.length - 1; index >= 0; index -= 1) {
    if (dust[index].life <= 0) {
      dust.splice(index, 1);
    }
  }
  for (const floater of floaters) {
    floater.life -= dt;
    floater.y -= 24 * dt;
  }
  for (let index = floaters.length - 1; index >= 0; index -= 1) {
    if (floaters[index].life <= 0) {
      floaters.splice(index, 1);
    }
  }
}

function camera() {
  return {
    x: clamp(player.x - viewW / 2, 0, Math.max(0, WORLD_W - viewW)),
    y: clamp(player.y - viewH / 2, 0, Math.max(0, WORLD_H - viewH))
  };
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
}

function pathRoundRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function paint(fill, width = 3) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.fill();
  ctx.stroke();
}

function drawShadow(x, y, rx, ry) {
  ctx.save();
  ctx.fillStyle = "rgba(48, 32, 16, 0.18)";
  ctx.beginPath();
  ctx.ellipse(x, y + 16, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGrass(piece) {
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.tilt);
  ctx.strokeStyle = "#5f8a45";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-4 * piece.scale, -10 * piece.scale);
  ctx.moveTo(0, 0);
  ctx.lineTo(1 * piece.scale, -12 * piece.scale);
  ctx.moveTo(0, 0);
  ctx.lineTo(6 * piece.scale, -9 * piece.scale);
  ctx.stroke();
  ctx.restore();
}

function drawStone(piece) {
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.beginPath();
  ctx.ellipse(0, 0, 8 * piece.scale, 5 * piece.scale, piece.tilt, 0, Math.PI * 2);
  paint("#cbb89a", 2);
  ctx.restore();
}

function drawWorld() {
  ctx.fillStyle = "#e4d0aa";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.strokeStyle = "#8a5a32";
  ctx.lineWidth = 12;
  ctx.strokeRect(28, 28, WORLD_W - 56, WORLD_H - 56);
  ctx.beginPath();
  ctx.arc(WORLD_W / 2, WORLD_H / 2, 210, 0, Math.PI * 2);
  ctx.fillStyle = "#d7bc8c";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  for (const piece of decor) {
    if (piece.kind === "grass") {
      drawGrass(piece);
    } else {
      drawStone(piece);
    }
  }
}

function drawPerson(actor, look) {
  const bob = Math.sin(time * (actor.moving ? 10 : 2.4) + actor.id) * (actor.moving ? 2 : 0.8);
  const fx = actor.facingX;
  const fy = actor.facingY;
  ctx.save();
  ctx.translate(actor.x, actor.y + bob);
  pathRoundRect(-7, 0, 6, 12, 2);
  paint(look.pants);
  pathRoundRect(1, 0, 6, 12, 2);
  paint(look.pants);
  pathRoundRect(-13, -20, 26, 22, 8);
  paint(look.robe);
  if (look.trim) {
    ctx.fillStyle = look.trim;
    ctx.fillRect(-3, -18, 6, 20);
  }
  ctx.beginPath();
  ctx.arc(0, -30, 10, 0, Math.PI * 2);
  paint(look.skin);
  ctx.beginPath();
  ctx.arc(-1, -36, 9, Math.PI, Math.PI * 2);
  ctx.fillStyle = look.hair;
  ctx.fill();
  if (look.headband) {
    ctx.fillStyle = look.headband;
    ctx.fillRect(-10, -32, 20, 4);
  }
  if (look.mask) {
    ctx.fillStyle = look.mask;
    pathRoundRect(-10, -28, 20, 7, 2);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  ctx.fillRect(-5 + fx * 2, -32 + fy * 2, 3, 3);
  ctx.fillRect(2 + fx * 2, -32 + fy * 2, 3, 3);
  if (look.blade || look.club) {
    ctx.strokeStyle = look.club ? "#6b442c" : "#d7dde4";
    ctx.lineWidth = look.club ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(8, -8);
    ctx.lineTo(8 + fx * 20, -8 + fy * 16);
    ctx.stroke();
    if (look.club) {
      ctx.beginPath();
      ctx.arc(8 + fx * 22, -8 + fy * 18, 5, 0, Math.PI * 2);
      paint("#6b442c", 2);
    }
  }
  if (look.iron) {
    ctx.strokeStyle = "rgba(226, 120, 48, 0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-12, -6, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, -6, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWolf(monster) {
  const bob = Math.sin(time * (monster.moving ? 12 : 2) + monster.id) * (monster.moving ? 2 : 0.7);
  const fx = monster.facingX;
  const fy = monster.facingY;
  ctx.save();
  ctx.translate(monster.x, monster.y + bob);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.fillStyle = "#5e6b78";
  for (const [lx, ly] of [[-10, 2], [8, 2], [-8, -12], [6, -12]]) {
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + fx * 3, ly + 8);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(-fx * 4, -4, 16, 9, Math.atan2(fy, fx), 0, Math.PI * 2);
  paint("#7f8d9b");
  ctx.beginPath();
  ctx.moveTo(-fx * 18, -6);
  ctx.quadraticCurveTo(-fx * 30, -18 - fy * 8, -fx * 16, -2);
  ctx.strokeStyle = "#7f8d9b";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(fx * 14, -8 + fy * 4, 8, 7, 0, 0, Math.PI * 2);
  paint("#d5dde4");
  ctx.beginPath();
  ctx.moveTo(fx * 18, -8 + fy * 4);
  ctx.lineTo(fx * 28, -4 + fy * 10);
  ctx.lineTo(fx * 16, -2 + fy * 8);
  ctx.closePath();
  paint("#2a2118", 2);
  ctx.beginPath();
  ctx.moveTo(fx * 8, -14);
  ctx.lineTo(fx * 12, -26);
  ctx.lineTo(fx * 16, -12);
  ctx.closePath();
  paint("#7f8d9b", 2);
  ctx.beginPath();
  ctx.moveTo(fx * 14, -13);
  ctx.lineTo(fx * 20, -24);
  ctx.lineTo(fx * 22, -11);
  ctx.closePath();
  paint("#7f8d9b", 2);
  ctx.fillStyle = INK;
  ctx.fillRect(fx * 16 - 1, -10 + fy * 3, 2, 2);
  ctx.restore();
}

function drawActor(actor) {
  if (actor.body === "wolf") {
    drawShadow(actor.x, actor.y, 18, 7);
    drawWolf(actor);
  } else {
  const looks = {
    bandit: { robe: "#9a6244", pants: "#3e342c", hair: "#2a2118", skin: "#f0c9a6", mask: "#c23b3b", club: true },
    swordsman: { robe: "#f7f3ea", pants: "#243044", hair: "#1c140f", skin: "#f3c7a1", trim: "#1f3d6e", blade: true },
    player: {
      robe: "#244e86",
      pants: "#1e2a3a",
      hair: "#1c140f",
      skin: "#f3c7a1",
      trim: "#c23b3b",
      headband: "#f4f4f4",
      blade: true,
      iron: player.ironArm > 0
    }
  };
  const look = looks[actor.body || "player"];
  drawShadow(actor.x, actor.y, actor.radius, 7);
  drawPerson(actor, look);
  }
  if (actor.hitFlash > 0 || (actor === player && actor.hurt > 0)) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = actor === player ? "#ffb4a8" : "#fff";
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 10, actor.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSwing() {
  if (player.swing <= 0) {
    return;
  }
  const flash = player.swingKind === "flash";
  const range = flash ? SKILLS.flash_cut.range : BASIC_RANGE;
  const spread = flash ? 0.7 : 1.05;
  const angle = Math.atan2(player.facingY, player.facingX);
  ctx.save();
  ctx.translate(player.x, player.y - 8);
  ctx.rotate(angle);
  ctx.globalAlpha = Math.min(1, player.swing * 7);
  ctx.strokeStyle = flash ? "#f4f7fb" : INK;
  ctx.lineWidth = flash ? 8 : 5;
  ctx.beginPath();
  ctx.arc(0, 0, range * 0.72, -spread / 2, spread / 2);
  ctx.stroke();
  if (flash) {
    ctx.strokeStyle = "#d64545";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

function drawDrop(drop) {
  const item = drop.kind === "item" ? ITEMS[drop.itemId] : SKILLS[drop.skillId];
  const blink = drop.life < 4 && Math.sin(time * 10) > 0;
  if (blink) {
    return;
  }
  ctx.save();
  ctx.translate(drop.x, drop.y + Math.sin(time * 3 + drop.x) * 2);
  ctx.beginPath();
  if (drop.kind === "skill") {
    pathRoundRect(-8, -12, 16, 18, 2);
  } else {
    ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2);
  }
  paint(item.color, 2);
  ctx.fillStyle = INK;
  ctx.font = "700 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(item.name, 0, 20);
  ctx.restore();
}

function drawBars() {
  for (const monster of monsters) {
    const y = monster.y - 46;
    ctx.fillStyle = "#2a2118";
    pathRoundRect(monster.x - 24, y, 48, 8, 3);
    ctx.fill();
    ctx.fillStyle = "#d64545";
    const width = 48 * clamp(monster.hp / monster.maxHp, 0, 1);
    if (width > 0) {
      pathRoundRect(monster.x - 24, y, width, 8, 3);
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    pathRoundRect(monster.x - 24, y, 48, 8, 3);
    ctx.stroke();
    ctx.font = "700 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff8ec";
    ctx.fillText(`${Math.ceil(monster.hp)}/${monster.maxHp}`, monster.x, y + 8);
    if (DEBUG_MODE) {
      const label = strengthLabel(monster);
      ctx.font = "700 13px sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#f6efe2";
      ctx.strokeText(label, monster.x, y - 6);
      ctx.fillStyle = INK;
      ctx.fillText(label, monster.x, y - 6);
    }
  }
}

function drawDustAndNumbers() {
  for (const speck of dust) {
    ctx.globalAlpha = Math.max(0, speck.life * 3);
    ctx.fillStyle = "#cbb59a";
    ctx.beginPath();
    ctx.ellipse(speck.x, speck.y, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const floater of floaters) {
    ctx.globalAlpha = Math.max(0, floater.life * 1.6);
    ctx.fillStyle = floater.color;
    ctx.font = "700 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.globalAlpha = 1;
}

function drawBodies() {
  const bodies = monsters.map((monster) => ({ y: monster.y, kind: "monster", actor: monster }));
  bodies.push({ y: player.y, kind: "player", actor: player });
  bodies.sort((a, b) => a.y - b.y);
  const hidePlayer = player.iframe > 0 && Math.sin(time * 36) > 0;
  for (const body of bodies) {
    if (body.kind === "player" && hidePlayer) {
      continue;
    }
    drawActor(body.actor);
  }
}

function renderScene() {
  const cam = camera();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#cbb892";
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.setTransform(dpr, 0, 0, dpr, -cam.x * dpr, -cam.y * dpr);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  drawWorld();
  for (const drop of fieldDrops) {
    drawDrop(drop);
  }
  for (const monster of monsters) {
    drawAura(ctx, monster, time);
  }
  drawBodies();
  for (const monster of monsters) {
    drawStrengthOutline(ctx, monster);
  }
  drawSwing();
  drawDustAndNumbers();
  drawBars();
}

function equippedNames() {
  const names = RECIPES.filter((recipe) => inventory.equipped[recipe.id]).map((recipe) => recipe.name);
  return names.length ? names.join(" · ") : "장비 없음";
}

function updateHud() {
  const stats = playerStats();
  const ratio = stats.maxHp > 0 ? clamp(player.hp / stats.maxHp, 0, 1) : 0;
  hudHpFill.style.width = `${ratio * 100}%`;
  hudHpText.textContent = `HP ${Math.ceil(player.hp)} / ${stats.maxHp}`;
  statLine.textContent = `공격 ${stats.attack.toFixed(1)} · 이동 ${Math.round(stats.speed)}`;
  gearLine.textContent = equippedNames();
  for (const slot of skillRow.children) {
    const skillId = slot.dataset.skill;
    const skill = SKILLS[skillId];
    const learned = hasSkill(inventory, skillId);
    const cd = player.skillCd[skillId];
    slot.className = "skill";
    if (!learned) {
      slot.classList.add("locked");
    } else if (skillId === "iron_arm" && player.ironArm > 0) {
      slot.classList.add("active");
    } else if (cd <= 0) {
      slot.classList.add("ready");
    }
    const state = slot.querySelector("span");
    if (!learned) {
      state.textContent = "미습득";
    } else if (skillId === "iron_arm" && player.ironArm > 0) {
      state.textContent = `발동 ${player.ironArm.toFixed(1)}`;
    } else if (cd > 0) {
      state.textContent = cd.toFixed(1);
    } else {
      state.textContent = "준비";
    }
    state.dataset.key = skill.key;
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

function renderInventory() {
  inventoryEl.replaceChildren();
  const head = element("div", "panel-head");
  head.append(element("h2", null, "인벤토리"));
  const close = element("button", null, "닫기");
  close.type = "button";
  close.addEventListener("click", () => inventoryEl.classList.add("hidden"));
  head.append(close);
  inventoryEl.append(head);

  const itemIds = Object.keys(ITEMS).filter((itemId) => itemCount(inventory, itemId) > 0);
  if (!itemIds.length) {
    inventoryEl.append(element("p", "muted", "아직 전리품이 없다."));
  }
  for (const itemId of itemIds) {
    const item = ITEMS[itemId];
    const block = element("article", "entry");
    block.append(element("h3", null, item.name));
    block.append(element("p", "muted", `수량 ${itemCount(inventory, itemId)}`));
    block.append(element("p", "muted", item.description));
    inventoryEl.append(block);
  }

  const gearTitle = element("h2", null, "장신구");
  gearTitle.style.marginTop = "16px";
  inventoryEl.append(gearTitle);
  const owned = RECIPES.filter((recipe) => ownsAccessory(inventory, recipe.id));
  if (!owned.length) {
    inventoryEl.append(element("p", "muted", "제작한 장신구가 없다."));
  }
  for (const recipe of owned) {
    const block = element("article", "entry");
    block.append(element("h3", null, recipe.name));
    block.append(element("p", "muted", `${recipe.effectText}. ${recipe.description}`));
    const button = element("button", null, inventory.equipped[recipe.id] ? "해제" : "착용");
    button.type = "button";
    button.addEventListener("click", () => {
      const before = playerStats().maxHp;
      toggleEquip(inventory, recipe.id);
      syncHp(before);
      uiDirty = true;
      refreshPanels();
    });
    block.append(button);
    inventoryEl.append(block);
  }

  const skillTitle = element("h2", null, "기술");
  skillTitle.style.marginTop = "16px";
  inventoryEl.append(skillTitle);
  const learned = SKILL_ORDER.filter((skillId) => hasSkill(inventory, skillId));
  if (!learned.length) {
    inventoryEl.append(element("p", "muted", "익힌 기술이 없다."));
  }
  for (const skillId of learned) {
    const skill = SKILLS[skillId];
    const block = element("article", "entry");
    block.append(element("h3", null, `${skill.name} (${skill.key})`));
    block.append(element("p", "muted", skill.description));
    inventoryEl.append(block);
  }
}

function renderCraft() {
  craftEl.replaceChildren();
  const head = element("div", "panel-head");
  head.append(element("h2", null, "제작"));
  const close = element("button", null, "닫기");
  close.type = "button";
  close.addEventListener("click", () => craftEl.classList.add("hidden"));
  head.append(close);
  craftEl.append(head);

  for (const recipe of RECIPES) {
    const block = element("article", "recipe");
    block.append(element("h3", null, recipe.name));
    block.append(element("p", "muted", `${recipe.effectText}. ${recipe.description}`));
    const list = element("ul", "materials");
    for (const material of recipe.materials) {
      const owned = itemCount(inventory, material.itemId);
      const row = element("li", owned >= material.count ? "ok" : "short", `${ITEMS[material.itemId].name} ${owned} / ${material.count}`);
      list.append(row);
    }
    block.append(list);
    const ownedGear = ownsAccessory(inventory, recipe.id);
    const button = element("button", null, ownedGear ? "보유 중" : "제작");
    button.type = "button";
    button.disabled = ownedGear || !canCraft(inventory, recipe);
    button.addEventListener("click", () => {
      if (!craft(inventory, recipe)) {
        return;
      }
      toast(`${recipe.name} 제작`);
      uiDirty = true;
      refreshPanels();
    });
    block.append(button);
    craftEl.append(block);
  }
}

function refreshPanels() {
  if (!inventoryEl.classList.contains("hidden")) {
    renderInventory();
  }
  if (!craftEl.classList.contains("hidden")) {
    renderCraft();
  }
  uiDirty = false;
}

function renderToasts() {
  toastWrap.replaceChildren();
  for (const entry of toasts) {
    const node = element("div", "toast", entry.text);
    node.style.opacity = String(Math.min(1, entry.life));
    toastWrap.append(node);
  }
}

function togglePanel(element) {
  element.classList.toggle("hidden");
  if (!element.classList.contains("hidden")) {
    refreshPanels();
  }
}

function buildSkillRow() {
  skillRow.replaceChildren();
  for (const skillId of SKILL_ORDER) {
    const skill = SKILLS[skillId];
    const slot = element("div", "skill locked");
    slot.dataset.skill = skillId;
    slot.append(element("b", null, `${skill.name} ${skill.key}`));
    slot.append(element("span", null, "미습득"));
    skillRow.append(slot);
  }
}

function buildDebugBar() {
  if (!DEBUG_MODE) {
    debugBar.classList.add("hidden");
    document.body.classList.remove("debug");
    return;
  }
  document.body.classList.add("debug");
  debugBar.classList.remove("hidden");
  debugBar.replaceChildren(element("strong", null, "DEBUG"));
  for (const monster of Object.values(MONSTERS)) {
    for (const roll of [0, 25, 50, 75, 100]) {
      const button = element("button", null, `${monster.name} ${roll}`);
      button.type = "button";
      button.addEventListener("click", () => {
        spawnMonster(monster.id, {
          strengthRoll: roll,
          x: player.x + player.facingX * 140,
          y: player.y + player.facingY * 110
        });
      });
      debugBar.append(button);
    }
  }
}

function frame(stamp) {
  if (!lastStamp) {
    lastStamp = stamp;
  }
  const dt = Math.min(0.05, (stamp - lastStamp) / 1000);
  lastStamp = stamp;
  time += dt;
  if (!panelsOpen()) {
    updatePlayer(dt);
    updateMonsters(dt);
    updateDrops(dt);
    updateRespawn(dt);
  } else {
    for (const monster of monsters) {
      updateAura(monster, dt, time);
    }
  }
  updateDust(dt);
  for (const entry of toasts) {
    entry.life -= dt;
  }
  for (let index = toasts.length - 1; index >= 0; index -= 1) {
    if (toasts[index].life <= 0) {
      toasts.splice(index, 1);
    }
  }
  renderScene();
  updateHud();
  renderToasts();
  if (uiDirty) {
    refreshPanels();
  }
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyE", "KeyC"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
  if (event.repeat) {
    return;
  }
  if (event.code === "Space") {
    startSwing("basic", 0.16);
  } else if (event.code === "KeyJ") {
    useSkill("flash_cut");
  } else if (event.code === "KeyK") {
    useSkill("gale_step");
  } else if (event.code === "KeyL") {
    useSkill("iron_arm");
  } else if (event.code === "KeyE") {
    togglePanel(inventoryEl);
  } else if (event.code === "KeyC") {
    togglePanel(craftEl);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => {
  keys.clear();
});

window.addEventListener("resize", resize);

canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const cam = camera();
  const worldX = event.clientX - rect.left + cam.x;
  const worldY = event.clientY - rect.top + cam.y;
  const dx = worldX - player.x;
  const dy = worldY - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 8) {
    player.facingX = dx / dist;
    player.facingY = dy / dist;
    pointerAim = true;
  }
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }
  startSwing("basic", 0.16);
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

document.querySelector("#inv-button").addEventListener("click", () => togglePanel(inventoryEl));
document.querySelector("#craft-button").addEventListener("click", () => togglePanel(craftEl));

window.spawnMonster = spawnMonster;
if (DEBUG_MODE) {
  window.__game = {
    spawnMonster,
    monsters: () => monsters,
    player: () => player,
    inventory,
    addItem: (itemId, amount) => {
      addItem(inventory, itemId, amount);
      uiDirty = true;
    },
    learnSkill: (skillId) => {
      const learned = learnSkill(inventory, skillId);
      uiDirty = true;
      return learned;
    },
    lastRolls: () => lastRolls,
    kill(monster) {
      defeatMonster(monster);
      monsters = monsters.filter((entry) => !entry.dead);
    }
  };
}

["bandit", "bandit", "wolf", "wolf", "swordsman", "swordsman"].forEach((typeId, index) => {
  const angle = (index / 6) * Math.PI * 2;
  spawnMonster(typeId, {
    x: player.x + Math.cos(angle) * 280,
    y: player.y + Math.sin(angle) * 200
  });
});

buildSkillRow();
buildDebugBar();
resize();
requestAnimationFrame(frame);
