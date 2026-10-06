"use client";

import { KeyboardEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/types";

type View = "chat" | "compare" | "sources";

const cannedReply = (question: string) => {
  if (/學長|coffee/i.test(question)) return "我會先依你的系所、目標職能與共同經歷，整理適合聯繫的學長姊輪廓。建議先從 3 位低關係距離的人開始，邀請訊息只問一個具體問題，並把訪談控制在 20 分鐘。";
  if (/截止|實習/i.test(question)) return "目前優先處理履歷初稿與 10/18 的實習申請。正式版會同步企業官網、臺大職涯中心與公開社群，並在截止日前 14、7、2 天提醒你。";
  return "我已把問題拆成「必要條件、可選路徑、最近一步」三層。先完成一個 30 分鐘內能開始的動作，再依結果更新時間線，會比一次規劃完整學期更可靠。";
};

export function ChatPanel({ title, onTitleChange, addPlan, notify }: { title: string; onTitleChange: (title: string) => void; addPlan: (title: string) => void; notify: (message: string) => void }) {
  const [view, setView] = useState<View>("chat");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const quickPrompts = ["哪些實習快截止？", "幫我比較三條路線", "幫我找適合 coffee chat 的學長姊"];
  const busy = useMemo(() => messages.some((message) => message.pending), [messages]);

  function send() {
    const question = prompt.trim();
    if (!question || busy) return;
    const pendingId = `assistant-${Date.now()}`;
    setMessages((items) => [...items, { id: `user-${Date.now()}`, role: "user", content: question }, { id: pendingId, role: "assistant", content: "", pending: true }]);
    setPrompt(""); setView("chat");
    window.setTimeout(() => setMessages((items) => items.map((message) => message.id === pendingId ? { ...message, content: cannedReply(question), pending: false } : message)), 700);
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[var(--bg)]">
      <header className="border-b border-[var(--line)] px-5 pt-5">
        <div className="flex items-start justify-between gap-4"><div><h1 className="text-lg font-semibold tracking-[-.03em] md:text-xl">{title}</h1><p className="mt-1 text-xs text-[var(--muted)]">依你的背景、截止日與公開資料即時整理</p></div><Button onClick={() => { setPrompt(""); notify("告訴我你現在最想解決的問題"); }}>新規劃</Button></div>
        <nav className="mt-5 flex gap-5" aria-label="內容分頁">{([['chat', 'AI 對話'], ['compare', '方案比較'], ['sources', '資料來源 12']] as Array<[View, string]>).map(([key, label]) => <button key={key} className={cn("border-b-2 pb-3 text-xs font-semibold", view === key ? "border-[var(--paper)] text-[var(--text)]" : "border-transparent text-[var(--muted)]")} onClick={() => setView(key)}>{label}</button>)}</nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-7">
        {view === "chat" && <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex justify-end"><div className="max-w-[82%] bg-[var(--paper)] px-4 py-3 text-sm leading-6 text-[var(--paper-ink)]">我是資管系大三，想找資料分析實習，但也在考慮申請台大資管所。可以幫我規劃接下來半年嗎？</div></div>
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[.14em] text-[var(--muted)]">PATH COACH · ANALYZED 12 SOURCES</div>
            <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--soft)]"><p>可以。依你的背景，我會建議先走<strong className="text-[var(--text)]">「實習優先、研究所選項保留」</strong>：兩條路前 8 週需要的準備高度重疊，先補齊履歷、專題證據與推薦人關係，再在 12 月依結果決定比重。</p><p>你目前最大的槓桿不是再修更多課，而是把課堂能力變成可被看見的成果：一份 2 頁內的分析專題、可讀的 GitHub README，以及能說清楚問題與決策的履歷。</p></div>
            <div className="mt-4 flex flex-wrap gap-2">{["01 臺大教務處", "02 資管所招生簡章", "03 NTU Career", "+9 公開來源"].map((source) => <span key={source} className="border border-[var(--line)] px-2 py-1 text-[9px] text-[var(--muted)]">{source}</span>)}</div>
          </div>
          <div className="flex items-end justify-between border-t border-[var(--line)] pt-5"><h3 className="font-semibold">三條可行路線</h3><span className="text-[10px] text-[var(--muted)]">已依你的時間與偏好排序</span></div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["BEST FIT · 86%", "雙軌並行", "先共用準備，12 月再根據實習面試與研究興趣分流。", "雙軌準備：完成作品集與推薦人清單"],
              ["SCENARIO B", "實習優先", "集中投遞 8–12 間公司，用實務經驗確認職涯方向。", "實習優先：建立 12 間公司投遞清單"],
              ["SCENARIO C", "研究優先", "提前進實驗室，建立研究問題與推薦信基礎。", "研究優先：聯繫 3 位潛在指導教授"],
            ].map(([kicker, heading, copy, plan], index) => <article key={heading} className={`border p-4 ${index === 0 ? "border-[var(--paper)] bg-[var(--paper)] text-[var(--paper-ink)]" : "border-[var(--line)] bg-[var(--panel)]"}`}><div className={`font-mono text-[9px] tracking-[.14em] ${index === 0 ? "text-[#555]" : "text-[var(--muted)]"}`}>{kicker}</div><h4 className="mt-2 font-semibold">{heading}</h4><p className={`my-3 text-xs leading-5 ${index === 0 ? "text-[#555]" : "text-[var(--muted)]"}`}>{copy}</p><button className={`border px-2 py-1.5 text-[10px] font-semibold ${index === 0 ? "border-[#333]" : "border-[var(--line-strong)]"}`} onClick={() => addPlan(plan)}>加入我的計畫</button></article>)}
          </div>
          <div className="border-t border-[var(--line)] pt-5"><h3 className="font-semibold">建議時間線</h3><div className="mt-3">{[["OCT", "整理定位與申請素材", "履歷初稿、LinkedIn、專題敘事、目標清單"], ["NOV", "密集投遞與資訊訪談", "每週 2–3 份客製申請；完成 2 次 coffee chat"], ["DEC", "依回饋調整路線", "檢視面試轉換率，決定寒假研究投入比重"], ["JAN–MAR", "補強作品與研究準備", "完成可公開作品；建立推薦信與讀書計畫素材庫"]].map(([time, heading, copy]) => <div key={time} className="grid grid-cols-[70px_1fr] gap-3 border-t border-[var(--line)] py-3"><time className="font-mono text-[10px] text-[var(--muted)]">{time}</time><div><b className="block text-xs">{heading}</b><span className="text-[10px] text-[var(--muted)]">{copy}</span></div></div>)}</div></div>
          {messages.map((message) => message.role === "user" ? <div key={message.id} className="flex justify-end animate-rise"><div className="max-w-[82%] bg-[var(--paper)] px-4 py-3 text-sm leading-6 text-[var(--paper-ink)]">{message.content}</div></div> : <div key={message.id} className="animate-rise"><div className="font-mono text-[9px] tracking-[.14em] text-[var(--muted)]">PATH COACH · {message.pending ? "SEARCHING" : "PERSONALIZED"}</div>{message.pending ? <div className="mt-3 flex gap-1"><span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--soft)]" /><span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--soft)]" /><span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--soft)]" /></div> : <p className="mt-3 text-sm leading-7 text-[var(--soft)]">{message.content}</p>}</div>)}
        </div>}

        {view === "compare" && <div className="mx-auto max-w-4xl animate-rise"><div className="font-mono text-[9px] tracking-[.14em] text-[var(--muted)]">SCENARIO MATRIX</div><p className="my-4 text-sm leading-7 text-[var(--soft)]">三個方案都可行，差別在於你願意多早做出取捨。以你目前的資訊來看，雙軌的選項價值最高。</p><div className="grid grid-cols-3 border-t border-l border-[var(--line)]">{["評估面向", "實習優先", "雙軌並行", "每週投入", "8–10 小時", "10–12 小時", "保留彈性", "中", "高", "適合情境", "想快速驗證職涯", "尚未確定升學或就業", "主要風險", "錯過研究準備窗口", "時間分散、需嚴格排序"].map((cell, index) => <div key={`${cell}-${index}`} className={`border-r border-b border-[var(--line)] p-3 text-xs ${index < 3 ? "bg-[var(--panel-2)] font-semibold" : "text-[var(--soft)]"}`}>{cell}</div>)}</div><Button variant="primary" className="mt-4" onClick={() => addPlan("雙軌準備：設定每週 10 小時固定時段")}>採用雙軌並行</Button></div>}

        {view === "sources" && <div className="mx-auto max-w-4xl space-y-3 animate-rise"><div className="font-mono text-[9px] tracking-[.14em] text-[var(--muted)]">SOURCE CABINET · 12 ITEMS</div>{[["臺大 115 學年度碩士班甄試招生簡章", "包含重要日程、報名資格、繳交資料與各系所規定。規劃研究所申請時應以最新公告為準。", "官方網站 · 3 小時前檢查"], ["臺大職涯中心｜實習與職缺", "彙整校園徵才、企業說明會與部分實習職缺，可搭配公司官網交叉確認截止日。", "官方網站 · 2 小時前檢查"], ["資管系學會 × 校友職涯分享", "近期公開活動與經驗分享，適合尋找 coffee chat 對象與產業探索線索。", "公開社群 · 昨天檢查"], ["企業實習頁面合輯", "依職能標籤整理資料分析、產品與軟體相關職缺。送出申請前請回到企業官網確認。", "公開網頁 · 今天檢查"]].map(([heading, copy, meta]) => <article key={heading} className="border border-[var(--line)] bg-[var(--panel)] p-4"><h3 className="text-sm font-semibold">{heading}</h3><p className="my-2 text-xs leading-6 text-[var(--muted)]">{copy}</p><div className="font-mono text-[9px] text-[var(--muted)]">{meta}</div></article>)}</div>}
      </div>

      <div className="border-t border-[var(--line)] bg-[var(--panel)] p-3 md:p-4"><div className="mx-auto max-w-4xl border border-[var(--line-strong)] bg-[var(--bg)] p-3"><textarea className="min-h-14 w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={handleKey} placeholder="問選課、實習、研究所、社團或找學長姊…" /><div className="mt-2 flex items-end justify-between gap-3"><div className="hidden flex-wrap gap-1.5 md:flex">{quickPrompts.map((item, index) => <button key={item} className="border border-[var(--line)] px-2 py-1 text-[9px] text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setPrompt(item)}>{["快截止的實習", "比較三條路線", "找學長姊"][index]}</button>)}</div><button className="grid h-9 w-9 shrink-0 place-items-center bg-[var(--paper)] font-bold text-[var(--paper-ink)] disabled:opacity-40" onClick={send} disabled={!prompt.trim() || busy} aria-label="送出">↑</button></div></div></div>
    </section>
  );
}
