# Shipping Tiered Rates and Cart Score Setup

## Problem Statement

Q: **We have a number of shipping methods (one day, 2 days, etc.) and for some of them the price depends on the distance, questions:**

1. **How can I charge shipping based on the distance from the warehouse to the shipping address**

2. **How can I handle a situation where a specific warehouse can not ship to a specific range of distances, for example OK to ship 0-19 miles, can not ship from 20 to 30 miles, OK to ship above 30 miles.**

## Solution Overview

The solution for this situation is as follows:

### Step 1: Set the Score

Cart score will be set to be the distance between the assigned warehouse (supply channel) and the shipping address. The score requires the shipping address to be defined as well as a warehouse from which the merchandise will ship. An external system will calculate the distance between the two and will set the score to be that distance.

### Step 2: Define Tiered Shipping Price

Define tiered shipping prices based on the score (distance). For ranges not supported (in the example above 20 to 30 miles) set the price to be zero. It should look as follows:

- Tier 0–19 miles: normal price
- Tier 20–30 miles: price set to **zero** (unsupported range)
- Tier 30+ miles: normal price

> **Note:** The score must be an integer. If necessary to have fractions of miles then it has to be multiplied by 10 or 100, etc.

### Step 3: Check the Availability

At this point an easy solution will be in the front end to eliminate the shipping methods that return price 0 (20 to 30 miles in the example above); however a cleaner/better solution will be to use a shipping predicate that will prevent this shipping method from being retrieved when `Get ShippingMethods for a Cart` is called.

## Useful Links

- https://docs.commercetools.com/api/projects/predicates
- https://docs.commercetools.com/api/projects/shippingMethods#get-shippingmethod
- https://docs.commercetools.com/api/projects/shippingMethods#get-matching-shippingmethods-for-a-cart#for-a-cart-and-location
