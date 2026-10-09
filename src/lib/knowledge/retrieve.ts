import "server-only";

export type KnowledgeScope = { department?: string; admissionYear?: number };
type RecordValue = Record<string, unknown>;
type Course = RecordValue & { name: string; year: string | null; semester: string | null;
  credits: number | null; requirement: string; group: string | null };
type Document = { document_id: string; source_url: string; title: string; department: string | null;
  applicable_year_text: string | null; admission_year_start: string | null; admission_year_end: string | null;
  courses: Course[]; rules: RecordValue[]; human_confirmations: RecordValue[] };
type Chunk = { chunk_id: string; document_id: string; page: number | null; content: string; vector: number[] };
export type ParsedKnowledge = { revision: string; model: string; dimensions: number; documents: Document[]; chunks: Chunk[] };

function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("知識庫物件格式錯誤");
  return value as RecordValue;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("知識庫文字欄位缺失");
  return value;
}
function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return string(value);
}
function records(value: unknown): RecordValue[] {
  if (!Array.isArray(value)) throw new Error("知識庫清單格式錯誤");
  return value.map(record);
}
export function parseKnowledge(rawKnowledge: unknown, rawRag: unknown): ParsedKnowledge {
  const knowledge = record(rawKnowledge), rag = record(rawRag);
  if (knowledge.schema_version !== 1 || rag.schema_version !== 1) throw new Error("知識庫版本不支援");
  const revision = string(knowledge.snapshot_revision);
  if (revision !== rag.snapshot_revision) throw new Error("規則檔與向量檔版本不同，請一起更新");
  const dimensions = rag.dimensions;
  if (dimensions !== 1536) throw new Error("向量維度不支援");
  const documents: Document[] = records(knowledge.documents).map(doc => ({
    document_id: string(doc.document_id), source_url: string(doc.source_url), title: string(doc.title),
    department: nullableString(doc.department), applicable_year_text: nullableString(doc.applicable_year_text),
    admission_year_start: nullableString(doc.admission_year_start), admission_year_end: nullableString(doc.admission_year_end),
    courses: records(doc.courses).map(course => {
      if (course.credits !== null && (typeof course.credits !== "number" || !Number.isFinite(course.credits) || course.credits < 0))
        throw new Error("課程學分格式錯誤");
      return { ...course, name: string(course.name), year: nullableString(course.year), semester: nullableString(course.semester),
        credits: course.credits as number | null, requirement: string(course.requirement), group: nullableString(course.group) };
    }), rules: records(doc.rules), human_confirmations: records(doc.human_confirmations ?? []),
  }));
  const ids = new Set(documents.map(doc => doc.document_id));
  if (ids.size !== documents.length) throw new Error("文件ID重複");
  const chunks: Chunk[] = records(rag.chunks).map(chunk => {
    if (!Array.isArray(chunk.vector) || chunk.vector.length !== dimensions ||
      chunk.vector.some(n => typeof n !== "number" || !Number.isFinite(n))) throw new Error("向量格式錯誤");
    const documentId = string(chunk.document_id);
    if (!ids.has(documentId)) throw new Error("向量缺少對應規則文件");
    if (chunk.page !== null && (typeof chunk.page !== "number" || !Number.isInteger(chunk.page) || chunk.page < 1))
      throw new Error("來源頁碼格式錯誤");
    return { chunk_id: string(chunk.chunk_id), document_id: documentId, page: chunk.page as number | null,
      content: string(chunk.content), vector: chunk.vector as number[] };
  });
  return { revision, model: string(rag.embedding_model), dimensions, documents, chunks };
}

export function normalizeQuery(value: string): string {
  const digits: Record<string, string> = { 一: "1", 二: "2", 三: "3", 四: "4" };
  return value.normalize("NFKC").replace(/微積分([一二三四])/g, (_, n: string) => "微積分" + digits[n])
    .replace(/\s+/g, "").toLowerCase();
}
export function needsKnowledge(message: string): boolean {
  return /畢業|學分|微積分|必修|選修|系選|通識|免修|體育|選課|服務課|群組|進階英語|財金系|財務金融學系|課程規定/.test(message);
}
function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] ** 2; normB += b[i] ** 2; }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}
function inScope(doc: Document, scope: KnowledgeScope): boolean {
  if (scope.department && normalizeQuery(doc.department ?? "") !== normalizeQuery(scope.department)) return false;
  if (scope.admissionYear !== undefined) {
    const start = doc.admission_year_start ? Number(doc.admission_year_start) : null;
    const end = doc.admission_year_end ? Number(doc.admission_year_end) : null;
    if (start === null || !Number.isFinite(start) || scope.admissionYear < start) return false;
    if (end !== null && (!Number.isFinite(end) || scope.admissionYear > end)) return false;
  }
  return true;
}
export function selectKnowledge(data: ParsedKnowledge, query: number[], message: string, scope: KnowledgeScope = {}) {
  if (query.length !== data.dimensions || query.some(n => !Number.isFinite(n)) || !query.some(n => n !== 0))
    throw new Error("查詢向量格式錯誤");
  const normalized = normalizeQuery(message);
  const scoped = data.documents.filter(doc => inScope(doc, scope));
  const docs = new Map(scoped.map(doc => [doc.document_id, doc]));
  const scored = data.chunks.filter(chunk => docs.has(chunk.document_id)).map(chunk => {
    const courseName = chunk.content.match(/^課名：([^\n]+)/m)?.[1];
    const nameMatch = courseName ? normalized.includes(normalizeQuery(courseName)) : false;
    const similarity = cosine(query, chunk.vector);
    return { chunk, similarity, score: similarity + (nameMatch ? 1 : 0), nameMatch };
  }).filter(hit => hit.nameMatch || hit.similarity >= 0.2).sort((a,b) => b.score-a.score);
  const chosen: typeof scored = [];
  let characters = 0;
  const seen = new Set<string>();
  for (const hit of scored) {
    if (chosen.length >= 6) break;
    if (seen.has(hit.chunk.content) || characters + hit.chunk.content.length > 12000) continue;
    chosen.push(hit); characters += hit.chunk.content.length; seen.add(hit.chunk.content);
  }
  const referenced = [...new Set(chosen.map(hit => hit.chunk.document_id))].map(id => docs.get(id)!);
  // Exact structured facts supplement retrieved passages. Human confirmation is
  // field-specific and does not turn unknown credits into zero or certify a PDF.
  return {
    snapshot_revision: data.revision, supplied_passages: chosen.length,
    selection_note: "向量搜尋相關段落，並附相同文件的結構化課程及規則；未宣稱資料為校方最新版本。",
    passages: chosen.map((hit, i) => ({ source_id: `校務${i+1}`, document_id: hit.chunk.document_id,
      title: docs.get(hit.chunk.document_id)!.title, source_url: docs.get(hit.chunk.document_id)!.source_url,
      page: hit.chunk.page, text: hit.chunk.content })),
    documents: referenced.map(doc => ({ document_id: doc.document_id, title: doc.title,
      source_url: doc.source_url, department: doc.department, applicable_year_text: doc.applicable_year_text,
      courses: doc.courses.map(course => ({ name: course.name, year: course.year, semester: course.semester,
        credits: course.credits, requirement: course.requirement, group: course.group,
        human_confirmations: doc.human_confirmations.filter(c => {
          const target = c.target as RecordValue | undefined;
          return c.target_type === "course" && target?.name === course.name && target?.year === course.year && target?.semester === course.semester;
        }) })),
      rules: doc.rules.map(rule => ({ title: rule.title, rule_type: rule.rule_type, statement: rule.statement,
        group: rule.group, courses: rule.courses, choose_count: rule.choose_count,
        evidence_pages: [...new Set(records(rule.evidence).map(e => e.page))] })),
      human_confirmations: doc.human_confirmations,
    })),
  };
}
