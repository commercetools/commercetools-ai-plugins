# AI-Powered and Semantic Search — Current State and Patterns

**Source:** "AI-Assisted Search — An Overview" (search-team@commercetools.com, 2025); "AI-powered commercetools search kick-off" (2025); Product Search QBR Q1 2026; Q2 2026 Domain Review: Search

---

## Why Keyword Search Falls Short

Traditional keyword search (BM25/TF-IDF) finds documents with matching terms and ranks by word frequency. It fails to capture **implied intent**:

- A search for "gift for someone who likes running under $100" returns nothing useful from keyword matching
- A search for "comfortable office chair for back pain" may miss products described as "ergonomic lumbar support seating"
- Multilingual and cross-language discovery is not possible without explicit synonym tables

As commerce moves toward agentic shopping (AI agents finding and purchasing products on behalf of customers), the search API must understand natural language queries and vague descriptions — not just keyword matches.

> "As part of our experiments with shopping agents, we learn that product search is even more important than in traditional storefronts (e.g. 'I'm looking for a gift for friend under $100, she likes running and comedy movies'). However, we face the major limitation of not having a search API that can handle semantic search or recommendations."
> — commercetools Product Manager

---

## Approaches to AI/Semantic Search

### 1. Embedding-Based (Vector Search)

Use an encoder model to create embeddings (dense vectors conveying contextual meaning) for both product documents and queries. Store document embeddings in a vector database. At query time, embed the query and find the most similar document vectors.

```
Product documents → encoder model → dense vectors → stored in vector DB
User query → same encoder model → query vector → cosine similarity search → ranked results
```

**Characteristics:**
- Better at capturing semantic similarity than keyword search
- Document and query embeddings can be created independently
- Quality is lower than cross-encoders (no interaction between query and document during ranking)
- Supported by vector databases: Elasticsearch (from 8.0), Vespa, Weaviate, Pinecone, etc.

**Image-based search:** The same embedding approach works for images. CT's internal "Red Dress Search" POC demonstrated searching products based on an uploaded image using image embeddings.

### 2. Hybrid Search

Combine keyword search (BM25/sparse vectors) with semantic search (dense vectors) to get the benefits of both:

- Keyword search handles exact product SKU / brand name lookups precisely
- Semantic search handles intent and vague descriptions
- A reciprocal rank fusion (RRF) or weighted combination merges the result sets

Hybrid search is the recommended approach for production storefront search when semantic capability is required.

### 3. Query Understanding with Language Models

Use an LLM to **rewrite or parse** a natural language query into structured search parameters before hitting the search index:

```
User: "red women's dress under $150 for a wedding"
  ↓  LLM query rewriting
Structured: { color: "red", gender: "women", category: "dress", maxPrice: 15000, occasion: "formal" }
  ↓
CT Product Search API query
```

This approach can be combined with any retriever (keyword, vector, hybrid). It does not require embedding infrastructure.

### 4. Learn-to-Rank (Behavioral Signals)

Gather signals from user interactions (clicks, add-to-basket, checkout) and use them to improve ranking:

- **Implicit signals:** click-through rate on search results, add-to-cart rate per position, checkout rate
- **Explicit signals:** merchant boosts, pinned products, business-rule overrides
- Models: LambdaMART, XGBoost rankers trained on interaction logs
- Signals must be continuously updated as products and preferences change

**Evaluation is critical:** without a measurement pipeline (offline evaluation against labeled queries, A/B testing), it is impossible to know if ranking changes are improving or degrading search quality.

---

## CT Native Semantic Search — Roadmap (as of mid-2026)

CT is building semantic search natively into the Product Search API:

| Milestone | Target |
|---|---|
| Shadow mode (cost estimation) | Q1 2026 |
| Early Access | June 2026 |
| Open Beta | Q3 2026 |
| GA | Q4 2026 |

**Positioning:** CT semantic search is designed for customers who want to minimize integration overhead — "good enough to not need a third party" at a price point standalone semantic search competitors cannot match for CT customers.

**Ideal customer profile for CT semantic search:**
- Equally B2B and B2C
- Wants to minimize TCO and integration complexity
- Does not immediately need advanced personalization, A/B testing, or recommendations
- Operating across multiple locales and regions
- Generic product catalog (not highly specialized/niche)

---

## Sparse Vectors and Late Interaction Models

For teams evaluating search provider options:

**Sparse vectors (BM25/SPLADE):** BM25 is inherently sparse vector search. SPLADE extends this with AI-based term expansion — improving recall by expanding the sparse representation with related terms.

**Late interaction models (ColBERT):** Creates contextualized embeddings at the **term level** rather than the document level. More expensive at index time but more accurate than bi-encoder dense retrieval. Supported by Elasticsearch from version 9.0.

---

## Product Data Quality for AI Discovery

AI-powered search — whether via vector embeddings, LLM query rewriting, or agentic shopping — depends heavily on product data quality. Poor product data produces poor AI results regardless of the sophistication of the retrieval model.

**What "AI-ready" product data looks like:**
- Rich, descriptive product names and descriptions (not just SKU codes and spec lists)
- Consistent use of attributes — color, size, material, occasion, gender defined as structured attributes (not buried in free-text descriptions)
- Complete localized content for all configured locales
- High-quality images (required for image-based search)
- Real-time inventory visibility (agents need accurate stock status)

> "The point to start with is shifting from traditional SEO to optimizing catalog information for LLM discovery. This means product data is often inconsistent or not machine-readable. Real-time inventory visibility is often lacking."
> — Dirk Hoerig, co-founder, commercetools

**Practical recommendation:** Before investing in semantic search infrastructure, audit product data quality. A well-tuned keyword search with high-quality product data frequently outperforms semantic search over poor-quality catalog data.

---

## Agentic Commerce and Search

Agentic commerce (AI agents buying on behalf of customers — ChatGPT checkout, Google UCP, Microsoft Copilot) requires a structured, queryable product index that understands commerce data models:

- Agents issue natural language queries ("find me a blue waterproof jacket under $200 in size M")
- The search layer must translate this into structured queries against the catalog
- CT's Product Search API is the native integration point for CT's own Cora agent and for AI Hub connectors
- External search providers require separate integration work for each AI agent surface

For CT customers moving toward agentic commerce, CT native search is the path of least resistance — it eliminates the need to build a separate search integration for each AI channel.
