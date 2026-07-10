/** Builds a stable identity key for a property value row, used to track per-row selection. */
export function buildValueKey(alias: string, culture: string | null, segment: string | null): string {
  return `value:${alias}:${culture ?? ""}:${segment ?? ""}`;
}

/** Builds a stable identity key for a variant (name) row, used to track per-row selection. */
export function buildVariantKey(culture: string | null, segment: string | null): string {
  return `variant:${culture ?? ""}:${segment ?? ""}`;
}
