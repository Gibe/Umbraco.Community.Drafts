import {
  buildBlockAreaKey,
  buildBlockPropKey,
  buildBlockRowKey,
  buildValueKey,
  buildVariantKey,
} from "./draft-row-key.js";
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
  /** Nesting depth: 0 for top-level blocks, +1 per nested collection (grid area or nested block editor). */
  depth: number;
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
  /**
   * Per-block sub-rows, present when this is a changed block-editor property
   * (block list or block grid). Nested collections are flattened into this
   * list with increasing `depth`.
   */
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
const BLOCK_GRID_LAYOUT = "Umbraco.BlockGrid";

/** A parsed block-editor property value (block list or block grid). */
interface BlockEditorValue {
  layoutKey: string;
  obj: BlockValue;
}

/** Returns the value as a block-editor value (block list or block grid), or null. */
function asBlockEditorValue(value: unknown): BlockEditorValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj["contentData"])) return null;
  const layout = obj["layout"];
  if (!layout || typeof layout !== "object") return null;
  const layoutKeys = Object.keys(layout);
  const layoutKey = layoutKeys.find(
    (k) => k === BLOCK_LIST_LAYOUT || k === BLOCK_GRID_LAYOUT
  );
  if (!layoutKey || layoutKeys.some((k) => k !== layoutKey)) return null;
  return { layoutKey, obj: obj as BlockValue };
}

const blockIdOf = (item: BlockItem): string | undefined =>
  typeof item["key"] === "string"
    ? item["key"]
    : typeof item["udi"] === "string"
      ? item["udi"]
      : undefined;

function layoutEntries(v: BlockEditorValue | null): BlockItem[] {
  const arr = v
    ? (v.obj.layout as Record<string, unknown> | undefined)?.[v.layoutKey]
    : undefined;
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

const synthEntry = (id: string): BlockItem =>
  id.startsWith("umb://") ? { contentUdi: id } : { contentKey: id };

interface AreaRef {
  key: string;
  obj: BlockItem;
  items: BlockItem[];
}

/** Areas of a block-grid layout entry (empty for block-list entries). */
function entryAreas(entry: BlockItem | undefined): AreaRef[] {
  const areas = entry?.["areas"];
  if (!Array.isArray(areas)) return [];
  return areas.flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const obj = a as BlockItem;
    if (typeof obj["key"] !== "string") return [];
    return [
      {
        key: obj["key"] as string,
        obj,
        items: Array.isArray(obj["items"]) ? (obj["items"] as BlockItem[]) : [],
      },
    ];
  });
}

/** The layout entry plus every entry nested inside its grid areas. */
function subtreeEntries(entry: BlockItem): BlockItem[] {
  return [entry, ...entryAreas(entry).flatMap((a) => a.items.flatMap(subtreeEntries))];
}

/**
 * One side (current or draft) of a block collection: the top level of a
 * block-editor value, or the items of one grid area within it. `root`
 * supplies contentData/settingsData/expose, which block editors keep in
 * flat per-value arrays even for blocks nested inside grid areas.
 */
interface CollectionSide {
  root: BlockEditorValue | null;
  order: string[];
  entryOf: (id: string) => BlockItem | undefined;
}

const EMPTY_SIDE: CollectionSide = { root: null, order: [], entryOf: () => undefined };

/** The top-level collection: layout order, with layout-orphaned contentData appended. */
function topLevelSide(v: BlockEditorValue | null): CollectionSide {
  if (!v) return EMPTY_SIDE;
  const tops = layoutEntries(v);
  const order = tops
    .map(layoutContentId)
    .filter((id): id is string => !!id);
  // A grid's contentData also holds blocks nested inside areas — only content
  // referenced nowhere in the layout tree is a true orphan.
  const claimed = new Set(
    tops
      .flatMap(subtreeEntries)
      .map(layoutContentId)
      .filter((id): id is string => !!id)
  );
  for (const item of v.obj.contentData) {
    const id = blockIdOf(item);
    if (id && !claimed.has(id)) {
      order.push(id);
      claimed.add(id);
    }
  }
  return { root: v, order, entryOf: (id) => tops.find((e) => layoutContentId(e) === id) };
}

/** The collection formed by one grid area's items. */
function areaSide(root: BlockEditorValue | null, items: BlockItem[]): CollectionSide {
  return {
    root,
    order: items.map(layoutContentId).filter((id): id is string => !!id),
    entryOf: (id) => items.find((e) => layoutContentId(e) === id),
  };
}

const contentOf = (root: BlockEditorValue | null, id: string): BlockItem | undefined =>
  root?.obj.contentData.find((b) => blockIdOf(b) === id);

const settingsOf = (
  root: BlockEditorValue | null,
  entry: BlockItem | undefined
): BlockItem | undefined => {
  const settingsId = entry ? layoutSettingsId(entry) : undefined;
  return settingsId
    ? (root?.obj.settingsData ?? []).find((s) => blockIdOf(s) === settingsId)
    : undefined;
};

const exposeOf = (root: BlockEditorValue | null, id: string): BlockItem[] => {
  const expose = root?.obj.expose;
  return Array.isArray(expose) ? expose.filter((e) => e["contentKey"] === id) : [];
};

const propIdentity = (pv: BlockItem): string =>
  `${pv["alias"] ?? ""}|${pv["culture"] ?? ""}|${pv["segment"] ?? ""}`;

interface PairedProp {
  alias: string;
  culture: string | null;
  segment: string | null;
  current?: BlockItem;
  draft?: BlockItem;
}

/** Pairs the `values` entries of two block content items by alias/culture/segment. */
function pairedProps(
  currentItem: BlockItem | undefined,
  draftItem: BlockItem | undefined
): PairedProp[] {
  const valuesOf = (item: BlockItem | undefined): BlockItem[] =>
    Array.isArray(item?.["values"]) ? (item!["values"] as BlockItem[]) : [];
  const pairs = new Map<string, PairedProp>();
  for (const pv of valuesOf(currentItem)) {
    pairs.set(propIdentity(pv), {
      alias: String(pv["alias"] ?? ""),
      culture: (pv["culture"] as string | null) ?? null,
      segment: (pv["segment"] as string | null) ?? null,
      current: pv,
    });
  }
  for (const pv of valuesOf(draftItem)) {
    const existing = pairs.get(propIdentity(pv));
    if (existing) existing.draft = pv;
    else
      pairs.set(propIdentity(pv), {
        alias: String(pv["alias"] ?? ""),
        culture: (pv["culture"] as string | null) ?? null,
        segment: (pv["segment"] as string | null) ?? null,
        draft: pv,
      });
  }
  return [...pairs.values()];
}

/**
 * Whether a property value pair can be decomposed into per-block sub-rows:
 * at least one side is a block-editor value and neither side is something else.
 */
function isDecomposable(currentValue: unknown, draftValue: unknown): boolean {
  const current = asBlockEditorValue(currentValue);
  const draft = asBlockEditorValue(draftValue);
  if (!current && !draft) return false;
  if (currentValue && !current) return false;
  if (draftValue && !draft) return false;
  return true;
}

/** Identities of props handled as nested sub-rows, excluded from a block's own diff. */
function decomposedPropIds(
  currentItem: BlockItem | undefined,
  draftItem: BlockItem | undefined
): Set<string> {
  return new Set(
    pairedProps(currentItem, draftItem)
      .filter((p) => isDecomposable(p.current?.["value"], p.draft?.["value"]))
      .map((p) => `${p.alias}|${p.culture ?? ""}|${p.segment ?? ""}`)
  );
}

/** Formats a block content/settings item's properties as "Label: value" lines. */
function formatBlockProps(
  item: BlockItem,
  separator: string,
  skipProps?: Set<string>
): string {
  const props = Array.isArray(item["values"])
    ? (item["values"] as BlockItem[])
        .filter((pv) => !skipProps?.has(propIdentity(pv)))
        .map(
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

/**
 * Formats a block's own content: its direct properties (minus those
 * decomposed into nested sub-rows) plus its settings. Grid-area descendants
 * and nested block-editor properties are covered by their own rows.
 */
function formatBlockOwn(
  root: BlockEditorValue | null,
  item: BlockItem,
  entry: BlockItem | undefined,
  skipProps: Set<string>
): string {
  let result = formatBlockProps(item, "\n", skipProps);
  const settings = settingsOf(root, entry);
  if (settings) result += `\nSettings:\n${formatBlockProps(settings, "\n")}`;
  return result;
}

/**
 * Formats a block together with everything nested inside it (settings and
 * grid-area descendants), used for blocks that only exist on one side.
 */
function formatBlockFull(root: BlockEditorValue | null, entry: BlockItem, id: string): string {
  const parts: string[] = [];
  subtreeEntries(entry).forEach((e) => {
    const contentId = layoutContentId(e) ?? (e === entry ? id : undefined);
    const item = contentId ? contentOf(root, contentId) : undefined;
    const isRoot = e === entry;
    if (item)
      parts.push(
        isRoot ? formatBlockProps(item, "\n") : `Nested block: ${formatBlockProps(item, "; ")}`
      );
    const settings = settingsOf(root, e);
    if (settings)
      parts.push(
        isRoot
          ? `Settings:\n${formatBlockProps(settings, "\n")}`
          : `Nested settings: ${formatBlockProps(settings, "; ")}`
      );
  });
  return parts.length ? parts.join("\n") : "(no properties)";
}

/** Images in a block's own (non-decomposed) property values. */
function ownImages(item: BlockItem, skipProps: Set<string>): ImageRef[] {
  if (!Array.isArray(item["values"])) return extractImageRefs(item, true);
  return (item["values"] as BlockItem[])
    .filter((pv) => !skipProps.has(propIdentity(pv)))
    .flatMap((pv) => extractImageRefs(pv["value"], true));
}

/** Images anywhere in a block's subtree (own content plus grid-area descendants). */
function subtreeImages(root: BlockEditorValue | null, entry: BlockItem, id: string): ImageRef[] {
  return subtreeEntries(entry).flatMap((e) => {
    const contentId = layoutContentId(e) ?? (e === entry ? id : undefined);
    const item = contentId ? contentOf(root, contentId) : undefined;
    return item ? extractImageRefs(item, true) : [];
  });
}

const BLOCK_ORDER_ID = "__order__";

/**
 * Builds per-block sub-rows for a block-editor property (block list or block
 * grid) so blocks can be selected individually. Blocks present on both sides
 * are decomposed further: nested block-editor properties and grid areas get
 * their own indented rows, recursively. Returns undefined when either side
 * isn't a block-editor value (then the property keeps whole-row selection).
 */
function buildBlockRows(
  rowKey: string,
  currentValue: unknown,
  draftValue: unknown
): DraftBlockRow[] | undefined {
  if (!isDecomposable(currentValue, draftValue)) return undefined;
  const rows = buildCollectionRows(
    rowKey,
    topLevelSide(asBlockEditorValue(currentValue)),
    topLevelSide(asBlockEditorValue(draftValue)),
    0,
    ""
  );
  return rows.length ? rows : undefined;
}

/** Builds the rows of one block collection, recursing into nested collections. */
function buildCollectionRows(
  collectionKey: string,
  cur: CollectionSide,
  dr: CollectionSide,
  depth: number,
  labelPrefix: string
): DraftBlockRow[] {
  const currentSet = new Set(cur.order);
  const draftSet = new Set(dr.order);

  // Display order: current order, with draft-only blocks inserted at their draft index
  const display = [...cur.order];
  dr.order.forEach((id, i) => {
    if (!currentSet.has(id)) display.splice(Math.min(i, display.length), 0, id);
  });
  if (display.length === 0) return [];

  const rows: DraftBlockRow[] = [];
  display.forEach((id, i) => {
    const label = `${labelPrefix}Block ${i + 1}`;
    const blockKey = buildBlockRowKey(collectionKey, id);
    const currentItem = currentSet.has(id) ? contentOf(cur.root, id) : undefined;
    const draftItem = draftSet.has(id) ? contentOf(dr.root, id) : undefined;
    if (!currentItem && !draftItem) return;

    if (!currentItem || !draftItem) {
      // Present on one side only — an atomic add/remove of the whole subtree
      const side = currentItem ? cur : dr;
      const entry = side.entryOf(id) ?? synthEntry(id);
      const full = formatBlockFull(side.root, entry, id);
      const images = subtreeImages(side.root, entry, id);
      rows.push({
        key: blockKey,
        blockId: id,
        isOrder: false,
        label,
        depth,
        status: currentItem ? "removed" : "added",
        currentStr: currentItem ? full : "",
        draftStr: draftItem ? full : "",
        currentImages: currentItem ? images : [],
        draftImages: draftItem ? images : [],
      });
      return;
    }

    // Present on both sides: this row covers the block's own properties and
    // settings; nested collections get their own rows below it.
    const currentEntry = cur.entryOf(id);
    const draftEntry = dr.entryOf(id);
    const skipProps = decomposedPropIds(currentItem, draftItem);
    const currentStr = formatBlockOwn(cur.root, currentItem, currentEntry, skipProps);
    const draftStr = formatBlockOwn(dr.root, draftItem, draftEntry, skipProps);
    rows.push({
      key: blockKey,
      blockId: id,
      isOrder: false,
      label,
      depth,
      status: currentStr !== draftStr ? "changed" : "unchanged",
      currentStr,
      draftStr,
      currentImages: ownImages(currentItem, skipProps),
      draftImages: ownImages(draftItem, skipProps),
    });

    // Nested rows are only worth showing when something in them changed
    const pushIfChanged = (childRows: DraftBlockRow[]) => {
      if (childRows.some((r) => r.status !== "unchanged")) rows.push(...childRows);
    };

    // Grid areas
    const currentAreas = entryAreas(currentEntry);
    const draftAreas = entryAreas(draftEntry);
    const areaKeys = currentAreas.map((a) => a.key);
    for (const a of draftAreas) if (!areaKeys.includes(a.key)) areaKeys.push(a.key);
    areaKeys.forEach((areaKey, areaIndex) => {
      const curItems = currentAreas.find((a) => a.key === areaKey)?.items ?? [];
      const draftItems = draftAreas.find((a) => a.key === areaKey)?.items ?? [];
      pushIfChanged(
        buildCollectionRows(
          buildBlockAreaKey(blockKey, areaKey),
          areaSide(cur.root, curItems),
          areaSide(dr.root, draftItems),
          depth + 1,
          `${label} › Area ${areaIndex + 1} › `
        )
      );
    });

    // Nested block-editor properties
    for (const p of pairedProps(currentItem, draftItem)) {
      const curVal = p.current?.["value"];
      const draftVal = p.draft?.["value"];
      if (!isDecomposable(curVal, draftVal)) continue;
      pushIfChanged(
        buildCollectionRows(
          buildBlockPropKey(blockKey, p.alias, p.culture, p.segment),
          topLevelSide(asBlockEditorValue(curVal)),
          topLevelSide(asBlockEditorValue(draftVal)),
          depth + 1,
          `${label} › ${formatAlias(p.alias)} › `
        )
      );
    }
  });

  // Reordering only shows up in the layout sequence, so give it its own row
  const commonCurrent = cur.order.filter((id) => draftSet.has(id));
  const commonDraft = dr.order.filter((id) => currentSet.has(id));
  if (commonCurrent.join("|") !== commonDraft.join("|")) {
    const labelOf = new Map(display.map((id, i) => [id, `Block ${i + 1}`]));
    rows.push({
      key: buildBlockRowKey(collectionKey, BLOCK_ORDER_ID),
      blockId: null,
      isOrder: true,
      label: `${labelPrefix}Block order`,
      depth,
      status: "changed",
      currentStr: commonCurrent.map((id) => labelOf.get(id)).join(", "),
      draftStr: commonDraft.map((id) => labelOf.get(id)).join(", "),
      currentImages: [],
      draftImages: [],
    });
  }

  return rows;
}

interface MergeOut {
  content: BlockItem[];
  settings: BlockItem[];
  expose: BlockItem[];
  seenContent: Set<string>;
  seenSettings: Set<string>;
}

/**
 * Appends a block's data items to the merge output. Deduped by id so a block
 * that ends up referenced twice (e.g. a partially-selected move between grid
 * areas) can't corrupt the value with duplicate contentData entries.
 */
function pushBlockData(
  out: MergeOut,
  root: BlockEditorValue | null,
  id: string,
  content: BlockItem,
  settings: BlockItem | undefined
): void {
  if (!out.seenContent.has(id)) {
    out.seenContent.add(id);
    out.content.push(content);
    out.expose.push(...exposeOf(root, id));
  }
  if (settings) {
    const settingsId = blockIdOf(settings);
    if (!settingsId || !out.seenSettings.has(settingsId)) {
      if (settingsId) out.seenSettings.add(settingsId);
      out.settings.push(settings);
    }
  }
}

/**
 * Merges a draft block-editor value (block list or block grid) into the
 * current one, applying only the selections in `selectedKeys`. Selections are
 * keyed the same way the diff rows are (see draft-row-key.ts): selecting an
 * "added" block includes it, selecting a "removed" block removes it, and
 * selecting a "changed" block takes the draft's own content/settings. Blocks
 * present on both sides are recursed into, so nested block-editor properties
 * and grid areas merge by their own selections. Selecting a collection's
 * "block order" row applies the draft's ordering for that collection.
 */
export function mergeBlockEditorValue(
  currentValue: unknown,
  draftValue: unknown,
  selectedKeys: ReadonlySet<string>,
  rowKey: string
): unknown {
  const current = asBlockEditorValue(currentValue);
  const draft = asBlockEditorValue(draftValue);
  if (!current && !draft) return draftValue;

  const out: MergeOut = {
    content: [],
    settings: [],
    expose: [],
    seenContent: new Set(),
    seenSettings: new Set(),
  };
  const entries = mergeCollection(
    rowKey,
    topLevelSide(current),
    topLevelSide(draft),
    selectedKeys,
    out
  );

  const base = (draft ?? current)!;
  const merged: BlockValue = {
    ...base.obj,
    layout: { ...(base.obj.layout ?? {}), [base.layoutKey]: entries },
    contentData: out.content,
    settingsData: out.settings,
  };
  if (Array.isArray(base.obj.expose)) merged.expose = out.expose;
  return merged;
}

/** Merges one block collection, appending the surviving data items to `out`. */
function mergeCollection(
  collectionKey: string,
  cur: CollectionSide,
  dr: CollectionSide,
  selectedKeys: ReadonlySet<string>,
  out: MergeOut
): BlockItem[] {
  const currentSet = new Set(cur.order);
  const draftSet = new Set(dr.order);
  const orderSelected = selectedKeys.has(buildBlockRowKey(collectionKey, BLOCK_ORDER_ID));

  // Which side supplies each block, or null to exclude it entirely
  const sideOf = (id: string): CollectionSide | null => {
    const selected = selectedKeys.has(buildBlockRowKey(collectionKey, id));
    if (currentSet.has(id) && draftSet.has(id)) return selected ? dr : cur;
    if (draftSet.has(id)) return selected ? dr : null; // added in draft
    return selected ? null : cur; // removed in draft
  };

  // Base order comes from whichever side "wins" the ordering; blocks that
  // only exist on the other side are inserted at their original index.
  const [baseOrder, baseSet, otherOrder] = orderSelected
    ? [dr.order, draftSet, cur.order]
    : [cur.order, currentSet, dr.order];
  const seq = baseOrder.filter((id) => sideOf(id));
  otherOrder.forEach((id, i) => {
    if (!baseSet.has(id) && sideOf(id)) {
      seq.splice(Math.min(i, seq.length), 0, id);
    }
  });

  const entries: BlockItem[] = [];
  for (const id of seq) {
    const side = sideOf(id)!;
    const bothPresent = currentSet.has(id) && draftSet.has(id);
    const entry = emitBlock(collectionKey, id, side, bothPresent, cur, dr, selectedKeys, out);
    if (entry) entries.push(entry);
  }
  return entries;
}

/**
 * Emits one block from its chosen side: pushes its content/settings/expose
 * items to `out` and returns its layout entry. Blocks present on both sides
 * are merged recursively; one-sided blocks are copied subtree-and-all.
 */
function emitBlock(
  collectionKey: string,
  id: string,
  side: CollectionSide,
  bothPresent: boolean,
  cur: CollectionSide,
  dr: CollectionSide,
  selectedKeys: ReadonlySet<string>,
  out: MergeOut
): BlockItem | null {
  const entry = side.entryOf(id) ?? synthEntry(id);
  const item = contentOf(side.root, id);
  if (!item) return null;

  if (!bothPresent) {
    // One-sided block: copy the whole subtree from its side
    for (const e of subtreeEntries(entry)) {
      const contentId = layoutContentId(e) ?? (e === entry ? id : undefined);
      const content = contentId ? contentOf(side.root, contentId) : undefined;
      if (contentId && content)
        pushBlockData(out, side.root, contentId, content, settingsOf(side.root, e));
    }
    return entry;
  }

  // Both sides present: merge grid areas and nested block-editor properties
  // by their own selections, on top of the chosen side's entry and content.
  const blockKey = buildBlockRowKey(collectionKey, id);
  const currentItem = contentOf(cur.root, id)!;
  const draftItem = contentOf(dr.root, id)!;

  let newEntry = entry;
  const baseAreas = entryAreas(entry);
  if (baseAreas.length > 0) {
    const currentAreas = entryAreas(cur.entryOf(id));
    const draftAreas = entryAreas(dr.entryOf(id));
    newEntry = {
      ...entry,
      areas: baseAreas.map((a) => {
        const curItems = currentAreas.find((x) => x.key === a.key)?.items ?? [];
        const draftItems = draftAreas.find((x) => x.key === a.key)?.items ?? [];
        return {
          ...a.obj,
          items: mergeCollection(
            buildBlockAreaKey(blockKey, a.key),
            areaSide(cur.root, curItems),
            areaSide(dr.root, draftItems),
            selectedKeys,
            out
          ),
        };
      }),
    };
  }

  pushBlockData(
    out,
    side.root,
    id,
    mergeNestedProps(blockKey, item, currentItem, draftItem, selectedKeys),
    settingsOf(side.root, entry)
  );
  return newEntry;
}

/**
 * Returns the base content item with each nested block-editor property value
 * replaced by its own recursive merge.
 */
function mergeNestedProps(
  blockKey: string,
  baseItem: BlockItem,
  currentItem: BlockItem,
  draftItem: BlockItem,
  selectedKeys: ReadonlySet<string>
): BlockItem {
  const nested = pairedProps(currentItem, draftItem).filter((p) =>
    isDecomposable(p.current?.["value"], p.draft?.["value"])
  );
  if (nested.length === 0 || !Array.isArray(baseItem["values"])) return baseItem;

  const values = [...(baseItem["values"] as BlockItem[])];
  for (const p of nested) {
    const propKey = buildBlockPropKey(blockKey, p.alias, p.culture, p.segment);
    const merged = mergeBlockEditorValue(
      p.current?.["value"],
      p.draft?.["value"],
      selectedKeys,
      propKey
    );
    const identity = `${p.alias}|${p.culture ?? ""}|${p.segment ?? ""}`;
    const index = values.findIndex((pv) => propIdentity(pv) === identity);
    if (index >= 0) {
      values[index] = { ...values[index], value: merged };
    } else {
      // The property only exists on the non-base side — include it only when
      // the user actually selected something inside it.
      const prefix = `${propKey}:`;
      if ([...selectedKeys].some((k) => k.startsWith(prefix))) {
        values.push({ ...(p.current ?? p.draft)!, value: merged });
      }
    }
  }
  return { ...baseItem, values };
}

/** Appends the culture/segment to a row label so variant rows are distinguishable. */
function withVariantSuffix(label: string, culture: string | null, segment: string | null): string {
  const parts = [culture, segment].filter((p): p is string => !!p);
  return parts.length ? `${label} (${parts.join(", ")})` : label;
}

/**
 * Whether a block collection contains a block present on both sides whose
 * property set differs — i.e. a property was added to or removed from the
 * block's element type since the draft was saved. Recurses into grid areas
 * and nested block-editor properties. Blocks that only exist on one side are
 * ordinary adds/removes, not a structural change.
 */
function collectionHasStructuralChange(cur: CollectionSide, dr: CollectionSide): boolean {
  for (const id of dr.order) {
    if (!cur.order.includes(id)) continue;
    const currentItem = contentOf(cur.root, id);
    const draftItem = contentOf(dr.root, id);
    if (!currentItem || !draftItem) continue;

    const currentPropIds = new Set(
      (Array.isArray(currentItem["values"]) ? (currentItem["values"] as BlockItem[]) : []).map(
        propIdentity
      )
    );
    const draftProps = Array.isArray(draftItem["values"])
      ? (draftItem["values"] as BlockItem[])
      : [];
    if (draftProps.some((pv) => !currentPropIds.has(propIdentity(pv)))) return true;

    const currentEntry = cur.entryOf(id);
    const draftEntry = dr.entryOf(id);
    const currentAreas = entryAreas(currentEntry);
    for (const a of entryAreas(draftEntry)) {
      const curItems = currentAreas.find((x) => x.key === a.key)?.items ?? [];
      if (collectionHasStructuralChange(areaSide(cur.root, curItems), areaSide(dr.root, a.items)))
        return true;
    }

    for (const p of pairedProps(currentItem, draftItem)) {
      const curVal = p.current?.["value"];
      const draftVal = p.draft?.["value"];
      if (!isDecomposable(curVal, draftVal)) continue;
      if (
        collectionHasStructuralChange(
          topLevelSide(asBlockEditorValue(curVal)),
          topLevelSide(asBlockEditorValue(draftVal))
        )
      )
        return true;
    }
  }
  return false;
}

/**
 * Whether the document's (or a block's element type's) structure has
 * changed since the draft was saved: a property the draft has a value for no
 * longer exists on the current document, or exists on both sides but nested
 * inside a block whose element type lost a property. A draft like this can't
 * be safely applied (`setPropertyValue` would be writing an alias Umbraco no
 * longer knows about), so callers should discard it rather than show/apply it.
 */
export function hasStructuralChange(
  current: DraftContent | undefined,
  draft: DraftContent | undefined
): boolean {
  for (const v of draft?.values ?? []) {
    const key = buildValueKey(v.alias, v.culture ?? null, v.segment ?? null);
    const currentVal = current?.values?.find(
      (cv) => buildValueKey(cv.alias, cv.culture ?? null, cv.segment ?? null) === key
    );
    if (!currentVal) return true; // property removed from the content type

    if (!isDecomposable(currentVal.value, v.value)) continue;
    if (
      collectionHasStructuralChange(
        topLevelSide(asBlockEditorValue(currentVal.value)),
        topLevelSide(asBlockEditorValue(v.value))
      )
    )
      return true;
  }
  return false;
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
    // Block-editor values (block list / block grid) get per-block sub-rows.
    // Block rows also catch layout-only changes (reordering) that the
    // formatted strings miss.
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
