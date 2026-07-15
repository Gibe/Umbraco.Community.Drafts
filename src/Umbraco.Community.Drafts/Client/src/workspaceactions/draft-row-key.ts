/** Builds a stable identity key for a property value row, used to track per-row selection. */
export function buildValueKey(alias: string, culture: string | null, segment: string | null): string {
  return `value:${alias}:${culture ?? ""}:${segment ?? ""}`;
}

/** Builds a stable identity key for a variant (name) row, used to track per-row selection. */
export function buildVariantKey(culture: string | null, segment: string | null): string {
  return `variant:${culture ?? ""}:${segment ?? ""}`;
}

/**
 * Builds a stable identity key for a single block within a block collection.
 * `collectionKey` is the key of the collection holding the block: the property
 * value row key at the top level, or a `buildBlockPropKey`/`buildBlockAreaKey`
 * for nested collections.
 */
export function buildBlockRowKey(collectionKey: string, blockId: string): string {
  return `${collectionKey}:block:${blockId}`;
}

/** Builds the collection key for a nested block-editor property inside a block. */
export function buildBlockPropKey(
  blockKey: string,
  alias: string,
  culture: string | null,
  segment: string | null
): string {
  return `${blockKey}:prop:${alias}:${culture ?? ""}:${segment ?? ""}`;
}

/** Builds the collection key for a block-grid area inside a block. */
export function buildBlockAreaKey(blockKey: string, areaKey: string): string {
  return `${blockKey}:area:${areaKey}`;
}
