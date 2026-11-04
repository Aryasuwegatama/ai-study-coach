-- Enables pgvector so later migrations can declare `vector(768)` columns
-- for chunk embeddings (PRD Section 4, "Database connection").
CREATE EXTENSION IF NOT EXISTS vector;
