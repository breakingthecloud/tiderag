# 🌊 TideRAG

[![npm version](https://img.shields.io/npm/v/@carloscortezcloud/tiderag?color=blue)](https://www.npmjs.com/package/@carloscortezcloud/tiderag)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com)

**CF-native RAG pipeline — $0/mo.** Vectorize + Workers AI + D1 on the edge.

## The Problem

Most RAG pipelines force you to:
- Spin up a vector database (Pinecone, Weaviate, pgvector)
- Manage embedding infrastructure
- Pay per-query costs before you have users

**TideRAG runs entirely on Cloudflare's free tier.** Your vector store, embedding inference, and metadata storage all live at the edge.

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

## Quick Start

```bash
npm install @carloscortezcloud/tiderag
```

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

## Deployment

```toml
# wrangler.jsonc
{
  "vectorize": [{ "binding": "VECTORIZE_INDEX", "index_name": "tiderag" }],
  "d1_databases": [{ "binding": "DB", "database_name": "tiderag", "database_id": "..." }],
  "ai": { "binding": "AI" }
}
```

## Why TideRAG?

| Feature | TideRAG | Managed RAG (Pinecone, etc.) |
|---------|---------|-------------------------------|
| **Cost** | $0/mo (free tier) | $70–$700+/mo |
| **Latency** | <50ms (edge) | 100–500ms (regional) |
| **Infra** | Zero | Vector DB + embedding API |
| **Scaling** | Auto (Cloudflare) | Manual |
| **Data locality** | Edge | Regional |

## Packages

- `@carloscortezcloud/tiderag` — Core RAG pipeline

## Tinkuy Ecosystem

TideRAG is part of the [Tinkuy ecosystem](https://github.com/breakingthecloud/tinkuylabs) — composable tools for AI agent observability, cost control, and routing.

## License

Apache 2.0
