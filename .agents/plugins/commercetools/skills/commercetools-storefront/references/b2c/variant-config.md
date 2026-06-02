---
name: variant-config
description: B2C variant selector configuration covering blocklist, renderer mapping, color codes, sort order, and info attributes display.
when_to_use:
  - "Configuring variant selectors on the B2C PDP"
  - "Adding color swatches to variant options"
  - "Hiding specific variant attributes"
  - "Managing variant display order"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - variant-config
    - ui
---

# Variant Config

**Impact: LOW — Variant selector behaviour on the PDP is controlled by `site/lib/ct/variant-config.ts`. Edit the config — never components.**

All five config variables live in one file. Changing them requires no component edits.

## Table of Contents
- [Pattern 1: Blocklist](#pattern-1-blocklist)
- [Pattern 2: Renderer Map](#pattern-2-renderer-map)
- [Pattern 3: Color Code](#pattern-3-color-code)
- [Pattern 4: Sort Order](#pattern-4-sort-order)
- [Pattern 5: Info Attributes](#pattern-5-info-attributes)
- [Config Summary](#config-summary)

---

## Pattern 1: Blocklist

`VARIANT_SELECTOR_BLOCKLIST: string[]` — attribute names that are **never** shown as selectors. Add any attribute that should not appear as a clickable option on the PDP.

```typescript
// site/lib/ct/variant-config.ts
export const VARIANT_SELECTOR_BLOCKLIST: string[] = [
  'color-code',        // hex value — companion to 'color-label', shown as swatch fill
  'colorCode',
  'finish-code',
  'sku',
  'articleNumber',
  // Add names here to hide them from the selector UI
];
```

> Any attribute that appears in `PDP_INFO_ATTRIBUTES` should also be added here — otherwise it will render as both a selector and an info block.

---

## Pattern 2: Renderer Map

`VARIANT_RENDERER_MAP: Record<string, VariantRenderer>` — maps an attribute name to a renderer. Attributes not listed default to `'pill'`.

```typescript
// site/lib/ct/variant-config.ts
export type VariantRenderer = 'pill' | 'color';

export const VARIANT_RENDERER_MAP: Record<string, VariantRenderer> = {
  'color-label': 'color',   // circular swatch, uses VARIANT_COLOR_CODE_ATTR for fill
  'finish':      'color',
  'size':        'pill',    // explicit pill (same as default)
  // Unlisted attributes → 'pill'
};
```

Renderers:
- `'pill'` — rectangular chip with the attribute value as text
- `'color'` — circular swatch; the fill colour comes from the companion attribute in `VARIANT_COLOR_CODE_ATTR`

---

## Pattern 3: Color Code

`VARIANT_COLOR_CODE_ATTR: Record<string, string>` — maps a **display attribute** (e.g. `'color-label'`) to its **companion hex attribute** (e.g. `'color-code'`). Used by the `'color'` renderer to determine the swatch background colour.

```typescript
// site/lib/ct/variant-config.ts
export const VARIANT_COLOR_CODE_ATTR: Record<string, string> = {
  'color-label': 'color-code',   // variant.attributes['color-code'] = '#FF5733'
  'finish':      'finish-code',
};
```

The companion attribute (`color-code`) must also be in `VARIANT_SELECTOR_BLOCKLIST` so it is not rendered as its own selector.

---

## Pattern 4: Sort Order

`VARIANT_SORT_ORDER: string[]` — explicit left-to-right order of attribute selectors. Attributes not in this list appear after the listed ones in their natural (API) order.

```typescript
// site/lib/ct/variant-config.ts
export const VARIANT_SORT_ORDER: string[] = [
  'color-label',   // shown first
  'size',          // shown second
  'width',         // shown third
  // Everything else appended after in natural order
];
```

---

## Pattern 5: Info Attributes

`PDP_INFO_ATTRIBUTES: string[]` — attributes rendered as **text sections below the description**, not as selectors. Values are rendered inside `<pre>` blocks to preserve formatting.

```typescript
// site/lib/ct/variant-config.ts
export const PDP_INFO_ATTRIBUTES: string[] = [
  'material-composition',
  'care-instructions',
  'country-of-origin',
  'description-long',
];
```

> Always add info attributes to `VARIANT_SELECTOR_BLOCKLIST` as well to avoid duplicate rendering.

---

## Config Summary

| Variable | Type | Purpose |
|---|---|---|
| `VARIANT_SELECTOR_BLOCKLIST` | `string[]` | Attribute names never shown as selectors |
| `VARIANT_RENDERER_MAP` | `Record<string, VariantRenderer>` | Maps attribute → `'pill'` or `'color'` renderer |
| `VARIANT_COLOR_CODE_ATTR` | `Record<string, string>` | Maps display attribute → companion hex attribute for color swatches |
| `VARIANT_SORT_ORDER` | `string[]` | Left-to-right display order; unlisted attributes appear after |
| `PDP_INFO_ATTRIBUTES` | `string[]` | Attributes shown as text info blocks below description (in `<pre>`) |
