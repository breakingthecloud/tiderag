/**
 * TideRAG — CF-Native RAG Pipeline
 *
 * $0/mo using Cloudflare free tier:
 * - Vectorize (5M vectors free)
 * - Workers AI (free embeddings)
 * - D1 (5GB free)
 *
 * Usage:
 *   const rag = new TideRAG({ vectorize: env.VECTORIZE, ai: env.AI, d1: env.DB });
 *   await rag.ingest({ content: '...', metadata: { source: 'docs/api.md' } });
 *   const results = await rag.query('How do I authenticate?', { topK: 5 });
 */

export interface TideRAGConfig {
  /** Cloudflare Vectorize binding */
  vectorize: VectorizeIndex;
  /** Cloudflare Workers AI binding */
  ai: Ai;
  /** Cloudflare D1 binding (stores chunk text + metadata) */
  d1: D1Database;
  /** Embedding model (default: @cf/baai/bge-base-en-v1.5) */
  embeddingModel?: string;
  /** Namespace prefix for multi-tenant isolation (optional) */
  namespace?: string;
}

export interface IngestOptions {
  /** Text content to ingest */
  content: string;
  /** Metadata attached to each chunk */
  metadata?: Record<string, string>;
  /** Chunking strategy */
  chunkStrategy?: 'markdown' | 'sliding' | 'paragraph';
  /** Max tokens per chunk (default: 400) */
  chunkSize?: number;
  /** Overlap between chunks in chars (default: 50) */
  chunkOverlap?: number;
}

export interface QueryOptions {
  /** Number of results (default: 5) */
  topK?: number;
  /** Filter by metadata field */
  filter?: Record<string, string>;
}

export interface QueryResult {
  text: string;
  score: number;
  metadata: Record<string, string>;
  chunkIndex: number;
}

export class TideRAG {
  private vectorize: VectorizeIndex;
  private ai: Ai;
  private d1: D1Database;
  private model: string;
  private namespace: string;

  constructor(config: TideRAGConfig) {
    this.vectorize = config.vectorize;
    this.ai = config.ai;
    this.d1 = config.d1;
    this.model = config.embeddingModel || '@cf/baai/bge-base-en-v1.5';
    this.namespace = config.namespace || 'default';
  }

  /**
   * Initialize D1 schema (run once)
   */
  async init(): Promise<void> {
    await this.d1.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        namespace TEXT DEFAULT 'default',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_ns ON chunks(namespace);
    `);
  }

  /**
   * Ingest content: chunk → embed → store
   */
  async ingest(options: IngestOptions): Promise<{ chunks: number; docId: string }> {
    const { content, metadata = {}, chunkStrategy = 'markdown', chunkSize = 400, chunkOverlap = 50 } = options;

    // Generate doc ID from metadata source or random
    const docId = metadata.source || crypto.randomUUID();

    // Delete existing chunks for this doc (re-ingest)
    await this.delete({ docId });

    // Chunk the content
    const chunks = this.chunk(content, chunkStrategy, chunkSize, chunkOverlap);

    if (chunks.length === 0) return { chunks: 0, docId };

    // Embed all chunks
    const embeddings = await this.embed(chunks);

    // Store in D1 + Vectorize
    const vectors: VectorizeVector[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `${docId}::${i}`;

      // D1: store text + metadata
      await this.d1.prepare(
        'INSERT OR REPLACE INTO chunks (id, doc_id, chunk_index, text, metadata, namespace) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(chunkId, docId, i, chunks[i], JSON.stringify(metadata), this.namespace).run();

      // Vectorize: store embedding with metadata for filtering
      vectors.push({
        id: chunkId,
        values: embeddings[i],
        metadata: { ...metadata, namespace: this.namespace, doc_id: docId },
      });
    }

    // Batch insert vectors
    await this.vectorize.upsert(vectors);

    return { chunks: chunks.length, docId };
  }

  /**
   * Query: embed question → vector search → fetch chunk text
   */
  async query(question: string, options: QueryOptions = {}): Promise<QueryResult[]> {
    const { topK = 5, filter } = options;

    // Embed the question
    const [questionEmbedding] = await this.embed([question]);

    // Search Vectorize
    const searchFilter: VectorizeVectorMetadataFilter = { namespace: this.namespace };
    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        (searchFilter as any)[key] = value;
      }
    }

    const matches = await this.vectorize.query(questionEmbedding, {
      topK,
      filter: searchFilter,
      returnMetadata: 'all',
    });

    if (!matches.matches?.length) return [];

    // Fetch chunk text from D1
    const ids = matches.matches.map(m => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await this.d1.prepare(
      `SELECT id, text, metadata, chunk_index FROM chunks WHERE id IN (${placeholders})`
    ).bind(...ids).all<{ id: string; text: string; metadata: string; chunk_index: number }>();

    // Map results with scores
    const textMap = new Map(results?.map(r => [r.id, r]) || []);

    return matches.matches
      .map(match => {
        const chunk = textMap.get(match.id);
        if (!chunk) return null;
        return {
          text: chunk.text,
          score: match.score,
          metadata: JSON.parse(chunk.metadata || '{}'),
          chunkIndex: chunk.chunk_index,
        };
      })
      .filter((r): r is QueryResult => r !== null);
  }

  /**
   * Delete all chunks for a document
   */
  async delete(opts: { docId?: string; source?: string }): Promise<void> {
    const docId = opts.docId || opts.source;
    if (!docId) return;

    // Get chunk IDs from D1
    const { results } = await this.d1.prepare(
      'SELECT id FROM chunks WHERE doc_id = ? AND namespace = ?'
    ).bind(docId, this.namespace).all<{ id: string }>();

    if (results?.length) {
      const ids = results.map(r => r.id);
      // Delete from Vectorize
      await this.vectorize.deleteByIds(ids);
      // Delete from D1
      await this.d1.prepare(
        `DELETE FROM chunks WHERE doc_id = ? AND namespace = ?`
      ).bind(docId, this.namespace).run();
    }
  }

  /**
   * Get stats
   */
  async stats(): Promise<{ totalChunks: number; totalDocs: number }> {
    const chunks = await this.d1.prepare(
      'SELECT COUNT(*) as count FROM chunks WHERE namespace = ?'
    ).bind(this.namespace).first<{ count: number }>();
    const docs = await this.d1.prepare(
      'SELECT COUNT(DISTINCT doc_id) as count FROM chunks WHERE namespace = ?'
    ).bind(this.namespace).first<{ count: number }>();

    return { totalChunks: chunks?.count || 0, totalDocs: docs?.count || 0 };
  }

  // ─── Private ──────────────────────────────────────────────────────

  private async embed(texts: string[]): Promise<number[][]> {
    const response = await this.ai.run(this.model as any, { text: texts });
    return (response as any).data;
  }

  private chunk(content: string, strategy: string, maxSize: number, overlap: number): string[] {
    switch (strategy) {
      case 'markdown':
        return this.chunkByMarkdown(content, maxSize);
      case 'paragraph':
        return this.chunkByParagraph(content, maxSize);
      case 'sliding':
      default:
        return this.chunkBySliding(content, maxSize, overlap);
    }
  }

  private chunkByMarkdown(content: string, maxSize: number): string[] {
    // Split by headers (## or ###)
    const sections = content.split(/(?=^#{1,3}\s)/m).filter(s => s.trim());
    const chunks: string[] = [];

    for (const section of sections) {
      if (section.length <= maxSize * 4) { // ~4 chars per token estimate
        chunks.push(section.trim());
      } else {
        // Section too long — split by paragraphs within it
        chunks.push(...this.chunkByParagraph(section, maxSize));
      }
    }

    return chunks.filter(c => c.length > 20); // Skip tiny chunks
  }

  private chunkByParagraph(content: string, maxSize: number): string[] {
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      if ((current + para).length > maxSize * 4) {
        if (current) chunks.push(current.trim());
        current = para;
      } else {
        current += (current ? '\n\n' : '') + para;
      }
    }
    if (current) chunks.push(current.trim());

    return chunks.filter(c => c.length > 20);
  }

  private chunkBySliding(content: string, maxSize: number, overlap: number): string[] {
    const chars = maxSize * 4; // ~4 chars per token
    const chunks: string[] = [];

    for (let i = 0; i < content.length; i += chars - overlap) {
      chunks.push(content.slice(i, i + chars).trim());
      if (i + chars >= content.length) break;
    }

    return chunks.filter(c => c.length > 20);
  }
}
