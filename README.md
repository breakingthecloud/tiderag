<p align="center">
  <img alt="TideRAG" src="https://img.shields.io/badge/🌊-TideRAG-06B6D4?style=for-the-badge" height="50">
</p>

<p align="center">
  <b>CF-native RAG Pipeline — $0/mo</b><br>
  Vectorize + Workers AI + D1 at the edge. Zero infrastructure to manage.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>
  ·
  <a href="#how-it-works">How It Works</a>
  ·
  <a href="#why-tiderag">Why TideRAG?</a>
  ·
  <a href="#ecosystem">Ecosystem</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@carloscortezcloud/tiderag?style=flat-square&logo=npm&color=06B6D4" alt="npm">
  <img src="https://img.shields.io/badge/license-Apache_2.0-06B6D4?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/TypeScript-5.5%2B-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-orange?style=flat-square&logo=cloudflare" alt="CF Workers">
  <img src="https://img.shields.io/badge/cost-%240%2Fmo-success?style=flat-square" alt="$0/mo">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs">
</p>

---

## What Is TideRAG?

Most RAG pipelines force you to spin up a vector database (Pinecone, Weaviate, pgvector), manage embedding infrastructure, and pay per-query costs before you have users. **TideRAG runs entirely on Cloudflare's free tier** — your vector store, embedding inference, and metadata storage all live at the edge.

```typescript
import { TideRAG } from '@carloscortezcloud/tiderag';

const rag = new TideRAG({
  vectorize: env.VECTORIZE_INDEX,
  d1: env.DB,
  ai: env.AI,
});

// Index a document
await rag.ingest({
  id: 'doc-1',
  content: 'Cloudflare Workers run on V8 isolates...',
  metadata: { source: 'docs', category: 'compute' },
});

// Query
const results = await rag.query('How do Workers work?', { topK: 3 });
```

## Install

```bash
npm install @carloscortezcloud/tiderag
```

## Quick Start

### 1. Install

```bash
npm install @carloscortezcloud/tiderag
```

### 2. Configure wrangler

```toml
# wrangler.jsonc
{
  "vectorize": [{ "binding": "VECTORIZE_INDEX", "index_name": "tiderag" }],
  "d1_databases": [{ "binding": "DB", "database_name": "tiderag", "database_id": "..." }],
  "ai": { "binding": "AI" }
}
```

### 3. Ingest & query

```typescript
import { TideRAG } from '@carloscortezcloud/tiderag';

const rag = new TideRAG({ vectorize: env.VECTORIZE_INDEX, d1: env.DB, ai: env.AI });

await rag.ingest({ id: 'doc-1', content: 'Your document text here...', metadata: { source: 'docs' } });
const results = await rag.query('Your question', { topK: 3 });
```

## How It Works

```
User Query
    │
    ▼
┌──────────────────┐
│  Workers AI      │  ← Embed query via @cf/baai/bge-small-en-v1.5 (free)
│  (embedding)     │
└──────┬───────────┘
       │ vector
       ▼
┌──────────────────┐
│  Vectorize        │  ← 10M vector index (free tier)
│  (similarity)     │
└──────┬───────────┘
       │ top-K IDs
       ▼
┌──────────────────┐
│  D1               │  ← Metadata + chunk storage (5GB free)
│  (metadata)       │
└──────┬───────────┘
       │ enriched chunks
       ▼
┌──────────────────┐
│  LLM Response    │  ← Augment prompt, return answer
└──────────────────┘
```

## Why TideRAG?

| Feature | TideRAG | Managed RAG (Pinecone, etc.) |
|---------|---------|-------------------------------|
| **Cost** | $0/mo (free tier) | $70–$700+/mo |
| **Latency** | <50ms (edge) | 100–500ms (regional) |
| **Infra** | Zero | Vector DB + embedding API |
| **Scaling** | Auto (Cloudflare) | Manual |
| **Data locality** | Edge (175+ cities) | Regional |

## Deployment

```bash
npx wrangler deploy
```

## Ecosystem

| Package | Role | npm |
|---------|------|-----|
| **TideRAG** | Edge RAG (this) | `@carloscortezcloud/tiderag` |
| **Tinkuy** | Agent framework | `@carloscortezcloud/tinkuy-agent` |
| **Styrr** | LLM router | `styrr` |
| **Sayay** | Cost guardrails | GitHub |
| **Qhaway** | Agent observability | `@carloscortezcloud/qhaway` |

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

<p align="center">
  Built by engineers who got tired of $700 vector DB bills.<br>
  <a href="https://github.com/breakingthecloud/tinkuylabs">Tinkuy Labs</a> · <a href="https://finoptix.dev">finoptix.dev</a>
</p>
<p align="center">
  <sub>Your RAG pipeline costs $0/mo. Your AI agent should too.</sub>
</p>
