export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [];
      };
      blacklist: {
        Row: {
          created_at: string;
          word: string;
        };
        Insert: {
          created_at?: string;
          word: string;
        };
        Update: {
          created_at?: string;
          word?: string;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          anon_hue: number | null;
          anon_name: string | null;
          author_id: string | null;
          body: string;
          confession_id: string;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          id: string;
          parent_id: string | null;
          report_count: number;
          status: string;
        };
        Insert: {
          anon_hue?: number | null;
          anon_name?: string | null;
          author_id?: string | null;
          body: string;
          confession_id: string;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          parent_id?: string | null;
          report_count?: number;
          status?: string;
        };
        Update: {
          anon_hue?: number | null;
          anon_name?: string | null;
          author_id?: string | null;
          body?: string;
          confession_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          parent_id?: string | null;
          report_count?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_confession_id_fkey";
            columns: ["confession_id"];
            isOneToOne: false;
            referencedRelation: "confessions";
            referencedColumns: ["id"];
          },
        ];
      };
      confessions: {
        Row: {
          author_id: string | null;
          body: string;
          category: string;
          comment_count: number;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          downvotes: number;
          id: string;
          reactions: Json;
          report_count: number;
          status: string;
          upvotes: number;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          category?: string;
          comment_count?: number;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          downvotes?: number;
          id?: string;
          reactions?: Json;
          report_count?: number;
          status?: string;
          upvotes?: number;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          category?: string;
          comment_count?: number;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          downvotes?: number;
          id?: string;
          reactions?: Json;
          report_count?: number;
          status?: string;
          upvotes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "confessions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          created_at: string;
          followee_id: string;
          follower_id: string;
        };
        Insert: {
          created_at?: string;
          followee_id: string;
          follower_id: string;
        };
        Update: {
          created_at?: string;
          followee_id?: string;
          follower_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey";
            columns: ["followee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_actions: {
        Row: {
          action: string;
          admin_id: string | null;
          created_at: string;
          id: string;
          reason: string;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          admin_id?: string | null;
          created_at?: string;
          id?: string;
          reason?: string;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          admin_id?: string | null;
          created_at?: string;
          id?: string;
          reason?: string;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          confession_id: string | null;
          created_at: string;
          id: string;
          message: string;
          read: boolean;
          type: string;
          user_id: string;
        };
        Insert: {
          confession_id?: string | null;
          created_at?: string;
          id?: string;
          message: string;
          read?: boolean;
          type: string;
          user_id: string;
        };
        Update: {
          confession_id?: string | null;
          created_at?: string;
          id?: string;
          message?: string;
          read?: boolean;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_confession_id_fkey";
            columns: ["confession_id"];
            isOneToOne: false;
            referencedRelation: "confessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar: string;
          bio: string;
          created_at: string;
          handle: string;
          handle_changed_at: string | null;
          id: string;
          status: string;
        };
        Insert: {
          avatar?: string;
          bio?: string;
          created_at?: string;
          handle: string;
          handle_changed_at?: string | null;
          id: string;
          status?: string;
        };
        Update: {
          avatar?: string;
          bio?: string;
          created_at?: string;
          handle?: string;
          handle_changed_at?: string | null;
          id?: string;
          status?: string;
        };
        Relationships: [];
      };
      reactions: {
        Row: {
          confession_id: string;
          emoji: string;
          voter_key: string;
        };
        Insert: {
          confession_id: string;
          emoji: string;
          voter_key: string;
        };
        Update: {
          confession_id?: string;
          emoji?: string;
          voter_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reactions_confession_id_fkey";
            columns: ["confession_id"];
            isOneToOne: false;
            referencedRelation: "confessions";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          id: string;
          reason: string;
          reporter_key: string;
          target_id: string;
          target_type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          reason?: string;
          reporter_key: string;
          target_id: string;
          target_type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          reason?: string;
          reporter_key?: string;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      votes: {
        Row: {
          confession_id: string;
          value: number;
          voter_key: string;
        };
        Insert: {
          confession_id: string;
          value: number;
          voter_key: string;
        };
        Update: {
          confession_id?: string;
          value?: number;
          voter_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "votes_confession_id_fkey";
            columns: ["confession_id"];
            isOneToOne: false;
            referencedRelation: "confessions";
            referencedColumns: ["id"];
          },
        ];
      };
      write_events: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          id: number;
          ip_hash: string | null;
        };
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          id?: number;
          ip_hash?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          id?: number;
          ip_hash?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_comment: {
        Args: {
          _as_alias: boolean;
          _body: string;
          _confession_id: string;
          _parent_id?: string | null;
        };
        Returns: string;
      };
      alias_stats: {
        Args: { _id?: string };
        Returns: {
          avatar: string;
          bio: string;
          comments: number;
          created_at: string;
          followers: number;
          handle: string;
          id: string;
          karma: number;
          posts: number;
          score: number;
          status: string;
        }[];
      };
      assert_can_post: { Args: never; Returns: undefined };
      cast_vote: {
        Args: { _confession_id: string; _value: number };
        Returns: undefined;
      };
      confession_detail: {
        Args: { _id: string };
        Returns: {
          author_avatar: string;
          author_handle: string;
          author_id: string;
          body: string;
          category: string;
          comment_count: number;
          created_at: string;
          downvotes: number;
          id: string;
          my_reactions: string[];
          my_vote: number;
          reactions: Json;
          upvotes: number;
        }[];
      };
      confession_marks: {
        Args: { _ids: string[] };
        Returns: {
          confession_id: string;
          my_reactions: string[];
          my_vote: number;
        }[];
      };
      consume_write: { Args: { _action: string }; Returns: undefined };
      contains_blocked: { Args: { _t: string }; Returns: boolean };
      create_confession: {
        Args: { _as_alias: boolean; _body: string; _category: string };
        Returns: string;
      };
      feed_page: {
        Args: {
          _category?: string;
          _limit?: number;
          _offset?: number;
          _q?: string;
          _tab?: string;
        };
        Returns: {
          author_avatar: string;
          author_handle: string;
          author_id: string;
          body: string;
          category: string;
          comment_count: number;
          created_at: string;
          downvotes: number;
          id: string;
          my_reactions: string[];
          my_vote: number;
          reactions: Json;
          upvotes: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_reserved_handle: { Args: { _h: string }; Returns: boolean };
      leaderboard_page: {
        Args: { _limit?: number; _offset?: number };
        Returns: {
          avatar: string;
          bio: string;
          comments: number;
          created_at: string;
          followers: number;
          handle: string;
          id: string;
          karma: number;
          posts: number;
          score: number;
        }[];
      };
      moderate: {
        Args: { _action: string; _id: string; _reason?: string; _type: string };
        Returns: undefined;
      };
      posting_open: { Args: never; Returns: boolean };
      report_content: {
        Args: { _id: string; _reason: string; _type: string };
        Returns: undefined;
      };
      request_ip_hash: { Args: never; Returns: string };
      retention_cleanup_internal: { Args: never; Returns: Json };
      run_retention_cleanup: { Args: never; Returns: Json };
      set_alias_status: {
        Args: { _status: string; _user: string };
        Returns: undefined;
      };
      set_posting_enabled: { Args: { _enabled: boolean }; Returns: undefined };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      toggle_reaction: {
        Args: { _confession_id: string; _emoji: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "admin" | "moderator" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const;
