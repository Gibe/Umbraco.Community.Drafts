import { buildBlockRowKey, buildValueKey, buildVariantKey } from "./draft-row-key.js";
import type { DraftContent } from "./draft-diff-modal.token.js";

/** A renderable image reference found inside a property value. */
export type ImageRef =
  | { kind: "media"; key: string }
  | { kind: "url"; url: string };

export interface DraftBlockRow {
  /** Selection key (see draft-row-key.ts). */
  key: string;
  /** The block's contentData key/udi. Null for the synthetic "block order" row. */
  blockId: string | null;
  isOrder: boolean;
  label: string;
  status: "added" | "removed" | "changed" | "unchanged";
  currentStr: string;
  draftStr: string;
  currentImages: ImageRef[];
  draftImages: ImageRef[];
}

export interface DraftDiffRow {
  key: string;
  alias: string;
  currentStr: string;
  draftStr: string;
  changed: boolean;
  currentImages: ImageRef[];
  draftImages: ImageRef[];
  /** Per-block sub-rows, present when this is a changed block-list property. */
  blocks?: DraftBlockRow[];
}

const IMAGE_SRC_RE = /\.(jpe?g|png|gif|webp|svg|avif|bmp)([?#]|$)/i;

export function isImageUrl(url: string): boolean {
  return IMAGE_SRC_RE.test(url);
}

/**
 * Finds image references in a property value: media picker items (mediaKey),
 * image cropper / upload objects (src) and upload field path strings.
 * With `deep`, also descends into nested objects (e.g. properties inside
 * block editor content) so images anywhere in the value are found.
 */
export function extractImageRefs(value: unknown, deep = false): ImageRef[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value.startsWith("/media/") && isImageUrl(value)
      ? [{ kind: "url", url: value }]
      : [];
  }
  if (Array.isArray(value)) return value.flatMap((v) => extractImageRefs(v, deep));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["mediaKey"] === "string") return [{ kind: "media", key: obj["mediaKey"] }];
    if (typeof obj["src"] === "string" && isImageUrl(obj["src"]))
      return [{ kind: "url", url: obj["src"] }];
    if (deep) {
      // Skip markup so <img> tags inside richtext HTML aren't misparsed
      return Object.entries(obj)
        .filter(([k]) => k !== "markup")
        .flatMap(([, v]) => extractImageRefs(v, true));
    }
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

type BlockItem = Record<string, unknown>;

interface BlockValue {
  layout?: Record<string, unknown>;
  contentData: BlockItem[];
  settingsData?: BlockItem[];
  expose?: BlockItem[];
  [key: string]: unknown;
}

const BLOCK_LIST_LAYOUT = "Umbraco.BlockList";

/**
 * Returns the value as a block-list value, or null. Block grid values are
 * rejected: their layout nests blocks inside areas, which per-block merging
 * can't safely reassemble, so they keep whole-property selection.
 */
function asBlockListValue(value: unknown): BlockValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj["contentData"])) return null;
  const layout = obj["layout"];
  if (!layout || typeof layout !== "object") return null;
  const layoutKeys = Object.keys(layout);
  if (layoutKeys.some((k) => k !== BLOCK_LIST_LAYOUT)) return null;
  return obj as BlockValue;
}

const blockIdOf = (item: BlockItem): string | undefined =>
  typeof item["key"] === "string"
    ? item["key"]
    : typeof item["udi"] === "string"
      ? item["udi"]
      : undefined;

function layoutEntries(v: BlockValue | null): BlockItem[] {
  const arr = (v?.layout as Record<string, unknown> | undefined)?.[BLOCK_LIST_LAYOUT];
  return Array.isArray(arr) ? (arr as BlockItem[]) : [];
}

const layoutContentId = (e: BlockItem): string | undefined =>
  typeof e["contentKey"] === "string"
    ? e["contentKey"]
    : typeof e["contentUdi"] === "string"
      ? e["contentUdi"]
      : undefined;

const layoutSettingsId = (e: BlockItem): string | undefined =>
  typeof e["settingsKey"] === "string"
    ? e["settingsKey"]
    : typeof e["settingsUdi"] === "string"
      ? e["settingsUdi"]
      : undefined;

/** Block ids in layout order, with any layout-orphaned contentData appended. */
function blockOrder(v: BlockValue | null): string[] {
  if (!v) return [];
  const ids = layoutEntries(v)
    .map(layoutContentId)
    .filter((id): id is string => !!id);
  const seen = new Set(ids);
  for (const item of v.contentData) {
    const id = blockIdOf(item);
    if (id && !seen.has(id)) {
      ids.push(id);
      seen.add(id);
    }
  }
  return ids;
}

/** Formats a block content/settings item's properties as "Label: value" lines. */
function formatBlockProps(item: BlockItem, separator: string): string {
  const props = Array.isArray(item["values"])
    ? (item["values"] as BlockItem[]).map(
        (pv) => `${formatAlias(String(pv["alias"] ?? ""))}: ${formatValueFriendly(pv["value"])}`
      )
    : Object.entries(item)
        .filter(([k]) => k !== "key" && k !== "contentTypeKey" && k !== "udi")
        .map(([k, v]) => `${formatAlias(k)}: ${formatValueFriendly(v)}`);
  return props.length ? props.join(separator) : "(no properties)";
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
    // Image cropper / upload field
    if (typeof obj["src"] === "string") return obj["src"] || "(empty)";
    // Block editor (contentData array) — format each block's inner property
    // values so edits inside a block (not just adding/removing blocks) are detected
    if (Array.isArray(obj["contentData"])) {
      const contentData = obj["contentData"] as BlockItem[];
      const settingsData = Array.isArray(obj["settingsData"])
        ? (obj["settingsData"] as BlockItem[])
        : [];
      if (contentData.length === 0) return "(empty)";

      const blocks = contentData.map(
        (item, i) => `Block ${i + 1}: ${formatBlockProps(item, "; ")}`
      );
      if (settingsData.length > 0) {
        blocks.push(
          ...settingsData.map(
            (item, i) => `Settings ${i + 1}: ${formatBlockProps(item, "; ")}`
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

/** Formats a block's content plus its settings (if any) for the diff cell. */
function formatBlock(side: BlockValue | null, id: string): string | undefined {
  const content = side?.contentData.find((b) => blockIdOf(b) === id);
  if (!content) return undefined;
  let result = formatBlockProps(content, "\n");
  const entry = layoutEntries(side).find((e) => layoutContentId(e) === id);
  const settingsId = entry ? layoutSettingsId(entry) : undefined;
  const settings = settingsId
    ? (side?.settingsData ?? []).find((s) => blockIdOf(s) === settingsId)
    : undefined;
  if (settings) result += `\nSettings:\n${formatBlockProps(settings, "\n")}`;
  return result;
}

const BLOCK_ORDER_ID = "__order__";

/**
 * Builds per-block sub-rows for a block-list property so blocks can be
 * selected individually. Returns undefined when either side isn't a
 * block-list value (then the property keeps whole-row selection).
 */
function buildBlockRows(
  rowKey: string,
  currentValue: unknown,
  draftValue: unknown
): DraftBlockRow[] | undefined {
  const current = asBlockListValue(currentValue);
  const draft = asBlockListValue(draftValue);
  if (!current && !draft) return undefined;
  if (currentValue && !current) return undefined;
  if (draftValue && !draft) return undefined;

  const currentOrder = blockOrder(current);
  const draftOrder = blockOrder(draft);
  const currentSet = new Set(currentOrder);
  const draftSet = new Set(draftOrder);

  // Display order: current order, with draft-only blocks inserted at their draft index
  const display = [...currentOrder];
  draftOrder.forEach((id, i) => {
    if (!currentSet.has(id)) display.splice(Math.min(i, display.length), 0, id);
  });
  if (display.length === 0) return undefined;

  const rows: DraftBlockRow[] = display.map((id, i) => {
    const currentStr = formatBlock(current, id);
    const draftStr = formatBlock(draft, id);
    const status: DraftBlockRow["status"] = !currentStr
      ? "added"
      : !draftStr
        ? "removed"
        : currentStr !== draftStr
          ? "changed"
          : "unchanged";
    const currentItem = current?.contentData.find((b) => blockIdOf(b) === id);
    const draftItem = draft?.contentData.find((b) => blockIdOf(b) === id);
    return {
      key: buildBlockRowKey(rowKey, id),
      blockId: id,
      isOrder: false,
      label: `Block ${i + 1}`,
      status,
      currentStr: currentStr ?? "",
      draftStr: draftStr ?? "",
      currentImages: currentItem ? extractImageRefs(currentItem, true) : [],
      draftImages: draftItem ? extractImageRefs(draftItem, true) : [],
    };
  });

  // Reordering only shows up in the layout sequence, so give it its own row
  const commonCurrent = currentOrder.filter((id) => draftSet.has(id));
  const commonDraft = draftOrder.filter((id) => currentSet.has(id));
  if (commonCurrent.join("|") !== commonDraft.join("|")) {
    const labelOf = new Map(display.map((id, i) => [id, `Block ${i + 1}`]));
    rows.push({
      key: buildBlockRowKey(rowKey, BLOCK_ORDER_ID),
      blockId: null,
      isOrder: true,
      label: "Block order",
      status: "changed",
      currentStr: commonCurrent.map((id) => labelOf.get(id)).join(", "),
      draftStr: commonDraft.map((id) => labelOf.get(id)).join(", "),
      currentImages: [],
      draftImages: [],
    });
  }

  return rows;
}

/**
 * Merges a draft block-list value into the current one, taking only the
 * selected blocks from the draft. Selecting an "added" block includes it,
 * selecting a "removed" block removes it, and selecting a "changed" block
 * takes the draft's content/settings. `orderSelected` applies the draft's
 * block ordering; otherwise the current ordering is kept.
 */
export function mergeBlockListValue(
  currentValue: unknown,
  draftValue: unknown,
  selectedBlockIds: ReadonlySet<string>,
  orderSelected: boolean
): unknown {
  const current = asBlockListValue(currentValue);
  const draft = asBlockListValue(draftValue);
  if (!current && !draft) return draftValue;

  const currentOrder = blockOrder(current);
  const draftOrder = blockOrder(draft);
  const currentSet = new Set(currentOrder);
  const draftSet = new Set(draftOrder);

  // Which side supplies each block, or null to exclude it entirely
  const sideOf = (id: string): BlockValue | null => {
    const selected = selectedBlockIds.has(id);
    if (currentSet.has(id) && draftSet.has(id)) return selected ? draft : current;
    if (draftSet.has(id)) return selected ? draft : null; // added in draft
    return selected ? null : current; // removed in draft
  };

  // Base order comes from whichever side "wins" the ordering; blocks that
  // only exist on the other side are inserted at their original index.
  const [baseOrder, baseSet, otherOrder] = orderSelected
    ? [draftOrder, draftSet, currentOrder]
    : [currentOrder, currentSet, draftOrder];
  const seq = baseOrder.filter((id) => sideOf(id));
  otherOrder.forEach((id, i) => {
    if (!baseSet.has(id) && sideOf(id)) {
      seq.splice(Math.min(i, seq.length), 0, id);
    }
  });

  const layoutFor = (id: string): BlockItem => {
    const side = sideOf(id)!;
    return (
      layoutEntries(side).find((e) => layoutContentId(e) === id) ??
      (id.startsWith("umb://") ? { contentUdi: id } : { contentKey: id })
    );
  };
  const contentFor = (id: string): BlockItem | undefined =>
    sideOf(id)!.contentData.find((b) => blockIdOf(b) === id);
  const settingsFor = (id: string): BlockItem | undefined => {
    const side = sideOf(id)!;
    const settingsId = layoutSettingsId(layoutFor(id));
    return settingsId
      ? (side.settingsData ?? []).find((s) => blockIdOf(s) === settingsId)
      : undefined;
  };
  const exposeFor = (id: string): BlockItem[] => {
    const expose = sideOf(id)!.expose;
    return Array.isArray(expose)
      ? expose.filter((e) => e["contentKey"] === id)
      : [];
  };

  const base = (draft ?? current)!;
  const merged: BlockValue = {
    ...base,
    layout: { ...(base.layout ?? {}), [BLOCK_LIST_LAYOUT]: seq.map(layoutFor) },
    contentData: seq.map(contentFor).filter((b): b is BlockItem => !!b),
    settingsData: seq
      .map(settingsFor)
      .filter((s): s is BlockItem => !!s),
  };
  if (Array.isArray(base.expose)) merged.expose = seq.flatMap(exposeFor);
  return merged;
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
      currentImages: [],
      draftImages: [],
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
    // Block-list values get per-block sub-rows. Block rows also catch
    // layout-only changes (reordering) that the formatted strings miss.
    const blocks = buildBlockRows(key, currentVal?.value, draftVal?.value);
    const changed = blocks
      ? blocks.some((b) => b.status !== "unchanged")
      : currentStr !== draftStr;
    propertyRows.set(key, {
      key,
      alias: withVariantSuffix(formatAlias(v.alias), culture, segment),
      currentStr,
      draftStr,
      changed,
      currentImages: extractImageRefs(currentVal?.value),
      draftImages: extractImageRefs(draftVal?.value),
      blocks: changed ? blocks : undefined,
    });
  }

  return [...variantRows.values(), ...propertyRows.values()];
}
