export type InventoryGroupKey =
  | "secret-lair"
  | "boosters"
  | "bundles"
  | "decks"
  | "singles"
  | "other-mtg"
  | "non-mtg";

export interface InventoryGroupDef {
  key: InventoryGroupKey;
  label: string;
  description: string;
  order: number;
}

export const INVENTORY_GROUPS: InventoryGroupDef[] = [
  {
    key: "secret-lair",
    label: "Secret Lair",
    description: "Limited-edition collectible drops, sealed.",
    order: 1,
  },
  {
    key: "boosters",
    label: "Booster packs",
    description: "Sealed packs with random cards inside.",
    order: 2,
  },
  {
    key: "bundles",
    label: "Bundles",
    description: "Packs plus extras in one box.",
    order: 3,
  },
  {
    key: "decks",
    label: "Ready-to-play decks",
    description: "Pre-built decks, no building needed.",
    order: 4,
  },
  {
    key: "singles",
    label: "Single cards",
    description: "Individual loose cards.",
    order: 5,
  },
  {
    key: "other-mtg",
    label: "Other MTG products",
    description: "Other Magic: The Gathering products.",
    order: 98,
  },
  {
    key: "non-mtg",
    label: "Other (non-MTG)",
    description: "Cards and items that aren’t Magic: The Gathering.",
    order: 99,
  },
];

const GROUP_BY_KEY = new Map(INVENTORY_GROUPS.map((g) => [g.key, g]));

export function inventoryGroupByKey(key: string | null | undefined): InventoryGroupDef | null {
  if (!key) return null;
  return GROUP_BY_KEY.get(key as InventoryGroupKey) ?? null;
}

/** Options for the manual group picker (Auto = no override). */
export const INVENTORY_GROUP_OPTIONS: { value: "" | InventoryGroupKey; label: string }[] = [
  { value: "", label: "Auto (let the app decide)" },
  ...INVENTORY_GROUPS.map((g) => ({ value: g.key, label: g.label })),
];
