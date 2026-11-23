export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          data: Json
          entity: string
          entity_id: string | null
          id: number
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          data?: Json
          entity: string
          entity_id?: string | null
          id?: never
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          data?: Json
          entity?: string
          entity_id?: string | null
          id?: never
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          created_at: string
          done: boolean
          done_at: string | null
          done_by: string | null
          id: string
          label: string
          license_id: string
          notes: string
          required: boolean
          requires_document: boolean
          sort: number
          template_code: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          label: string
          license_id: string
          notes?: string
          required?: boolean
          requires_document?: boolean
          sort?: number
          template_code?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          label?: string
          license_id?: string
          notes?: string
          required?: boolean
          requires_document?: boolean
          sort?: number
          template_code?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_license_id_tenant_id_fkey"
            columns: ["license_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "license_overview"
            referencedColumns: ["license_id", "tenant_id"]
          },
          {
            foreignKeyName: "checklist_items_license_id_tenant_id_fkey"
            columns: ["license_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          code: string
          condition: string | null
          id: string
          label_en: string
          label_es: string
          license_type: string
          required: boolean
          requires_document: boolean
          sort: number
        }
        Insert: {
          code: string
          condition?: string | null
          id?: string
          label_en: string
          label_es: string
          license_type: string
          required?: boolean
          requires_document?: boolean
          sort?: number
        }
        Update: {
          code?: string
          condition?: string | null
          id?: string
          label_en?: string
          label_es?: string
          license_type?: string
          required?: boolean
          requires_document?: boolean
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_license_type_fkey"
            columns: ["license_type"]
            isOneToOne: false
            referencedRelation: "license_types"
            referencedColumns: ["code"]
          },
        ]
      }
      documents: {
        Row: {
          checklist_item_id: string | null
          created_at: string
          expires_on: string | null
          file_name: string
          id: string
          kind: string
          license_id: string | null
          mime_type: string
          property_id: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          checklist_item_id?: string | null
          created_at?: string
          expires_on?: string | null
          file_name: string
          id?: string
          kind?: string
          license_id?: string | null
          mime_type: string
          property_id: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          checklist_item_id?: string | null
          created_at?: string
          expires_on?: string | null
          file_name?: string
          id?: string
          kind?: string
          license_id?: string | null
          mime_type?: string
          property_id?: string
          size_bytes?: number
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_checklist_item_id_tenant_id_fkey"
            columns: ["checklist_item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "documents_license_id_tenant_id_fkey"
            columns: ["license_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "license_overview"
            referencedColumns: ["license_id", "tenant_id"]
          },
          {
            foreignKeyName: "documents_license_id_tenant_id_fkey"
            columns: ["license_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "documents_property_id_tenant_id_fkey"
            columns: ["property_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          ip_hash: string
          locale: string
          message: string
          name: string
          notified_at: string | null
          phone: string
          plan: string
          properties: number
          status: string
          utm_campaign: string
          utm_medium: string
          utm_source: string
        }
        Insert: {
          company?: string
          created_at?: string
          email: string
          id?: string
          ip_hash: string
          locale?: string
          message?: string
          name: string
          notified_at?: string | null
          phone?: string
          plan?: string
          properties: number
          status?: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          ip_hash?: string
          locale?: string
          message?: string
          name?: string
          notified_at?: string | null
          phone?: string
          plan?: string
          properties?: number
          status?: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
        }
        Relationships: []
      }
      license_types: {
        Row: {
          authority: string
          code: string
          expiry_day: number | null
          expiry_month: number | null
          filing_day: number | null
          filing_month: number | null
          name_en: string
          name_es: string
          notes: string
          rules_confirmed: boolean
          source_url: string | null
        }
        Insert: {
          authority: string
          code: string
          expiry_day?: number | null
          expiry_month?: number | null
          filing_day?: number | null
          filing_month?: number | null
          name_en: string
          name_es: string
          notes?: string
          rules_confirmed?: boolean
          source_url?: string | null
        }
        Update: {
          authority?: string
          code?: string
          expiry_day?: number | null
          expiry_month?: number | null
          filing_day?: number | null
          filing_month?: number | null
          name_en?: string
          name_es?: string
          notes?: string
          rules_confirmed?: boolean
          source_url?: string | null
        }
        Relationships: []
      }
      licenses: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          expires_on: string
          fee_estimate: number | null
          id: string
          issued_on: string | null
          license_number: string
          license_type: string
          notes: string
          property_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_on: string
          fee_estimate?: number | null
          id?: string
          issued_on?: string | null
          license_number?: string
          license_type: string
          notes?: string
          property_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_on?: string
          fee_estimate?: number | null
          id?: string
          issued_on?: string | null
          license_number?: string
          license_type?: string
          notes?: string
          property_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licenses_license_type_fkey"
            columns: ["license_type"]
            isOneToOne: false
            referencedRelation: "license_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "licenses_property_id_tenant_id_fkey"
            columns: ["property_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          locale: string
          tour_done_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          locale?: string
          tour_done_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          locale?: string
          tour_done_at?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          archived_at: string | null
          area: string
          created_at: string
          created_by: string | null
          has_pool: boolean
          id: string
          is_sample: boolean
          island: string
          name: string
          notes: string
          owner_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string
          archived_at?: string | null
          area?: string
          created_at?: string
          created_by?: string | null
          has_pool?: boolean
          id?: string
          is_sample?: boolean
          island?: string
          name: string
          notes?: string
          owner_name?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          archived_at?: string | null
          area?: string
          created_at?: string
          created_by?: string | null
          has_pool?: boolean
          id?: string
          is_sample?: boolean
          island?: string
          name?: string
          notes?: string
          owner_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          deadline: string
          id: number
          kind: string
          license_id: string
          recipients: number
          sent_at: string
          tenant_id: string
        }
        Insert: {
          deadline: string
          id?: never
          kind: string
          license_id: string
          recipients?: number
          sent_at?: string
          tenant_id: string
        }
        Update: {
          deadline?: string
          id?: never
          kind?: string
          license_id?: string
          recipients?: number
          sent_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_log_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "license_overview"
            referencedColumns: ["license_id"]
          },
          {
            foreignKeyName: "reminder_log_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      license_overview: {
        Row: {
          area: string | null
          days_left: number | null
          expires_on: string | null
          fee_estimate: number | null
          filing_deadline: string | null
          is_sample: boolean | null
          island: string | null
          license_id: string | null
          license_name_en: string | null
          license_name_es: string | null
          license_number: string | null
          license_type: string | null
          owner_name: string | null
          property_id: string | null
          property_name: string | null
          required_done: number | null
          required_items: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_license_type_fkey"
            columns: ["license_type"]
            isOneToOne: false
            referencedRelation: "license_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "licenses_property_id_tenant_id_fkey"
            columns: ["property_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
    }
    Functions: {
      _audit: {
        Args: {
          p_action: string
          p_data?: Json
          p_entity: string
          p_entity_id: string
          p_tenant: string
        }
        Returns: undefined
      }
      _owner_count: { Args: { p_tenant: string }; Returns: number }
      _path_tenant: { Args: { p_name: string }; Returns: string }
      _require_user: { Args: never; Returns: string }
      accept_invitation: { Args: { p_token: string }; Returns: string }
      change_member_role: {
        Args: {
          p_role: Database["public"]["Enums"]["member_role"]
          p_tenant: string
          p_user: string
        }
        Returns: undefined
      }
      clear_sample_data: { Args: { p_tenant: string }; Returns: number }
      create_organization: { Args: { p_name: string }; Returns: string }
      due_reminders: {
        Args: { p_today?: string }
        Returns: {
          days_left: number
          deadline: string
          expires_on: string
          kind: string
          license_id: string
          license_type: string
          organization: string
          property_name: string
          recipients: Json
          required_done: number
          required_items: number
          tenant_id: string
        }[]
      }
      has_role: {
        Args: {
          p_min: Database["public"]["Enums"]["member_role"]
          p_tenant: string
        }
        Returns: boolean
      }
      import_properties: {
        Args: { p_rows: Json; p_tenant: string }
        Returns: number
      }
      invitation_preview: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          organization_name: string
          role: Database["public"]["Enums"]["member_role"]
        }[]
      }
      invite_member: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["member_role"]
          p_tenant: string
        }
        Returns: string
      }
      is_member: { Args: { p_tenant: string }; Returns: boolean }
      load_sample_data: { Args: { p_tenant: string }; Returns: number }
      mark_reminder_sent: {
        Args: {
          p_deadline: string
          p_kind: string
          p_license: string
          p_recipients: number
        }
        Returns: undefined
      }
      my_organizations: {
        Args: never
        Returns: {
          id: string
          name: string
          role: Database["public"]["Enums"]["member_role"]
        }[]
      }
      my_role: {
        Args: { p_tenant: string }
        Returns: Database["public"]["Enums"]["member_role"]
      }
      next_expiry: {
        Args: { p_from?: string; p_type: string }
        Returns: string
      }
      reminder_kind: { Args: { p_days: number }; Returns: string }
      remove_member: {
        Args: { p_tenant: string; p_user: string }
        Returns: undefined
      }
      rename_organization: {
        Args: { p_name: string; p_tenant: string }
        Returns: undefined
      }
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined }
      role_rank: {
        Args: { r: Database["public"]["Enums"]["member_role"] }
        Returns: number
      }
    }
    Enums: {
      member_role: "owner" | "admin" | "operator" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      member_role: ["owner", "admin", "operator", "viewer"],
    },
  },
} as const

