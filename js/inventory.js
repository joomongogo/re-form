export function createInventory() {
  return {
    counts: Object.create(null),
    ownedAccessories: Object.create(null),
    equipped: Object.create(null),
    skills: Object.create(null)
  };
}

export function itemCount(inventory, itemId) {
  return inventory.counts[itemId] || 0;
}

export function addItem(inventory, itemId, amount = 1) {
  const next = itemCount(inventory, itemId) + amount;
  inventory.counts[itemId] = Math.max(0, next);
  return inventory.counts[itemId];
}

export function hasSkill(inventory, skillId) {
  return Boolean(inventory.skills[skillId]);
}

export function learnSkill(inventory, skillId) {
  if (inventory.skills[skillId]) {
    return false;
  }
  inventory.skills[skillId] = true;
  return true;
}
