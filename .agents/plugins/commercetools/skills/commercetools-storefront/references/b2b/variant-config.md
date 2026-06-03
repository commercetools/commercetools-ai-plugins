---
name: variant-config
description: PDP variant selector configuration covering blocklist, renderer mapping (pill/color), color hex codes, sort order, and info attributes.
when_to_use:
  - "Configuring variant selectors on the B2B PDP"
  - "Adding color swatches to variant options"
  - "Hiding specific variant attributes"
  - "Reordering variant options"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - variant-config
    - ui
---

# Variant Selector Configuration

**The only file you normally need to edit is `lib/ct/variant-config.ts`.**

All variant selector behaviour on the PDP is controlled in this one file. No component changes needed for common adjustments.

## `VARIANT_SELECTOR_BLOCKLIST`

Attribute names to never render as variant selectors. Add any attribute here to prevent it from appearing as a selection option:

```typescript
// lib/ct/variant-config.ts
export const VARIANT_SELECTOR_BLOCKLIST: string[] = [
  'internal-code',   // just the attribute name, not 'variants.attributes.*'
];
```

## `VARIANT_RENDERER_MAP`

Maps attribute name → render style. Attributes not listed default to `'pill'`:

```typescript
export type VariantRenderer = 'pill' | 'color';

export const VARIANT_RENDERER_MAP: Record<string, VariantRenderer> = {
  color: 'color',  // → circular swatch using COLOR_HEX
  model: 'pill',   // → text button (same as default, explicit for clarity)
};
```

| Renderer | Component | Use for |
|---|---|---|
| `'pill'` | Text button | Any attribute (default) |
| `'color'` | Circular swatch | Color attributes — fills from `COLOR_HEX` |

## `COLOR_HEX`

Maps lowercase color names/keys to CSS color values for swatch rendering:

```typescript
export const COLOR_HEX: Record<string, string> = {
  black: '#1A1A1A',
  gray: '#9CA3AF',
  white: '#F9FAFB',
  blue: '#3B82F6',
  yellow: '#EAB308',
  red: '#EF4444',
  green: '#22C55E',
  silver: '#C0C0C0',
  gold: '#D97706',
  multicolored: 'linear-gradient(135deg, #3B82F6, #EC4899, #22C55E)',
  // add more as needed
};
```

**Note:** B2B uses name→hex lookup (not a companion variant attribute) because equipment color attributes carry predefined names like `'yellow'`, `'black'`.

## `VARIANT_SORT_ORDER`

Display order for variant selector groups (left to right). Attributes listed here appear first; unlisted attributes are appended after:

```typescript
export const VARIANT_SORT_ORDER: string[] = ['color'];
// color swatch first, then other attributes in commercetools-defined order
```

## `PDP_INFO_ATTRIBUTES`

Attribute names to render as informational text sections on the PDP, below the product description. These are excluded from the product details grid:

```typescript
export const PDP_INFO_ATTRIBUTES: string[] = ['mobility', 'capacity', 'iso45001'];
```

Each listed attribute renders with its localised commercetools label and its value as preformatted text (preserving line breaks). Attributes with no value on the active variant are silently skipped.

## How Variant Navigation Works

Variant selection navigates to a new URL — it does **not** use component state. Each variant option renders as a `<Link href={opt.targetUrl}>`. The `targetUrl` is `/{locale}/{categorySlug}/p/{variantSku}`.

```typescript
// components/product/VariantSelector.tsx
export interface VariantOption {
  label: string;
  targetUrl: string;  // URL for this variant
  colorCode?: string; // hex from COLOR_HEX
  isActive: boolean;  // current SKU matches
  isAvailable: boolean; // stock from supplyChannelId
}
```

Unavailable variants render as `<span>` (not `<Link>`) with `opacity-35 cursor-not-allowed` styling.

## How Availability Is Determined

`isAvailable` on each `VariantOption` comes from the `supplyChannelId` in session:

```typescript
// In the variant options builder (lib/ct/product-api.ts or mapper)
const channelStock = variant.availability?.channels?.[session.supplyChannelId];
const isAvailable = channelStock ? channelStock.availableQuantity > 0 : true;
```

If `supplyChannelId` is not in session (no BU selected), falls back to `isOnStock` — acceptable for unauthenticated users.

## Adding a New Color

1. Add the commercetools attribute name to `VARIANT_RENDERER_MAP` with `renderer: 'color'`
2. Add hex codes to `COLOR_HEX` for each color value in the commercetools enum
3. Ensure the commercetools attribute is a variant attribute (not product-level)

## Checklist

- [ ] New color attribute: add to `VARIANT_RENDERER_MAP` + hex values to `COLOR_HEX`
- [ ] Hidden selector: add attribute name to `VARIANT_SELECTOR_BLOCKLIST`
- [ ] Attribute display order: add to `VARIANT_SORT_ORDER`
- [ ] Info-only attribute (not a selector): add to `PDP_INFO_ATTRIBUTES`
- [ ] Availability uses `channels[supplyChannelId]` when BU is active
