import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  ChatMessage,
  Conversation,
} from "@/lib/types";

export interface StoredMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface StoredConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function createChatRepository(
  client: SupabaseClient
) {
  async function load(
    userId: string
  ): Promise<Conversation[]> {
    const conversations: StoredConversation[] =
      [];

    const messages: StoredMessage[] =
      [];

    const pageSize = 100;

    /*
     * 讀取 conversations。
     */
    for (
      let offset = 0;
      ;
      offset += pageSize
    ) {
      const { data, error } =
        await client
          .from("coach_conversations")
          .select(
            "id,user_id,title,created_at,updated_at"
          )
          .eq("user_id", userId)
          .order(
            "updated_at",
            {
              ascending: false,
            }
          )
          .range(
            offset,
            offset + pageSize - 1
          );

      if (error) {
        throw error;
      }

      const rows =
        (data ??
          []) as StoredConversation[];

      conversations.push(...rows);

      if (
        rows.length < pageSize
      ) {
        break;
      }
    }

    /*
     * 沒有 conversation 時，
     * 就不用繼續查 messages。
     */
    if (
      conversations.length === 0
    ) {
      return [];
    }

    /*
     * 讀取這個使用者的所有訊息。
     */
    for (
      let offset = 0;
      ;
      offset += pageSize
    ) {
      const { data, error } =
        await client
          .from("coach_messages")
          .select(
            "id,conversation_id,user_id,role,content,created_at"
          )
          .eq("user_id", userId)
          .order(
            "created_at",
            {
              ascending: true,
            }
          )
          .order(
            "id",
            {
              ascending: true,
            }
          )
          .range(
            offset,
            offset + pageSize - 1
          );

      if (error) {
        throw error;
      }

      const rows =
        (data ??
          []) as StoredMessage[];

      messages.push(...rows);

      if (
        rows.length < pageSize
      ) {
        break;
      }
    }

    /*
     * 將 messages 依 conversation 分組。
     */
    const grouped =
      new Map<
        string,
        ChatMessage[]
      >();

    for (
      const message of messages
    ) {
      const items =
        grouped.get(
          message.conversation_id
        ) ?? [];

      items.push({
        id: message.id,
        role: message.role,
        content:
          message.content,
      });

      grouped.set(
        message.conversation_id,
        items
      );
    }

    /*
     * 轉成前端 Conversation 格式。
     */
    return conversations
      .map(
        (
          row
        ): Conversation => ({
          id: row.id,
          title: row.title,
          createdAt:
            row.created_at,
          updatedAt:
            row.updated_at,
          messages:
            grouped.get(
              row.id
            ) ?? [],
        })
      )
      .sort((a, b) =>
        b.updatedAt.localeCompare(
          a.updatedAt
        )
      );
  }

  async function create(
    userId: string,
    title = "新問題"
  ): Promise<Conversation> {
    const { data, error } =
      await client
        .from(
          "coach_conversations"
        )
        .insert({
          id: crypto.randomUUID(),
          user_id: userId,
          title,
        })
        .select(
          "id,title,created_at,updated_at"
        )
        .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        "Conversation was not created."
      );
    }

    return {
      id: data.id,
      title: data.title,
      createdAt:
        data.created_at,
      updatedAt:
        data.updated_at,
      messages: [],
    };
  }

  async function title(
    userId: string,
    conversationId: string,
    nextTitle: string
  ): Promise<void> {
    const { error } =
      await client
        .from(
          "coach_conversations"
        )
        .update({
          title: nextTitle,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          conversationId
        )
        .eq(
          "user_id",
          userId
        );

    if (error) {
      throw error;
    }
  }

  async function saveMessage(
    row: StoredMessage
  ): Promise<void> {
    /*
     * 相同 message id 重試時，
     * 不建立重複訊息。
     */
    const { error } =
      await client
        .from("coach_messages")
        .upsert(row, {
          onConflict: "id",
        });

    if (error) {
      throw error;
    }
  }

  return {
    load,
    create,
    title,
    saveMessage,
  };
}