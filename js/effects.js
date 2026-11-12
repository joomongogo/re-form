export function auraParams(strengthRoll) {
  const roll = Math.max(0, Math.min(100, strengthRoll));
  const t = roll / 100;
  const band = roll >= 95 ? 5 : roll >= 80 ? 4 : roll >= 60 ? 3 : roll >= 40 ? 2 : roll >= 20 ? 1 : 0;
  return {
    t,
    band,
    layers: band >= 5 ? 3 : band >= 4 ? 2 : band >= 1 ? 1 : 0,
    radiusScale: 1.08 + t * 0.62,
    opacity: band === 0 ? 0 : 0.045 + t * 0.34,
    particleCap: band < 2 ? 0 : Math.round(2 + t * 10),
    spawnRate: band < 2 ? 0 : 0.55 + t * 5.2,
    pulse: band >= 4 ? 0.028 + t * 0.028 : 0,
    outline: band >= 3,
    dust: band >= 4
  };
}

export function updateAura(monster, dt, time) {
  const params = auraParams(monster.strengthRoll);
  monster.aura = params;
  if (!monster.motes) {
    monster.motes = [];
  }
  if (params.particleCap <= 0) {
    monster.motes.length = 0;
    return;
  }

  if (monster.motes.length < params.particleCap && Math.random() < dt * params.spawnRate) {
    monster.motes.push({
      angle: Math.random() * Math.PI * 2,
      radius: monster.radius * (0.35 + Math.random() * (0.55 + params.t * 0.45)),
      rise: 0,
      life: 0.7 + Math.random() * (0.7 + params.t),
      maxLife: 0,
      size: (params.dust ? 2.4 : 1.6) + Math.random() * 2.2,
      dust: params.dust && Math.random() < 0.55
    });
    const mote = monster.motes[monster.motes.length - 1];
    mote.maxLife = mote.life;
  }

  for (const mote of monster.motes) {
    mote.life -= dt;
    mote.rise -= dt * (14 + params.t * 30);
    mote.angle += dt * (0.35 + params.t);
    mote._time = time;
  }
  monster.motes = monster.motes.filter((mote) => mote.life > 0);
}

export function drawAura(ctx, monster, time) {
  const params = monster.aura || auraParams(monster.strengthRoll);
  if (params.layers <= 0 && !(monster.motes && monster.motes.length)) {
    return;
  }

  const pulse = 1 + Math.sin(time * (1.3 + params.t * 2.4)) * params.pulse;
  let alpha = params.opacity;
  if (params.band === 1) {
    alpha *= 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.15));
  }

  ctx.save();
  ctx.translate(monster.x, monster.y - 6);
  for (let layer = 0; layer < params.layers; layer += 1) {
    const radius = monster.radius * params.radiusScale * pulse * (1 + layer * 0.2);
    const layerAlpha = Math.max(0, alpha * (1 - layer * 0.28));
    const gradient = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
    if (layer % 2 === 0) {
      gradient.addColorStop(0, `rgba(255, 214, 120, ${layerAlpha})`);
      gradient.addColorStop(1, `rgba(212, 148, 48, 0)`);
    } else {
      gradient.addColorStop(0, `rgba(214, 72, 48, ${layerAlpha * 0.85})`);
      gradient.addColorStop(1, `rgba(214, 72, 48, 0)`);
    }
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  for (const mote of monster.motes || []) {
    const fade = mote.maxLife > 0 ? mote.life / mote.maxLife : 0;
    const x = Math.cos(mote.angle) * mote.radius;
    const y = Math.sin(mote.angle) * mote.radius * 0.55 + mote.rise;
    ctx.beginPath();
    ctx.fillStyle = mote.dust
      ? `rgba(120, 84, 48, ${0.15 + fade * 0.4})`
      : `rgba(255, 220, 140, ${0.18 + fade * 0.6})`;
    ctx.arc(x, y, mote.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawStrengthOutline(ctx, monster) {
  const params = monster.aura || auraParams(monster.strengthRoll);
  if (!params.outline) {
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(monster.x, monster.y - 8, monster.radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255, 214, 130, ${0.22 + params.t * 0.5})`;
  ctx.lineWidth = 2 + params.t * 1.6;
  ctx.stroke();
  ctx.restore();
}
