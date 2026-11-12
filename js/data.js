function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export const ITEMS = freeze({
  old_cloth: {
    id: "old_cloth",
    name: "낡은 천 조각",
    description: "해진 옷자락. 아직 먼지와 땀내가 남아 있다.",
    color: "#cbb59a"
  },
  rusty_iron: {
    id: "rusty_iron",
    name: "녹슨 철편",
    description: "녹이 슨 얇은 쇠조각. 두드리면 겨우 모양이 잡힌다.",
    color: "#a6634b"
  },
  wolf_fang: {
    id: "wolf_fang",
    name: "늑대 송곳니",
    description: "무림 늑대의 단단한 이빨.",
    color: "#f4f1ea"
  },
  beast_hide: {
    id: "beast_hide",
    name: "짐승 가죽",
    description: "질기고 거친 짐승의 가죽.",
    color: "#8d6b43"
  },
  broken_blade: {
    id: "broken_blade",
    name: "부러진 검 조각",
    description: "날이 부러진 검의 파편.",
    color: "#9aa3ad"
  },
  warrior_token: {
    id: "warrior_token",
    name: "무인의 증표",
    description: "무인이 남긴 작은 표식.",
    color: "#d4a24a"
  },
  beast_aura: {
    id: "beast_aura",
    name: "야수의 기운",
    description: "짐승의 기운이 엉겨 굳은 조각.",
    color: "#7d5cff"
  },
  inner_crystal: {
    id: "inner_crystal",
    name: "내공의 결정",
    description: "맑게 응축된 내공의 조각.",
    color: "#6ec8d4"
  }
});

export const SKILLS = freeze({
  flash_cut: {
    id: "flash_cut",
    name: "일섬",
    key: "J",
    description: "전방으로 빠르게 베는 공격. 짧은 거리의 적에게 강한 피해를 준다.",
    cooldown: 1.2,
    damageMultiplier: 2.4,
    range: 112,
    minDot: 0.2,
    color: "#d64545"
  },
  gale_step: {
    id: "gale_step",
    name: "질풍보",
    key: "K",
    description: "짧은 거리를 빠르게 이동한다. 이동하는 동안 아주 짧게 피격을 무시한다.",
    cooldown: 2.6,
    dashDistance: 148,
    dashTime: 0.16,
    iframe: 0.16,
    color: "#3d8b6e"
  },
  iron_arm: {
    id: "iron_arm",
    name: "철완",
    key: "L",
    description: "일정 시간 동안 공격력이 오른다.",
    cooldown: 8,
    duration: 4,
    attackMultiplier: 1.4,
    color: "#c47a3a"
  }
});

export const SKILL_ORDER = Object.freeze(["flash_cut", "gale_step", "iron_arm"]);

export const MONSTERS = freeze({
  bandit: {
    id: "bandit",
    name: "산적",
    hp: 100,
    attack: 12,
    speed: 72,
    radius: 20,
    attackInterval: 1.2,
    body: "bandit",
    drops: [
      { kind: "item", itemId: "old_cloth", chance: 0.55 },
      { kind: "item", itemId: "rusty_iron", chance: 0.3 },
      { kind: "item", itemId: "warrior_token", chance: 0.05 },
      { kind: "skill", skillId: "iron_arm", chance: 0.004 }
    ]
  },
  wolf: {
    id: "wolf",
    name: "무림 늑대",
    hp: 75,
    attack: 15,
    speed: 102,
    radius: 18,
    attackInterval: 0.95,
    body: "wolf",
    drops: [
      { kind: "item", itemId: "wolf_fang", chance: 0.6 },
      { kind: "item", itemId: "beast_hide", chance: 0.35 },
      { kind: "item", itemId: "beast_aura", chance: 0.04 },
      { kind: "skill", skillId: "gale_step", chance: 0.0035 }
    ]
  },
  swordsman: {
    id: "swordsman",
    name: "떠돌이 검객",
    hp: 140,
    attack: 18,
    speed: 64,
    radius: 22,
    attackInterval: 1.35,
    body: "swordsman",
    drops: [
      { kind: "item", itemId: "broken_blade", chance: 0.45 },
      { kind: "item", itemId: "warrior_token", chance: 0.12 },
      { kind: "item", itemId: "inner_crystal", chance: 0.02 },
      { kind: "skill", skillId: "flash_cut", chance: 0.005 }
    ]
  }
});

export const RECIPES = freeze([
  {
    id: "warrior_bracelet",
    name: "무인의 팔찌",
    description: "증표와 철편을 엮은 팔찌.",
    materials: [
      { itemId: "warrior_token", count: 3 },
      { itemId: "rusty_iron", count: 5 }
    ],
    effect: { attack: 0.05 },
    effectText: "공격력 +5%"
  },
  {
    id: "beast_necklace",
    name: "야수의 목걸이",
    description: "송곳니와 야수의 기운으로 만든 목걸이.",
    materials: [
      { itemId: "wolf_fang", count: 5 },
      { itemId: "beast_aura", count: 2 }
    ],
    effect: { speed: 0.07 },
    effectText: "이동속도 +7%"
  },
  {
    id: "inner_ring",
    name: "내공의 반지",
    description: "내공의 결정을 박은 반지.",
    materials: [
      { itemId: "inner_crystal", count: 2 },
      { itemId: "warrior_token", count: 5 }
    ],
    effect: { maxHp: 0.1 },
    effectText: "최대 HP +10%"
  }
]);
