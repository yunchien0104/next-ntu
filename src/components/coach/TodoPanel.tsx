"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, Modal } from "@/components/ui/Modal";
import type { TodoItem } from "@/lib/types";

export function TodoPanel({ todos, setTodos, notify }: { todos: TodoItem[]; setTodos: React.Dispatch<React.SetStateAction<TodoItem[]>>; notify: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const done = todos.filter((todo) => todo.done).length;
  const openCount = todos.length - done;
  const total = todos.length + 3;
  const progress = done + 2;

  function toggle(id: string) {
    setTodos((items) => items.map((item) => item.id === id ? { ...item, done: !item.done } : item));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return notify("先輸入待辦內容");
    const due = date ? date.slice(5).replace("-", "/") : "未設定";
    setTodos((items) => [{ id: `task-${Date.now()}`, title: title.trim(), due, tag: "自訂", done: false }, ...items]);
    setTitle(""); setDate(""); setOpen(false); notify("已加入你的生涯待辦");
  }

  return (
    <section className="min-h-0 flex-1">
      <header className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4">
        <div><div className="font-mono text-[9px] font-bold tracking-[.16em] text-[var(--muted)]">CAREER TO DO</div><h2 className="text-sm font-semibold">生涯待辦</h2></div>
        <div className="grid min-w-7 place-items-center bg-[var(--panel-2)] px-2 py-1 text-xs">{openCount}</div>
      </header>
      <div className="max-h-[42vh] overflow-y-auto p-3 lg:max-h-none">
        <div className="mb-5">
          <div className="mb-2 flex justify-between text-[10px] text-[var(--soft)]"><span>本學期進度</span><strong>{progress} / {total}</strong></div>
          <div className="h-[3px] bg-[var(--line)]"><span className="block h-full bg-[var(--paper)] transition-all" style={{ width: `${Math.round(progress / total * 100)}%` }} /></div>
        </div>
        <div className="space-y-2">
          {todos.map((todo) => (
            <article key={todo.id} className={`border border-[var(--line)] bg-[var(--panel)] p-3 transition hover:border-[var(--line-strong)] ${todo.done ? "opacity-45" : ""}`}>
              <label className="flex items-start gap-2.5"><input className="mt-0.5 h-4 w-4 appearance-none border border-[#777] bg-[#111] checked:bg-[var(--paper)] checked:shadow-[inset_0_0_0_3px_#111]" type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} /><span className={`text-xs font-medium leading-5 ${todo.done ? "line-through" : ""}`}>{todo.title}</span></label>
              <div className="mt-2 flex items-center justify-between pl-6"><span className={`text-[10px] ${todo.urgent ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>{todo.due}</span><span className="border border-[var(--line-strong)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">{todo.tag}</span></div>
            </article>
          ))}
        </div>
        <Button full className="mt-3" onClick={() => setOpen(true)}>＋ 新增待辦</Button>
      </div>
      <Modal open={open} title="新增待辦" onClose={() => setOpen(false)} footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" onClick={submit}>加入待辦</Button></>}>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="待辦內容"><input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：完成實習履歷初稿" autoFocus /></Field>
          <Field label="截止日期"><input className={inputClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        </form>
      </Modal>
    </section>
  );
}
