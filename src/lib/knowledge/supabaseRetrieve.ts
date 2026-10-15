import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

type ActiveDocument = {
  artifact_id: string;
  title: string;
  summary: string;
  source_url: string;
};

type ChunkRow = {
  chunk_id: string;
  artifact_id: string;
  rule_id: string | null;
  content: string;
  metadata: JsonRecord | null;
  knowledge_documents: ActiveDocument | ActiveDocument[];
};

const FETCH_LIMIT = 200;
const PASSAGE_LIMIT = 8;
const CHARACTER_LIMIT = 12_000;

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function searchUnits(value: string): Set<string> {
  const normalized = normalize(value);
  const units = new Set<string>();

  for (const token of normalized.match(/[a-z0-9][a-z0-9._+-]*/g) ?? []) {
    if (token.length >= 2) units.add(token);
  }

  const chinese = normalized.replace(/[^\p{Script=Han}]/gu, "");
  for (let index = 0; index < chinese.length - 1; index += 1) {
    units.add(chinese.slice(index, index + 2));
  }

  return units;
}

function oneDocument(value: ChunkRow["knowledge_documents"]): ActiveDocument | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function scoreChunk(row: ChunkRow, message: string, queryUnits: Set<string>): number {
  const document = oneDocument(row.knowledge_documents);
  const haystack = normalize(`${document?.title ?? ""}\n${document?.summary ?? ""}\n${row.content}`);
  const normalizedMessage = normalize(message);
  let score = normalizedMessage.length >= 2 && haystack.includes(normalizedMessage) ? 20 : 0;

  for (const unit of queryUnits) {
    if (haystack.includes(unit)) score += unit.length > 2 ? 3 : 1;
  }

  if (row.metadata?.kind === "document_summary") score += 0.25;
  return score;
}

export type SupabaseKnowledgeContext = {
  supplied_passages: number;
  total_available_chunks: number | null;
  selection_note: string;
  passages: Array<{
    source_id: string;
    chunk_id: string;
    artifact_id: string;
    rule_id: string | null;
    title: string;
    source_url: string;
    text: string;
    evidence: unknown;
  }>;
};

export async function retrieveSupabaseKnowledge(
  supabase: SupabaseClient,
  message: string,
): Promise<SupabaseKnowledgeContext> {
  const { data, error, count } = await supabase
    .from("coach_chunks")
    .select(
      `
        chunk_id,
        artifact_id,
        rule_id,
        content,
        metadata,
        knowledge_documents!inner (
          artifact_id,
          title,
          summary,
          source_url
        )
      `,
      { count: "exact" },
    )
    .eq("knowledge_documents.admission_status", "AUTO_ACCEPTED")
    .eq("knowledge_documents.database_allowed", true)
    .eq("knowledge_documents.coach_allowed", true)
    .is("knowledge_documents.retired_at", null)
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) {
    throw new Error(`Supabase knowledge query failed: ${error.code}`);
  }

  const rows = (data ?? []) as unknown as ChunkRow[];
  const queryUnits = searchUnits(message);
  const ranked = rows
    .map((row) => ({ row, score: scoreChunk(row, message, queryUnits) }))
    .sort((left, right) => right.score - left.score);

  const positive = ranked.filter((item) => item.score > 0);
  const summaries = ranked.filter(
    (item) => item.row.metadata?.kind === "document_summary",
  );
  const candidates = positive.length > 0 ? positive : summaries;
  const selected: ChunkRow[] = [];
  let characters = 0;

  for (const { row } of candidates) {
    if (selected.length >= PASSAGE_LIMIT) break;
    if (characters + row.content.length > CHARACTER_LIMIT) continue;
    selected.push(row);
    characters += row.content.length;
  }

  return {
    supplied_passages: selected.length,
    total_available_chunks: count,
    selection_note:
      positive.length > 0
        ? "從 Supabase 中已通過 Research 且允許 Coach 使用的資料，依文字相關性選取段落。"
        : "找不到明顯文字重疊；僅提供少量已核准文件摘要作為背景，不代表其中必有答案。",
    passages: selected.map((row, index) => {
      const document = oneDocument(row.knowledge_documents);
      if (!document) throw new Error("Knowledge chunk is missing its active document");
      return {
        source_id: `校務${index + 1}`,
        chunk_id: row.chunk_id,
        artifact_id: row.artifact_id,
        rule_id: row.rule_id,
        title: document.title,
        source_url: document.source_url,
        text: row.content,
        evidence: row.metadata?.evidence ?? null,
      };
    }),
  };
}
