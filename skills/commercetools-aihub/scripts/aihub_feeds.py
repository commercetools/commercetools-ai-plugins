#!/usr/bin/env python3
"""commercetools AI Hub product feeds: OpenAI Commerce feed, OpenAI Ads feed, Google Merchant Center, Microsoft Merchant Center.

    aihub_feeds.py fetch     download a product selection from commercetools (also --list-stores,
                             --list-categories, --list-attribute, --dry-run)
    aihub_feeds.py specs     fetch and parse the vendors' current feed specs
    aihub_feeds.py build     per-vendor working files + gap report (offline, uses the cached specs)
    aihub_feeds.py finalize  completed working file -> vendor upload file + finalize report

Run `aihub_feeds.py <command> --help` for options. Python 3.9+, standard library only.
"""

from __future__ import annotations

import argparse
import base64
import copy
import csv
import gzip
import html
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Iterable, Optional, Tuple

SCRIPT_PATH = os.path.abspath(__file__)

# Default mapping (see references/mapping-and-files.md). A run's mapping.json is merged over it.
DEFAULT_MAPPING = json.loads(r"""
{
  "locale": null,
  "currency": null,
  "country": null,
  "itemId": "sku",
  "itemIdTemplate": "{productKey}-{variantId}",
  "groupId": "productKey",
  "productUrlTemplate": "{baseUrl}/products/{slug}",
  "appendVariantToTitle": false,
  "allowLocaleFallback": false,
  "restockableAsBackorder": false,
  "onlyInStock": false,
  "flags": {
    "isEligibleSearch": true,
    "isEligibleCheckout": false,
    "isAdsEligible": true
  },
  "adsMetadata": {},
  "store": {
    "baseUrl": [
      "custom.sellerStoreUrl",
      "storefront.orderUrlTemplate@origin",
      "storefront.checkoutUrlTemplate@origin"
    ],
    "sellerName": [
      "custom.sellerName",
      "name"
    ],
    "privacyPolicyUrl": [
      "storefront.privacyPolicyUrl",
      "custom.sellerPrivacyPolicyUrl"
    ],
    "termsOfServiceUrl": [
      "storefront.termsOfServiceUrl",
      "custom.sellerTermsOfServiceUrl"
    ],
    "returnPolicyUrl": [
      "storefront.refundPolicyUrl",
      "custom.returnPolicyUrl"
    ],
    "returnWindowDays": [
      "custom.returnWindowDays"
    ],
    "acceptsReturns": [
      "custom.acceptsReturns"
    ]
  },
  "attributes": {
    "brand": [
      "brand",
      "manufacturer",
      "designer"
    ],
    "gtin": [
      "gtin",
      "ean",
      "upc",
      "barcode"
    ],
    "mpn": [
      "mpn",
      "manufacturerPartNumber"
    ],
    "color": [
      "color",
      "colour"
    ],
    "size": [
      "size"
    ],
    "sizeSystem": [
      "sizeSystem"
    ],
    "material": [
      "material"
    ],
    "pattern": [
      "pattern"
    ],
    "condition": [
      "condition"
    ],
    "gender": [
      "gender"
    ],
    "ageGroup": [
      "ageGroup",
      "age_group"
    ],
    "weight": [
      "weight",
      "netWeight"
    ],
    "weightUnit": [
      "weightUnit"
    ],
    "length": [
      "length"
    ],
    "width": [
      "width"
    ],
    "height": [
      "height"
    ],
    "dimensionsUnit": [
      "dimensionsUnit"
    ],
    "isEligibleSearch": [
      "chatgptEnableSearch",
      "isEligibleSearch"
    ],
    "isEligibleCheckout": [
      "chatgptEnableCheckout",
      "isEligibleCheckout"
    ],
    "reviewCount": [
      "reviewCount"
    ],
    "starRating": [
      "starRating",
      "averageRating",
      "rating"
    ],
    "googleProductCategory": [
      "googleProductCategory"
    ],
    "promotionId": [
      "promotionId"
    ],
    "customLabel0": [],
    "customLabel1": [],
    "customLabel2": [],
    "customLabel3": [],
    "customLabel4": [],
    "identifierExists": [
      "identifierExists"
    ],
    "isAdsEligible": [
      "chatgptEnableAds",
      "isAdsEligible"
    ]
  },
  "valueMaps": {
    "gender": {
      "men": "male",
      "man": "male",
      "mens": "male",
      "m": "male",
      "herren": "male",
      "women": "female",
      "woman": "female",
      "womens": "female",
      "w": "female",
      "f": "female",
      "damen": "female"
    },
    "ageGroup": {
      "adults": "adult",
      "kid": "kids",
      "child": "kids",
      "children": "kids",
      "baby": "infant"
    },
    "condition": {
      "brand new": "new",
      "second hand": "used",
      "pre-owned": "used",
      "refurb": "refurbished"
    }
  },
  "variantOptions": {
    "color": "Color",
    "size": "Size",
    "material": "Material",
    "pattern": "Pattern"
  },
  "categoryFields": {
    "googleProductCategory": [
      "googleProductCategory"
    ]
  },
  "categoryPath": {
    "preferFilteredCategories": true,
    "excludeRoots": []
  }
}
""")


# ===========================================================================
# Shared helpers
# ===========================================================================

LOCALE_KEY = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$")


# ---------------------------------------------------------------------------
# Environment / IO
# ---------------------------------------------------------------------------


def load_env_file(path: str) -> None:
    """Load KEY=VALUE pairs into os.environ without overriding existing values."""
    with open(path, encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip().removeprefix("export ").strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(key, value)


def read_json(path: str) -> Any:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False, default=str)
        handle.write("\n")


def read_jsonl(path: str) -> Iterable[dict]:
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override into a copy of base (lists are replaced)."""
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


# ---------------------------------------------------------------------------
# commercetools value helpers
# ---------------------------------------------------------------------------


def is_localized_string(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and len(value) > 0
        and all(isinstance(k, str) and LOCALE_KEY.match(k) for k in value)
        and all(isinstance(v, str) for v in value.values())
    )


def localized(value: Any, locale: str, strict: bool = False) -> str | None:
    """Resolve a commercetools LocalizedString.

    Tries the exact locale, then the language (en-US -> en), then any locale with the
    same language. With strict=False it finally falls back to the first available value.
    """
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if not isinstance(value, dict) or not value:
        return None
    # Empty strings count as missing: projects often keep "" placeholders for unused locales.
    value = {key: text for key, text in value.items() if isinstance(text, str) and text.strip()}
    if not value:
        return None
    if locale in value:
        return value[locale]
    language = locale.split("-")[0]
    if language in value:
        return value[language]
    for key, text in value.items():
        if key.split("-")[0] == language:
            return text
    if strict:
        return None
    return next(iter(value.values()))


def money_to_decimal(money: dict | None) -> Decimal | None:
    if not money:
        return None
    fraction_digits = int(money.get("fractionDigits", 2))
    if money.get("type") == "highPrecision" and "preciseAmount" in money:
        return Decimal(money["preciseAmount"]).scaleb(-fraction_digits)
    if "centAmount" in money:
        return Decimal(money["centAmount"]).scaleb(-fraction_digits)
    return None


def money_fraction_digits(money: dict | None) -> int:
    if not money:
        return 2
    if money.get("type") == "highPrecision":
        # Feeds expect the currency's normal precision, not the high-precision scale.
        return 2
    return int(money.get("fractionDigits", 2))


def format_amount(amount: Decimal | None, digits: int = 2) -> str | None:
    if amount is None:
        return None
    quantum = Decimal(1).scaleb(-digits)
    return str(amount.quantize(quantum))


def attribute_to_text(value: Any, locale: str) -> str | None:
    """Render any commercetools attribute value as feed-friendly text."""
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return format_number(value)
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, list):
        parts = [attribute_to_text(item, locale) for item in value]
        parts = [part for part in parts if part]
        return ", ".join(parts) if parts else None
    if isinstance(value, dict):
        if "label" in value:  # enum / lenum
            label = value["label"]
            text = localized(label, locale) if isinstance(label, dict) else label
            return text or value.get("key")
        if "centAmount" in value:  # money
            amount = money_to_decimal(value)
            digits = money_fraction_digits(value)
            return f"{format_amount(amount, digits)} {value.get('currencyCode', '')}".strip()
        if "typeId" in value:  # reference
            obj = value.get("obj") or {}
            return localized(obj.get("name"), locale) or obj.get("key") or value.get("id")
        if is_localized_string(value):
            return localized(value, locale)
    return json.dumps(value, ensure_ascii=False)


def format_number(value: float | int | Decimal) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, Decimal):
        text = format(value, "f")
        return text.rstrip("0").rstrip(".") if "." in text else text
    return str(value)


NUMBER_WITH_UNIT = re.compile(r"^\s*([0-9]+(?:[.,][0-9]+)?)\s*([A-Za-z]+)?\s*$")


def parse_measure(value: Any) -> tuple[Decimal | None, str | None]:
    """Parse '1.2 kg', '1,2', 12 into (Decimal, unit|None)."""
    if value is None:
        return None, None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return Decimal(str(value)), None
    if isinstance(value, dict) and "value" in value:  # e.g. {value: 1.2, unit: "kg"}
        number, _ = parse_measure(value.get("value"))
        return number, value.get("unit")
    if isinstance(value, str):
        match = NUMBER_WITH_UNIT.match(value)
        if match:
            try:
                return Decimal(match.group(1).replace(",", ".")), (match.group(2) or None)
            except InvalidOperation:
                return None, None
    return None, None


# ---------------------------------------------------------------------------
# Text and identifier helpers
# ---------------------------------------------------------------------------

TAG = re.compile(r"<[^>]+>")
BLOCK_TAG = re.compile(r"<\s*(br|/p|/div|/li|/h[1-6])\s*/?>", re.IGNORECASE)
WHITESPACE = re.compile(r"\s+")


def strip_html(text: str | None) -> str | None:
    if text is None:
        return None
    text = BLOCK_TAG.sub(" ", text)
    text = TAG.sub("", text)
    text = html.unescape(text)
    text = WHITESPACE.sub(" ", text).strip()
    return text or None


def has_html(text: str | None) -> bool:
    return bool(text) and bool(TAG.search(text))


def gtin_is_valid(gtin: str | None) -> bool:
    if not gtin or not gtin.isdigit() or len(gtin) not in (8, 12, 13, 14):
        return False
    body, check = gtin[:-1], int(gtin[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def is_http_url(value: str | None) -> bool:
    return bool(value) and re.match(r"^https?://[^\s/$.?#].[^\s]*$", value, re.IGNORECASE) is not None


def url_origin(url: str | None) -> str | None:
    if not url:
        return None
    match = re.match(r"^(https?://[^/]+)", url, re.IGNORECASE)
    return match.group(1) if match else None


def first_present(*values: Any) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return None


# ===========================================================================
# commercetools download (fetch)
# ===========================================================================

PAGE_SIZE = 500


def tls_context() -> ssl.SSLContext:
    """Default trust store (honours SSL_CERT_FILE) with chain and hostname verification.

    Python 3.13+ also enables VERIFY_X509_STRICT, which rejects the CA certificates of common
    TLS-inspecting corporate proxies (missing critical Basic Constraints). Only that RFC 5280
    strictness flag is relaxed; certificates are still fully verified.
    """
    context = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
    context.verify_flags &= ~getattr(ssl, "VERIFY_X509_STRICT", 0)
    return context
RETRY_STATUSES = {429, 500, 502, 503, 504}


class CtError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"HTTP {status}: {message}")
        self.status = status


class CtClient:
    def __init__(self, auth_url: str, api_url: str, project_key: str, client_id: str,
                 client_secret: str, scope: str | None):
        self.auth_url = auth_url.rstrip("/")
        self.api_url = api_url.rstrip("/")
        self.project_key = project_key
        self.client_id = client_id
        self.client_secret = client_secret
        self.scope = self._normalize_scope(scope, project_key)
        self._token: str | None = None
        self._tls = tls_context()
        self.request_count = 0

    @staticmethod
    def _normalize_scope(scope: str | None, project_key: str) -> str | None:
        if not scope:
            return None
        parts = []
        for item in scope.split():
            parts.append(item if ":" in item else f"{item}:{project_key}")
        return " ".join(parts)

    def _fetch_token(self) -> str:
        form = {"grant_type": "client_credentials"}
        if self.scope:
            form["scope"] = self.scope
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        request = urllib.request.Request(
            f"{self.auth_url}/oauth/token",
            data=urllib.parse.urlencode(form).encode(),
            headers={"Authorization": f"Basic {basic}",
                     "Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30, context=self._tls) as response:
                return json.loads(response.read())["access_token"]
        except urllib.error.HTTPError as error:
            raise CtError(error.code, f"token request failed: {error.read().decode(errors='replace')}")

    def authenticate(self) -> None:
        self._token = self._fetch_token()

    def get(self, path: str, params: list[tuple[str, str]] | None = None) -> dict:
        query = f"?{urllib.parse.urlencode(params)}" if params else ""
        url = f"{self.api_url}/{self.project_key}{path}{query}"
        refreshed = False
        for attempt in range(6):
            if self._token is None:
                self._token = self._fetch_token()
            request = urllib.request.Request(url, headers={"Authorization": f"Bearer {self._token}"})
            try:
                self.request_count += 1
                with urllib.request.urlopen(request, timeout=60, context=self._tls) as response:
                    return json.loads(response.read())
            except urllib.error.HTTPError as error:
                body = error.read().decode(errors="replace")
                if error.code == 401 and not refreshed:
                    self._token, refreshed = None, True
                    continue
                if error.code in RETRY_STATUSES and attempt < 5:
                    time.sleep(min(2 ** attempt, 20))
                    continue
                raise CtError(error.code, f"GET {path}: {body[:500]}")
            except urllib.error.URLError:
                if attempt < 5:
                    time.sleep(min(2 ** attempt, 20))
                    continue
                raise
        raise CtError(0, f"GET {path}: retries exhausted")

    def get_or_none(self, path: str, params: list[tuple[str, str]] | None = None) -> dict | None:
        try:
            return self.get(path, params)
        except CtError as error:
            if error.status == 404:
                return None
            raise

    def iterate(self, path: str, extra: list[tuple[str, str]] | None = None, where: list[str] | None = None,
                max_items: int | None = None):
        """Iterate a query endpoint with id-cursor pagination (no 10k offset limit)."""
        last_id = None
        yielded = 0
        while True:
            predicates = list(where or [])
            if last_id:
                predicates.append(f'id > "{last_id}"')
            params = [("limit", str(PAGE_SIZE)), ("sort", "id asc"), ("withTotal", "false")]
            params += [("where", " and ".join(f"({p})" for p in predicates))] if predicates else []
            params += extra or []
            page = self.get(path, params)
            results = page.get("results", [])
            for item in results:
                yield item
                yielded += 1
                if max_items is not None and yielded >= max_items:
                    return
            if len(results) < PAGE_SIZE:
                return
            last_id = results[-1]["id"]

    def iterate_search(self, extra: list[tuple[str, str]], filters: list[str], max_items: int | None = None):
        """Iterate Product Projection Search with an id cursor (`id:range("<last>" to *)`), so
        large result sets are not capped by the search offset limit."""
        last_id = None
        yielded = 0
        while True:
            params = [("limit", str(PAGE_SIZE)), ("sort", "id asc"), ("markMatchingVariants", "true"),
                      *[("filter.query", f) for f in filters], *extra]
            if last_id:
                params.append(("filter.query", f'id:range("{last_id}" to *)'))
            page = self.get("/product-projections/search", params)
            results = [r for r in page.get("results", []) if r["id"] != last_id]  # the range is inclusive
            for item in results:
                yield item
                yielded += 1
                if max_items is not None and yielded >= max_items:
                    return
            if len(page.get("results", [])) < PAGE_SIZE:
                return
            last_id = page["results"][-1]["id"]


# ---------------------------------------------------------------------------
# Attribute conditions (--attribute)
# ---------------------------------------------------------------------------

ATTRIBUTE_CONDITION = re.compile(r"^\s*([^!<>=\s]+)\s*(!=|>=|<=|=|>|<)\s*(.*?)\s*$")
ENUM_TYPES = ("enum", "lenum")


def parse_attribute_condition(text: str) -> dict:
    match = ATTRIBUTE_CONDITION.match(text)
    if not match:
        raise ValueError(f"cannot read --attribute '{text}'; use name=value, name!=value, name>=value, ...")
    name, op, raw = match.groups()
    values = [v.strip() for v in raw.split(",") if v.strip()] if op in ("=", "!=") else [raw.strip()]
    if not values:
        raise ValueError(f"--attribute '{text}' has no value")
    return {"name": name, "op": op, "values": values, "text": text}


def attribute_types(client: CtClient) -> dict[str, dict]:
    """Attribute name -> type definition, across all product types."""
    types: dict[str, dict] = {}
    for product_type in client.iterate("/product-types"):
        for definition in product_type.get("attributes", []):
            types.setdefault(definition["name"], definition["type"])
    return types


def resolve_condition(condition: dict, attr_type: dict | None) -> dict:
    """Attach the attribute type and turn enum labels into keys (\"Herren\" -> \"men\")."""
    condition = dict(condition)
    base = (attr_type or {}).get("elementType") if (attr_type or {}).get("name") == "set" else attr_type
    condition["type"] = (base or {}).get("name")
    condition["isSet"] = (attr_type or {}).get("name") == "set"
    if condition["type"] in ENUM_TYPES:
        keys = {}
        for value in base.get("values", []):
            keys[value["key"].lower()] = value["key"]
            label = value.get("label")
            for text in (label.values() if isinstance(label, dict) else [label]):
                if isinstance(text, str):
                    keys.setdefault(text.lower(), value["key"])
        unknown = [v for v in condition["values"] if v.lower() not in keys]
        if unknown:
            raise ValueError(f"--attribute {condition['name']}: {', '.join(unknown)} is not a value of this enum "
                             f"(keys: {', '.join(sorted(v['key'] for v in base.get('values', []))[:20])})")
        condition["values"] = [keys[v.lower()] for v in condition["values"]]
    return condition


def condition_predicate(condition: dict) -> str | None:
    """Attribute clause that narrows the download to products with a matching variant (combined
    per variant by variant_predicate). None when only the local variant check can express it
    (e.g. !=, ltext, money)."""
    kind, op, values = condition["type"], condition["op"], condition["values"]
    if op == "!=":
        return None
    if kind in ENUM_TYPES:
        if op != "=":
            return None
        inner = f"value(key in ({quote_list(values)}))"
    elif kind in ("text", "date", "time", "datetime"):
        inner = f"value in ({quote_list(values)})" if op == "=" else f'value {op} {json.dumps(values[0])}'
    elif kind == "number":
        try:
            numbers = [str(float(v)).rstrip("0").rstrip(".") for v in values]
        except ValueError:
            raise ValueError(f"--attribute {condition['name']} is a number attribute; got {values}") from None
        inner = f"value in ({', '.join(numbers)})" if op == "=" else f"value {op} {numbers[0]}"
    elif kind == "boolean" and op == "=":
        inner = f"value = {values[0].lower()}"
    else:
        return None
    return f'attributes(name={json.dumps(condition["name"])} and {inner})'


def variant_predicate(clauses: list[str]) -> str:
    """All attribute clauses on the same variant: master variant or any other variant."""
    inner = " and ".join(clauses)
    return f"masterVariant({inner}) or variants({inner})"


def condition_search_filter(condition: dict) -> str | None:
    """Product Projection Search filter narrowing to variants that can match (the local
    variant check stays authoritative, e.g. for strict > and <)."""
    kind, op, values, name = condition["type"], condition["op"], condition["values"], condition["name"]
    if op == "!=":
        return None
    if kind in ENUM_TYPES and op == "=":
        return f"variants.attributes.{name}.key:{quote_list(values)}"
    if kind in ("text", "boolean") and op == "=":
        return f"variants.attributes.{name}:" + (values[0].lower() if kind == "boolean" else quote_list(values))
    if kind == "number":
        if op == "=":
            return f"variants.attributes.{name}:{', '.join(values)}"
        low, high = ("*", values[0]) if op in ("<", "<=") else (values[0], "*")
        return f"variants.attributes.{name}:range({low} to {high})"
    return None


def _compare(actual, op: str, values: list[str], kind: str | None) -> bool:
    if actual is None:
        return op == "!="
    if isinstance(actual, list):  # set attribute: any element
        hits = [_compare(item, "=", values, kind) for item in actual]
        return not any(hits) if op == "!=" else (any(hits) if op == "=" else any(_compare(i, op, values, kind) for i in actual))
    if isinstance(actual, dict) and "key" in actual:
        actual = actual["key"]
    elif isinstance(actual, dict):  # localized text: any locale
        return any(_compare(v, op, values, kind) for v in actual.values())
    if op in ("=", "!="):
        if isinstance(actual, bool):
            hit = str(actual).lower() in [v.lower() for v in values]
        elif isinstance(actual, (int, float)):
            hit = any(_number(v) == actual for v in values)
        else:
            hit = str(actual).lower() in [v.lower() for v in values]
        return hit if op == "=" else not hit
    left, right = (actual, _number(values[0])) if isinstance(actual, (int, float)) else (str(actual), values[0])
    if right is None:
        return False
    return {">": left > right, "<": left < right, ">=": left >= right, "<=": left <= right}[op]


def _number(text: str):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def variant_matches(product: dict, variant: dict, conditions: list[dict]) -> bool:
    attributes = {a["name"]: a.get("value") for a in (product.get("attributes") or [])}
    attributes.update({a["name"]: a.get("value") for a in (variant.get("attributes") or [])})
    return all(_compare(attributes.get(c["name"]), c["op"], c["values"], c.get("type")) for c in conditions)


def scope_variants(product: dict, keep_skus: list[str] | None, conditions: list[dict], per_variant: bool,
                   matching_only: bool) -> tuple[bool, list[str] | None]:
    """Apply attribute conditions and search matching-variant flags on top of the assortment."""
    variants = [product["masterVariant"], *product.get("variants", [])]
    candidates = [v for v in variants if keep_skus is None or v.get("sku") in keep_skus]
    if conditions:
        matching = [v for v in candidates if variant_matches(product, v, conditions)]
        if not matching:
            return False, None
        if per_variant:
            candidates = matching
    if matching_only and any("isMatchingVariant" in v for v in candidates):
        candidates = [v for v in candidates if v.get("isMatchingVariant")]
    if not candidates:
        return False, None
    if keep_skus is None and len(candidates) == len(variants):
        return True, None
    return True, [v.get("sku") for v in candidates if v.get("sku")]


# ---------------------------------------------------------------------------
# Filter resolution
# ---------------------------------------------------------------------------


def category_path(category: dict, by_id: dict[str, dict]) -> str:
    locale = os.environ.get("CTP_LOCALE") or "en-US"
    chain = [by_id.get(a["id"]) for a in category.get("ancestors", [])] + [category]
    return " > ".join(localized(c.get("name"), locale) or c["id"] for c in chain if c)


def resolve_categories(tokens: list[str], categories: list[dict], include_subtree: bool) -> tuple[list[str], list[str], dict[str, list[str]]]:
    """Map user-supplied category ids / keys / slugs / names to category ids.

    Ids and keys are unique. Slugs and names are not (\"Women\" can exist under several trees),
    so a slug or name that matches more than one category is returned as ambiguous with the
    candidate paths instead of silently exporting all of them."""
    by_id = {c["id"]: c for c in categories}
    resolved: set[str] = set()
    unresolved: list[str] = []
    ambiguous: dict[str, list[str]] = {}
    for token in tokens:
        needle = token.strip().lower()
        exact = [c for c in categories if c["id"].lower() == needle or (c.get("key") or "").lower() == needle]
        matches = exact or [
            c for c in categories
            if any(s.lower() == needle for s in (c.get("slug") or {}).values())
            or any(n.lower() == needle for n in (c.get("name") or {}).values())
        ]
        if not matches:
            unresolved.append(token)
        elif len(matches) > 1:
            ambiguous[token] = sorted(f"{c.get('key') or c['id']}: {category_path(c, by_id)}" for c in matches)
        else:
            resolved.add(matches[0]["id"])
    if include_subtree and resolved:
        roots = set(resolved)
        for category in categories:
            ancestors = {a["id"] for a in category.get("ancestors", [])}
            if ancestors & roots:
                resolved.add(category["id"])
    return sorted(resolved), unresolved, ambiguous


def resolve_product_types(client: CtClient, tokens: list[str]) -> tuple[list[str], list[str]]:
    all_types = list(client.iterate("/product-types"))
    resolved, unresolved = [], []
    for token in tokens:
        needle = token.strip().lower()
        match = [t for t in all_types if needle in (t["id"].lower(), (t.get("key") or "").lower(), t["name"].lower())]
        if match:
            resolved.extend(t["id"] for t in match)
        else:
            unresolved.append(token)
    return sorted(set(resolved)), unresolved


def quote_list(values: list[str]) -> str:
    return ", ".join(json.dumps(v) for v in values)


def resolve_product_selections(client: CtClient, tokens: list[str]) -> tuple[list[dict], list[str]]:
    """Map product selection ids / keys / names (any locale, case-insensitive) to selections."""
    selections = list(client.iterate("/product-selections"))
    resolved, unresolved = {}, []
    for token in tokens:
        needle = token.strip().lower()
        matches = [
            ps for ps in selections
            if ps["id"].lower() == needle or (ps.get("key") or "").lower() == needle
            or any(name.lower() == needle for name in (ps.get("name") or {}).values())
        ]
        if not matches:
            unresolved.append(token)
        resolved.update({ps["id"]: ps for ps in matches})
    return list(resolved.values()), unresolved


def stores_using_selections(client: CtClient, selection_ids: set[str]) -> list[str]:
    """Keys of Stores with an active setting for any of the selections ([] without view_stores)."""
    try:
        return [
            store["key"] for store in client.iterate("/stores")
            if any(s.get("active") and s["productSelection"]["id"] in selection_ids for s in store.get("productSelections", []))
        ]
    except CtError:
        return []


def load_selection_assortment(client: CtClient, selections: list[dict]) -> dict:
    """Return {"include": {productId: skuRule|None}, "exclude": {...}} for product selections.

    `Individual` selections list the products they contain; `IndividualExclusion` selections
    list the products they leave out. Variant selections / exclusions narrow the SKUs."""
    assortment: dict = {"include": {}, "exclude": {}, "hasIndividual": False}
    for selection in selections:
        bucket = "exclude" if selection.get("mode") == "IndividualExclusion" else "include"
        assortment["hasIndividual"] |= bucket == "include"  # an empty Individual selection includes nothing
        offset = 0
        while True:
            page = client.get(f"/product-selections/{selection['id']}/products",
                              [("limit", str(PAGE_SIZE)), ("offset", str(offset))])
            for assigned in page.get("results", []):
                rule = assigned.get("variantSelection") or assigned.get("variantExclusion")
                assortment[bucket][assigned["product"]["id"]] = rule
            if len(page.get("results", [])) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
    return assortment


def load_store_assortment(client: CtClient, store: dict) -> dict | None:
    """Assortment of the store's active product selections, or None when the store has none
    (= all products)."""
    settings = [s for s in store.get("productSelections", []) if s.get("active")]
    if not settings:
        return None
    selections = [client.get(f"/product-selections/{s['productSelection']['id']}") for s in settings]
    return load_selection_assortment(client, selections)


def apply_assortment(product: dict, assortment: dict, all_skus: list[str]) -> tuple[bool, set[str] | None]:
    if product["id"] in assortment["exclude"]:
        rule = assortment["exclude"][product["id"]]
        if not rule:  # whole product excluded
            return False, None
        return True, set(all_skus) - set(rule.get("skus", []))
    if assortment["hasIndividual"]:
        if product["id"] not in assortment["include"]:
            return False, None
        rule = assortment["include"][product["id"]]
        if rule and rule.get("type") == "includeOnly":
            return True, set(rule.get("skus", []))
        if rule and rule.get("type") == "includeAllExcept":
            return True, set(all_skus) - set(rule.get("skus", []))
    return True, None


def selected_skus(product: dict, assortments: list[dict], sku_filter: set[str]) -> tuple[bool, list[str] | None]:
    """Decide whether the product is in scope and which SKUs (None = all variants).
    Every assortment (store, explicit product selections) must include the product."""
    all_skus = [v.get("sku") for v in [product["masterVariant"], *product.get("variants", [])] if v.get("sku")]
    allowed: set[str] | None = None
    for assortment in assortments:
        in_scope, skus = apply_assortment(product, assortment, all_skus)
        if not in_scope:
            return False, None
        if skus is not None:
            allowed = skus if allowed is None else allowed & skus

    if sku_filter:
        allowed = (allowed if allowed is not None else set(all_skus)) & sku_filter

    if allowed is None:
        return True, None
    keep = [sku for sku in all_skus if sku in allowed]
    return bool(keep), keep


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


AUDIT_FIELDS = ("createdBy", "lastModifiedBy")


def scrub(resource):
    """Drop audit metadata (it carries the API client id) before anything is written to disk."""
    if isinstance(resource, dict):
        return {k: v for k, v in resource.items() if k not in AUDIT_FIELDS}
    return resource


def list_stores(client: CtClient) -> dict:
    """Market context to choose --store / --currency / --country / --channel / --locale from."""
    project = client.get("")
    channels = {c["id"]: c.get("key") or c["id"] for c in client.iterate("/channels")}
    selections = {ps["id"]: ps for ps in client.iterate("/product-selections")}
    stores = []
    for store in client.iterate("/stores"):
        stores.append({
            "key": store["key"],
            "name": localized(store.get("name"), "en-US"),
            "languages": store.get("languages", []),
            "countries": [c.get("code") for c in store.get("countries", [])],
            "distributionChannels": [channels.get(c["id"], c["id"]) for c in store.get("distributionChannels", [])],
            "supplyChannels": [channels.get(c["id"], c["id"]) for c in store.get("supplyChannels", [])],
            "productSelections": [
                (selections.get(s["productSelection"]["id"]) or {}).get("key") or s["productSelection"]["id"]
                for s in store.get("productSelections", []) if s.get("active")
            ],
            "storefrontFields": sorted((store.get("storefront") or {}).keys()),
            "customFields": sorted(((store.get("custom") or {}).get("fields") or {}).keys()),
        })
    return {
        "project": {k: project.get(k) for k in ("key", "currencies", "countries", "languages")},
        "channels": [{"key": c.get("key"), "roles": c.get("roles", [])} for c in client.iterate("/channels")],
        "stores": stores,
        "productSelections": [
            {"key": ps.get("key"), "name": localized(ps.get("name"), "en-US"), "mode": ps.get("mode"),
             "productCount": ps.get("productCount")}
            for ps in selections.values()
        ],
    }


def locale_coverage(products: list[dict], locale: str) -> dict:
    """How many sample product names resolve in the feed locale (exact or same language)."""
    exact = language = 0
    seen: dict[str, int] = {}
    for product in products:
        names = {k: v for k, v in (product.get("name") or {}).items() if isinstance(v, str) and v.strip()}
        for key in names:
            seen[key] = seen.get(key, 0) + 1
        if locale in names:
            exact += 1
        elif localized(names, locale, strict=True):
            language += 1
    return {"sampled": len(products), "exactLocale": exact, "sameLanguage": language, "localesInData": seen}


def add_fetch_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--out", help="Run directory; raw data is written to <out>/raw")
    parser.add_argument("--list-stores", action="store_true",
                        help="Print project currencies/countries/languages, Stores and product selections, then exit")
    parser.add_argument("--list-categories", nargs="?", const="", default=None, metavar="TEXT",
                        help="Print category keys and paths (optionally only those whose path contains TEXT), then exit")
    parser.add_argument("--list-attribute", metavar="NAME",
                        help="Print an attribute's type and enum keys/labels, then exit")
    parser.add_argument("--locale", default=None, help="Feed locale (default: CTP_LOCALE, else the Store's first language, else en-US)")
    parser.add_argument("--env-file", help="dotenv file with CTP_* credentials (e.g. product-feed-trigger/.env)")
    parser.add_argument("--store", default=os.environ.get("CTP_STORE_KEY"), help="Store key (store projection, assortment, seller data)")
    parser.add_argument("--currency", default=None, help="Price selection currency, e.g. USD (default: CTP_CURRENCY)")
    parser.add_argument("--country", default=None, help="Price selection country, e.g. US (default: CTP_COUNTRY)")
    parser.add_argument("--channel", default=None, help="Price/distribution channel KEY (default: CTP_DISTRIBUTION_CHANNEL_KEY)")
    parser.add_argument("--customer-group", default=None, help="Price selection customer group id")
    parser.add_argument("--category", action="append", default=[], help="Category id, key, slug or name. Repeatable")
    parser.add_argument("--no-subtree", action="store_true", help="Do not include sub-categories of --category")
    parser.add_argument("--product-type", action="append", default=[], help="Product type key, id or name. Repeatable")
    parser.add_argument("--sku", action="append", default=[], help="Only these SKUs. Repeatable or comma-separated")
    parser.add_argument("--product-key", action="append", default=[], help="Only these product keys. Repeatable or comma-separated")
    parser.add_argument("--product-selection", action="append", default=[],
                        help="Product selection key, id or name. Repeatable; a product must be in every one")
    parser.add_argument("--where", action="append", default=[], help="Extra ProductProjection query predicate. Repeatable (ANDed)")
    parser.add_argument("--attribute", action="append", default=[],
                        help="Attribute condition: name=value[,value], name!=value, name>=value, name<=value, name>value, "
                             "name<value. Enum labels or keys. Repeatable (ANDed)")
    parser.add_argument("--attribute-scope", choices=["variant", "product"], default="variant",
                        help="variant (default): export only matching variants; product: whole products with a matching variant")
    parser.add_argument("--search-filter", action="append", default=[],
                        help="Product Projection Search filter.query expression, e.g. variants.availability.isOnStock:true. "
                             "Repeatable (ANDed). Uses the search endpoint; cannot be combined with --where")
    parser.add_argument("--all-variants", action="store_true",
                        help="With --search-filter: keep all variants of matching products, not only matching variants")
    parser.add_argument("--ignore-assortment", action="store_true", help="Ignore the store's product selections")
    parser.add_argument("--staged", action="store_true", help="Use staged (draft) data instead of published")
    parser.add_argument("--max-products", type=int, default=None, help="Stop after N matching products (sampling)")
    parser.add_argument("--expand", action="append", default=[], help="Extra expansion paths")
    parser.add_argument("--dry-run", action="store_true",
                        help="Resolve filters, count matches and print a summary without downloading products or writing files")
    parser.add_argument("--json", action="store_true", help="With --dry-run: print the full plan (query, parameters) as JSON")


def split_multi(values: list[str]) -> list[str]:
    return [part.strip() for value in values for part in value.split(",") if part.strip()]


def cmd_fetch(args: argparse.Namespace) -> int:
    if not (args.list_stores or args.list_categories is not None or args.list_attribute or args.dry_run) and not args.out:
        print("fetch: --out is required for a download", file=sys.stderr)
        return 2
    if args.env_file:
        load_env_file(args.env_file)
        args.store = args.store or os.environ.get("CTP_STORE_KEY")

    missing = [k for k in ("CTP_PROJECT_KEY", "CTP_CLIENT_ID", "CTP_CLIENT_SECRET", "CTP_AUTH_URL", "CTP_API_URL") if not os.environ.get(k)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        return 2

    currency = args.currency or os.environ.get("CTP_CURRENCY")
    country = args.country or os.environ.get("CTP_COUNTRY")
    channel_key = args.channel or os.environ.get("CTP_DISTRIBUTION_CHANNEL_KEY")

    client = CtClient(os.environ["CTP_AUTH_URL"], os.environ["CTP_API_URL"], os.environ["CTP_PROJECT_KEY"],
                      os.environ["CTP_CLIENT_ID"], os.environ["CTP_CLIENT_SECRET"], os.environ.get("CTP_SCOPE"))
    try:
        client.authenticate()
    except (CtError, urllib.error.URLError) as error:
        print(f"Authentication against {os.environ['CTP_AUTH_URL']} failed: {error}", file=sys.stderr)
        return 2

    if args.list_stores:
        print(json.dumps(list_stores(client), indent=2, ensure_ascii=False))
        return 0
    if args.list_attribute:
        attr_type = attribute_types(client).get(args.list_attribute)
        if attr_type is None:
            print(f"Unknown attribute '{args.list_attribute}'", file=sys.stderr)
            return 2
        base = attr_type.get("elementType") if attr_type.get("name") == "set" else attr_type
        values = [f"{v['key']}: {localized(v.get('label'), args.locale or 'en-US') if isinstance(v.get('label'), dict) else v.get('label')}"
                  for v in (base or {}).get("values", [])]
        print(json.dumps({"name": args.list_attribute, "type": attr_type.get("name"),
                          "elementType": (base or {}).get("name") if base is not attr_type else None,
                          "values": values}, indent=2, ensure_ascii=False))
        return 0
    if args.list_categories is not None:
        os.environ.setdefault("CTP_LOCALE", args.locale or "en-US")
        categories = list(client.iterate("/categories"))
        by_id = {c["id"]: c for c in categories}
        needle = args.list_categories.lower()
        for line in sorted(f"{c.get('key') or c['id']}: {category_path(c, by_id)}" for c in categories):
            if needle in line.lower():
                print(line)
        return 0

    raw_dir = os.path.join(args.out or ".", "raw")
    warnings: list[str] = []

    # Categories are always downloaded: they are small and needed for category paths offline.
    print("Downloading categories...", file=sys.stderr)
    try:
        categories = [scrub(c) for c in client.iterate("/categories")]
    except CtError as error:
        warnings.append(f"Could not download categories ({error}); category filters and paths are unavailable. "
                        "The API client needs the view_categories scope")
        categories = []

    store = None
    assortments: list[dict] = []
    if args.store:
        store = scrub(client.get_or_none(f"/stores/key={urllib.parse.quote(args.store)}"))
        if store is None:
            print(f"Store '{args.store}' not found", file=sys.stderr)
            return 2
        if not args.ignore_assortment:
            store_assortment = load_store_assortment(client, store)
            if store_assortment is not None:
                assortments.append(store_assortment)
    # Feed locale: --locale / CTP_LOCALE, else the Store's first language, else en-US.
    locale = args.locale or os.environ.get("CTP_LOCALE") or ((store or {}).get("languages") or ["en-US"])[0]
    os.environ["CTP_LOCALE"] = locale  # used for category paths in messages

    if args.where and args.search_filter:
        print("--where (query predicates) and --search-filter (search filters) use different endpoints; use one of them",
              file=sys.stderr)
        return 2
    where = list(args.where)
    search = list(args.search_filter)  # used instead of `where` when --search-filter is given
    category_ids: list[str] = []
    resolved_category_roots: list[dict] = []
    by_id: dict[str, dict] = {}
    if args.category:
        if not categories:
            print("--category needs the category list, which could not be downloaded (view_categories scope?)", file=sys.stderr)
            return 2
        category_ids, unresolved, ambiguous = resolve_categories(args.category, categories, not args.no_subtree)
        if unresolved:
            print(f"Unknown categories: {', '.join(unresolved)}", file=sys.stderr)
            return 2
        if ambiguous:
            for token, candidates in ambiguous.items():
                print(f"Category '{token}' matches {len(candidates)} categories; pass a key instead:", file=sys.stderr)
                for candidate in candidates:
                    print(f"  {candidate}", file=sys.stderr)
            return 2
        where.append(f"categories(id in ({quote_list(category_ids)}))")
        search.append(f"categories.id:{quote_list(category_ids)}")
        by_id = {c["id"]: c for c in categories}
        resolved_category_roots = [c for c in categories if c["id"] in category_ids
                                   and not ({a["id"] for a in c.get("ancestors", [])} & set(category_ids))]
    if args.product_type:
        type_ids, unresolved = resolve_product_types(client, args.product_type)
        if unresolved:
            print(f"Unknown product types: {', '.join(unresolved)}", file=sys.stderr)
            return 2
        where.append(f"productType(id in ({quote_list(type_ids)}))")
        search.append(f"productType.id:{quote_list(type_ids)}")
    skus = split_multi(args.sku)
    if skus:
        where.append(f"masterVariant(sku in ({quote_list(skus)})) or variants(sku in ({quote_list(skus)}))")
        search.append(f"variants.sku:{quote_list(skus)}")
    selection_ids: list[str] = []
    resolved_selections: list[dict] = []
    if args.product_selection:
        selections, unresolved = resolve_product_selections(client, args.product_selection)
        if unresolved:
            print(f"Unknown product selections: {', '.join(unresolved)}", file=sys.stderr)
            return 2
        selection_ids = [ps["id"] for ps in selections]
        resolved_selections = [
            {"key": ps.get("key"), "name": localized(ps.get("name"), locale), "mode": ps.get("mode"),
             "productCount": ps.get("productCount")} for ps in selections
        ]
        if not args.store:
            stores_with = stores_using_selections(client, set(selection_ids))
            if stores_with:
                warnings.append(
                    f"No --store given. Stores using this product selection: {', '.join(stores_with)}. "
                    "Pass one with --store to read its storefront URL, seller and policy data, prices and inventory scope")
        for selection in selections:
            selection_assortment = load_selection_assortment(client, [selection])
            assortments.append(selection_assortment)
            # Narrow the query for small Individual selections; larger ones are filtered while paging.
            included = list(selection_assortment["include"])
            if selection.get("mode") != "IndividualExclusion" and len(included) <= 100:
                where.append(f"id in ({quote_list(included)})" if included else 'id = "-"')
                search.append(f"id:{quote_list(included)}" if included else 'id:"-"')
    product_keys = split_multi(args.product_key)
    if product_keys:
        where.append(f"key in ({quote_list(product_keys)})")
        search.append(f"key:{quote_list(product_keys)}")
    conditions: list[dict] = []
    if args.attribute:
        types = attribute_types(client)
        clauses: list[str] = []
        unnarrowed: list[str] = []
        try:
            for text in args.attribute:
                condition = parse_attribute_condition(text)
                if condition["name"] not in types:
                    print(f"Unknown attribute '{condition['name']}'. Attributes in this project: "
                          f"{', '.join(sorted(types))}", file=sys.stderr)
                    return 2
                condition = resolve_condition(condition, types[condition["name"]])
                conditions.append(condition)
                clause = condition_predicate(condition)
                if clause:
                    clauses.append(clause)
                else:
                    unnarrowed.append(condition["text"])
                search_filter = condition_search_filter(condition)
                if search_filter:
                    search.append(search_filter)
        except ValueError as error:
            print(str(error), file=sys.stderr)
            return 2
        if clauses:
            where.append(variant_predicate(clauses))
        if unnarrowed:
            warnings.append(f"Checked per variant only, not in the query: {', '.join(unnarrowed)}. "
                            "The match count below includes products these conditions will drop")

    params: list[tuple[str, str]] = [("staged", "true" if args.staged else "false")]
    channel_id = None
    if currency:
        params.append(("priceCurrency", currency))
        if country:
            params.append(("priceCountry", country))
        if channel_key:
            channel = client.get_or_none(f"/channels/key={urllib.parse.quote(channel_key)}")
            if channel is None:
                warnings.append(f"Channel '{channel_key}' not found; prices selected without a channel")
            else:
                channel_id = channel["id"]
                params.append(("priceChannel", channel_id))
        if args.customer_group:
            params.append(("priceCustomerGroup", args.customer_group))
    else:
        warnings.append("No currency given: price selection is off, so prices are picked offline from variant.prices")
    if args.store:
        params.append(("storeProjection", args.store))
    for path in ["masterVariant.price.discounted.discount", "variants[*].price.discounted.discount", *args.expand]:
        params.append(("expand", path))

    manifest = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "projectKey": os.environ["CTP_PROJECT_KEY"],
        "apiUrl": os.environ["CTP_API_URL"],
        "store": args.store,
        "locale": locale,
        "currency": currency,
        "country": country,
        "channelKey": channel_key,
        "channelId": channel_id,
        "staged": args.staged,
        "filters": {
            "categories": args.category,
            "categoryIds": category_ids,
            "resolvedCategories": [f"{c.get('key') or c['id']}: {category_path(c, by_id)}" for c in resolved_category_roots],
            "resolvedProductSelections": resolved_selections,
            "includeSubtree": not args.no_subtree,
            "productTypes": args.product_type,
            "skus": skus,
            "productKeys": product_keys,
            "where": args.where,
            "attributes": [{"name": c["name"], "op": c["op"], "values": c["values"], "type": c["type"]} for c in conditions],
            "attributeScope": args.attribute_scope,
            "searchFilters": args.search_filter,
            "productSelections": args.product_selection,
            "productSelectionIds": selection_ids,
            "assortments": [
                {"includedProducts": len(a["include"]), "excludedProducts": len(a["exclude"])} for a in assortments
            ],
            "maxProducts": args.max_products,
        },
        "query": ({"endpoint": "product-projections/search", "filter.query": search, "params": params} if args.search_filter
                  else {"endpoint": "product-projections", "where": where, "params": params}),
        "warnings": warnings,
    }

    if args.dry_run:
        # Count matches before the assortment, and sample names to check the feed locale.
        if args.search_filter:
            sample = client.get("/product-projections/search", [("limit", "20"), ("markMatchingVariants", "true"), *params,
                                                                 *[("filter.query", f) for f in search]])
        else:
            sample = client.get("/product-projections", [("limit", "20"), ("withTotal", "true"), *params]
                                + ([("where", " and ".join(f"({p})" for p in where))] if where else []))
        coverage = locale_coverage(sample.get("results", []), locale)
        manifest["dryRun"] = {"productsMatchingQuery": sample.get("total"), "localeCheck": coverage}
        if conditions or args.search_filter:
            scoped = [scope_variants(p, selected_skus(p, assortments, set(skus))[1], conditions,
                                     args.attribute_scope == "variant", not args.all_variants) for p in sample.get("results", [])]
            manifest["dryRun"]["sampleVariantsKept"] = sum(
                (len(k) if k is not None else 1 + len(p.get("variants", []))) for (ok, k), p in zip(scoped, sample.get("results", [])) if ok)
        if assortments:
            in_scope = sum(1 for p in sample.get("results", []) if selected_skus(p, assortments, set(skus))[0])
            manifest["dryRun"]["sampleInAssortment"] = f"{in_scope} of {len(sample.get('results', []))}"
            if sample.get("results") and in_scope == 0:
                warnings.append("None of the sampled products is in the Store assortment / product selection; "
                                "the download will likely be empty. Ignoring the assortment (--ignore-assortment) "
                                "changes the scope: ask the user")
        if coverage["sampled"] and coverage["exactLocale"] + coverage["sameLanguage"] == 0:
            warnings.append(f"Feed locale '{locale}' matches no sampled product name; locales in data: "
                            f"{', '.join(coverage['localesInData'])}. Pass --locale")
        if args.json:
            print(json.dumps(manifest, indent=2, ensure_ascii=False))
        summary = [
            "Dry run summary:",
            f"  endpoint: {manifest['query']['endpoint']}",
            f"  categories: {', '.join(manifest['filters']['resolvedCategories']) or '–'}",
            f"  product selections: {', '.join(s['key'] or '?' for s in resolved_selections) or '–'}",
            f"  attributes: {', '.join(c['name'] + c['op'] + ','.join(c['values']) for c in conditions) or '–'}",
            f"  store: {args.store or '–'}  currency/country/channel: {currency or '–'}/{country or '–'}/{channel_key or '–'}  locale: {locale}",
            f"  search filters: {'; '.join(search) if args.search_filter else '–'}",
            f"  query predicates: {len(where)}" + (" (see --json)" if where else ""),
            f"  products matching the query (before the Store assortment and per-variant checks): "
            f"{manifest['dryRun']['productsMatchingQuery']}",
        ]
        if "sampleVariantsKept" in manifest["dryRun"]:
            summary.append(f"  variants kept in a {len(sample.get('results', []))}-product sample: {manifest['dryRun']['sampleVariantsKept']}")
        if "sampleInAssortment" in manifest["dryRun"]:
            summary.append(f"  sample in store assortment / selection: {manifest['dryRun']['sampleInAssortment']}")
        summary += [f"  WARNING: {w}" for w in warnings]
        print("\n".join(summary), file=sys.stderr if args.json else sys.stdout)
        return 0

    os.makedirs(raw_dir, exist_ok=True)
    write_json(os.path.join(raw_dir, "categories.json"), categories)
    write_json(os.path.join(raw_dir, "store.json"), store)

    print("Downloading products...", file=sys.stderr)
    sku_filter = set(skus)
    kept = scanned = 0
    variant_count = 0
    products_path = os.path.join(raw_dir, "products.jsonl")
    with open(products_path, "w", encoding="utf-8") as handle:
        products = (client.iterate_search(params, search) if args.search_filter
                    else client.iterate("/product-projections", params, where))
        for product in products:
            scanned += 1
            in_scope, keep_skus = selected_skus(product, assortments, sku_filter)
            if not in_scope:
                continue
            in_scope, keep_skus = scope_variants(product, keep_skus, conditions, args.attribute_scope == "variant",
                                                 not args.all_variants)
            if not in_scope:
                continue
            product = scrub(product)
            product["_feed"] = {"selectedSkus": keep_skus}
            handle.write(json.dumps(product, ensure_ascii=False) + "\n")
            kept += 1
            variant_count += len(keep_skus) if keep_skus is not None else 1 + len(product.get("variants", []))
            if kept % 500 == 0:
                print(f"  {kept} products...", file=sys.stderr)
            if args.max_products and kept >= args.max_products:
                break

    manifest["counts"] = {"productsScanned": scanned, "productsKept": kept, "variantsKept": variant_count,
                          "categories": len(categories), "apiRequests": client.request_count}
    write_json(os.path.join(raw_dir, "fetch-manifest.json"), manifest)

    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    print(f"Saved {kept} products ({variant_count} variants) to {products_path}")
    if kept == 0:
        print("No products matched the filters.", file=sys.stderr)
        return 1
    return 0


# ===========================================================================
# Normalization: commercetools -> vendor-neutral records
# ===========================================================================

# Canonical attribute keys -> record keys
ATTRIBUTE_FIELDS = {
    "brand": "brand", "gtin": "gtin", "mpn": "mpn", "color": "color", "size": "size",
    "sizeSystem": "size_system", "material": "material", "pattern": "pattern",
    "condition": "condition", "gender": "gender", "ageGroup": "age_group",
    "reviewCount": "review_count", "starRating": "star_rating",
    "googleProductCategory": "google_product_category", "promotionId": "promotion_id",
    "customLabel0": "custom_label_0", "customLabel1": "custom_label_1", "customLabel2": "custom_label_2",
    "customLabel3": "custom_label_3", "customLabel4": "custom_label_4",
}
MEASURE_FIELDS = ("weight", "length", "width", "height")
BOOLEAN_FIELDS = {"isEligibleSearch": "is_eligible_search", "isEligibleCheckout": "is_eligible_checkout",
                  "isAdsEligible": "is_ads_eligible"}


class Normalizer:
    def __init__(self, cfg: dict, categories: list[dict], store: dict | None, manifest: dict):
        self.cfg = cfg
        self.locale = cfg.get("locale") or manifest.get("locale") or "en-US"
        self.currency = cfg.get("currency") or manifest.get("currency")
        self.country = cfg.get("country") or manifest.get("country")
        self.categories = {c["id"]: c for c in categories}
        self.store = store or {}
        self.notes: list[dict] = []  # {"item_id", "field", "message"}
        self.flag_defaults: Counter = Counter()  # flag field -> rows that got the `flags` default
        self.attribute_stats: dict[str, dict] = defaultdict(lambda: {"count": 0, "sample": None})
        self._mapped_names = {
            name.lower() for names in cfg.get("attributes", {}).values() for name in (names or [])
        }
        self.seller = self._resolve_seller()
        self.filtered_categories = set((manifest.get("filters") or {}).get("categoryIds") or [])

    # -- public -------------------------------------------------------------

    def records(self, products) -> list[dict]:
        out = []
        for product in products:
            variants = [product["masterVariant"], *product.get("variants", [])]
            selected = (product.get("_feed") or {}).get("selectedSkus")
            varying = self._varying_options(product, variants)
            for variant in variants:
                if selected is not None and variant.get("sku") not in selected:
                    continue
                record = self._record(product, variant, len(variants), varying)
                if self.cfg.get("onlyInStock") and record["availability"] != "in_stock":
                    continue
                out.append(record)
        return out

    def unmapped_attributes(self) -> list[dict]:
        rows = []
        for name, stats in sorted(self.attribute_stats.items(), key=lambda kv: -kv[1]["count"]):
            if name.lower() not in self._mapped_names:
                rows.append({"attribute": name, "variantsWithValue": stats["count"], "sample": stats["sample"]})
        return rows

    def source_descriptions(self) -> dict[str, str]:
        attrs = self.cfg.get("attributes", {})
        described = {
            "item_id": f"itemId strategy '{self.cfg.get('itemId')}'",
            "title": f"product.name[{self.locale}]" + (" + variant options" if self.cfg.get("appendVariantToTitle") else ""),
            "description": f"product.description[{self.locale}] (HTML stripped)",
            "url": f"productUrlTemplate '{self.cfg.get('productUrlTemplate')}' with Store baseUrl",
            "image_url": "variant.images[0].url",
            "additional_image_urls": "variant.images[1..]",
            "price": "variant.price (price selection) / variant.prices",
            "sale_price": "variant.price.discounted",
            "sale_dates": "variant.price.discounted.discount.validFrom/validUntil",
            "availability": "variant.availability (inventory)",
            "inventory_quantity": "variant.availability.availableQuantity",
            "group_id": f"groupId strategy '{self.cfg.get('groupId')}' (only for multi-variant products)",
            "category_path": "product.categories[0] ancestors > name",
            "google_product_category": "attribute googleProductCategory / category custom field",
            "variant_options": f"variantOptions {list(self.cfg.get('variantOptions', {}).values())}",
            **{f"store:{key}": "Store: " + " | ".join(paths) for key, paths in (self.cfg.get("store") or {}).items()},
            "identifier_exists": "attribute: " + " | ".join(self.cfg.get("attributes", {}).get("identifierExists") or ["(not mapped)"]),
        }
        for canonical, field in ATTRIBUTE_FIELDS.items():
            described.setdefault(field, "attribute: " + " | ".join(attrs.get(canonical) or ["(not mapped)"]))
        for canonical in MEASURE_FIELDS:
            described[canonical] = "attribute: " + " | ".join(attrs.get(canonical) or ["(not mapped)"])
        for canonical, field in BOOLEAN_FIELDS.items():
            described[field] = ("attribute: " + " | ".join(attrs.get(canonical) or ["(not mapped)"])
                                + f", else flags.{canonical} = {(self.cfg.get('flags') or {}).get(canonical)}")
        described["ads_metadata"] = "adsMetadata keys → attributes"
        described["market_country"] = "--country of the download"
        return described

    # -- record -------------------------------------------------------------

    def _varying_options(self, product: dict, variants: list[dict]) -> set[str]:
        """Variant options whose value differs between the product's variants (e.g. color, size)."""
        values: dict[str, set] = defaultdict(set)
        for variant in variants:
            index = self._raw_index(product, variant)
            for canonical in self.cfg.get("variantOptions") or {}:
                values[canonical].add(self._lookup(index, canonical))
        return {canonical for canonical, seen in values.items() if len(seen - {None}) > 1}

    def _record(self, product: dict, variant: dict, variant_count: int, varying: set[str]) -> dict:
        loc = self.locale
        attributes = self._attribute_index(product, variant)
        item_id = self._item_id(product, variant)

        def note(field: str, message: str) -> None:
            self.notes.append({"item_id": item_id, "field": field, "message": message})

        fallback = bool(self.cfg.get("allowLocaleFallback"))
        name = localized(product.get("name"), loc, strict=True)
        if name is None and product.get("name"):
            name = localized(product.get("name"), loc) if fallback else None
            note("title", f"no '{loc}' name" + ("; used another locale" if fallback else "; left empty"))
        raw_description = localized(product.get("description"), loc, strict=True)
        if raw_description is None and product.get("description"):
            raw_description = localized(product.get("description"), loc) if fallback else None
            note("description", f"no '{loc}' description" + ("; used another locale" if fallback else "; left empty"))
        slug = localized(product.get("slug"), loc)

        rec: dict[str, Any] = {
            "item_id": item_id,
            "sku": variant.get("sku"),
            "variant_id": variant.get("id"),
            "variant_key": variant.get("key"),
            "product_id": product["id"],
            "product_key": product.get("key"),
            "slug": slug,
            "group_title": name,
            "description": strip_html(raw_description),
            "description_had_html": has_html(raw_description),
        }

        # Attributes
        for canonical, field in ATTRIBUTE_FIELDS.items():
            rec[field] = self._lookup(attributes, canonical)
        if rec["gtin"]:
            rec["gtin"] = rec["gtin"].replace(" ", "").replace("-", "")
        rec["identifier_exists"] = self._lookup(attributes, "identifierExists")
        if rec["identifier_exists"] is not None:
            rec["identifier_exists"] = rec["identifier_exists"].strip().lower() in ("true", "yes", "1")
        for field in ("gender", "age_group", "condition"):
            rec[field] = self._map_value(field, rec[field])
        # Eligibility flags are merchant settings, not product data: a product attribute wins,
        # otherwise the `flags` defaults apply (discovery on, checkout off, ads on for Ads feeds).
        flag_defaults = self.cfg.get("flags") or {}
        for canonical, field in BOOLEAN_FIELDS.items():
            text = self._lookup(attributes, canonical)
            if text is None:
                rec[field] = flag_defaults.get(canonical)
                if rec[field] is not None:
                    self.flag_defaults[field] += 1
            else:
                rec[field] = text.strip().lower() in ("true", "yes", "1")
        ads_metadata = {}
        for key, names in (self.cfg.get("adsMetadata") or {}).items():
            value = attribute_to_text(first_present(*(attributes.get(n.lower()) for n in (names or []))), self.locale)
            if value:
                ads_metadata[key] = value
        rec["ads_metadata"] = ads_metadata or None
        rec["market_country"] = self.country

        dimension_units = set()
        for measure in MEASURE_FIELDS:
            number, unit = parse_measure(self._lookup_raw(attributes, measure))
            resolved = unit or self._lookup(attributes, "weightUnit" if measure == "weight" else "dimensionsUnit")
            if number is not None and not resolved:
                note(measure, "numeric value without a unit (no unit in the value or a unit attribute); left empty")
                number = None
            rec[measure] = number
            if measure == "weight":
                rec["weight_unit"] = resolved.lower() if number is not None else None
            elif number is not None:
                dimension_units.add(resolved.lower())
        rec["dimensions_unit"] = next(iter(dimension_units)) if len(dimension_units) == 1 else None
        if len(dimension_units) > 1:
            note("dimensions", f"mixed dimension units {sorted(dimension_units)}; dimensions omitted")
            rec["length"] = rec["width"] = rec["height"] = None

        # Variant group
        is_group = variant_count > 1
        rec["group_id"] = self._group_id(product, slug) if is_group else None
        if is_group and self.cfg.get("groupId", "productKey") == "productKey" and not product.get("key"):
            note("group_id", "product has no key; the product id is used as group id")
        options = {}
        for canonical, label in (self.cfg.get("variantOptions") or {}).items():
            value = rec.get(ATTRIBUTE_FIELDS.get(canonical, canonical))
            if value and (canonical in varying or not varying):
                options[label] = value
        rec["variant_options"] = options if is_group else {}
        title = name
        if title and is_group and options and self.cfg.get("appendVariantToTitle"):
            suffix = " / ".join(options.values())
            if suffix.lower() not in title.lower():
                title = f"{title} - {suffix}"
        rec["title"] = title

        # Media
        images = [img.get("url") for img in variant.get("images", []) if img.get("url")]
        rec["image_url"] = images[0] if images else None
        rec["additional_image_urls"] = images[1:]

        # URL
        rec["url"] = self._product_url(product, variant, slug)

        # Price
        self._apply_price(rec, variant, note)

        # Availability
        self._apply_availability(rec, variant, note)

        # Categories
        self._apply_categories(rec, product)

        # Seller / policies (store level)
        rec.update(self.seller)
        return rec

    # -- helpers ------------------------------------------------------------

    @staticmethod
    def _raw_index(product: dict, variant: dict) -> dict[str, Any]:
        # Product-level attributes first; variant attributes win on conflicts.
        return {a["name"].lower(): a.get("value")
                for a in [*(product.get("attributes") or []), *(variant.get("attributes") or [])]}

    def _attribute_index(self, product: dict, variant: dict) -> dict[str, Any]:
        index = self._raw_index(product, variant)
        for attribute in variant.get("attributes") or []:
            stats = self.attribute_stats[attribute["name"]]
            stats["count"] += 1
            if stats["sample"] is None:
                stats["sample"] = attribute_to_text(attribute.get("value"), self.locale)
        return index

    def _lookup_raw(self, index: dict[str, Any], canonical: str) -> Any:
        for name in self.cfg.get("attributes", {}).get(canonical) or []:
            value = index.get(name.lower())
            if value not in (None, "", [], {}):
                return value
        return None

    def _lookup(self, index: dict[str, Any], canonical: str) -> str | None:
        return attribute_to_text(self._lookup_raw(index, canonical), self.locale)

    def _map_value(self, field: str, value: str | None) -> str | None:
        if value is None:
            return None
        key = {"age_group": "ageGroup"}.get(field, field)
        mapping = {k.lower(): v for k, v in (self.cfg.get("valueMaps", {}).get(key) or {}).items()}
        lowered = value.strip().lower()
        return mapping.get(lowered, lowered)

    def _item_id(self, product: dict, variant: dict) -> str:
        strategy = self.cfg.get("itemId", "sku")
        fallback = f"{product.get('key') or product['id']}-{variant.get('id')}"
        if strategy == "sku":
            return variant.get("sku") or variant.get("key") or fallback
        if strategy == "variantKey":
            return variant.get("key") or variant.get("sku") or fallback
        if strategy == "productKeyVariantId":
            return fallback
        if strategy == "template":
            return self._fill(self.cfg.get("itemIdTemplate", "{productKey}-{variantId}"), product, variant, None) or fallback
        raise ValueError(f"Unknown itemId strategy '{strategy}'")

    def _group_id(self, product: dict, slug: str | None) -> str:
        strategy = self.cfg.get("groupId", "productKey")
        if strategy == "slug" and slug:
            return slug
        if strategy == "productKey" and product.get("key"):
            return product["key"]
        return product["id"]

    def _fill(self, template: str, product: dict, variant: dict, slug: str | None) -> str | None:
        values = {
            "baseUrl": (self.seller.get("_base_url") or "").rstrip("/"),
            "slug": slug or "",
            "sku": variant.get("sku") or "",
            "variantId": str(variant.get("id")),
            "variantKey": variant.get("key") or "",
            "productKey": product.get("key") or "",
            "productId": product["id"],
            "locale": self.locale.lower(),
        }
        try:
            return template.format(**values)
        except KeyError as error:
            raise ValueError(f"Unknown placeholder {error} in template '{template}'") from None

    def _product_url(self, product: dict, variant: dict, slug: str | None) -> str | None:
        template = self.cfg.get("productUrlTemplate") or "{baseUrl}/products/{slug}"
        if "{baseUrl}" in template and not self.seller.get("_base_url"):
            return None
        if "{slug}" in template and not slug:
            return None
        return self._fill(template, product, variant, slug)

    def _apply_price(self, rec: dict, variant: dict, note) -> None:
        price = variant.get("price")
        if price is None and variant.get("prices"):
            price = self._pick_price(variant["prices"])
            if price is not None:
                note("price", "no price selection on download; picked a price offline")
        rec.update({"price_amount": None, "currency": None, "sale_price_amount": None,
                    "sale_start": None, "sale_end": None})
        if price is None:
            return
        value = price.get("value")
        digits = money_fraction_digits(value)
        rec["currency"] = value.get("currencyCode")
        rec["price_amount"] = format_amount(money_to_decimal(value), digits)
        discounted = price.get("discounted")
        if discounted:
            rec["sale_price_amount"] = format_amount(money_to_decimal(discounted.get("value")), digits)
            discount = (discounted.get("discount") or {}).get("obj") or {}
            rec["sale_start"] = discount.get("validFrom")
            rec["sale_end"] = discount.get("validUntil")

    def _pick_price(self, prices: list[dict]) -> dict | None:
        now = datetime.now(timezone.utc).isoformat()
        candidates = [
            p for p in prices
            if (not self.currency or p["value"].get("currencyCode") == self.currency)
            and (p.get("validFrom") or "") <= now
            and (not p.get("validUntil") or p["validUntil"] > now)
            and not p.get("customerGroup")
        ]
        # Prefer the configured country, then country-less prices; prefer prices without a channel.
        candidates = [p for p in candidates if not p.get("country") or p.get("country") == self.country]
        candidates.sort(key=lambda p: (0 if p.get("country") == self.country else 1, p.get("channel") is not None))
        return candidates[0] if candidates else None

    def _apply_availability(self, rec: dict, variant: dict, note) -> None:
        availability = variant.get("availability")
        if not availability:
            rec["availability"] = None
            rec["inventory_quantity"] = None
            rec["availability_source"] = None
            note("availability", "no inventory data in commercetools; availability left empty")
            return
        channels = availability.get("channels")
        if channels:
            entries = list(channels.values())
            on_stock = any(e.get("isOnStock") for e in entries)
            quantity = sum(e.get("availableQuantity", 0) for e in entries)
            restock = any(e.get("restockableInDays") for e in entries)
        else:
            on_stock = availability.get("isOnStock", False)
            quantity = availability.get("availableQuantity")
            restock = bool(availability.get("restockableInDays"))
        rec["availability"] = "in_stock" if on_stock else ("backorder" if restock and self.cfg.get("restockableAsBackorder") else "out_of_stock")
        rec["inventory_quantity"] = quantity
        rec["availability_source"] = "inventory"

    def _apply_categories(self, rec: dict, product: dict) -> None:
        paths, keys, chain_ids = [], [], []
        for ref in self._ordered_categories(product):
            category = self.categories.get(ref["id"])
            if not category:
                continue
            chain = [self.categories.get(a["id"]) for a in category.get("ancestors", [])] + [category]
            names = [localized(c.get("name"), self.locale) for c in chain if c]
            paths.append(" > ".join(n for n in names if n))
            keys.append(category.get("key") or category["id"])
            chain_ids.append([c for c in chain if c])
        rec["category_path"] = paths[0] if paths else None
        rec["category_paths"] = paths
        rec["category_keys"] = keys

        # Google taxonomy from a category custom field; the most specific category wins.
        field_names = (self.cfg.get("categoryFields") or {}).get("googleProductCategory") or []
        if not rec.get("google_product_category") and field_names:
            for chain in chain_ids:
                for category in reversed(chain):
                    fields = ((category.get("custom") or {}).get("fields")) or {}
                    value = first_present(*(fields.get(name) for name in field_names))
                    if value not in (None, ""):
                        rec["google_product_category"] = attribute_to_text(value, self.locale)
                        break
                if rec.get("google_product_category"):
                    break

    def _store_value(self, paths: list[str]) -> Any:
        """First non-empty Store value. Paths: `name`, `storefront.privacyPolicyUrl`,
        `custom.<field>` (Store custom field); a trailing `@origin` keeps only scheme and host."""
        for path in paths or []:
            origin = path.endswith("@origin")
            node: Any = self.store
            for part in path.removesuffix("@origin").split("."):
                if part == "custom" and isinstance(node, dict):
                    node = (node.get("custom") or {}).get("fields") or {}
                else:
                    node = node.get(part) if isinstance(node, dict) else None
            if isinstance(node, dict):
                node = localized(node, self.locale)
            if origin:
                node = url_origin(node)
            if node not in (None, ""):
                return node
        return None

    def _ordered_categories(self, product: dict) -> list[dict]:
        """Category references in path priority: categories inside the downloaded category filter
        first, then categories outside `categoryPath.excludeRoots` (e.g. merchandising trees such
        as New or Sale), then the rest, each in commercetools order."""
        options = self.cfg.get("categoryPath") or {}
        excluded = {key.lower() for key in options.get("excludeRoots") or []}

        def root_tokens(category_id: str) -> set[str]:
            category = self.categories.get(category_id) or {}
            ancestors = category.get("ancestors") or []
            root = (self.categories.get(ancestors[0]["id"]) if ancestors else category) or {}
            names = (root.get("name") or {}).values()
            return {t.lower() for t in [root.get("key"), root.get("id"), *names] if t}

        def rank(ref: dict) -> int:
            if root_tokens(ref["id"]) & excluded:  # excluded roots always come last, even when filtered on
                return 2
            if options.get("preferFilteredCategories", True) and ref["id"] in self.filtered_categories:
                return 0
            return 1

        return sorted(product.get("categories", []), key=rank)

    def _resolve_seller(self) -> dict:
        paths = self.cfg.get("store") or {}
        base_url = self._store_value(paths.get("baseUrl"))
        return_window = self._store_value(paths.get("returnWindowDays"))
        accepts_returns = self._store_value(paths.get("acceptsReturns"))
        return {
            "_base_url": base_url,
            "seller_name": self._store_value(paths.get("sellerName")),
            "seller_url": base_url,
            "seller_privacy_policy": self._store_value(paths.get("privacyPolicyUrl")),
            "seller_tos": self._store_value(paths.get("termsOfServiceUrl")),
            "return_policy": self._store_value(paths.get("returnPolicyUrl")),
            "return_window_days": None if return_window in (None, "") else int(Decimal(str(return_window))),
            "accepts_returns": None if accepts_returns in (None, "") else str(accepts_returns).lower() in ("true", "yes", "1"),
        }


# ===========================================================================
# Vendor field registry: how commercetools data becomes each vendor field
# ===========================================================================

REQUIRED, CONDITIONAL, RECOMMENDED, OPTIONAL = "required", "conditional", "recommended", "optional"

# A check takes (value, record) and returns (new_value, problem). problem is None when the
# value is fine, ("flagged", msg) when the value is sent but worth a warning (or was
# re-spelled for the vendor), ("invalid", msg) when the value must be dropped.
Check = Callable[[Any, dict], Tuple[Any, Optional[Tuple[str, str]]]]


@dataclass
class Field:
    name: str
    status: str
    value: Callable[[dict], Any]
    rule: str = ""
    checks: tuple[Check, ...] = ()
    required_if: Callable[[dict], bool] | None = None
    blocking: bool = True  # for CONDITIONAL: True = counts as a required field when it applies
    source: str = ""       # normalized record key(s) used, for the report
    kind: str = "str"      # str | bool | int | json | list: how a working-file cell is parsed back


@dataclass
class Vendor:
    key: str
    title: str
    fields: list[Field]
    output_kind: str                      # "full" or "supplemental"
    supplemental_fields: list[str] = field(default_factory=list)
    spec_url: str = ""
    status_overrides: dict = field(default_factory=dict)  # spec statuses a vendor guide tightens


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


def max_len(limit: int, hard: bool = False) -> Check:
    """Soft limits keep the commercetools text unchanged and warn; hard limits flag it invalid."""
    def check(value, _rec):
        if isinstance(value, str) and len(value) > limit:
            if hard:
                return value, ("invalid", f"longer than {limit} chars ({len(value)})")
            return value, ("flagged", f"longer than {limit} chars ({len(value)}); sent unchanged, the vendor may truncate or reject it")
        return value, None
    check.from_spec = True  # replaced by the limit in the live spec
    return check


def one_of(*allowed: str) -> Check:
    def check(value, _rec):
        if value not in allowed:
            return value, ("invalid", f"'{value}' is not one of {', '.join(allowed)}")
        return value, None
    check.from_spec = True  # replaced by the allowed values in the live spec
    return check


def http_url(value, _rec):
    if not is_http_url(value):
        return value, ("invalid", f"not an absolute http(s) URL: '{str(value)[:80]}'")
    return value, None


def url_list(limit: int | None = None) -> Check:
    def check(values, _rec):
        good = [v for v in values if is_http_url(v)]
        problem = None
        if len(good) != len(values):
            problem = ("flagged", f"dropped {len(values) - len(good)} invalid image URL(s)")
        if limit and len(good) > limit:
            good = good[:limit]
            problem = ("flagged", f"kept the first {limit} additional images")
        return (good or None), problem
    return check


def valid_gtin(value, _rec):
    if not gtin_is_valid(value):
        return value, ("invalid", f"GTIN '{value}' is not 8/12/13/14 digits with a valid check digit")
    return value, None


def positive_money(value, _rec):
    amount = Decimal(value.split(" ")[0])
    if amount <= 0:
        return value, ("invalid", f"price must be > 0 (got {value})")
    return value, None


def sale_below_price(value, rec):
    if not has_valid_sale(rec):
        return value, ("invalid", "sale price must be lower than price")
    return value, None


def not_equal_item_id(value, rec):
    if value == rec.get("item_id"):
        return value, ("invalid", "group id must differ from the item id")
    return value, None


def checkout_ready(value, rec):
    if value is True:
        missing = [n for n in ("seller_privacy_policy", "seller_tos") if not rec.get(n)]
        if rec.get("is_eligible_search") is False:
            return value, ("invalid", "checkout requires is_eligible_search=true")
        if missing:
            return value, ("invalid", f"checkout requires {', '.join(missing)}")
    return value, None


def int_range(low: int | None = None, high: int | None = None) -> Check:
    def check(value, _rec):
        try:
            number = int(Decimal(str(value)))
        except Exception:  # noqa: BLE001
            return value, ("invalid", f"'{value}' is not a whole number")
        if (low is not None and number < low) or (high is not None and number > high):
            return value, ("invalid", f"{number} is out of range")
        return number, None
    return check


# ---------------------------------------------------------------------------
# Value helpers
# ---------------------------------------------------------------------------


def money(rec: dict, key: str = "price_amount") -> str | None:
    if rec.get(key) is None or not rec.get("currency"):
        return None
    return f"{rec[key]} {rec['currency']}"


def is_variant(rec: dict) -> bool:
    return bool(rec.get("group_id"))


def measure(rec: dict, key: str, unit_key: str, allowed_units: dict[str, tuple[str, Decimal]]) -> str | None:
    """Format '<number> <unit>' converting to a vendor-supported unit."""
    number, unit = rec.get(key), (rec.get(unit_key) or "").lower()
    if number is None or unit not in allowed_units:
        return None
    target, factor = allowed_units[unit]
    return f"{format_number(number * factor)} {target}"


DIMENSION_UNITS_GOOGLE = {"cm": ("cm", Decimal(1)), "mm": ("cm", Decimal("0.1")), "m": ("cm", Decimal(100)),
                          "in": ("in", Decimal(1)), "ft": ("in", Decimal(12))}
WEIGHT_UNITS = {"g": ("g", Decimal(1)), "kg": ("kg", Decimal(1)), "lb": ("lb", Decimal(1)), "oz": ("oz", Decimal(1))}


def openai_dimensions(rec: dict) -> dict | None:
    unit = (rec.get("dimensions_unit") or "").lower()
    axes = {k: rec.get(k) for k in ("length", "width", "height") if rec.get(k)}
    if len(axes) < 2 or unit not in ("in", "cm", "ft", "m", "mm"):
        return None
    return {**{k: format_number(v) for k, v in axes.items()}, "unit": unit}


def identifier_exists(rec: dict, yes: str, no: str) -> str | None:
    """Only from a commercetools attribute: absence of a GTIN in the data is not proof that none exists."""
    value = rec.get("identifier_exists")
    return None if value is None else (yes if value else no)


def has_valid_sale(rec: dict) -> bool:
    return (rec.get("sale_price_amount") is not None and rec.get("price_amount") is not None
            and Decimal(rec["sale_price_amount"]) < Decimal(rec["price_amount"]))


def sale_dates(rec: dict) -> str | None:
    if has_valid_sale(rec) and rec.get("sale_start") and rec.get("sale_end"):
        return f"{rec['sale_start']}/{rec['sale_end']}"
    return None


# ---------------------------------------------------------------------------
# OpenAI
# ---------------------------------------------------------------------------

OPENAI = Vendor(
    key="openai",
    # Ads fields belong to the separate OpenAI Ads export (vendor openai-ads), not the merchant feed.
    status_overrides={"is_ads_eligible": OPTIONAL},
    title="OpenAI Commerce feed (ChatGPT shopping)",
    output_kind="full",
    spec_url="https://developers.openai.com/commerce/specs/file-upload/products",
    fields=[
        Field("item_id", REQUIRED, lambda r: r["item_id"], "unique per variant, stable", source="item_id"),
        Field("title", REQUIRED, lambda r: r["title"], "≤150 chars", (max_len(150),), source="title"),
        Field("description", REQUIRED, lambda r: r["description"], "plain text, ≤5000 chars", (max_len(5000),), source="description"),
        Field("url", REQUIRED, lambda r: r["url"], "absolute public http(s) URL", (http_url,), source="url"),
        Field("brand", REQUIRED, lambda r: r["brand"], "real brand name", source="brand"),
        Field("seller_name", REQUIRED, lambda r: r["seller_name"], "on every row", source="store:sellerName"),
        Field("image_url", REQUIRED, lambda r: r["image_url"], "absolute public http(s) URL", (http_url,), source="image_url"),
        Field("availability", REQUIRED, lambda r: r["availability"], "in_stock|out_of_stock|pre_order|backorder|unknown",
              (one_of("in_stock", "out_of_stock", "pre_order", "backorder", "unknown"),), source="availability"),
        Field("price", REQUIRED, lambda r: money(r), "'79.99 USD'", (positive_money,), source="price"),
        Field("is_eligible_search", OPTIONAL, lambda r: r["is_eligible_search"], "true|false (default true)", source="is_eligible_search", kind="bool"),
        Field("is_eligible_checkout", OPTIONAL, lambda r: r["is_eligible_checkout"],
              "true only with search + privacy policy + ToS", (checkout_ready,), source="is_eligible_checkout", kind="bool"),
        Field("group_id", CONDITIONAL, lambda r: r["group_id"], "required for variants; ≠ item_id", (not_equal_item_id,),
              required_if=is_variant, source="group_id"),
        Field("listing_has_variations", CONDITIONAL, lambda r: True if r["group_id"] else None, "true on every variant row",
              required_if=is_variant, source="group_id", kind="bool"),
        Field("variant_dict", CONDITIONAL, lambda r: r["variant_options"] or None, "option name -> value for variants",
              required_if=is_variant, blocking=False, source="variant_options", kind="json"),
        Field("gtin", OPTIONAL, lambda r: r["gtin"], "8/12/13/14 digits, valid check digit", (valid_gtin,), source="gtin"),
        Field("mpn", OPTIONAL, lambda r: r["mpn"], "submit with brand", source="mpn"),
        Field("condition", OPTIONAL, lambda r: r["condition"], "new|refurbished|used", (one_of("new", "refurbished", "used"),), source="condition"),
        Field("product_category", OPTIONAL, lambda r: r["category_path"], "broad > specific", source="category_path"),
        Field("material", OPTIONAL, lambda r: r["material"], source="material"),
        Field("color", OPTIONAL, lambda r: r["color"], source="color"),
        Field("size", OPTIONAL, lambda r: r["size"], source="size"),
        Field("size_system", OPTIONAL, lambda r: (r["size_system"] or "").upper() or None, "US|UK|EU|DE|FR|JP|CN|IT|BR|MEX|AU",
              (one_of("US", "UK", "EU", "DE", "FR", "JP", "CN", "IT", "BR", "MEX", "AU"),), source="size_system"),
        Field("gender", OPTIONAL, lambda r: r["gender"], "male|female|unisex", (one_of("male", "female", "unisex"),), source="gender"),
        Field("age_group", OPTIONAL, lambda r: r["age_group"], "newborn|infant|toddler|kids|adult",
              (one_of("newborn", "infant", "toddler", "kids", "adult"),), source="age_group"),
        Field("dimensions", OPTIONAL, openai_dimensions, "{length,width,height,unit}, ≥2 axes", source="length", kind="json"),
        *[Field(axis, OPTIONAL, (lambda axis: lambda r: format_number(r[axis]) if r[axis] and r["dimensions_unit"] else None)(axis),
                "positive decimal, with dimensions_unit", source=axis) for axis in ("length", "width", "height")],
        Field("dimensions_unit", CONDITIONAL, lambda r: r["dimensions_unit"] if any(r[a] for a in ("length", "width", "height")) else None,
              "in|cm|ft|m|mm, with length/width/height", required_if=lambda r: any(r.get(a) for a in ("length", "width", "height")),
              blocking=False, source="length"),
        Field("weight", OPTIONAL, lambda r: format_number(r["weight"]) if r["weight"] and r["weight_unit"] in WEIGHT_UNITS else None,
              "positive decimal", source="weight"),
        Field("item_weight_unit", CONDITIONAL, lambda r: r["weight_unit"] if r["weight"] and r["weight_unit"] in WEIGHT_UNITS else None,
              "g|kg|oz|lb, with weight", required_if=lambda r: bool(r["weight"]), blocking=False, source="weight"),
        Field("additional_image_urls", OPTIONAL, lambda r: r["additional_image_urls"] or None, "array of URLs", (url_list(),),
              source="additional_image_urls", kind="list"),
        Field("sale_price", OPTIONAL, lambda r: money(r, "sale_price_amount"), "< price, same currency", (sale_below_price,), source="sale_price"),
        Field("seller_url", OPTIONAL, lambda r: r["seller_url"], "http(s) URL", (http_url,), source="store:baseUrl"),
        Field("accepts_returns", OPTIONAL, lambda r: r["accepts_returns"], "true|false", source="store:acceptsReturns", kind="bool"),
        Field("return_deadline_in_days", OPTIONAL, lambda r: r["return_window_days"] if r["accepts_returns"] else None,
              "positive int, only with accepts_returns=true", (int_range(1),), source="store:returnWindowDays", kind="int"),
        Field("return_policy", OPTIONAL, lambda r: r["return_policy"], "http(s) URL", (http_url,), source="store:returnPolicyUrl"),
        Field("seller_privacy_policy", CONDITIONAL, lambda r: r["seller_privacy_policy"], "required for checkout", (http_url,),
              required_if=lambda r: r["is_eligible_checkout"] is True, source="store:privacyPolicyUrl"),
        Field("seller_tos", CONDITIONAL, lambda r: r["seller_tos"], "required for checkout", (http_url,),
              required_if=lambda r: r["is_eligible_checkout"] is True, source="store:termsOfServiceUrl"),
        Field("review_count", OPTIONAL, lambda r: r["review_count"], "int ≥ 0", (int_range(0),), source="review_count", kind="int"),
        Field("star_rating", OPTIONAL,
              lambda r: f"{Decimal(r['star_rating']):.2f}" if r["star_rating"] and r["review_count"] not in (None, "0") else None,
              "0–5, two decimals, with review_count > 0", source="star_rating"),
    ],
)


# ---------------------------------------------------------------------------
# Google Merchant Center
# ---------------------------------------------------------------------------

GOOGLE_AVAILABILITY = {"in_stock": "in_stock", "out_of_stock": "out_of_stock", "pre_order": "preorder", "backorder": "backorder"}

GOOGLE = Vendor(
    key="google",
    title="Google Merchant Center",
    output_kind="supplemental",
    spec_url="https://support.google.com/merchants/answer/7052112",
    fields=[
        Field("id", REQUIRED, lambda r: r["item_id"], "≤50 chars; must equal the primary feed id", (max_len(50, hard=True),), source="item_id"),
        Field("title", REQUIRED, lambda r: r["title"], "≤150 chars", (max_len(150),), source="title"),
        Field("description", REQUIRED, lambda r: r["description"], "≤5000 chars", (max_len(5000),), source="description"),
        Field("link", REQUIRED, lambda r: r["url"], "http(s) landing page", (http_url,), source="url"),
        Field("image_link", REQUIRED, lambda r: r["image_url"], "http(s) image URL", (http_url,), source="image_url"),
        Field("additional_image_link", OPTIONAL, lambda r: r["additional_image_urls"] or None, "up to 10 URLs", (url_list(10),),
              source="additional_image_urls", kind="list"),
        Field("availability", REQUIRED, lambda r: GOOGLE_AVAILABILITY.get(r["availability"], r["availability"]),
              "in_stock|out_of_stock|preorder|backorder", (one_of("in_stock", "out_of_stock", "preorder", "backorder"),), source="availability"),
        Field("price", REQUIRED, lambda r: money(r), "'15.00 USD'", (positive_money,), source="price"),
        Field("sale_price", OPTIONAL, lambda r: money(r, "sale_price_amount"), "< price", (sale_below_price,), source="sale_price"),
        Field("sale_price_effective_date", OPTIONAL, sale_dates, "ISO 8601 start/end", source="sale_dates"),
        Field("brand", REQUIRED, lambda r: r["brand"], "≤70 chars; required for new products", (max_len(70, hard=True),), source="brand"),
        Field("gtin", RECOMMENDED, lambda r: r["gtin"], "strongly recommended; valid GTIN", (valid_gtin,), source="gtin"),
        Field("mpn", CONDITIONAL, lambda r: r["mpn"], "required when there is no GTIN", (max_len(70, hard=True),),
              required_if=lambda r: not r["gtin"], blocking=False, source="mpn"),
        Field("identifier_exists", OPTIONAL, lambda r: identifier_exists(r, "yes", "no"), "yes|no", source="identifier_exists"),
        Field("condition", OPTIONAL, lambda r: r["condition"], "required if used/refurbished", (one_of("new", "refurbished", "used"),),
              source="condition"),
        Field("google_product_category", OPTIONAL, lambda r: r["google_product_category"], "Google taxonomy id or path",
              source="google_product_category"),
        Field("product_type", OPTIONAL, lambda r: r["category_path"], "your category path, ≤750 chars", (max_len(750),), source="category_path"),
        Field("item_group_id", CONDITIONAL, lambda r: r["group_id"], "required for variants (US/UK/DE/FR/JP/BR), ≤50 chars",
              (max_len(50, hard=True),), required_if=is_variant, source="group_id"),
        Field("color", OPTIONAL, lambda r: r["color"], "≤100 chars; required for apparel", (max_len(100, hard=True),), source="color"),
        Field("size", OPTIONAL, lambda r: r["size"], "≤100 chars; required for apparel", (max_len(100, hard=True),), source="size"),
        Field("size_system", OPTIONAL, lambda r: (r["size_system"] or "").upper() or None, "US|UK|EU|DE|FR|JP|CN|IT|BR|MEX|AU",
              (one_of("US", "UK", "EU", "DE", "FR", "JP", "CN", "IT", "BR", "MEX", "AU"),), source="size_system"),
        Field("gender", OPTIONAL, lambda r: r["gender"], "male|female|unisex; required for apparel", (one_of("male", "female", "unisex"),), source="gender"),
        Field("age_group", OPTIONAL, lambda r: r["age_group"], "newborn|infant|toddler|kids|adult; required for apparel",
              (one_of("newborn", "infant", "toddler", "kids", "adult"),), source="age_group"),
        Field("material", OPTIONAL, lambda r: r["material"], "≤200 chars", (max_len(200, hard=True),), source="material"),
        Field("pattern", OPTIONAL, lambda r: r["pattern"], "≤100 chars", (max_len(100, hard=True),), source="pattern"),
        Field("product_length", OPTIONAL, lambda r: measure(r, "length", "dimensions_unit", DIMENSION_UNITS_GOOGLE), "number + cm|in", source="length"),
        Field("product_width", OPTIONAL, lambda r: measure(r, "width", "dimensions_unit", DIMENSION_UNITS_GOOGLE), "number + cm|in", source="width"),
        Field("product_height", OPTIONAL, lambda r: measure(r, "height", "dimensions_unit", DIMENSION_UNITS_GOOGLE), "number + cm|in", source="height"),
        Field("product_weight", OPTIONAL, lambda r: measure(r, "weight", "weight_unit", WEIGHT_UNITS), "number + lb|oz|g|kg", source="weight"),
        *[Field(f"custom_label_{i}", OPTIONAL, (lambda i: lambda r: r[f"custom_label_{i}"])(i), "≤100 chars",
                (max_len(100, hard=True),), source=f"custom_label_{i}") for i in range(5)],
        Field("promotion_id", OPTIONAL, lambda r: r["promotion_id"], "≤50 chars", (max_len(50, hard=True),), source="promotion_id"),
    ],
)


# ---------------------------------------------------------------------------
# Microsoft Merchant Center
# ---------------------------------------------------------------------------

MICROSOFT_AVAILABILITY = {"in_stock": "in stock", "out_of_stock": "out of stock", "pre_order": "preorder", "backorder": "out of stock"}


def microsoft_availability(rec: dict) -> str | None:
    return MICROSOFT_AVAILABILITY.get(rec["availability"])


def backorder_note(value, rec):
    if rec.get("availability") == "backorder":
        return value, ("flagged", "Microsoft has no 'backorder'; sent as 'out of stock'")
    return value, None


MICROSOFT = Vendor(
    key="microsoft",
    title="Microsoft Merchant Center",
    output_kind="supplemental",
    spec_url="https://help.ads.microsoft.com/#apex/ads/en/51084/1-500",
    # Only these fields can be overridden by a Microsoft supplemental feed (51105).
    supplemental_fields=["title", "description", "size", "color", *[f"custom_label_{i}" for i in range(5)], "promotion_ID", "id"],
    fields=[
        Field("title", REQUIRED, lambda r: r["title"], "≤150 chars", (max_len(150),), source="title"),
        Field("description", REQUIRED, lambda r: r["description"], "≤10000 chars, no HTML", (max_len(10000),), source="description"),
        Field("link", REQUIRED, lambda r: r["url"], "http(s), same domain as store, ≤2000", (http_url, max_len(2000, hard=True)), source="url"),
        Field("image_link", REQUIRED, lambda r: r["image_url"], "http(s), ≤2000", (http_url, max_len(2000, hard=True)), source="image_url"),
        Field("price", REQUIRED, lambda r: money(r), "'23.99 USD', 0–10,000,000", source="price"),
        Field("brand", RECOMMENDED, lambda r: r["brand"], "required if assigned by manufacturer; ≤70 chars", (max_len(1000, hard=True),), source="brand"),
        Field("gtin", RECOMMENDED, lambda r: r["gtin"], "required if assigned by manufacturer", (valid_gtin,), source="gtin"),
        Field("mpn", RECOMMENDED, lambda r: r["mpn"], "required if assigned by manufacturer; ≤70", (max_len(70, hard=True),), source="mpn"),
        Field("identifier_exists", OPTIONAL, lambda r: identifier_exists(r, "TRUE", "FALSE"), "TRUE|FALSE", source="identifier_exists"),
        Field("availability", RECOMMENDED, microsoft_availability, "in stock|out of stock|preorder; Microsoft assumes in stock when empty",
              (backorder_note, one_of("in stock", "out of stock", "preorder")), source="availability"),
        Field("condition", OPTIONAL, lambda r: r["condition"], "new|used|refurbished", (one_of("new", "used", "refurbished"),), source="condition"),
        Field("age_group", OPTIONAL, lambda r: r["age_group"], "required for apparel (US/UK/DE/FR)",
              (one_of("newborn", "infant", "toddler", "kids", "adult"),), source="age_group"),
        Field("color", OPTIONAL, lambda r: r["color"], "≤100 chars; required for apparel", (max_len(100, hard=True),), source="color"),
        Field("gender", OPTIONAL, lambda r: r["gender"], "male|female|unisex; required for apparel", (one_of("male", "female", "unisex"),), source="gender"),
        Field("size", OPTIONAL, lambda r: r["size"], "≤100 chars; required for apparel", (max_len(100, hard=True),), source="size"),
        Field("size_system", OPTIONAL, lambda r: (r["size_system"] or "").upper() or None, "DE|FR|AU|US|UK",
              (one_of("DE", "FR", "AU", "US", "UK"),), source="size_system"),
        Field("additional_image_link", OPTIONAL, lambda r: r["additional_image_urls"] or None, "up to 10, comma-separated", (url_list(10),),
              source="additional_image_urls", kind="list"),
        Field("item_group_id", CONDITIONAL, lambda r: r["group_id"], "groups variants, ≤50 chars", (max_len(50, hard=True),),
              required_if=is_variant, blocking=False, source="group_id"),
        Field("material", OPTIONAL, lambda r: r["material"], "≤200 chars", (max_len(200, hard=True),), source="material"),
        Field("pattern", OPTIONAL, lambda r: r["pattern"], "≤100 chars", (max_len(100, hard=True),), source="pattern"),
        Field("product_category", OPTIONAL, lambda r: r["google_product_category"], "taxonomy path or id, ≤255", (max_len(255, hard=True),),
              source="google_product_category"),
        Field("product_type", OPTIONAL, lambda r: r["category_path"], "your category path, ≤750", (max_len(750),), source="category_path"),
        Field("sale_price", OPTIONAL, lambda r: r["sale_price_amount"], "number, no currency", (sale_below_price,), source="sale_price"),
        Field("sale_price_effective_date", OPTIONAL, sale_dates, "ISO 8601 start/end", source="sale_dates"),
        *[Field(f"custom_label_{i}", OPTIONAL, (lambda i: lambda r: r[f"custom_label_{i}"])(i), "≤100 chars",
                (max_len(100, hard=True),), source=f"custom_label_{i}") for i in range(5)],
        Field("promotion_ID", OPTIONAL, lambda r: r["promotion_id"], "≤60 chars", (max_len(60, hard=True),), source="promotion_id"),
        # id is last on purpose: Microsoft rejects lines with trailing tabs, and id is never empty.
        Field("id", REQUIRED, lambda r: r["item_id"], "≤50 chars, unique per market", (max_len(50, hard=True),), source="item_id"),
    ],
)

OPENAI_ADS = replace(
    OPENAI,
    key="openai-ads",
    title="OpenAI Ads feed",
    spec_url="https://developers.openai.com/ads/product-feeds",
    # The Ads guide adds to the product spec: is_ads_eligible must be true for products Ads should
    # process; target/store country describe the market; ads_metadata keys come from the Ads setup.
    status_overrides={"is_ads_eligible": REQUIRED},
    fields=[*OPENAI.fields,
            Field("is_ads_eligible", REQUIRED, lambda r: r.get("is_ads_eligible"), "true for products Ads should process",
                  source="is_ads_eligible", kind="bool"),
            Field("ads_metadata", OPTIONAL, lambda r: r.get("ads_metadata"), "keys configured for your Ads integration",
                  source="ads_metadata", kind="json"),
            Field("target_countries", OPTIONAL, lambda r: [r["market_country"]] if r.get("market_country") else None,
                  "ISO country codes", source="market_country", kind="list"),
            Field("store_country", OPTIONAL, lambda r: r.get("market_country"), "seller store country",
                  source="market_country")],
)

VENDORS = {v.key: v for v in (OPENAI, OPENAI_ADS, GOOGLE, MICROSOFT)}
OPENAI_FORMAT_VENDORS = ("openai", "openai-ads")


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def is_required(spec: Field, rec: dict) -> bool:
    """Required for this row: always-required fields, plus conditional ones whose condition holds."""
    if spec.status == REQUIRED:
        return True
    return spec.status == CONDITIONAL and spec.blocking and spec.required_if is not None and bool(spec.required_if(rec))


def check_value(spec: Field, value: Any, rec: dict) -> list[tuple[str, str]]:
    """Run a field's checks without changing the value. Returns [(kind, message)]."""
    problems = []
    for check in spec.checks:
        try:
            _, problem = check(value, rec)
        except Exception as error:  # noqa: BLE001 - values typed by hand can be anything
            problem = ("invalid", f"could not be read ({error.__class__.__name__})")
        if problem:
            problems.append(problem)
            if problem[0] == "invalid":
                break
    return problems


def check_row(vendor: Vendor, row: dict, rec: dict, stats: dict | None = None) -> tuple[list[str], list[dict]]:
    """Validate one vendor row. Returns (missing_or_invalid_required_fields, issues)."""
    missing_required: list[str] = []
    issues: list[dict] = []
    for spec in vendor.fields:
        value = row.get(spec.name)
        required = is_required(spec, rec)
        field_stats = stats[spec.name] if stats is not None else {}
        if is_empty(value):
            field_stats["missing"] = field_stats.get("missing", 0) + 1
            if required:
                field_stats["missing_required"] = field_stats.get("missing_required", 0) + 1
                missing_required.append(spec.name)
                issues.append(_issue(vendor, rec, spec, "required", f"required value missing ({spec.rule or spec.status})"))
            elif spec.status == RECOMMENDED or (spec.status == CONDITIONAL and spec.required_if and spec.required_if(rec)):
                issues.append(_issue(vendor, rec, spec, "warning", f"recommended value missing ({spec.rule})"))
            elif spec.status == CONDITIONAL and spec.required_if is None:
                # The spec's condition cannot be evaluated from data ("for apparel", "for new products").
                field_stats["missing_conditional"] = field_stats.get("missing_conditional", 0) + 1
                issues.append(_issue(vendor, rec, spec, "conditional", f"empty; required {spec.rule[:120]}"))
            continue
        field_stats["filled"] = field_stats.get("filled", 0) + 1
        for kind, message in check_value(spec, value, rec):
            if kind == "invalid":
                field_stats["invalid"] = field_stats.get("invalid", 0) + 1
                if required:
                    missing_required.append(spec.name)
                issues.append(_issue(vendor, rec, spec, "required" if required else "warning", f"invalid value: {message}"))
            else:
                field_stats["flagged"] = field_stats.get("flagged", 0) + 1
                issues.append(_issue(vendor, rec, spec, "warning", message))
    return missing_required, issues


def new_stats(vendor: Vendor) -> dict[str, dict]:
    return {f.name: {"filled": 0, "flagged": 0, "invalid": 0, "missing": 0, "missing_required": 0, "missing_conditional": 0}
            for f in vendor.fields}


def evaluate(vendor: Vendor, records: list[dict]) -> tuple[list[dict], dict[str, dict], list[dict]]:
    """Format every record for the vendor and check it. Every record becomes a row; values are
    never dropped. Returns (rows with `_missing_required`, field stats, issues)."""
    stats = new_stats(vendor)
    rows, issues = [], []
    for rec in records:
        row = {spec.name: spec.value(rec) for spec in vendor.fields}
        row = {k: v for k, v in row.items() if not is_empty(v)}
        missing_required, row_issues = check_row(vendor, row, rec, stats)
        row["_missing_required"] = missing_required
        row["_issues"] = [f"{i['field']}: {i['message']}" for i in row_issues if i["severity"] != "required"]
        rows.append(row)
        issues.extend(row_issues)
    return rows, stats, issues


def _issue(vendor: Vendor, rec: dict, spec: Field, severity: str, message: str) -> dict:
    return {"vendor": vendor.key, "item_id": rec.get("item_id"), "sku": rec.get("sku"), "field": spec.name,
            "status": spec.status, "severity": severity, "message": message}


# ===========================================================================
# Vendor specs at runtime: fetch, parse, cache, merge with the field registry
# ===========================================================================
#
# The field registry above says how commercetools data becomes each vendor field. Which
# fields exist, which are required, their allowed values and length limits come from the
# vendor's published spec, fetched at runtime. New spec fields become empty working-file
# columns; fields gone from the spec are dropped. Without network access the registry's
# own list (captured 2026-10-23) is used and reported as such.

SPEC_SOURCES = {
    "openai-ads": {"page": "https://developers.openai.com/commerce/specs/file-upload/products",
                   "fetch": "https://developers.openai.com/commerce/specs/file-upload/products.md"},
    "openai": {"page": "https://developers.openai.com/commerce/specs/file-upload/products",
               "fetch": "https://developers.openai.com/commerce/specs/file-upload/products.md"},
    "google": {"page": "https://support.google.com/merchants/answer/7052112",
               "fetch": "https://support.google.com/merchants/answer/7052112?hl=en"},
    "microsoft": {"page": "https://help.ads.microsoft.com/#apex/ads/en/51084/1-500",
                  "fetch": "https://help.ads.microsoft.com/api/apexv2api?id=ads&language=en&query=51084&nav=1",
                  "supplemental": "https://help.ads.microsoft.com/api/apexv2api?id=ads&language=en&query=51105&nav=1"},
}
ID_FIELDS = {"id", "item_id"}


def http_get(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (commercetools-aihub feed skill)"})
    with urllib.request.urlopen(request, timeout=30, context=tls_context()) as response:
        return response.read().decode("utf-8", errors="replace")


def html_text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def classify_requirement(text: str) -> tuple[str, str]:
    """Map a requirement phrase to (status, condition)."""
    text = text.strip()
    lowered = text.lower()
    if lowered.startswith("conditionally required"):
        return CONDITIONAL, text[len("conditionally required"):].strip(" ;:-")
    if lowered.startswith("required"):
        rest = text[len("required"):].strip(" :-")
        if rest.startswith("("):
            return CONDITIONAL, rest[1:rest.find(")")] if ")" in rest else rest[1:]
        if re.match(r"(if|for|when|only|with)\b", rest, re.I):
            return CONDITIONAL, rest.split(".")[0][:200]
        return REQUIRED, ""
    if lowered.startswith(("it depends", "strongly recommended", "recommended")):
        return CONDITIONAL if lowered.startswith("it depends") else RECOMMENDED, text[:200]
    if lowered.startswith("optional"):
        return OPTIONAL, text[len("optional"):].strip(" ;:-")
    return OPTIONAL, text[:200]


def _max_length(text: str) -> int | None:
    match = re.search(r"(?:Max|max|at most|up to)\s+(\d[\d,]*)\s+(?:alphanumeric |numeric |unicode |Unicode )?characters"
                      r"|(\d[\d,]*)[ -](?:Unicode |unicode )?character limit|[Cc]haracter limit:?\s*(\d[\d,]*)", text)
    if not match:
        return None
    return int(next(g for g in match.groups() if g).replace(",", ""))


def parse_openai_spec(markdown: str) -> dict:
    fields, section = [], ""
    for line in markdown.splitlines():
        if line.startswith("#"):
            section = line.lstrip("#").strip()
            continue
        if not line.startswith("| `"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        name, dtype, requirement, description = cells[0].strip("`"), cells[1], cells[2], cells[3]
        status, condition = classify_requirement(requirement.replace("`", ""))
        allowed = []
        if dtype.lower().startswith("string") and "(" not in dtype:
            runs = re.findall(r"((?:`[^`\s]+`(?:,\s*(?:or\s+)?|\s+or\s+))+`[^`\s]+`)", description)
            if runs:
                allowed = re.findall(r"`([^`]+)`", max(runs, key=len))
        fields.append({"name": name, "status": status, "condition": condition, "type": dtype, "section": section,
                       "allowed": allowed, "maxLength": _max_length(description)})
    return {"fields": fields}


def parse_google_spec(page: str) -> dict:
    fields = []
    for table in re.findall(r"<table.*?</table>", page, re.S):
        for row in re.findall(r"<tr.*?</tr>", table, re.S)[1:]:
            cells = re.findall(r"<t[dh].*?</t[dh]>", row, re.S)
            if not cells:
                continue
            first = html_text(cells[0])
            keyword = re.search(r"\b(Required|Optional|It [Dd]epends|Strongly recommended)\b", first)
            head = first[:keyword.start()] if keyword else first
            names = [n.strip().replace(" ", "_") for n in re.findall(r"\[([a-z0-9_ ]+(?:-\d)?)\]", head)]
            if not names:
                continue  # no attribute before the requirement phrase: a sub-attribute or prose row
            status, condition = classify_requirement(first[keyword.start():]) if keyword else (OPTIONAL, "")
            supported = re.search(r"Supported values(.*?)(?:Syntax|Schema\.org|Example|Format|$)", first)
            allowed = re.findall(r"\[([^\]]+)\]", supported.group(1)) if supported else []
            expanded = []
            # The first bracket is the attribute; later ones are alternatives ("[title] or
            # [structured_title]") or sub-attributes, which are not separate feed columns.
            for name in names[:1]:
                if re.match(r"custom_label_\d-\d", name):
                    expanded += [f"custom_label_{i}" for i in range(5)]
                else:
                    expanded.append(name)
            for name in expanded:
                fields.append({"name": name, "status": status, "condition": condition, "allowed": allowed,
                               "maxLength": _max_length(first)})
    unique = {}
    for f in fields:
        unique.setdefault(f["name"], f)
    return {"fields": list(unique.values())}


def parse_microsoft_spec(payload: str, supplemental_payload: str | None) -> dict:
    content = json.loads(payload)["Content"]["Content"]
    fields = []
    starts = [m.start() for m in re.finditer(r"<table", content)]
    previous = 0
    for start in starts:
        section = html_text(content[max(previous, start - 600):start])[-120:]
        previous = start
        if "Required fields" in section:
            section_status, section_condition = REQUIRED, ""
        elif "Required (if" in section:
            section_status, section_condition = CONDITIONAL, re.search(r"Required \((if[^)]*)\)", section).group(1)
        else:
            section_status, section_condition = OPTIONAL, ""
        table = content[start:content.find("</table>", start)]
        for row in re.findall(r"<tr.*?</tr>", table, re.S)[1:]:
            cells = [html_text(c) for c in re.findall(r"<t[dh].*?</t[dh]>", row, re.S)]
            if len(cells) < 2:
                continue
            label = cells[0].split("(")[0]
            if re.search(r"\b[A-Z][a-z]", label) and "_" not in label:
                continue  # prose label such as "Exception policy", not a field name
            names = re.findall(r"\b([a-z][a-z0-9]*(?:_[a-zA-Z0-9]+)*)\b", label)
            text = " ".join(cells[1:])
            status, condition = section_status, section_condition
            required_for = re.search(r"\b(?:is a |is |only )?[Rr]equired (?:field )?(for [^.]+|when [^.]+|if [^.]+)\.", text)
            if required_for and status != REQUIRED or (status == REQUIRED and required_for and "only" in required_for.group(0)):
                status, condition = CONDITIONAL, required_for.group(1)[:200]
            values = re.search(r"(?:Valid options|Supported values|Valid values)\s*:\s*(.+?)(?:\.|Default|No other|$)", text)
            allowed = []
            if values:
                allowed = [v.strip(" .") for v in re.split(r",|;|\band\b|\bor\b", values.group(1)) if v.strip(" .")]
            elif re.search(r"Boolean\s*:\s*TRUE or FALSE", text):
                allowed = ["TRUE", "FALSE"]
            for name in names:
                fields.append({"name": name, "status": status, "condition": condition, "allowed": allowed,
                               "maxLength": _max_length(cells[1])})
    supplemental = []
    if supplemental_payload:
        page = json.loads(supplemental_payload)["Content"]["Content"]
        at = page.find("Fields currently supported by supplemental feeds")
        listing = re.search(r"<ul.*?</ul>", page[at:], re.S) if at >= 0 else None
        known = {f["name"].lower(): f["name"] for f in fields}
        for item in re.findall(r"<li.*?</li>", listing.group(0), re.S) if listing else []:
            label = html_text(item).split("(")[0].strip().lower()
            if label.startswith("custom label"):
                supplemental += [f"custom_label_{i}" for i in range(5)]
            elif label in ("product id", "id"):
                supplemental.append("id")
            else:
                supplemental.append(known.get(label.replace(" ", "_"), label.replace(" ", "_")))
    unique = {}
    for f in fields:
        unique.setdefault(f["name"], f)
    return {"fields": list(unique.values()), "supplementalFields": supplemental}


def fetch_spec(vendor_key: str) -> dict:
    source = SPEC_SOURCES[vendor_key]
    if vendor_key in ("openai", "openai-ads"):
        spec = parse_openai_spec(http_get(source["fetch"]))
    elif vendor_key == "google":
        spec = parse_google_spec(http_get(source["fetch"]))
    else:
        spec = parse_microsoft_spec(http_get(source["fetch"]), http_get(source["supplemental"]))
    if len(spec["fields"]) < 10 or not any(f["status"] == REQUIRED for f in spec["fields"]):
        raise ValueError(f"the {vendor_key} spec page did not parse as expected ({len(spec['fields'])} fields); its layout may have changed")
    spec.update(vendor=vendor_key, source=source["page"], fetchedFrom=source["fetch"],
                fetchedAt=datetime.now(timezone.utc).isoformat(timespec="seconds"), origin="live")
    return spec


def load_spec(vendor_key: str, cache_dir: str | None, mode: str = "auto") -> tuple[dict | None, str]:
    """Return (spec, note). mode: auto (cache, else live), live (always fetch), bundled (registry only)."""
    cache = os.path.join(cache_dir, f"{vendor_key}.json") if cache_dir else None
    if mode == "bundled":
        return None, "the skill's built-in field list (captured 2026-10-23), as requested"
    if mode == "auto" and cache and os.path.exists(cache):
        spec = read_json(cache)
        return spec, f"spec fetched {spec.get('fetchedAt')} from {spec.get('source')} (cached in {cache})"
    try:
        spec = fetch_spec(vendor_key)
    except Exception as error:  # noqa: BLE001 - offline, blocked or changed page: fall back, loudly
        reason = f"could not read the live {vendor_key} spec ({error.__class__.__name__}: {str(error)[:160]})"
        if cache and os.path.exists(cache):
            spec = read_json(cache)
            return spec, f"{reason}; using the cached spec fetched {spec.get('fetchedAt')}"
        return None, f"{reason}; using the skill's built-in field list captured 2026-10-23"
    if cache:
        if os.path.exists(cache):
            previous = read_json(cache)
            spec["previous"] = {"fetchedAt": previous.get("fetchedAt"), "changes": diff_specs(previous, spec)}
            write_json(cache.replace(".json", ".previous.json"), previous)
        write_json(cache, spec)
    return spec, f"spec fetched {spec['fetchedAt']} from {spec['source']}"


def diff_specs(old: dict, new: dict) -> dict:
    """What changed between two fetched specs of the same vendor."""
    before = {f["name"]: f for f in old.get("fields", [])}
    after = {f["name"]: f for f in new.get("fields", [])}
    changed = []
    for name in sorted(set(before) & set(after)):
        a, b = before[name], after[name]
        for key, label in (("status", "requirement"), ("allowed", "allowed values"), ("maxLength", "max length")):
            if (a.get(key) or None) != (b.get(key) or None):
                changed.append(f"{name}: {label} {a.get(key) or '–'} → {b.get(key) or '–'}")
    return {"added": sorted(set(after) - set(before)), "removed": sorted(set(before) - set(after)), "changed": changed,
            "supplementalFields": (old.get("supplementalFields"), new.get("supplementalFields"))
            if old.get("supplementalFields") != new.get("supplementalFields") else None}


def apply_spec(vendor: Vendor, spec: dict | None) -> tuple[Vendor, dict]:
    """Merge a live spec into the field registry. Returns (vendor, changes)."""
    changes = {"added": [], "removed": [], "statusChanged": []}
    if not spec:
        return vendor, changes
    code = {f.name: f for f in vendor.fields}
    merged = []
    for entry in spec["fields"]:
        name = entry["name"]
        base = code.get(name)
        checks = tuple(c for c in (base.checks if base else ()) if not getattr(c, "from_spec", False))
        if entry.get("allowed"):
            checks += (one_of(*entry["allowed"]),)
        if entry.get("maxLength"):
            checks += (max_len(entry["maxLength"], hard=name in ID_FIELDS),)
        rule = "; ".join(part for part in (
            entry.get("condition") or "",
            f"≤{entry['maxLength']} chars" if entry.get("maxLength") else "",
            "|".join(entry["allowed"]) if entry.get("allowed") else "",
        ) if part) or entry["status"]
        if base is None:
            merged.append(Field(name, vendor.status_overrides.get(name, entry["status"]), lambda r: None, rule, checks,
                                source="(no commercetools mapping)", kind="str"))
            changes["added"].append(name)
            continue
        if base.status != entry["status"] and name not in vendor.status_overrides:
            changes["statusChanged"].append(f"{name}: {base.status} → {entry['status']}")
        status = vendor.status_overrides.get(name, entry["status"])
        merged.append(replace(base, status=status, rule=rule if status == entry["status"] else base.rule, checks=checks,
                              blocking=base.blocking and base.required_if is not None))
    names = {e["name"] for e in spec["fields"]}
    changes["removed"] = [f.name for f in vendor.fields if f.name not in names]
    supplemental = spec.get("supplementalFields") or vendor.supplemental_fields
    return replace(vendor, fields=merged, supplemental_fields=supplemental), changes


def add_specs_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--vendors", required=True, help="Comma-separated: openai, google, microsoft")
    parser.add_argument("--out", help="Cache directory, normally <run>/specs (default: print only)")


def cmd_specs(args: argparse.Namespace) -> int:
    keys = parse_vendors(args.vendors)
    if keys is None:
        print(f"specs: --vendors must list one or more of: {', '.join(VENDORS)}", file=sys.stderr)
        return 2
    status = 0
    for key in keys:
        spec, note = load_spec(key, args.out, "live")
        if spec is None:
            print(f"[{key}] {note}", file=sys.stderr)
            status = 1
            continue
        _, changes = apply_spec(VENDORS[key], spec)
        counts = Counter(f["status"] for f in spec["fields"])
        print(f"[{key}] {len(spec['fields'])} fields ({', '.join(f'{v} {k}' for k, v in counts.items())}) from {spec['source']}")
        print(f"    required: {', '.join(f['name'] for f in spec['fields'] if f['status'] == REQUIRED)}")
        if spec.get("supplementalFields"):
            print(f"    supplemental feed fields: {', '.join(spec['supplementalFields'])}")
        for label, items in (("not in the skill's field registry (no commercetools mapping)", changes["added"]),
                             ("in the registry but no longer in the spec", changes["removed"]),
                             ("requirement changed", changes["statusChanged"])):
            if items:
                print(f"    {label}: {', '.join(items)}")
    return status


# ===========================================================================
# Working files
# ===========================================================================

HELPER_COLUMNS = ["_missing_required", "_issues"]


def cell(value: Any, booleans_upper: bool = False) -> str:
    """Serialize a vendor value for a CSV/TSV cell."""
    if value is None:
        return ""
    if isinstance(value, bool):
        text = "true" if value else "false"
        return text.upper() if booleans_upper else text
    if isinstance(value, list):
        return ",".join(str(v).replace(",", "%2C") for v in value)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return re.sub(r"[\t\r\n]+", " ", str(value))


def parse_cell(text: str, kind: str) -> Any:
    """Parse a working-file cell back into a vendor value. Unparseable text is returned as-is,
    so the checks report it instead of the value silently disappearing."""
    text = (text or "").strip()
    if text == "":
        return None
    if kind == "bool":
        lowered = text.lower()
        return True if lowered in ("true", "yes", "1") else False if lowered in ("false", "no", "0") else text
    if kind == "int":
        try:
            return int(Decimal(text))
        except (InvalidOperation, ValueError):
            return text
    if kind == "json":
        try:
            return json.loads(text)
        except ValueError:
            return text
    if kind == "list":
        return [part.strip().replace("%2C", ",") for part in text.split(",") if part.strip()]
    return text


def id_field(vendor: Vendor) -> str:
    return "item_id" if vendor.key in OPENAI_FORMAT_VENDORS else "id"


def working_columns(vendor: Vendor) -> list[str]:
    """Helper columns, the id, then every spec field in spec order (empty ones included, so
    the team can fill them)."""
    ident = id_field(vendor)
    return [*HELPER_COLUMNS, ident, *[f.name for f in vendor.fields if f.name != ident]]


def write_working(path: str, vendor: Vendor, rows: list[dict]) -> None:
    columns = working_columns(vendor)
    with open(path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        for row in rows:
            values = []
            for column in columns:
                value = row.get(column)
                if column in HELPER_COLUMNS:
                    values.append("; ".join(value or []))
                else:
                    values.append(cell(value))
            writer.writerow(values)


def detect_delimiter(header_line: str) -> str:
    """Delimiter of a working file, from its header row only: header cells are field names,
    so the most frequent of `,` `;` tab is the separator. (Sniffing data rows misfires on
    free text such as the `_issues` column.)"""
    counts = {d: header_line.count(d) for d in (",", ";", "\t")}
    return max(counts, key=counts.get) if any(counts.values()) else ","


def read_working(path: str, vendor: Vendor, delimiter: str | None = None) -> tuple[list[dict], list[str], bool]:
    """Read an edited working file. Returns (rows, unknown_columns, had_helper_columns).
    Helper columns are dropped."""
    kinds = {f.name: f.kind for f in vendor.fields}
    with open(path, encoding="utf-8-sig", newline="") as handle:
        header_line = handle.readline()
        handle.seek(0)
        reader = csv.DictReader(handle, delimiter=delimiter or detect_delimiter(header_line))
        headers = [h.strip() for h in (reader.fieldnames or [])]
        unknown = [h for h in headers if h and not h.startswith("_") and h not in kinds]
        had_helpers = any(h.startswith("_") for h in headers)
        rows = []
        for raw in reader:
            row = {}
            for key, text in raw.items():
                key = (key or "").strip()
                if not key or key.startswith("_") or key not in kinds:
                    continue
                value = parse_cell(text, kinds[key])
                if value not in (None, "", [], {}):
                    row[key] = value
            if row:
                rows.append(row)
    return rows, unknown, had_helpers


def group_issues(issues: list[dict]) -> list[dict]:
    groups: dict[tuple, dict] = {}
    for issue in issues:
        message = re.sub(r"'[^']*'", "'…'", issue["message"])
        message = re.sub(r"\(\d+\)", "(n)", message)
        key = (issue["field"], issue["severity"], message)
        group = groups.setdefault(key, {"field": issue["field"], "severity": issue["severity"], "message": message,
                                        "count": 0, "examples": []})
        group["count"] += 1
        if len(group["examples"]) < 3 and issue.get("item_id"):
            group["examples"].append(str(issue["item_id"]))
    order = {"required": 0, "conditional": 1, "warning": 2}
    return sorted(groups.values(), key=lambda g: (order.get(g["severity"], 2), -g["count"]))


def pct(part: int, whole: int) -> str:
    return f"{(100 * part / whole):.0f}%" if whole else "–"


def required_field_lines(vendor: Vendor, stats: dict[str, dict], total: int) -> list[str]:
    """Markdown table: is every required field present? One line per required/conditional field."""
    lines = ["| Required field | When | Filled | Missing where required | Missing, required if the condition applies | Invalid |",
             "|---|---|---|---|---|---|"]
    for spec in vendor.fields:
        if spec.status not in (REQUIRED, CONDITIONAL):
            continue
        s = stats[spec.name]
        when = "always" if spec.status == REQUIRED else (spec.rule or "conditional")
        when = when if len(when) <= 120 else when[:117] + "…"
        if s["missing_required"] or s["invalid"]:
            mark = " ⚠"
        elif s.get("missing_conditional"):
            mark = " ⚠?"
        else:
            mark = " ✓"
        lines.append(f"| `{spec.name}`{mark} | {when} | {s['filled']} / {total} | {s['missing_required'] or ''} | "
                     f"{s.get('missing_conditional') or ''} | {s['invalid'] or ''} |")
    return lines


def row_context(vendor: Vendor, row: dict) -> dict:
    """The record-like context check_row needs, rebuilt from a vendor row (for edited files)."""
    def amount(text: Any) -> str | None:
        if text in (None, ""):
            return None
        token = str(text).split(" ")[0]
        try:
            Decimal(token)
            return token
        except InvalidOperation:
            return None
    ident = id_field(vendor)
    return {
        "item_id": row.get(ident),
        "sku": row.get(ident),
        "group_id": row.get("group_id") or row.get("item_group_id"),
        "gtin": row.get("gtin"),
        "weight": row.get("weight") or row.get("product_weight"),
        "is_eligible_search": row.get("is_eligible_search"),
        "is_eligible_checkout": row.get("is_eligible_checkout"),
        "seller_privacy_policy": row.get("seller_privacy_policy"),
        "seller_tos": row.get("seller_tos"),
        "price_amount": amount(row.get("price")),
        "sale_price_amount": amount(row.get("sale_price")),
        "availability": None,
    }


# ===========================================================================
# build: working files and gap report
# ===========================================================================

HINTS = {
    "brand": "If the brand is stored under another attribute name, add it to `attributes.brand`.",
    "price": "Check price selection (--currency/--country/--channel) and that variants have prices.",
    "image_url": "Variants without images in commercetools.",
    "image_link": "Variants without images in commercetools.",
    "description": "Products without a description in the feed locale (or its language).",
    "gtin": "If barcodes are stored under another attribute name, add it to `attributes.gtin`.",
    "mpn": "If part numbers are stored under another attribute name, add it to `attributes.mpn`.",
    "google_product_category": "Read from `attributes.googleProductCategory` or the category custom fields in `categoryFields`.",
    "product_category": "Products without a category.",
    "item_group_id": "Variants need a group id; check the `groupId` strategy.",
    "availability": "Variants without inventory entries (for the Store's supply channels when --store is used).",
}
STORE_FIELDS = ("url", "link", "seller_name", "seller_privacy_policy", "seller_tos")


def render_markdown(context: dict) -> str:
    manifest = context["manifest"]
    lines = [
        "# AI Hub product feed – gap report",
        "",
        f"- Built: {context['builtAt']}",
        f"- Source: project `{manifest.get('projectKey', '?')}`, store `{manifest.get('store') or '–'}`, "
        f"locale `{context['locale']}`, currency `{context['currency'] or '–'}`, country `{context['country'] or '–'}`",
        f"- Filters: `{json.dumps({k: v for k, v in manifest.get('filters', {}).items() if v not in (None, [], '', {}) and k not in ('categoryIds', 'productSelectionIds', 'assortments', 'includeSubtree', 'attributeScope')}, ensure_ascii=False)}`",
        f"- Products: {context['productCount']} · variants (rows): {context['recordCount']}",
        "",
        f"- Feed flags: {context['flagsNote']}",
        "",
        "Every row is in the working file of each vendor, with the values commercetools has. "
        "Blank cells are values commercetools does not have; flagged values are kept as they are.",
        "",
        "## Summary",
        "",
        "| Vendor | Rows | Rows with every required field | Rows missing a required field | Working file |",
        "|---|---|---|---|---|",
    ]
    for result in context["vendors"]:
        lines.append(
            f"| {result['title']} | {result['rows']} | {result['complete']} ({pct(result['complete'], result['rows'])}) | "
            f"{result['incomplete']} | `{result['workingFile']}` |")
    lines.append("")

    if context["globalWarnings"]:
        lines += ["## Configuration notes", ""] + [f"- {w}" for w in context["globalWarnings"]] + [""]

    for result in context["vendors"]:
        lines += [f"## {result['title']}", "", f"Spec: {result['specUrl']} – {result['specNote']}", ""]
        previous = result.get("specPrevious")
        if previous:
            delta = previous["changes"]
            if delta["added"] or delta["removed"] or delta["changed"] or delta.get("supplementalFields"):
                lines += [f"**Changes since the previous spec of this run (fetched {previous['fetchedAt']}):**", ""]
                lines += [f"- Added: {', '.join(f'`{n}`' for n in delta['added'])}"] if delta["added"] else []
                lines += [f"- Removed: {', '.join(f'`{n}`' for n in delta['removed'])}"] if delta["removed"] else []
                lines += [f"- {c}" for c in delta["changed"]]
                if delta.get("supplementalFields"):
                    lines.append(f"- Supplemental fields: {delta['supplementalFields'][0]} → {delta['supplementalFields'][1]}")
                lines.append("")
            else:
                lines += [f"No changes since the previous spec of this run (fetched {previous['fetchedAt']}).", ""]
        changes = result["specChanges"]
        if changes["added"] or changes["removed"] or changes["statusChanged"]:
            lines += ["Differences between the current spec and the skill's field registry:", ""]
            if changes["added"]:
                lines.append(f"- In the spec, no commercetools mapping yet (empty working-file columns): {', '.join(f'`{n}`' for n in changes['added'])}")
            if changes["removed"]:
                lines.append(f"- No longer in the spec (left out): {', '.join(f'`{n}`' for n in changes['removed'])}")
            if changes["statusChanged"]:
                lines.append(f"- Requirement changed: {', '.join(changes['statusChanged'])}")
            lines.append("")
        if result["kind"] == "supplemental":
            lines += [
                "> Required fields are those of the full product spec. For a **supplemental** feed only `id` is "
                "required; the other values update products that already exist in the primary feed.",
                "",
            ]
        lines += ["### Required fields", ""] + required_field_lines(result["vendor"], result["stats"], result["rows"]) + [""]
        lines += ["### All fields", "", "| Field | Spec | Rule | Filled | Flagged | Invalid | Missing | commercetools source |",
                  "|---|---|---|---|---|---|---|---|"]
        for row in result["fields"]:
            lines.append(
                f"| `{row['field']}` | {row['status']} | {row['rule'] if len(row['rule']) <= 100 else row['rule'][:97] + '…'} | "
                f"{row['filled']} ({pct(row['filled'], result['rows'])}) | "
                f"{row['flagged'] or ''} | {row['invalid'] or ''} | {row['missing'] or ''} | {row['source']} |")
        lines.append("")
        if result["topIssues"]:
            lines += ["### Top issues", "", "| Severity | Field | Issue | Rows | Examples |", "|---|---|---|---|---|"]
            for issue in result["topIssues"][:25]:
                lines.append(f"| {issue['severity']} | `{issue['field']}` | {issue['message']} | {issue['count']} | "
                             f"{', '.join(issue['examples'])} |")
            lines.append("")
        if result["hints"]:
            lines += ["### Where the values come from", ""] + [f"- `{f}`: {h}" for f, h in result["hints"].items()] + [""]

    if context["unmappedAttributes"]:
        lines += ["## commercetools attributes not used by any feed field", "",
                  "Candidates for `attributes.*` or `customLabel*` in mapping.json.", "",
                  "| Attribute | Variants with value | Sample |", "|---|---|---|"]
        for row in context["unmappedAttributes"][:40]:
            sample = (row["sample"] or "")[:60].replace("|", "\\|")
            lines.append(f"| `{row['attribute']}` | {row['variantsWithValue']} | {sample} |")
        lines.append("")

    if context["normalizationNotes"]:
        lines += ["## Normalization notes", "", "| Field | Note | Rows |", "|---|---|---|"]
        for (field, message), count in context["normalizationNotes"]:
            lines.append(f"| `{field}` | {message} | {count} |")
        lines.append("")

    lines += ["Row-level details: `report/issues.csv`; each working file also lists, per row, the required "
              "fields it is missing (`_missing_required`). Next steps: `NEXT-STEPS.md`.", ""]
    return "\n".join(lines)


def render_next_steps(context: dict, run: str) -> str:
    run = os.path.abspath(run)
    finalize = f"{SCRIPT_PATH} finalize"
    out = [
        "# Next steps", "",
        "## 1. Complete the working files", "",
        "Each file in `working/` has one row per variant and one column per vendor field, filled with what "
        "commercetools has. Columns starting with `_` are notes for the team and are ignored later:",
        "",
        "- `_missing_required`: required fields this row does not have yet;",
        "- `_issues`: values worth a look (for example an invalid GTIN or an over-long title).",
        "",
        "Edit the files in a spreadsheet and keep the header row unchanged. Import them as text (Google Sheets: "
        "File → Import; Excel: Data → From Text/CSV, column type Text) so GTINs, SKUs and prices keep their exact "
        "form. Save as CSV (UTF-8).",
        "",
        "## 2. Turn a completed file into the vendor format", "",
        "Hand the completed file back to the agent, or run:", "",
    ]
    commands = {
        "openai": f"python3 {finalize} --vendor openai --input <completed openai-working.csv> --out {run}/final",
        "openai-ads": f"python3 {finalize} --vendor openai-ads --input <completed openai-ads-working.csv> --out {run}/final",
        "google": f"python3 {finalize} --vendor google --kind supplemental --input <completed google-working.csv> --out {run}/final",
        "microsoft": f"python3 {finalize} --vendor microsoft --kind supplemental --input <completed microsoft-working.csv> --out {run}/final",
    }
    for result in context["vendors"]:
        out += ["```bash", commands[result["key"]], "```", ""]
    out += [
        "`aihub_feeds.py finalize` checks the file against the vendor spec, reports which required fields are still missing, "
        "and writes the upload file with the values exactly as they are in the completed file.",
        "",
        "## 3. Uploading", "",
    ]
    keys = {r["key"] for r in context["vendors"]}
    if "openai" in keys:
        out += [
            "**OpenAI Commerce feed** (merchant portal → product feed):",
            "- *Manual upload*: Upload a file → **Choose File** → **Validate** → **Submit feed**.",
            "- *SFTP* (username/password, shown once, or SSH key) or *Hosted URL* (Once / Hourly / Daily) for recurring delivery.",
            "- OpenAI treats each upload as the complete catalog: products missing from a later upload drop out after up to 14 days.",
            "",
        ]
    if "openai-ads" in keys:
        out += [
            "**OpenAI Ads feed** (ad account product feed, separate from the Commerce feed):",
            "- Needs an ad account with product feed API access. Create a feed in the ad account, configure its SFTP "
            "access (password or SSH key), and put the finalized `ads-product-feed.csv` in the SFTP root.",
            "- Check ingestion under upload history / diagnostics, then select products for ad groups with product sets "
            "(brand, category, price, `ads_metadata.<key>`).",
            "- Products need `is_ads_eligible=true`, current price and availability, and public HTTPS product and image URLs.",
            "",
        ]
    if "google" in keys:
        out += [
            "**Google Merchant Center** (supplemental data source):",
            "- Settings → Data sources → Supplemental sources → **Add supplemental product data** → Upload a file → link it to the primary source(s).",
            "- Rows apply to products whose `id` matches the primary feed. Each column overrides the primary value for those products.",
            "",
        ]
    if "microsoft" in keys:
        out += [
            "**Microsoft Merchant Center** (supplemental feed):",
            "- Tools → Merchant Center → Feeds → **Create feed** → Feed type *Supplemental feed* → same Feed label / Country of sale "
            "and Language as the primary feed → Manually upload (< 4 MB) or FTP/SFTP.",
            "- Supplemental feeds carry `id`, `title`, `description`, `size`, `color`, `custom_label_0–4`, `promotion_ID`; other "
            "fields belong in the primary feed (`--kind primary`).",
            "",
        ]
    return "\n".join(out)


def add_build_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--run", required=True, help="Run directory created by `fetch` (contains raw/)")
    parser.add_argument("--mapping", help="Mapping JSON merged over the defaults (default: <run>/mapping.json if present)")
    parser.add_argument("--specs", choices=["auto", "live", "bundled"], default="auto",
                        help="auto (default): cached spec of this run, else fetch live; live: always fetch; "
                             "bundled: the skill's built-in field list")
    parser.add_argument("--vendors", required=True,
                        help="Vendors the user asked for, comma-separated: openai, google, microsoft. There is no default")


def parse_vendors(text: str) -> list[str] | None:
    keys = [v.strip() for v in (text or "").split(",") if v.strip()]
    return keys if keys and all(k in VENDORS for k in keys) else None


def cmd_build(args: argparse.Namespace) -> int:
    if parse_vendors(args.vendors) is None:
        print(f"build: --vendors must list one or more of: {', '.join(VENDORS)}", file=sys.stderr)
        return 2
    run = args.run
    raw = os.path.join(run, "raw")
    if not os.path.exists(os.path.join(raw, "products.jsonl")):
        print(f"{raw}/products.jsonl not found – run `aihub_feeds.py fetch` first", file=sys.stderr)
        return 2

    mapping_path = args.mapping or os.path.join(run, "mapping.json")
    cfg = copy.deepcopy(DEFAULT_MAPPING)
    if os.path.exists(mapping_path):
        cfg = deep_merge(cfg, read_json(mapping_path))
    write_json(os.path.join(run, "mapping.json"), cfg)

    def optional(name, default):
        path = os.path.join(raw, name)
        return read_json(path) if os.path.exists(path) else default

    manifest = optional("fetch-manifest.json", {})
    categories = optional("categories.json", [])
    store = optional("store.json", None)
    products = list(read_jsonl(os.path.join(raw, "products.jsonl")))
    normalizer = Normalizer(cfg, categories, store, manifest)
    records = normalizer.records(products)

    os.makedirs(os.path.join(run, "normalized"), exist_ok=True)
    with open(os.path.join(run, "normalized", "records.jsonl"), "w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps({k: v for k, v in record.items() if not k.startswith("_")}, ensure_ascii=False, default=str) + "\n")

    global_warnings = list(manifest.get("warnings", []))
    roots = Counter((r.get("category_path") or "").split(" > ")[0] for r in records if r.get("category_path"))
    filtered_roots = {(c.split(": ", 1)[1] if ": " in c else c).split(" > ")[0]
                      for c in (manifest.get("filters") or {}).get("resolvedCategories", [])}
    if roots and len(roots) == 1 and next(iter(roots)) in filtered_roots and not (cfg.get("categoryPath") or {}).get("excludeRoots"):
        global_warnings.append(f"Every category path starts with '{next(iter(roots))}', the category filtered on. If that is a "
                               "merchandising tree (New, Sale), set categoryPath.excludeRoots to use the products' other categories.")
    duplicates = [i for i, c in Counter(r["item_id"] for r in records).items() if c > 1]
    if duplicates:
        global_warnings.append(f"{len(duplicates)} duplicate item ids (e.g. {', '.join(duplicates[:3])}); change the `itemId` strategy.")
    if manifest.get("store"):
        store_hint = (f"Read from Store `{manifest['store']}` at the `store.*` paths in mapping.json; "
                      "blank when the Store has no value there.")
    else:
        store_hint = "Read from the Store; the download had no --store (see `aihub_feeds.py fetch --list-stores`)."

    sources = normalizer.source_descriptions()
    results, all_issues = [], []
    os.makedirs(os.path.join(run, "working"), exist_ok=True)
    for key in [v.strip() for v in args.vendors.split(",") if v.strip()]:
        spec, spec_note = load_spec(key, os.path.join(run, "specs"), args.specs)
        vendor, spec_changes = apply_spec(VENDORS[key], spec)
        rows, stats, issues = evaluate(vendor, records)
        all_issues.extend(issues)
        working = os.path.join(run, "working", f"{key}-working.csv")
        write_working(working, vendor, rows)
        complete = sum(1 for r in rows if not r["_missing_required"])
        hints = {**HINTS, **{f: store_hint for f in STORE_FIELDS}}
        results.append({
            "key": key, "title": vendor.title, "kind": vendor.output_kind, "specUrl": vendor.spec_url,
            "specNote": spec_note, "specLive": spec is not None, "specChanges": spec_changes,
            "specPrevious": (spec or {}).get("previous"),
            "vendor": vendor, "stats": stats, "rows": len(rows), "complete": complete, "incomplete": len(rows) - complete,
            "workingFile": os.path.relpath(working, run),
            "fields": [{"field": f.name, "status": f.status, "rule": f.rule, "source": sources.get(f.source, f.source),
                        **stats[f.name]} for f in vendor.fields],
            "topIssues": group_issues(issues),
            "issues": issues,
            "hints": {f.name: hints[f.name] for f in vendor.fields if f.name in hints
                      and (stats[f.name]["missing_required"] or stats[f.name]["invalid"]
                           or (f.status in (REQUIRED, RECOMMENDED) and stats[f.name]["missing"]))},
        })

    note_counts = Counter((n["field"], n["message"]) for n in normalizer.notes)
    context = {
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "manifest": manifest,
        "locale": normalizer.locale,
        "currency": normalizer.currency,
        "country": normalizer.country,
        "productCount": len(products),
        "recordCount": len(records),
        "vendors": results,
        "globalWarnings": global_warnings,
        "unmappedAttributes": normalizer.unmapped_attributes(),
        "normalizationNotes": note_counts.most_common(20),
        "flagsNote": ", ".join(f"{k} default {v}" for k, v in (cfg.get("flags") or {}).items()) + " (merchant settings from "
                     "mapping.json `flags`; a product attribute overrides them). Defaults used on: " +
                     (", ".join(f"{f} {n} rows" for f, n in normalizer.flag_defaults.items()) or "none"),
    }

    report_dir = os.path.join(run, "report")
    os.makedirs(report_dir, exist_ok=True)
    with open(os.path.join(report_dir, "gap-report.md"), "w", encoding="utf-8") as handle:
        handle.write(render_markdown(context))
    write_json(os.path.join(report_dir, "gap-report.json"), {
        **{k: v for k, v in context.items() if k != "vendors"},
        "vendors": [{k: v for k, v in r.items() if k not in ("vendor", "stats", "issues")} for r in results],
        "normalizationNotes": [{"field": f, "message": m, "count": c} for (f, m), c in context["normalizationNotes"]],
    })
    with open(os.path.join(report_dir, "issues.csv"), "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["vendor", "item_id", "sku", "field", "status", "severity", "message"])
        writer.writeheader()
        writer.writerows(all_issues)
    with open(os.path.join(run, "NEXT-STEPS.md"), "w", encoding="utf-8") as handle:
        handle.write(render_next_steps(context, run))

    print(f"Products: {len(products)}  variants: {len(records)}")
    for result in results:
        gaps = Counter(i["field"] for i in result["issues"] if i["severity"] == "required")
        print(f"[{result['key']}] {result['specNote']}")
        print(f"[{result['key']}] rows: {result['rows']}  with every required field: {result['complete']}  "
              f"missing required fields: {result['incomplete']}  -> {result['workingFile']}")
        if gaps:
            print("    required fields with gaps (rows): " + ", ".join(f"{f} ({n})" for f, n in gaps.items()))
    for warning in global_warnings:
        print(f"NOTE: {warning}")
    print(f"Report: {os.path.join(report_dir, 'gap-report.md')}")
    return 0


# ===========================================================================
# finalize: completed working file -> vendor upload file
# ===========================================================================

DEFAULT_NAMES = {
    ("openai", "full"): "product-feed",
    ("openai-ads", "full"): "ads-product-feed",
    ("google", "supplemental"): "google-supplemental-feed",
    ("google", "primary"): "google-primary-feed",
    ("microsoft", "supplemental"): "microsoft_supplemental_feed",
    ("microsoft", "primary"): "microsoft_primary_feed",
}


def write_delimited(path: str, columns: list[str], rows: list[dict], delimiter: str, booleans_upper: bool, compress: bool) -> None:
    opener = gzip.open if compress else open
    with opener(path, "wt", encoding="utf-8", newline="") as handle:
        if delimiter == "\t":
            # Plain TSV: no quoting (Microsoft rejects quotes and tabs inside values; cell() strips tabs).
            handle.write("\t".join(columns) + "\n")
            for row in rows:
                handle.write("\t".join(cell(row.get(c), booleans_upper) for c in columns) + "\n")
        else:
            writer = csv.writer(handle)
            writer.writerow(columns)
            for row in rows:
                writer.writerow([cell(row.get(c), booleans_upper) for c in columns])


def add_finalize_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--vendor", required=True, choices=sorted(VENDORS))
    parser.add_argument("--input", required=True, help="Completed working file (CSV)")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--kind", choices=["supplemental", "primary"], default="supplemental",
                        help="Google/Microsoft: supplemental (default) or primary feed")
    parser.add_argument("--format", choices=["jsonl.gz", "csv.gz", "tsv.gz", "csv"],
                        help="OpenAI file format (default: jsonl.gz; OpenAI Ads: csv, as its guide asks)")
    parser.add_argument("--columns", help="Supplemental feeds: comma-separated columns to include (default: every column with a value)")
    parser.add_argument("--file-name", help="Output file name without extension")
    parser.add_argument("--delimiter", choices=[",", ";", "tab"], help="Input delimiter (default: detected from the header row)")
    parser.add_argument("--specs-dir", help="Cached specs (default: <run>/specs next to the working/ folder, if present)")
    parser.add_argument("--specs", choices=["auto", "live", "bundled"], default="auto",
                        help="auto (default): cached spec of this run, else fetch live; live: always fetch; "
                             "bundled: the skill's built-in field list")


def cmd_finalize(args: argparse.Namespace) -> int:
    specs_dir = args.specs_dir or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(args.input))), "specs")
    spec, spec_note = load_spec(args.vendor, specs_dir if os.path.isdir(specs_dir) or args.specs_dir else None, args.specs)
    vendor, _ = apply_spec(VENDORS[args.vendor], spec)
    kind = "full" if vendor.key in OPENAI_FORMAT_VENDORS else args.kind
    file_format = args.format or ("csv" if vendor.key == "openai-ads" else "jsonl.gz")
    ident = id_field(vendor)
    args.input, args.out = os.path.abspath(args.input), os.path.abspath(args.out)
    rows, unknown_columns, had_helpers = read_working(args.input, vendor, "\t" if args.delimiter == "tab" else args.delimiter)
    os.makedirs(args.out, exist_ok=True)

    stats = new_stats(vendor)
    issues: list[dict] = []
    incomplete = 0
    for row in rows:
        missing, row_issues = check_row(vendor, row, row_context(vendor, row), stats)
        issues.extend(row_issues)
        incomplete += bool(missing)
    no_id = sum(1 for r in rows if not r.get(ident))
    duplicates = [i for i, c in Counter(r.get(ident) for r in rows if r.get(ident)).items() if c > 1]

    # Columns: spec order; values as given.
    present = [f.name for f in vendor.fields if any(r.get(f.name) not in (None, "", [], {}) for r in rows)]
    left_out: list[str] = []
    no_values: list[str] = []
    if kind == "supplemental":
        wanted = [c.strip() for c in args.columns.split(",")] if args.columns else present
        allowed = vendor.supplemental_fields or [f.name for f in vendor.fields]
        columns = [f.name for f in vendor.fields if f.name in wanted and f.name in allowed and f.name != ident]
        left_out = [c for c in wanted if c not in columns and c != ident]
        no_values = [f for f in allowed if f != ident and f not in present and (not args.columns or f in wanted)]
        columns = [ident, *columns] if vendor.key != "microsoft" else [*columns, ident]
    else:
        columns = present
        if vendor.key == "microsoft" and ident in columns:  # Microsoft rejects trailing tabs; id is never empty
            columns = [c for c in columns if c != ident] + [ident]
    empty_cells = {c: sum(1 for r in rows if r.get(c) in (None, "", [], {})) for c in columns if c != ident}

    name = args.file_name or DEFAULT_NAMES[(vendor.key, kind)]
    if vendor.key in OPENAI_FORMAT_VENDORS:
        path = os.path.join(args.out, f"{name}.{file_format}")
        if file_format == "jsonl.gz":
            with gzip.open(path, "wt", encoding="utf-8") as handle:
                for row in rows:
                    ordered = {c: row[c] for c in columns if row.get(c) not in (None, "", [], {})}
                    handle.write(json.dumps(ordered, ensure_ascii=False) + "\n")
        else:
            write_delimited(path, columns, rows, "," if file_format.startswith("csv") else "\t", False,
                            file_format.endswith(".gz"))
    elif vendor.key == "google":
        path = os.path.join(args.out, f"{name}.tsv")
        write_delimited(path, columns, rows, "\t", False, False)
    else:
        name = name.replace(" ", "_")[:46]
        path = os.path.join(args.out, f"{name}.txt")
        write_delimited(path, columns, rows, "\t", True, False)

    # Report
    total = len(rows)
    lines = [f"# {vendor.title} – finalize report", "",
             f"- Input: `{args.input}`",
             f"- Output: `{path}` ({total} rows, {kind} feed, columns: {', '.join(columns)})",
             f"- Spec: {vendor.spec_url} – {spec_note}", ""]
    notes = []
    if no_id:
        notes.append(f"{no_id} rows have no `{ident}`.")
    if duplicates:
        notes.append(f"{len(duplicates)} duplicate `{ident}` values (e.g. {', '.join(map(str, duplicates[:3]))}).")
    if had_helpers:
        notes.append("Helper columns (`_missing_required`, `_issues`) from the build were ignored; they describe the file "
                     "before the team edited it. The checks below ran on the completed values.")
    if unknown_columns:
        notes.append(f"Columns not in the {vendor.key} spec were not written: {', '.join(unknown_columns)}.")
    if left_out:
        notes.append(f"Columns left out of the supplemental file ({'not accepted in a Microsoft supplemental feed' if vendor.key == 'microsoft' else 'not requested'}): "
                     f"{', '.join(left_out)}.")
    if kind == "supplemental" and no_values:
        notes.append(f"Not written because no row has a value: {', '.join(no_values)}.")
    if notes:
        lines += ["## Notes", ""] + [f"- {n}" for n in notes] + [""]
    if kind == "supplemental":
        lines += ["## Supplemental feed", "",
                  f"Only `{ident}` is required; it must match the id in the primary feed. Each column overrides the primary "
                  "value for the matching product, and an empty cell can clear it.", "",
                  "| Column | Rows with a value | Empty cells |", "|---|---|---|"]
        for column in columns:
            if column != ident:
                lines.append(f"| `{column}` | {total - empty_cells[column]} / {total} | {empty_cells[column] or ''} |")
        lines += ["", "Required fields of the full product spec, for reference:", ""]
    else:
        lines += ["## Required fields", "",
                  f"Rows with every required field: {total - incomplete} / {total} ({pct(total - incomplete, total)}).", ""]
    lines += required_field_lines(vendor, stats, total) + [""]
    grouped = group_issues(issues)
    if grouped:
        lines += ["## Issues", "", "| Severity | Field | Issue | Rows | Examples |", "|---|---|---|---|---|"]
        for issue in grouped[:30]:
            lines.append(f"| {issue['severity']} | `{issue['field']}` | {issue['message']} | {issue['count']} | {', '.join(issue['examples'])} |")
        lines.append("")
    report_path = os.path.join(args.out, f"{vendor.key}-{kind}-finalize-report.md")
    with open(report_path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))

    print(f"[{vendor.key}] {spec_note}")
    print(f"[{vendor.key}] {total} rows -> {path}")
    if kind != "supplemental":
        print(f"    rows with every required field: {total - incomplete} / {total}")
    gaps = Counter(i["field"] for i in issues if i["severity"] == "required")
    if gaps and kind != "supplemental":
        print("    required fields with gaps (rows): " + ", ".join(f"{f} ({n})" for f, n in gaps.items()))
    for note in notes:
        print(f"    note: {note}")
    print(f"    report: {report_path}")
    return 0


# ===========================================================================
# CLI
# ===========================================================================


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    for name, add, run, help_text in (
        ("fetch", add_fetch_args, cmd_fetch, "download products from commercetools (read-only)"),
        ("specs", add_specs_args, cmd_specs, "fetch and parse the vendors' current feed specs"),
        ("build", add_build_args, cmd_build, "write per-vendor working files and the gap report (offline)"),
        ("finalize", add_finalize_args, cmd_finalize, "convert a completed working file into the vendor upload format"),
    ):
        sub = commands.add_parser(name, help=help_text, description=help_text)
        add(sub)
        sub.set_defaults(handler=run)
    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except CtError as error:
        print(f"commercetools request failed: {error}", file=sys.stderr)
        sys.exit(1)
