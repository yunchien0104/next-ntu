"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FeatureHeader } from "@/components/ui/FeatureHeader";
import { initialPosts } from "@/lib/data";
import { cn } from "@/lib/cn";
import type { Post } from "@/lib/types";

const categories = [
  ["all", "全部文章", "24"],
  ["course", "選課與學習", "08"],
  ["career", "實習與求職", "11"],
  ["graduate", "研究所", "06"],
  ["community", "社團與校園", "09"],
  ["abroad", "交換與海外", "05"],
  ["life", "生涯探索", "12"],
];

export function ColumnsPage({ notify }: { notify: (message: string) => void }) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [category, setCategory] = useState("all");
  const [bookmarksOnly, setBookmarksOnly] = useState(false);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const visiblePosts = useMemo(() => posts.filter((post) => (category === "all" || post.category === category) && (!bookmarksOnly || post.saved)), [bookmarksOnly, category, posts]);

  function toggle(id: string, field: "liked" | "saved") {
    setPosts((items) => items.map((post) => post.id === id ? { ...post, [field]: !post[field] } : post));
  }

  function publish() {
    if (!draft.trim()) return notify("先寫下一些內容");
    setPosts((items) => [{ id: `post-${Date.now()}`, category: "life", initials: "YC", author: "游同學", meta: "生涯探索 · 剛剛", title: "新的經驗分享", copy: draft.trim(), likes: 0 }, ...items]);
    setDraft(""); setCategory("all"); setBookmarksOnly(false); notify("貼文已發布");
  }

  function showBookmarks() {
    const count = posts.filter((post) => post.saved).length;
    setBookmarksOnly((value) => !value);
    notify(count ? `顯示 ${count} 篇收藏` : "目前還沒有收藏文章");
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)]">
      <FeatureHeader eyebrow="NTU COMMUNITY NOTES" title="專欄" description="由台大學生與校友分享選擇、方法與真實經驗。" actions={<><Button className={bookmarksOnly ? "border-[var(--paper)]" : ""} onClick={showBookmarks}>我的收藏</Button><Button variant="primary" onClick={() => composerRef.current?.focus()}>撰寫貼文</Button></>} />
      <div className="grid lg:grid-cols-[230px_1fr]">
        <aside className="border-b border-[var(--line)] bg-[var(--panel)] p-4 lg:min-h-[720px] lg:border-r lg:border-b-0 lg:p-5">
          <div className="mb-3 font-mono text-[9px] tracking-[.16em] text-[var(--muted)]">TOPICS</div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">{categories.map(([key, label, count]) => <button key={key} className={cn("flex items-center justify-between border px-3 py-2 text-left text-xs", category === key ? "border-[var(--paper)] bg-[var(--paper)] text-[var(--paper-ink)]" : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]")} onClick={() => { setCategory(key); setBookmarksOnly(false); }}><span>{label}</span><span className="font-mono text-[9px]">{count}</span></button>)}</div>
        </aside>
        <section className="mx-auto w-full max-w-4xl p-4 md:p-7">
          <div className="border border-[var(--line-strong)] bg-[var(--panel)]">
            <div className="flex gap-3 p-4"><div className="grid h-10 w-10 shrink-0 place-items-center bg-[var(--paper)] text-xs font-bold text-[var(--paper-ink)]">YC</div><textarea ref={composerRef} className="min-h-20 flex-1 bg-transparent text-sm leading-6 outline-none placeholder:text-[var(--muted)]" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="分享一個對其他台大生有幫助的經驗、方法或觀察…" /></div>
            <div className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-[9px] text-[var(--muted)]">以 游同學 發布 · 請避免張貼個資與未經驗證的招募資訊</span><Button variant="primary" onClick={publish}>發布貼文</Button></div>
          </div>
          <div className="mt-4 space-y-3">
            {visiblePosts.map((post) => (
              <article key={post.id} className="border border-[var(--line)] bg-[var(--panel)] p-5 animate-rise">
                <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-[var(--line-strong)] text-xs font-bold">{post.initials}</div><div><b className="block text-xs">{post.author}</b><span className="text-[10px] text-[var(--muted)]">{post.meta}</span></div></div>
                <h2 className="mt-5 text-lg font-semibold tracking-[-.025em]">{post.title}</h2>
                <p className="mt-2 text-sm leading-7 text-[var(--soft)]">{post.copy}</p>
                <div className="mt-4 flex gap-4 border-t border-[var(--line)] pt-3"><button className={`text-xs ${post.liked ? "text-[var(--text)]" : "text-[var(--muted)]"}`} onClick={() => toggle(post.id, "liked")}>{post.liked ? "♥" : "♡"} {post.likes + (post.liked ? 1 : 0)}</button><button className={`text-xs ${post.saved ? "text-[var(--text)]" : "text-[var(--muted)]"}`} onClick={() => toggle(post.id, "saved")}>{post.saved ? "✓ 已收藏" : "＋ 收藏"}</button></div>
              </article>
            ))}
            {!visiblePosts.length && <div className="border border-dashed border-[var(--line-strong)] p-12 text-center text-sm text-[var(--muted)]">這個篩選條件目前沒有文章。</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
