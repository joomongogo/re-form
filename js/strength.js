export function rollStrength(rng = Math.random) {
  return Math.max(0, Math.min(100, Math.floor(rng() * 101)));
}

export function resolveStrength(options = {}, rng = Math.random) {
  if (options.strengthRoll == null) {
    return rollStrength(rng);
  }
  const value = Number(options.strengthRoll);
  if (!Number.isFinite(value)) {
    return rollStrength(rng);
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function strengthMultiplier(strengthRoll) {
  return 1 + strengthRoll / 100;
}

export function applyStrength(base, strengthRoll) {
  const multiplier = strengthMultiplier(strengthRoll);
  return {
    multiplier,
    maxHp: Math.round(base.hp * multiplier),
    attackDamage: Math.round(base.attack * multiplier * 10) / 10,
    speed: base.speed
  };
}
