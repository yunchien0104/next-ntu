export type TaskSource = "todo" | "calendar";

// 待辦與日曆共用同一筆資料。
export interface CareerTask {
  id: string;
  title: string;

  // 完整日期，例如 2026-10-08。
  date: string;

  // 台灣時間，格式為 HH:mm，例如 14:30。
  time: string;

  done: boolean;

  // 協作者的 Email。
  guests: string[];

  notes: string;

  // 記錄從哪個介面建立。
  source: TaskSource;

  createdAt: string;
  updatedAt: string;
}

// 新增時需要提供的資料。
export interface CreateTaskInput {
  title: string;
  date: string;
  time: string;
  guests?: string[];
  notes?: string;
  source: TaskSource;
}

// 依截止日期、時間由近到遠排序。
// 日期時間相同時，以建立時間和 ID 排序。
export function sortCareerTasks(
  tasks: CareerTask[]
): CareerTask[] {
  return [...tasks].sort((a, b) => {
    const dateOrder =
      a.date.localeCompare(b.date);

    if (dateOrder !== 0) return dateOrder;

    const timeOrder =
      a.time.localeCompare(b.time);

    if (timeOrder !== 0) return timeOrder;

    const createdOrder =
      a.createdAt.localeCompare(b.createdAt);

    if (createdOrder !== 0) return createdOrder;

    return a.id.localeCompare(b.id);
  });
}
