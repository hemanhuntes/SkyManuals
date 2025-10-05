# ADR-001: PostgreSQL with pgvector for Semantic Search

## Status
Accepted

## Context
SkyManuals needs comprehensive semantic search across aviation documentation including:
- Aircraft Flight Manuals (AFM)
- Minimum Equipment Lists (MMEL) 
- Standard Operating Procedures (SOPs)
- Maintenance manuals and service bulletins
- Emergency procedures and checklists

The search system must handle:
- Multi-language aviation terminology
- Technical jargon and abbreviations
- Regulatory compliance requirements
- High-confidentiality flight operations data
- Strict data sovereignty requirements

## Decision
Use PostgreSQL with pgvector extension for vector similarity search instead of external vector databases.

## Consequences

### Positive
- **Single database architecture**: Both relational and vector data in one system
- **ACID compliance**: Full transactional consistency for regulatory requirements
- **Data sovereignty**: All data remains within customer infrastructure
- **Proven reliability**: PostgreSQL is battle-tested in production aviation systems
- **Cost efficiency**: No additional SaaS charges for vector operations
- **Backup integration**: Vector embeddings included in existing backup procedures
- **Query flexibility**: Combine vector search with SQL joins and filters

### Negative
- **PostgreSQL dependency**: Locked into PostgreSQL ecosystem for vector operations
- **Scaling limitations**: Vector operations are more CPU-intensive than traditional queries
- **Embedding storage**: Additional storage overhead for vector dimensions
- **Query complexity**: More complex indexing strategies required

## Alternatives Considered

### Pinecone (SaaS Vector Database)
**Rejected because:**
- Data sovereignty concerns for aviation customers
- Continuous SaaS costs per vector operation
- Limited customer network isolation options
- Compliance validation challenges for regulated industries

### Elasticsearch with Dense Vector Plugin
**Rejected because:**
- Additional infrastructure complexity
- Separate backup and disaster recovery procedures
- Elasticsearch security model less mature than PostgreSQL
- Higher operational overhead for aviation customers

### Weaviate
**Rejected because:**
- Immature for aviation use cases (limited production track record)
- Smaller community and support ecosystem
- Limited SQL integration capabilities
- Unknown regulatory compliance posture

### Chroma
**Rejected because:**
- Too early-stage for production aviation systems
- Limited enterprise features and support
- Unknown security and compliance capabilities

## Implementation Details

### Vector Configuration
```sql
-- pgvector extension setup
CREATE EXTENSION IF NOT EXISTS vector;

-- Aviation document embedding table
CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  chunk_id TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL, -- SHA-256 for integrity
  embedding VECTOR(1536), -- OpenAI text-embedding-ada-002 dimensions
  metadata JSONB, -- Document type, aircraft model, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Aviation-optimized indexes
CREATE INDEX idx_document_embeddings_document_id ON document_embeddings(document_id);
CREATE INDEX idx_document_embeddings_embedding_cosine 
ON document_embeddings USING ivfflat (embedding vector_cosine_ops)  
WITH (lists = 100);

-- Hierarchical navigable small worlds for better performance
CREATE INDEX idx_document_embeddings_hsnw
ON document_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

### Query Performance Optimization
```sql
-- Aviation-specific similarity search with filters
SELECT 
  d.title,
  d.document_type,
  d.regulatory_framework,
  1 - (de.embedding <=> $1) AS similarity_score
FROM document_embeddings de
JOIN documents d ON de.document_id = d.id
WHERE 
  d.status = 'APPROVED'
  AND d.regulatory_framework = ANY($2::text[]) -- EASA/FAA filters
  AND d.organization_id = $3
ORDER BY de.embedding <=> $1
LIMIT 25;
```

### Data Retention Strategy
- Vector embeddings follow same 7-year retention as source documents
- Automatic cleanup when source documents are archived
- Cryptographically verified deletion for regulatory compliance

## Aviation-Specific Considerations

### Security Requirements
- All embeddings encrypted at rest using AES-256
- Vector similarity queries logged for security audit
- IP address restriction for vector similarity endpoints
- Role-based access control for embedding generation

### Regulatory Compliance  
- Embeddings treated as aviation data subject to EASA/FAA requirements
- Complete audit trail for embedding generation and updates
- Version control for embedding model changes
- Export capabilities for regulatory inspection

### Performance Targets
- Vector similarity query: P95 < 500ms response time
- Embedding generation: Batch processing for full document indexing
- Storage overhead: <50% additional storage vs source documents
- Query throughput: Support 100+ concurrent searches

## Migration Path
1. **Phase 1**: Basic pgvector setup with existing PostgreSQL
2. **Phase 2**: Embedding generation pipeline for pilot documents  
3. **Phase 3**: Advanced similarity search with aviation filters
4. **Phase 4**: Real-time embedding updates during document changes

## Monitoring
- Query performance metrics (latency, throughput)
- Embedding storage growth trends
- Vector index efficiency scores
- Search result quality metrics

This decision provides the best balance of regulatory compliance, operational simplicity, and aviation-specific requirements while maintaining the flexibility to scale with customer needs.






