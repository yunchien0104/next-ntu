"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

import {
  createTaskRepository,
  type UpdateTaskInput,
} from "./repository";

import {
  sortCareerTasks,
  type CareerTask,
  type CreateTaskInput,
} from "./types";

const repository = createTaskRepository(supabase);

interface TaskState {
  userId: string | null;
  tasks: CareerTask[];
  loading: boolean;
  ready: boolean;
  busy: boolean;
  error: string | null;
}

interface OwnerToken {
  userId: string;
}

interface PendingCreate {
  key: string;
  id: string;
}

function emptyState(
  userId: string | null
): TaskState {
  return {
    userId,
    tasks: [],
    loading: Boolean(userId),
    ready: false,
    busy: false,
    error: null,
  };
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "無法同步任務，請稍後再試";
}

export function useCloudTasks(
  userId: string | null
) {
  const [state, setState] = useState<TaskState>(
    () => emptyState(null)
  );

  const ownerRef = useRef<OwnerToken | null>(null);
  const latestUserIdRef = useRef(userId);

  const readRevisionRef = useRef(0);
  const mutationLockRef = useRef<symbol | null>(null);
  const readyRef = useRef(false);
  const loadingRef = useRef(false);

  const pendingCreateRef =
    useRef<PendingCreate | null>(null);

  latestUserIdRef.current = userId;

  const isCurrentOwner = useCallback(
    (owner: OwnerToken) =>
      ownerRef.current === owner &&
      latestUserIdRef.current === owner.userId,
    []
  );

  /**
   * 載入雲端任務。
   * 避免舊帳號或過期請求的結果覆蓋目前資料。
   */
  const reload = useCallback(
    async (): Promise<boolean> => {
      const owner = ownerRef.current;

      if (
        !owner ||
        owner.userId !== userId ||
        !isCurrentOwner(owner) ||
        mutationLockRef.current
      ) {
        return false;
      }

      const revision = ++readRevisionRef.current;

      loadingRef.current = true;

      setState((current) => ({
        ...current,
        loading: true,
        error: null,
      }));

      try {
        const tasks =
          await repository.load(owner.userId);

        if (
          !isCurrentOwner(owner) ||
          revision !== readRevisionRef.current
        ) {
          return false;
        }

        readyRef.current = true;

        setState((current) => ({
          ...current,
          tasks,
          ready: true,
          error: null,
        }));

        return true;
      } catch (error) {
        if (
          isCurrentOwner(owner) &&
          revision === readRevisionRef.current
        ) {
          console.error("Load tasks failed:", error);

          setState((current) => ({
            ...current,
            error: getErrorMessage(error),
          }));
        }

        return false;
      } finally {
        if (
          isCurrentOwner(owner) &&
          revision === readRevisionRef.current
        ) {
          loadingRef.current = false;

          setState((current) => ({
            ...current,
            loading: false,
          }));
        }
      }
    },
    [userId, isCurrentOwner]
  );

  /**
   * 登入、登出或切換帳號時重設任務狀態。
   */
  useEffect(() => {
    readRevisionRef.current++;
    mutationLockRef.current = null;
    pendingCreateRef.current = null;
    readyRef.current = false;
    loadingRef.current = Boolean(userId);

    setState(emptyState(userId));

    if (!userId) {
      ownerRef.current = null;
      return;
    }

    const owner: OwnerToken = { userId };

    ownerRef.current = owner;

    void reload();

    return () => {
      if (ownerRef.current === owner) {
        ownerRef.current = null;
        readRevisionRef.current++;
        mutationLockRef.current = null;
        pendingCreateRef.current = null;
        readyRef.current = false;
        loadingRef.current = false;
      }
    };
  }, [userId, reload]);

  /**
   * 統一處理新增、修改、完成與刪除。
   * 雲端成功後才更新畫面，同時避免重複操作。
   */
  const runMutation = useCallback(
    async <T>(
      operation: (ownerId: string) => Promise<T>,
      apply: (
        tasks: CareerTask[],
        result: T
      ) => CareerTask[]
    ): Promise<T | null> => {
      const owner = ownerRef.current;

      if (
        !owner ||
        owner.userId !== userId ||
        !isCurrentOwner(owner) ||
        !readyRef.current ||
        loadingRef.current ||
        mutationLockRef.current
      ) {
        return null;
      }

      const lock = Symbol("task-mutation");

      mutationLockRef.current = lock;

      setState((current) => ({
        ...current,
        busy: true,
        error: null,
      }));

      try {
        const result =
          await operation(owner.userId);

        if (!isCurrentOwner(owner)) {
          return null;
        }

        setState((current) => ({
          ...current,
          tasks: sortCareerTasks(
            apply(current.tasks, result)
          ),
          error: null,
        }));

        return result;
      } catch (error) {
        if (isCurrentOwner(owner)) {
          console.error("Save task failed:", error);

          setState((current) => ({
            ...current,
            error: getErrorMessage(error),
          }));
        }

        return null;
      } finally {
        if (
          isCurrentOwner(owner) &&
          mutationLockRef.current === lock
        ) {
          mutationLockRef.current = null;

          setState((current) => ({
            ...current,
            busy: false,
          }));
        }
      }
    },
    [userId, isCurrentOwner]
  );

  /**
   * 新增任務。
   * 相同內容重試時沿用 ID，避免重複新增。
   */
  const createTask = useCallback(
    async (
      input: CreateTaskInput
    ): Promise<CareerTask | null> => {
      const owner = ownerRef.current;

      if (
        !owner ||
        owner.userId !== userId ||
        !isCurrentOwner(owner) ||
        !readyRef.current ||
        loadingRef.current ||
        mutationLockRef.current
      ) {
        return null;
      }

      const normalized: CreateTaskInput = {
        title: input.title.trim(),
        date: input.date,
        time: input.time,
        guests: [
          ...new Set(
            (input.guests ?? [])
              .map((email) => email.trim())
              .filter(Boolean)
          ),
        ],
        notes: input.notes?.trim() ?? "",
        source: input.source,
      };

      const key = JSON.stringify(normalized);

      if (pendingCreateRef.current?.key !== key) {
        pendingCreateRef.current = {
          key,
          id: crypto.randomUUID(),
        };
      }

      const pending = pendingCreateRef.current;

      const task = await runMutation(
        (ownerId) =>
          repository.create(
            ownerId,
            normalized,
            pending.id
          ),
        (tasks, created) => [
          ...tasks.filter(
            (item) => item.id !== created.id
          ),
          created,
        ]
      );

      if (
        task &&
        isCurrentOwner(owner) &&
        pendingCreateRef.current === pending
      ) {
        pendingCreateRef.current = null;
      }

      return task;
    },
    [userId, isCurrentOwner, runMutation]
  );

  /**
   * 修改任務細節。
   * 更新共用資料後，待辦與日曆會同步顯示新內容。
   */
  const updateTask = useCallback(
    async (
      taskId: string,
      input: UpdateTaskInput
    ): Promise<CareerTask | null> => {
      return runMutation(
        (ownerId) =>
          repository.update(
            ownerId,
            taskId,
            input
          ),
        (tasks, updated) => [
          ...tasks.filter(
            (item) => item.id !== updated.id
          ),
          updated,
        ]
      );
    },
    [runMutation]
  );

  /**
   * 勾選或取消完成。
   */
  const setTaskDone = useCallback(
    async (
      taskId: string,
      done: boolean
    ): Promise<boolean> => {
      const task = await runMutation(
        (ownerId) =>
          repository.setDone(
            ownerId,
            taskId,
            done
          ),
        (tasks, updated) =>
          tasks.map((item) =>
            item.id === updated.id
              ? updated
              : item
          )
      );

      return task !== null;
    },
    [runMutation]
  );

  /**
   * 刪除共用任務，日曆與待辦都會移除。
   */
  const deleteTask = useCallback(
    async (
      taskId: string
    ): Promise<boolean> => {
      const result = await runMutation(
        async (ownerId) => {
          await repository.remove(
            ownerId,
            taskId
          );

          return taskId;
        },
        (tasks, deletedId) =>
          tasks.filter(
            (item) => item.id !== deletedId
          )
      );

      return result !== null;
    },
    [runMutation]
  );

  // 切換帳號時，立即隱藏前一個帳號的資料。
  const visibleState =
    state.userId === userId
      ? state
      : emptyState(userId);

  return {
    tasks: visibleState.tasks,
    loading: visibleState.loading,
    ready: visibleState.ready,
    busy: visibleState.busy,
    error: visibleState.error,
    reload,
    createTask,
    updateTask,
    setTaskDone,
    deleteTask,
  };
}

export type CloudTasks = ReturnType<
  typeof useCloudTasks
>;