import type { SupabaseClient } from "@supabase/supabase-js";

import {
  sortCareerTasks,
  type CareerTask,
  type CreateTaskInput,
  type TaskSource,
} from "./types";

// 編輯時不更改任務來源。
export type UpdateTaskInput = Omit<
  CreateTaskInput,
  "source"
>;

interface StoredTask {
  id: string;
  user_id: string;
  title: string;
  date: string;
  time: string;
  done: boolean;
  guests: string[];
  notes: string;
  source: TaskSource;
  created_at: string;
  updated_at: string;
}

const TABLE = "career_tasks";

const COLUMNS = [
  "id",
  "user_id",
  "title",
  "date",
  "time",
  "done",
  "guests",
  "notes",
  "source",
  "created_at",
  "updated_at",
].join(",");

function toCareerTask(row: StoredTask): CareerTask {
  return {
    id: row.id,
    title: row.title,
    date: row.date,

    // Supabase 回傳 HH:mm:ss，介面使用 HH:mm。
    time: row.time.slice(0, 5),

    done: row.done,
    guests: row.guests ?? [],
    notes: row.notes ?? "",
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateInput(input: UpdateTaskInput) {
  if (!input.title.trim()) {
    throw new Error("請輸入任務內容");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("請選擇有效的日期");
  }

  const parsedDate = new Date(
    `${input.date}T00:00:00.000Z`
  );

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== input.date
  ) {
    throw new Error("請選擇有效的日期");
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) {
    throw new Error("請選擇有效的時間");
  }
}

function normalizeGuests(
  guests: string[] = []
): string[] {
  return [
    ...new Set(
      guests
        .map((email) => email.trim())
        .filter(Boolean)
    ),
  ];
}

export function createTaskRepository(
  client: SupabaseClient
) {
  return {
    /**
     * 讀取目前帳號的全部任務。
     */
    async load(
      userId: string
    ): Promise<CareerTask[]> {
      const tasks: CareerTask[] = [];
      const pageSize = 100;

      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await client
          .from(TABLE)
          .select(COLUMNS)
          .eq("user_id", userId)
          .order("date", { ascending: true })
          .order("time", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        const rows =
          (data ?? []) as unknown as StoredTask[];

        tasks.push(...rows.map(toCareerTask));

        if (rows.length < pageSize) {
          break;
        }
      }

      return sortCareerTasks(tasks);
    },

    /**
     * 新增任務。
     * 相同操作重試時可沿用 ID，避免重複新增。
     */
    async create(
      userId: string,
      input: CreateTaskInput,
      taskId: string = crypto.randomUUID()
    ): Promise<CareerTask> {
      validateInput(input);

      if (
        input.source !== "todo" &&
        input.source !== "calendar"
      ) {
        throw new Error("任務來源不正確");
      }

      const { data, error } = await client
        .from(TABLE)
        .insert({
          id: taskId,
          user_id: userId,
          title: input.title.trim(),
          date: input.date,
          time: input.time,
          done: false,
          guests: normalizeGuests(input.guests),
          notes: input.notes?.trim() ?? "",
          source: input.source,
        })
        .select(COLUMNS)
        .single();

      if (!error) {
        return toCareerTask(
          data as unknown as StoredTask
        );
      }

      // 上次可能已成功寫入，但回應因網路中斷而遺失。
      if (error.code === "23505") {
        const {
          data: existing,
          error: readError,
        } = await client
          .from(TABLE)
          .select(COLUMNS)
          .eq("id", taskId)
          .eq("user_id", userId)
          .single();

        if (readError) throw readError;

        return toCareerTask(
          existing as unknown as StoredTask
        );
      }

      throw error;
    },

    /**
     * 修改既有任務。
     *
     * 保留原本的 ID、擁有者、來源、完成狀態及建立時間。
     * 修改時間由資料庫自動更新。
     */
    async update(
      userId: string,
      taskId: string,
      input: UpdateTaskInput
    ): Promise<CareerTask> {
      validateInput(input);

      const { data, error } = await client
        .from(TABLE)
        .update({
          title: input.title.trim(),
          date: input.date,
          time: input.time,
          guests: normalizeGuests(input.guests),
          notes: input.notes?.trim() ?? "",
        })
        .eq("id", taskId)
        .eq("user_id", userId)
        .select(COLUMNS)
        .single();

      if (error) throw error;

      return toCareerTask(
        data as unknown as StoredTask
      );
    },

    /**
     * 設定完成狀態。
     */
    async setDone(
      userId: string,
      taskId: string,
      done: boolean
    ): Promise<CareerTask> {
      const { data, error } = await client
        .from(TABLE)
        .update({ done })
        .eq("id", taskId)
        .eq("user_id", userId)
        .select(COLUMNS)
        .single();

      if (error) throw error;

      return toCareerTask(
        data as unknown as StoredTask
      );
    },

    /**
     * 刪除任務。
     * 已刪除的任務再次刪除也視為成功，方便重試。
     */
    async remove(
      userId: string,
      taskId: string
    ): Promise<void> {
      const { error } = await client
        .from(TABLE)
        .delete()
        .eq("id", taskId)
        .eq("user_id", userId);

      if (error) throw error;
    },
  };
}