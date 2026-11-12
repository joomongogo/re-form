import { RECIPES } from "./data.js";
import { itemCount } from "./inventory.js";

export function ownsAccessory(inventory, recipeId) {
  return Boolean(inventory.ownedAccessories[recipeId]);
}

export function canCraft(inventory, recipe) {
  if (ownsAccessory(inventory, recipe.id)) {
    return false;
  }
  return recipe.materials.every((material) => itemCount(inventory, material.itemId) >= material.count);
}

export function craft(inventory, recipe) {
  if (!canCraft(inventory, recipe)) {
    return false;
  }
  for (const material of recipe.materials) {
    inventory.counts[material.itemId] -= material.count;
  }
  inventory.ownedAccessories[recipe.id] = true;
  return true;
}

export function toggleEquip(inventory, recipeId) {
  if (!ownsAccessory(inventory, recipeId)) {
    return false;
  }
  inventory.equipped[recipeId] = !inventory.equipped[recipeId];
  return inventory.equipped[recipeId];
}

export function equipmentMultipliers(inventory) {
  const mods = { attack: 1, speed: 1, maxHp: 1 };
  for (const recipe of RECIPES) {
    if (!inventory.equipped[recipe.id]) {
      continue;
    }
    if (recipe.effect.attack) {
      mods.attack *= 1 + recipe.effect.attack;
    }
    if (recipe.effect.speed) {
      mods.speed *= 1 + recipe.effect.speed;
    }
    if (recipe.effect.maxHp) {
      mods.maxHp *= 1 + recipe.effect.maxHp;
    }
  }
  return mods;
}
