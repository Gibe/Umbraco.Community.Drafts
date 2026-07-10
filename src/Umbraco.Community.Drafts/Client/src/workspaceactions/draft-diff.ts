import { buildValueKey, buildVariantKey } from "./draft-row-key.js";
import type { DraftContent } from "./draft-diff-modal.token.js";

export interface DraftDiffRow {
  key: string;
  alias: string;
  currentStr: string;
  draftStr: string;
  changed: boolean;
  currentMediaKeys: string[];
  draftMediaKeys: string[];
}

export function extractMediaKeys(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((v) => extractMediaKeys(v));
  if (typeof value === 'object' && value !== null) {
    const key = (value as any).mediaKey;
    if (typeof key === 'string') return [key];
  }
  return [];
}

/** Converts a property alias to a human-friendly label */
export function formatAlias(alias: string): string {
  return alias
    .replace(/[-_]/g, ' ')                      // kebab-case / snake_case → spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2')        // camelCase → words
    .replace(/\b\w/g, (c) => c.toUpperCase())   // title-case each word
    .trim();
}

/** Converts a raw property value to a human-readable string */
export function formatValueFriendly(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";

  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);

  if (typeof value === "string") {
    if (!value) return "(empty)";
    // Strip HTML tags (e.g. simple richtext stored as string)
    const stripped = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return stripped || "(empty)";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "(empty)";
    // Media picker array
    if (value[0]?.mediaKey !== undefined)
      return value.map((v: any) => v.mediaKey ?? "(unknown)").join("\n");
    // Content picker array
    if (value[0]?.contentKey !== undefined)
      return value.map((v: any) => v.contentKey ?? "(unknown)").join("\n");
    // Generic – recurse per item
    return value.map((v) => formatValueFriendly(v)).join("\n");
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;

    // Richtext stored as object with markup field
    if (typeof obj["markup"] === "string") {
      const stripped = obj["markup"].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return stripped || "(empty)";
    }
    // Block editor (contentData array) — format each block's inner property
    // values so edits inside a block (not just adding/removing blocks) are detected
    if (Array.isArray(obj["contentData"])) {
      const contentData = obj["contentData"] as Record<string, unknown>[];
      const settingsData = Array.isArray(obj["settingsData"])
        ? (obj["settingsData"] as Record<string, unknown>[])
        : [];
      if (contentData.length === 0) return "(empty)";

      const formatBlockItem = (item: Record<string, unknown>): string => {
        const props = Object.entries(item)
          .filter(([k]) => k !== "key" && k !== "contentTypeKey" && k !== "udi")
          .map(([k, v]) => `${formatAlias(k)}: ${formatValueFriendly(v)}`);
        return props.length ? props.join("; ") : "(no properties)";
      };

      const blocks = contentData.map(
        (item, i) => `Block ${i + 1}: ${formatBlockItem(item)}`
      );
      if (settingsData.length > 0) {
        blocks.push(
          ...settingsData.map(
            (item, i) => `Settings ${i + 1}: ${formatBlockItem(item)}`
          )
        );
      }
      return blocks.join("\n");
    }
    // Single media / content picker
    if (typeof obj["mediaKey"] === "string") return obj["mediaKey"];
    if (typeof obj["contentKey"] === "string") return obj["contentKey"];
    // Fallback: compact JSON
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

/** Appends the culture/segment to a row label so variant rows are distinguishable. */
function withVariantSuffix(label: string, culture: string | null, segment: string | null): string {
  const parts = [culture, segment].filter((p): p is string => !!p);
  return parts.length ? `${label} (${parts.join(", ")})` : label;
}

/** Builds the per-row comparison between current content and a draft. */
export function buildDiffRows(
  current: DraftContent | undefined,
  draft: DraftContent | undefined
): DraftDiffRow[] {
  // Pair variants by culture/segment rather than array index, and include
  // variants that exist on only one side — the apply step in
  // auto-save.element.ts matches on the same key, so every appliable name
  // change must get a row here or partial selection would silently skip it.
  const findVariant = (
    variants: DraftContent["variants"] | undefined,
    culture: string | null,
    segment: string | null
  ) =>
    variants?.find(
      (v) => (v.culture ?? null) === culture && (v.segment ?? null) === segment
    );

  const variantRows = new Map<string, DraftDiffRow>();
  for (const v of [...(current?.variants ?? []), ...(draft?.variants ?? [])]) {
    const culture = v.culture ?? null;
    const segment = v.segment ?? null;
    const key = buildVariantKey(culture, segment);
    if (variantRows.has(key)) continue;
    const currentStr = findVariant(current?.variants, culture, segment)?.name || "(empty)";
    const draftStr = findVariant(draft?.variants, culture, segment)?.name || "(empty)";
    variantRows.set(key, {
      key,
      alias: withVariantSuffix("Name", culture, segment),
      currentStr,
      draftStr,
      changed: currentStr !== draftStr,
      currentMediaKeys: [],
      draftMediaKeys: [],
    });
  }

  // Values are variant-aware, so the same alias can legitimately appear once
  // per culture/segment — one row per (alias, culture, segment), not per alias.
  const findValue = (
    values: DraftContent["values"] | undefined,
    alias: string,
    culture: string | null,
    segment: string | null
  ) =>
    values?.find(
      (v) =>
        v.alias === alias &&
        (v.culture ?? null) === culture &&
        (v.segment ?? null) === segment
    );

  const propertyRows = new Map<string, DraftDiffRow>();
  for (const v of [...(current?.values ?? []), ...(draft?.values ?? [])]) {
    const culture = v.culture ?? null;
    const segment = v.segment ?? null;
    const key = buildValueKey(v.alias, culture, segment);
    if (propertyRows.has(key)) continue;
    const currentVal = findValue(current?.values, v.alias, culture, segment);
    const draftVal = findValue(draft?.values, v.alias, culture, segment);
    const currentStr = formatValueFriendly(currentVal?.value);
    const draftStr = formatValueFriendly(draftVal?.value);
    propertyRows.set(key, {
      key,
      alias: withVariantSuffix(formatAlias(v.alias), culture, segment),
      currentStr,
      draftStr,
      changed: currentStr !== draftStr,
      currentMediaKeys: extractMediaKeys(currentVal?.value),
      draftMediaKeys: extractMediaKeys(draftVal?.value),
    });
  }

  return [...variantRows.values(), ...propertyRows.values()];
}
