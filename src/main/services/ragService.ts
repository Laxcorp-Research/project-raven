import { readFileSync } from 'fs';
import { extname } from 'path';
import { databaseService } from './database';

let pipeline: any = null;
let embeddingModel: any = null;

async function getEmbeddingPipeline() {
  if (embeddingModel) return embeddingModel;

  if (!pipeline) {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
  }

  console.log('[RAG] Loading embedding model (first time may download ~30MB)...');
  embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('[RAG] Embedding model loaded');
  return embeddingModel;
}

// ==================== FILE PARSING ====================

async function parseFile(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.txt':
    case '.md': {
      return readFileSync(filePath, 'utf-8');
    }
    case '.pdf': {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text;
    }
    case '.docx': {
      const mammoth = await import('mammoth');
      const buffer = readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

// ==================== CHUNKING ====================

function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= chunkSize) return [words.join(' ')];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end >= words.length) break;
    start += chunkSize - overlap;
  }

  return chunks;
}

// ==================== EMBEDDING ====================

async function embedText(text: string): Promise<number[]> {
  const model = await getEmbeddingPipeline();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

async function embedChunks(
  chunks: string[],
  onProgress?: (current: number, total: number) => void
): Promise<number[][]> {
  const model = await getEmbeddingPipeline();
  const embeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i++) {
    const output = await model(chunks[i], { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data as Float32Array));
    onProgress?.(i + 1, chunks.length);
  }

  return embeddings;
}

// ==================== COSINE SIMILARITY ====================

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ==================== PUBLIC API ====================

export interface ContextFile {
  id: string;
  modeId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkCount: number;
  createdAt: number;
}

export async function uploadContextFile(
  modeId: string,
  filePath: string,
  fileName: string,
  fileSize: number,
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<ContextFile> {
  onProgress?.('parsing', 0, 1);
  const text = await parseFile(filePath);

  if (!text.trim()) {
    throw new Error('File contains no extractable text');
  }

  onProgress?.('chunking', 0, 1);
  const chunks = chunkText(text);

  if (chunks.length === 0) {
    throw new Error('File produced no chunks');
  }

  onProgress?.('embedding', 0, chunks.length);
  const embeddings = await embedChunks(chunks, (current, total) => {
    onProgress?.('embedding', current, total);
  });

  const fileId = globalThis.crypto.randomUUID();
  const ext = extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  onProgress?.('storing', 0, chunks.length);

  databaseService.insertContextFile({
    id: fileId,
    modeId,
    fileName,
    fileSize,
    fileType: mimeMap[ext] || 'text/plain',
    chunkCount: chunks.length,
  });

  for (let i = 0; i < chunks.length; i++) {
    databaseService.insertContextChunk({
      id: globalThis.crypto.randomUUID(),
      modeId,
      fileId,
      fileName,
      chunkIndex: i,
      chunkText: chunks[i],
      embeddingJson: JSON.stringify(embeddings[i]),
    });
    onProgress?.('storing', i + 1, chunks.length);
  }

  console.log(`[RAG] Stored ${chunks.length} chunks for file "${fileName}" in mode ${modeId}`);

  return {
    id: fileId,
    modeId,
    fileName,
    fileSize,
    fileType: mimeMap[ext] || 'text/plain',
    chunkCount: chunks.length,
    createdAt: Date.now(),
  };
}

export function getContextFiles(modeId: string): ContextFile[] {
  return databaseService.getContextFiles(modeId);
}

export function deleteContextFile(fileId: string): boolean {
  return databaseService.deleteContextFile(fileId);
}

export async function retrieveRelevantChunks(
  modeId: string,
  query: string,
  topK = 5
): Promise<Array<{ chunkText: string; fileName: string; score: number }>> {
  const allChunks = databaseService.getContextChunks(modeId);
  if (allChunks.length === 0) return [];

  const queryEmbedding = await embedText(query);

  const scored = allChunks.map((chunk) => {
    const embedding = JSON.parse(chunk.embeddingJson) as number[];
    const score = cosineSimilarity(queryEmbedding, embedding);
    return {
      chunkText: chunk.chunkText,
      fileName: chunk.fileName,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const maxTokens = 3000;
  const results: typeof scored = [];
  let tokenCount = 0;

  for (const item of scored.slice(0, topK)) {
    const approxTokens = item.chunkText.split(/\s+/).length;
    if (tokenCount + approxTokens > maxTokens) break;
    results.push(item);
    tokenCount += approxTokens;
  }

  return results;
}
