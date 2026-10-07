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

export interface ChatFolder {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  conversationIds: string[];
}

interface StoredFolder {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

interface StoredFolderConversation {
  folder_id: string;
  conversation_id: string;
  user_id: string;
  created_at: string;
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

    if (
      conversations.length === 0
    ) {
      return [];
    }

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

  async function loadFolders(
    userId: string
  ): Promise<ChatFolder[]> {
    const {
      data: folderData,
      error: folderError,
    } = await client
      .from("coach_folders")
      .select(
        "id,user_id,name,created_at"
      )
      .eq("user_id", userId)
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (folderError) {
      throw folderError;
    }

    const folders =
      (folderData ??
        []) as StoredFolder[];

    if (
      folders.length === 0
    ) {
      return [];
    }

    const {
      data: linkData,
      error: linkError,
    } = await client
      .from(
        "coach_folder_conversations"
      )
      .select(
        "folder_id,conversation_id,user_id,created_at"
      )
      .eq("user_id", userId)
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (linkError) {
      throw linkError;
    }

    const links =
      (linkData ??
        []) as StoredFolderConversation[];

    const grouped =
      new Map<
        string,
        string[]
      >();

    for (
      const link of links
    ) {
      const items =
        grouped.get(
          link.folder_id
        ) ?? [];

      items.push(
        link.conversation_id
      );

      grouped.set(
        link.folder_id,
        items
      );
    }

    return folders.map(
      (folder) => ({
        id: folder.id,
        userId:
          folder.user_id,
        name: folder.name,
        createdAt:
          folder.created_at,
        conversationIds:
          grouped.get(
            folder.id
          ) ?? [],
      })
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

  async function createFolder(
    userId: string,
    name: string
  ): Promise<ChatFolder> {
    const trimmedName =
      name.trim();

    if (!trimmedName) {
      throw new Error(
        "Folder name is required."
      );
    }

    const { data, error } =
      await client
        .from("coach_folders")
        .insert({
          id: crypto.randomUUID(),
          user_id: userId,
          name: trimmedName,
        })
        .select(
          "id,user_id,name,created_at"
        )
        .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        "Folder was not created."
      );
    }

    return {
      id: data.id,
      userId:
        data.user_id,
      name: data.name,
      createdAt:
        data.created_at,
      conversationIds: [],
    };
  }

  async function addConversationToFolder(
    userId: string,
    folderId: string,
    conversationId: string
  ): Promise<void> {
    const { error } =
      await client
        .from(
          "coach_folder_conversations"
        )
        .upsert(
          {
            folder_id:
              folderId,
            conversation_id:
              conversationId,
            user_id:
              userId,
          },
          {
            onConflict:
              "folder_id,conversation_id",
            ignoreDuplicates:
              true,
          }
        );

    if (error) {
      throw error;
    }
  }

  async function removeConversationFromFolder(
    userId: string,
    folderId: string,
    conversationId: string
  ): Promise<void> {
    const { error } =
      await client
        .from(
          "coach_folder_conversations"
        )
        .delete()
        .eq(
          "folder_id",
          folderId
        )
        .eq(
          "conversation_id",
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

  async function deleteConversation(
    userId: string,
    conversationId: string
  ): Promise<void> {
    /*
     * 先刪 messages。
     * 即使 DB 有 cascade，
     * 這樣也比較明確。
     */
    const {
      error: messageError,
    } = await client
      .from("coach_messages")
      .delete()
      .eq(
        "conversation_id",
        conversationId
      )
      .eq(
        "user_id",
        userId
      );

    if (messageError) {
      throw messageError;
    }

    /*
     * 再刪 conversation。
     *
     * coach_folder_conversations
     * 因為有 on delete cascade，
     * 對應關聯會一起消失。
     */
    const {
      error:
        conversationError,
    } = await client
      .from(
        "coach_conversations"
      )
      .delete()
      .eq(
        "id",
        conversationId
      )
      .eq(
        "user_id",
        userId
      );

    if (
      conversationError
    ) {
      throw conversationError;
    }
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
    loadFolders,

    create,
    createFolder,

    addConversationToFolder,
    removeConversationFromFolder,
    deleteConversation,

    title,
    saveMessage,
  };
}