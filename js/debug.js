import { ITEMS, SKILLS } from "./data.js";

export const DEBUG_MODE = true;

export function strengthLabel(monster) {
  return `${monster.name} [${monster.strengthRoll}]`;
}

function entryName(roll) {
  if (roll.kind === "skill") {
    return SKILLS[roll.skillId]?.name || roll.skillId;
  }
  return ITEMS[roll.itemId]?.name || roll.itemId;
}

function formatChance(chance) {
  const percent = chance * 100;
  const digits = percent < 1 ? 3 : percent < 10 ? 2 : 1;
  return `${percent.toFixed(digits)}%`;
}

export function logLootRoll(monster, rolls) {
  if (!DEBUG_MODE) {
    return;
  }
  console.group(`[drop] ${monster.typeId} ${monster.name} [${monster.strengthRoll}]`);
  for (const roll of rolls) {
    const result = roll.skipped ? "skip" : roll.hit ? "drop" : "miss";
    console.log(
      `${entryName(roll)} base ${formatChance(roll.baseChance)} effective ${formatChance(roll.chance)} ${result}`
    );
  }
  console.groupEnd();
}
