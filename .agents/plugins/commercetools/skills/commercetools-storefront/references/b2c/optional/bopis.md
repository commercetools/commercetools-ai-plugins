---
name: bopis
description: Buy online, pickup in store functionality
when_to_use:
  - "Implementing buy-online-pickup-in-store functionality"
  - "Adding supply channel to line items"
  - "Filtering channels for the pickup selector"
  - "Displaying per-store availability on the PDP"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - bopis
    - cart
---

# B2C BOPIS (Buy Online, Pick Up In Store)

Store channels expose per-store inventory on the PDP. A ChannelSelector lets customers choose delivery or pickup. The chosen supply channel is attached to cart line items so fulfilment knows which store ships or holds the item.

## Key Takeaways

**Supply channel reference is an object, not a string.** commercetools rejects a raw `channelId` string — always `{ typeId: 'channel', id: channelId }` in cart actions.

**Filter channels by `InventorySupply` role for the store selector.** Distribution or fulfilment-only channels should not appear in the pickup UI.

**Delivery mode persists to `localStorage`.** ChannelSelector saves `'delivery'` or `'pickup'` across navigation. Switching to delivery calls `onSelect(null)` to clear the supply channel.

**Use `KEY_CHANNELS` / `keyChannel(id)` from `<server>/cache-keys`.** Don't inline cache key strings in hooks.

## Anti-Patterns

| Anti-pattern | Correct approach |
|---|---|
| `supplyChannel: channelId` (string) | `supplyChannel: { typeId: 'channel', id: channelId }` |
| Showing all channels in the selector | `channels.filter(c => c.roles?.includes('InventorySupply'))` |
| Hardcoded string key in the client state hook | Use `KEY_CHANNELS` from `<server>/cache-keys` |

## Reference

| Task | Reference |
|---|---|
| Channels API (`<server>/ct/channels`), server endpoints, supply channel on cart, per-channel inventory, cache keys, `useChannels` hook, `ChannelSelector` UI, pickup badge in CartItem | [bopis.md](./bopis.md) |



# BOPIS (Buy Online, Pick Up In Store)

**Impact: MEDIUM — Supply channel reference format must be `{ typeId: 'channel', id: channelId }`.

BOPIS adds store channels to the cart and shows per-store stock on the PDP.

## Table of Contents
- [Pattern 1: Channels API](#pattern-1-channels-api)
- [Pattern 2: Cart Supply Channel](#pattern-2-cart-supply-channel)
- [Pattern 3: Per-Channel Inventory](#pattern-3-per-channel-inventory)
- [Pattern 4: Cache Keys](#pattern-4-cache-keys)
- [Pattern 5: useChannels Hook](#pattern-5-usechannels-hook)
- [Pattern 6: Type Extensions](#pattern-6-type-extensions)
- [Pattern 7: UI Components](#pattern-7-ui-components)


## Pattern 1: Channels API

```typescript
// /<server>/ct/channels
export async function getAllChannels(): Promise<Channel[]> {
  const { body } = await ctClient
    .channels()
    .get({ queryArgs: { limit: 500 } })
    .execute();
  return body.results.map(mapChannel);
}

export async function getChannelById(id: string): Promise<Channel | null> {
  const { body } = await ctClient.channels().withId({ ID: id }).get().execute();
  return mapChannel(body);
}

export async function getChannelByKey(key: string): Promise<Channel | null> {
  const { body } = await ctClient.channels().withKey({ key }).get().execute();
  return mapChannel(body);
}
```

Server endpoints expose these helpers to the client:

- `GET /channels` → returns `getAllChannels()`.
- `GET /channels/:id` → returns `getChannelById(id)`, or a 404 not-found response when the channel does not exist.

> Find the stack's `data-loading.md` for concrete server endpoints pattern implementation.


## Pattern 2: Cart Supply Channel

**INCORRECT:** wrong reference format for supply channel.

```typescript
// BAD
supplyChannel: channelId   // string only — commercetools rejects this
```

**CORRECT — reference object with `typeId`:**

```typescript
// /<server>/ct/cart
export async function addLineItem(
  cartId: string,
  cartVersion: number,
  productId: string,
  variantId: number,
  quantity: number,
  supplyChannelId?: string
) {
  const { body } = await apiRoot.carts().withId({ ID: cartId }).post({
    body: {
      version: cartVersion,
      actions: [{
        action: 'addLineItem',
        productId,
        variantId,
        quantity,
        ...(supplyChannelId && {
          supplyChannel: { typeId: 'channel', id: supplyChannelId },  // ← correct format
        }),
      }],
    },
  }).execute();
  return body;
}
```

The add-to-cart server endpoint reads `{ productId, variantId, quantity, supplyChannelId }` from the request and the `cartId` from the session, loads the cart with `getCart(session.cartId)`, then calls `addLineItem(cartId, cart.version, productId, variantId, quantity, supplyChannelId)` and returns the updated cart.



## Pattern 3: Per-Channel Inventory

Accessing per-store stock:

```typescript
const variant = product.masterVariant;
const storeStock = variant.availability?.channels?.[channelId];
const isInStock = storeStock?.isOnStock ?? false;
const availableQty = storeStock?.availableQuantity ?? 0;
```


## Pattern 4: Cache Keys

```typescript
// <root-dir>/<server>/cache-keys
export const KEY_CHANNELS = 'channels';
export const keyChannel = (id: string) => `channel-${id}`;
```

Use these as the client state-manager/cache key and as the server-side cache-invalidation tag in server endpoints that mutate channels.


## Pattern 5: useChannels Hook

Two client state hooks back the channel UI:

- `useChannels()` — cache key `KEY_CHANNELS`; fetches `GET /<api>/channels`; returns `{ channels, error, isLoading }` (defaulting `channels` to `[]`). Disable refetch-on-focus.
- `useChannel(id)` — cache key `[keyChannel(id), id]`, or `null` when `id` is null so it does not fetch; fetches `GET /<api>/channels/:id`; returns `{ channel, error, isLoading }` (defaulting `channel` to `null`). Disable refetch-on-focus.

Import `KEY_CHANNELS` / `keyChannel` from `<server>/cache-keys` and the `Channel` type from `<server>/types` — do not inline key strings.

> Find the stack's `concept-mapping.md` for concrete client-cache implementation.


## Pattern 6: Type Extensions

```typescript
// <root-dir>/types/index.ts

export interface CartLineItem {
  id:               string;
  sku:              string;
  name:             string;
  quantity:         number;
  price:            Money;
  totalPrice:       Money;
  imageUrl?:        string;
  supplyChannelId?: string;   // ← new: which store this item ships from / is collected at
}

export interface VariantAvailability {
  isOnStock:          boolean;
  availableQuantity?: number;
  channels?:          Record<string, VariantChannelAvailability>;
}

export interface VariantChannelAvailability {
  isOnStock:          boolean;
  availableQuantity?: number;
}
```


## Pattern 7: UI Components

**ChannelSelector** — a client component with tabs for delivery vs pickup that persists the chosen mode to `localStorage`:

- Reads the channel list from `useChannels()` and derives the pickup options with `channels.filter((c) => c.roles?.includes('InventorySupply'))` — only `InventorySupply` channels appear in the pickup selector.
- Holds a local `'delivery' | 'pickup'` mode, initialised from `localStorage` (`deliveryMode`) and written back whenever it changes.
- Renders a Delivery button, a Pick Up In Store button, and — when in pickup mode — a `<select>` of the pickup channels that calls `onSelect(channelId)`.
- Switching to delivery calls `onSelect(null)` to clear the supply channel.

**Pickup badge in cart item:**

A small `PickupBadge` client component takes a `channelId`, resolves the channel via `useChannel(channelId)`, and renders the store name (e.g. "Pickup: {channel.name}"), returning nothing while unresolved. In `CartItem`, render it only when `item.supplyChannelId` is set: `{item.supplyChannelId && <PickupBadge channelId={item.supplyChannelId} />}`.


## Checklist
- [ ] `getAllChannels`, `getChannelById`, `getChannelByKey` implemented in `<server>/ct/channels`
- [ ] Server endpoints `GET /channels` and `GET /channels/:id` expose `getAllChannels` / `getChannelById`
- [ ] `addLineItem` accepts `supplyChannelId` and uses `{ typeId: 'channel', id }` reference
- [ ] The add-to-cart server endpoint passes `supplyChannelId` through to `addLineItem`
- [ ] `KEY_CHANNELS` and `keyChannel(id)` added to `<server>/cache-keys`
- [ ] `useChannels()` and `useChannel(id)` client state hooks created with a deduping interval
- [ ] `CartLineItem.supplyChannelId?: string` added to types
- [ ] `VariantAvailability` and `VariantChannelAvailability` interfaces added
- [ ] `ChannelSelector` persists delivery mode to `localStorage`
- [ ] Pickup badge visible in cart line items when `supplyChannelId` is set
