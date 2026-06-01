# Inventory Modeling

## Q&A

### Q: Does commercetools reserve inventory during checkout?

**A:** No, commercetools does **not** reserve inventory upon adding an item to the cart. It reduces the available quantity when an **order is placed**, if the inventory mode of the cart is `TrackOnly` or `ReserveOnOrder`.

### Q: What is the difference between TrackOnly and ReserveOnOrder inventory mode?

**A:**

- **`TrackOnly`** — Allows placing an order even if there is **no inventory available** for a SKU. Inventory is tracked but not enforced.
- **`ReserveOnOrder`** — Allows placing an order **only when stock is available**. If inventory is insufficient, the order cannot be placed.
