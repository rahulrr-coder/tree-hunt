// One definition of the plant categories, shared by the Hunt, Map and Board pages and the API.
import type { Kind } from "./hunt";

export type FindKind = Kind | "other";
export type KindFilter = "all" | "tree" | "shrub" | "herb" | "other";

export const KIND_FILTERS: { id: KindFilter; label: string; color: string }[] = [
  { id: "all", label: "All", color: "#1f2a1f" },
  { id: "tree", label: "Trees", color: "#2f6b3a" },
  { id: "shrub", label: "Shrubs & flowers", color: "#b5532e" },
  { id: "herb", label: "Herbs & climbers", color: "#3d6fb5" },
  { id: "other", label: "Other", color: "#6b6b5e" },
];

/** Which filter chip a stored kind belongs to. Finds saved before kinds existed count as "other". */
export function groupOf(kind: FindKind | undefined | null): Exclude<KindFilter, "all"> {
  if (kind === "tree" || kind === "shrub") return kind;
  if (kind === "herb" || kind === "climber") return "herb";
  return "other";
}

/** The stored kinds a filter stands for (used in database queries). */
export function kindsFor(filter: KindFilter): FindKind[] | null {
  switch (filter) {
    case "tree": return ["tree"];
    case "shrub": return ["shrub"];
    case "herb": return ["herb", "climber"];
    case "other": return ["other"];
    default: return null;
  }
}

export const colorOfKind = (kind: FindKind | undefined | null) =>
  KIND_FILTERS.find((f) => f.id === groupOf(kind))!.color;
