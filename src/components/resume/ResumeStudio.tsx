"use client";

import { ChangeEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FeatureHeader } from "@/components/ui/FeatureHeader";
import { Field, inputClass, Modal } from "@/components/ui/Modal";
import { defaultResumeData } from "@/lib/data";
import { usePersistentState } from "@/lib/storage";
import type { ResumeData, ResumeSectionType } from "@/lib/types";
import { ResumePreview } from "./ResumePreview";
import { ResumeSectionEditor } from "./ResumeSectionEditor";

export function ResumeStudio({ notify }: { notify: (message: string) => void }) {
  const [resume, setResume] = usePersistentState<ResumeData>("next-ntu-resume", defaultResumeData);
  const [fileName, setFileName] = useState("上傳現有履歷");
  const [sectionModal, setSectionModal] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionType, setSectionType] = useState<ResumeSectionType>("experience");
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function updateProfile(key: keyof ResumeData["profile"], value: string) {
    setResume((current) => ({ ...current, profile: { ...current.profile, [key]: value } }));
  }

  function fileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name); notify("檔案已載入，可開始 AI 判讀");
  }

  function analyze() {
    setAnalyzing(true);
    window.setTimeout(() => { setResume(defaultResumeData); setAnalyzing(false); notify("已拆成 5 個區塊與多筆可編輯資料"); }, 800);
  }

  function addSection() {
    if (!sectionTitle.trim()) return notify("請輸入區塊標題");
    setResume((current) => ({ ...current, sections: [...current.sections, { id: `section-${Date.now()}`, title: sectionTitle.trim(), type: sectionType, entries: [{ organization: "", location: "", role: "", startDate: "", endDate: "", description: "" }] }] }));
    setSectionModal(false); setSectionTitle(""); notify(`已新增 ${sectionTitle.trim()}`);
  }

  const exportPdf = () => { notify("正在開啟列印／PDF 匯出"); window.setTimeout(() => window.print(), 150); };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)]">
      <FeatureHeader eyebrow="AI RESUME STUDIO" title="修履歷" description="上傳、拆解、改寫，再重新組成一份乾淨可投遞的履歷。" actions={<Button variant="primary" onClick={exportPdf}>匯出 PDF</Button>} />
      <div className="grid xl:grid-cols-[minmax(520px,.95fr)_minmax(600px,1.05fr)]">
        <section className="space-y-4 border-b border-[var(--line)] p-4 md:p-6 xl:border-r xl:border-b-0">
          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <div className="flex flex-col justify-between gap-4 border border-[var(--line)] bg-[var(--panel)] p-4 sm:flex-row sm:items-center"><div><h2 className="text-sm font-semibold">{fileName}</h2><p className="mt-1 text-[10px] text-[var(--muted)]">支援 PDF、DOCX、PPTX；載入後建立可編輯草稿。</p></div><div className="flex gap-2"><input ref={fileRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.pptx" onChange={fileSelected} /><Button onClick={() => fileRef.current?.click()}>選擇檔案</Button><Button variant="primary" onClick={analyze} disabled={analyzing}>{analyzing ? "判讀中…" : "AI 判讀"}</Button></div></div>
            <button className="grid place-items-center border border-dashed border-[var(--line-strong)] bg-[var(--panel)] p-4 text-sm font-semibold hover:border-[var(--paper)]" onClick={() => setSectionModal(true)}><span className="text-2xl">＋</span>新增區塊<small className="font-normal text-[9px] text-[var(--muted)]">自訂標題與欄位類型</small></button>
          </div>

          <section className="border border-[var(--line)] bg-[var(--panel)]">
            <header className="border-b border-[var(--line)] p-3"><strong className="text-sm">個人資料</strong></header>
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              {([['fullName', '英文姓名', 'Yun Chien, Lu'], ['cityCountry', '城市／國家', 'New Taipei City, Taiwan'], ['phone', '電話', '0958-xxx-xxx'], ['email', 'Email', 'name@gmail.com'], ['linkedIn', 'LinkedIn／作品集（選填）', 'linkedin.com/in/yourname']] as Array<[keyof ResumeData['profile'], string, string]>).map(([key, label, placeholder]) => <label key={key} className={`grid gap-1 text-[10px] text-[var(--muted)] ${key === "linkedIn" ? "sm:col-span-2" : ""}`}>{label}<input className={inputClass} value={resume.profile[key]} onChange={(event) => updateProfile(key, event.target.value)} placeholder={placeholder} /></label>)}
            </div>
          </section>

          {resume.sections.map((section, index) => <ResumeSectionEditor key={section.id} section={section} index={index} onChange={(next) => setResume((current) => ({ ...current, sections: current.sections.map((item) => item.id === section.id ? next : item) }))} onDelete={() => setResume((current) => ({ ...current, sections: current.sections.filter((item) => item.id !== section.id) }))} onMoveUp={() => setResume((current) => { if (index === 0) return current; const sections = [...current.sections]; [sections[index - 1], sections[index]] = [sections[index], sections[index - 1]]; return { ...current, sections }; })} />)}
        </section>

        <aside className="bg-[#202020] p-4 md:p-6">
          <div className="mb-4 flex flex-col gap-3 text-[var(--text)] sm:flex-row sm:items-center sm:justify-between"><span className="font-mono text-[9px] text-[#aaa]">A4 · REFERENCE FORMAT · TIMES NEW ROMAN 11 PT</span><div className="flex gap-2"><Button onClick={() => { setResume(defaultResumeData); notify("已還原附件版式的示範履歷"); }}>重設</Button><Button variant="primary" onClick={exportPdf}>匯出 PDF</Button></div></div>
          <ResumePreview resume={resume} />
        </aside>
      </div>

      <Modal open={sectionModal} title="新增履歷區塊" onClose={() => setSectionModal(false)} footer={<><Button onClick={() => setSectionModal(false)}>取消</Button><Button variant="primary" onClick={addSection}>新增區塊</Button></>}>
        <Field label="區塊標題"><input className={inputClass} value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} placeholder="例如：Research Experience" /></Field>
        <Field label="欄位類型"><select className={inputClass} value={sectionType} onChange={(event) => setSectionType(event.target.value as ResumeSectionType)}><option value="experience">經歷（機構、職稱、日期、內容）</option><option value="education">教育（學校、學位、日期、內容）</option><option value="skills">簡短項目（分類、內容）</option></select></Field>
      </Modal>
    </main>
  );
}
