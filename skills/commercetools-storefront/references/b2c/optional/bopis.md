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

**Use `KEY_CHANNELS` / `keyChannel(id)` from `lib/cache-keys.ts`.** Don't inline cache key strings in hooks.

## Anti-Patterns

| Anti-pattern | Correct approach |
|---|---|
| `supplyChannel: channelId` (string) | `supplyChannel: { typeId: 'channel', id: channelId }` |
| Showing all channels in the selector | `channels.filter(c => c.roles?.includes('InventorySupply'))` |
| Hardcoded string key in `useSWR` call | Use `KEY_CHANNELS` from `lib/cache-keys.ts` |

## Reference

| Task | Reference |
|---|---|
| Channels API (`lib/ct/channels.ts`), route handlers, supply channel on cart, per-channel inventory, cache keys, `useChannels` hook, `ChannelSelector` UI, pickup badge in CartItem | [bopis.md](./bopis.md) |



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
// site/lib/ct/channels.ts
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

Route Handlers:

```typescript
// site/app/api/channels/route.ts
export async function GET() {
  const channels = await getAllChannels();
  return NextResponse.json(channels);
}

// site/app/api/channels/[id]/route.ts
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const channel = await getChannelById(params.id);
  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(channel);
}
```


## Pattern 2: Cart Supply Channel

**INCORRECT:** wrong reference format for supply channel.

```typescript
// BAD
supplyChannel: channelId   // string only — commercetools rejects this
```

**CORRECT — reference object with `typeId`:**

```typescript
// site/lib/ct/cart.ts
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

```typescript
// site/app/api/cart/items/route.ts
export async function POST(request: Request) {
  const session = await getSession();
  const { productId, variantId, quantity = 1, supplyChannelId } = await request.json();
  const cart = await getCart(session.cartId!);
  const updated = await addLineItem(session.cartId!, cart.version, productId, variantId, quantity, supplyChannelId);
  return NextResponse.json({ cart: updated });
}
```


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
// site/lib/cache-keys.ts
export const KEY_CHANNELS = 'channels';
export const keyChannel = (id: string) => `channel-${id}`;
```

Use these as the SWR cache key and as the `revalidateTag` argument in Route Handlers that mutate channels.


## Pattern 5: useChannels Hook

```typescript
// site/hooks/useChannels.ts
'use client';
import useSWR from 'swr';
import { KEY_CHANNELS, keyChannel } from '@/lib/cache-keys';
import type { Channel } from '@/lib/types';

async function channelsFetcher() {
  const res = await fetch('/api/channels');
  if (!res.ok) return [];
  return res.json();
}

async function channelFetcher([, id]: [string, string]) {
  const res = await fetch(`/api/channels/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export function useChannels() {
  const { data, error, isLoading } = useSWR<Channel[]>(KEY_CHANNELS, channelsFetcher, {
    revalidateOnFocus: false,
  });
  return { channels: data ?? [], error, isLoading };
}

export function useChannel(id: string | null) {
  const { data, error, isLoading } = useSWR<Channel>(
    id ? [keyChannel(id), id] : null,
    channelFetcher,
    { revalidateOnFocus: false }
  );
  return { channel: data ?? null, error, isLoading };
}
```


## Pattern 6: Type Extensions

```typescript
// site/types/index.ts

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

**ChannelSelector** — tabs for delivery vs pickup, persists mode to `localStorage`:

```typescript
// site/components/bopis/ChannelSelector.tsx
'use client';
import { useState, useEffect } from 'react';
import { useChannels } from '@/hooks/useChannels';

type DeliveryMode = 'delivery' | 'pickup';

export default function ChannelSelector({
  onSelect,
}: {
  onSelect: (channelId: string | null) => void;
}) {
  const { channels } = useChannels();
  const [mode, setMode] = useState<DeliveryMode>('delivery');
  const pickupChannels = channels.filter((c) => c.roles?.includes('InventorySupply'));

  useEffect(() => {
    const saved = localStorage.getItem('deliveryMode') as DeliveryMode | null;
    if (saved) setMode(saved);
  }, []);

  const handleModeChange = (m: DeliveryMode) => {
    setMode(m);
    localStorage.setItem('deliveryMode', m);
    if (m === 'delivery') onSelect(null);
  };

  return (
    <div>
      <button onClick={() => handleModeChange('delivery')}>Delivery</button>
      <button onClick={() => handleModeChange('pickup')}>Pick Up In Store</button>
      {mode === 'pickup' && (
        <select onChange={(e) => onSelect(e.target.value)}>
          {pickupChannels.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
```

**Pickup badge in cart item:**

```typescript
// site/components/cart/CartItem.tsx
import { useChannel } from '@/hooks/useChannels';

function PickupBadge({ channelId }: { channelId: string }) {
  const { channel } = useChannel(channelId);
  if (!channel) return null;
  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
      Pickup: {channel.name}
    </span>
  );
}

// In CartItem:
{item.supplyChannelId && <PickupBadge channelId={item.supplyChannelId} />}
```


## Checklist
- [ ] `getAllChannels`, `getChannelById`, `getChannelByKey` implemented in `lib/ct/channels.ts`
- [ ] Route handlers at `app/api/channels/route.ts` and `app/api/channels/[id]/route.ts`
- [ ] `addLineItem` accepts `supplyChannelId` and uses `{ typeId: 'channel', id }` reference
- [ ] `app/api/cart/items/route.ts` passes `supplyChannelId` through to `addLineItem`
- [ ] `KEY_CHANNELS` and `keyChannel(id)` added to `lib/cache-keys.ts`
- [ ] `useChannels()` and `useChannel(id)` hooks created with `dedupingInterval: 60_000`
- [ ] `CartLineItem.supplyChannelId?: string` added to types
- [ ] `VariantAvailability` and `VariantChannelAvailability` interfaces added
- [ ] `ChannelSelector` persists delivery mode to `localStorage`
- [ ] Pickup badge visible in cart line items when `supplyChannelId` is set
