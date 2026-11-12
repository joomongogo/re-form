export function effectiveDropChance(baseChance, strengthRoll) {
  if (!Number.isFinite(baseChance) || baseChance <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, baseChance * (1 + strengthRoll / 100)));
}

export function rollLoot(entries, strengthRoll, rng = Math.random) {
  return entries.map((entry) => {
    const chance = effectiveDropChance(entry.chance, strengthRoll);
    return {
      kind: entry.kind,
      itemId: entry.itemId,
      skillId: entry.skillId,
      baseChance: entry.chance,
      chance,
      hit: rng() < chance
    };
  });
}
