"use client";

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/Button";
import {
  Field,
  inputClass,
  Modal,
} from "@/components/ui/Modal";

import { sortCareerTasks } from "@/lib/tasks/types";
import type { CloudTasks } from "@/lib/tasks/useCloudTasks";

interface TodoPanelProps {
  taskStore: CloudTasks;
  notify: (message: string) => void;
}

export function TodoPanel({
  taskStore,
  notify,
}: TodoPanelProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("23:59");
  const [submitting, setSubmitting] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);

  const todos = useMemo(
    () => sortCareerTasks(taskStore.tasks),
    [taskStore.tasks]
  );

  const done = todos.filter((todo) => todo.done).length;
  const total = todos.length;
  const openCount = total - done;

  const progressPercent =
    total > 0 ? Math.round((done / total) * 100) : 0;

  const blocked =
    !taskStore.ready ||
    taskStore.loading ||
    taskStore.busy ||
    submitting;

  function closeModal() {
    if (taskStore.busy || submittingRef.current) return;
    setOpen(false);
  }

  function openModal() {
    if (blocked) return;

    setTitle("");
    setDate("");
    setTime("23:59");
    setOpen(true);
  }

  async function toggle(
    id: string,
    nextDone: boolean
  ) {
    if (blocked) return;

    const success = await taskStore.setTaskDone(
      id,
      nextDone
    );

    if (!success) {
      notify("更新失敗，請稍後再試");
    }
  }

  async function remove(id: string) {
    if (blocked) return;

    const success = await taskStore.deleteTask(id);

    if (!success) {
      notify("刪除失敗，請稍後再試");
      return;
    }

    notify("已刪除待辦與對應的日曆任務");
  }

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (blocked || submittingRef.current) return;

    if (!title.trim()) {
      notify("請輸入待辦內容");
      return;
    }

    if (!date || !time) {
      notify("請填寫截止日期與時間");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const task = await taskStore.createTask({
        title: title.trim(),
        date,
        time,
        source: "todo",
      });

      if (!task) {
        notify("新增失敗，請保留內容並重試");
        return;
      }

      setTitle("");
      setDate("");
      setTime("23:59");
      setOpen(false);

      notify("已加入生涯待辦與日曆");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="min-h-0 flex-1">
      <header className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4">
        <div>
          <div className="font-mono text-[9px] font-bold tracking-[.16em] text-[var(--muted)]">
            CAREER TO DO
          </div>

          <h2 className="text-sm font-semibold">
            生涯待辦
          </h2>
        </div>

        <div className="grid min-w-7 place-items-center bg-[var(--panel-2)] px-2 py-1 text-xs">
          {openCount}
        </div>
      </header>

      <div className="max-h-[42vh] overflow-y-auto p-3 lg:max-h-none">
        {taskStore.error && (
          <div
            role="alert"
            className="mb-4 border border-[var(--line-strong)] bg-[var(--bg)] p-3"
          >
            <p className="break-words text-xs leading-5 text-[var(--soft)]">
              任務同步失敗：{taskStore.error}
            </p>

            <Button
              className="mt-2"
              disabled={
                taskStore.loading ||
                taskStore.busy ||
                submitting
              }
              onClick={() => void taskStore.reload()}
            >
              重新讀取
            </Button>
          </div>
        )}

        <div className="mb-5">
          <div className="mb-2 flex justify-between text-[10px] text-[var(--soft)]">
            <span>待辦完成進度</span>

            <strong>
              {done} / {total}
            </strong>
          </div>

          <div
            role="progressbar"
            aria-label="待辦完成進度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            className="h-[3px] bg-[var(--line)]"
          >
            <span
              className="block h-full bg-[var(--paper)] transition-all"
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>

          <p className="mt-2 text-[9px] text-[var(--muted)]">
            依截止日期與時間，由近到遠排列
          </p>
        </div>

        {taskStore.loading && (
          <p
            role="status"
            className="mb-3 text-center text-xs text-[var(--muted)]"
          >
            正在讀取任務…
          </p>
        )}

        {taskStore.ready &&
          !taskStore.loading &&
          todos.length === 0 && (
            <div className="border border-dashed border-[var(--line)] px-3 py-6 text-center text-xs text-[var(--muted)]">
              尚無待辦，新增第一個任務吧。
            </div>
          )}

        <div className="space-y-2">
          {todos.map((todo) => (
            <article
              key={todo.id}
              className={`border border-[var(--line)] bg-[var(--panel)] p-3 transition hover:border-[var(--line-strong)] ${
                todo.done ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                  <input
                    className="mt-0.5 h-4 w-4 shrink-0 appearance-none border border-[#777] bg-[#111] checked:bg-[var(--paper)] checked:shadow-[inset_0_0_0_3px_#111] disabled:cursor-not-allowed"
                    type="checkbox"
                    checked={todo.done}
                    disabled={blocked}
                    onChange={(event) =>
                      void toggle(
                        todo.id,
                        event.target.checked
                      )
                    }
                  />

                  <span
                    className={`min-w-0 break-words text-xs font-medium leading-5 ${
                      todo.done ? "line-through" : ""
                    }`}
                  >
                    {todo.title}
                  </span>
                </label>

                <button
                  type="button"
                  className="grid h-6 w-6 shrink-0 place-items-center border border-[var(--line)] text-[10px] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`刪除待辦：${todo.title}`}
                  title="刪除此待辦與日曆任務"
                  disabled={blocked}
                  onClick={() => void remove(todo.id)}
                >
                  X
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-6">
                <time
                  dateTime={`${todo.date}T${todo.time}:00+08:00`}
                  className="text-[10px] text-[var(--muted)]"
                >
                  {todo.date.replaceAll("-", "/")}{" "}
                  {todo.time}
                </time>

                <span className="border border-[var(--line-strong)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
                  {todo.source === "calendar"
                    ? "日曆活動"
                    : "自訂待辦"}
                </span>
              </div>
            </article>
          ))}
        </div>

        <Button
          full
          className="mt-3"
          disabled={blocked}
          onClick={openModal}
        >
          ＋ 新增待辦
        </Button>
      </div>

      <Modal
        open={open}
        title="新增待辦"
        onClose={closeModal}
        footer={
          <>
            <Button
              disabled={taskStore.busy || submitting}
              onClick={closeModal}
            >
              取消
            </Button>

            <Button
              variant="primary"
              disabled={blocked}
              onClick={() =>
                formRef.current?.requestSubmit()
              }
            >
              {submitting ? "儲存中…" : "加入待辦"}
            </Button>
          </>
        }
      >
        <form
          ref={formRef}
          className="space-y-4"
          onSubmit={submit}
        >
          <Field label="待辦內容">
            <input
              className={inputClass}
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              placeholder="例如：完成實習履歷初稿"
              disabled={submitting || taskStore.busy}
              required
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="截止日期">
              <input
                className={inputClass}
                type="date"
                value={date}
                onChange={(event) =>
                  setDate(event.target.value)
                }
                disabled={submitting || taskStore.busy}
                required
              />
            </Field>

            <Field label="截止時間">
              <input
                className={inputClass}
                type="time"
                step={60}
                value={time}
                onChange={(event) =>
                  setTime(event.target.value)
                }
                disabled={submitting || taskStore.busy}
                required
              />
            </Field>
          </div>

          <p className="text-[10px] leading-5 text-[var(--muted)]">
            日期與時間以台灣時間為準。新增後會同步顯示於日曆。
          </p>

          {taskStore.error && (
            <p
              role="alert"
              className="break-words text-xs leading-5 text-[var(--soft)]"
            >
              儲存未完成：{taskStore.error}
              <br />
              請檢查後再次按「加入待辦」。
            </p>
          )}
        </form>
      </Modal>
    </section>
  );
}