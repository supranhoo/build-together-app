export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_modules: {
        Row: {
          created_at: string
          default_label: string
          description: string | null
          icon_name: string | null
          id: string
          is_active: boolean
          is_configurable: boolean
          module_key: string
          route_segment: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_label: string
          description?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_configurable?: boolean
          module_key: string
          route_segment: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_label?: string
          description?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_configurable?: boolean
          module_key?: string
          route_segment?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string
          batch_id: string | null
          change_summary: Json
          context: Json
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          profit_center_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          batch_id?: string | null
          change_summary?: Json
          context?: Json
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          profit_center_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          batch_id?: string | null
          change_summary?: Json
          context?: Json
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          profit_center_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_rates: {
        Row: {
          cost_type: Database["public"]["Enums"]["cost_type"]
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          id: string
          material_id: string
          notes: string | null
          profit_center_id: string
          rate: number
        }
        Insert: {
          cost_type?: Database["public"]["Enums"]["cost_type"]
          created_at?: string
          created_by: string
          effective_from: string
          effective_to?: string | null
          id?: string
          material_id: string
          notes?: string | null
          profit_center_id: string
          rate: number
        }
        Update: {
          cost_type?: Database["public"]["Enums"]["cost_type"]
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          profit_center_id?: string
          rate?: number
        }
        Relationships: []
      }
      furnaces: {
        Row: {
          capacity_mt: number | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          machine_type: Database["public"]["Enums"]["machine_type"] | null
          name: string
          power_rating_kw: number | null
          profit_center_id: string
          updated_at: string
        }
        Insert: {
          capacity_mt?: number | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          machine_type?: Database["public"]["Enums"]["machine_type"] | null
          name: string
          power_rating_kw?: number | null
          profit_center_id: string
          updated_at?: string
        }
        Update: {
          capacity_mt?: number | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          machine_type?: Database["public"]["Enums"]["machine_type"] | null
          name?: string
          power_rating_kw?: number | null
          profit_center_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "furnaces_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      heat_log_events: {
        Row: {
          action: string
          actor_user_id: string
          change_summary: Json
          created_at: string
          heat_log_id: string
          id: string
          profit_center_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          change_summary?: Json
          created_at?: string
          heat_log_id: string
          id?: string
          profit_center_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          change_summary?: Json
          created_at?: string
          heat_log_id?: string
          id?: string
          profit_center_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "heat_log_events_heat_log_id_fkey"
            columns: ["heat_log_id"]
            isOneToOne: false
            referencedRelation: "heat_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_log_events_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      heat_logs: {
        Row: {
          created_at: string
          created_by: string
          furnace_id: string
          heat_number: string
          id: string
          is_voided: boolean
          notes: string | null
          power_mwh: number | null
          profit_center_id: string
          shift_id: string
          tap_time: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          weight_mt: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          furnace_id: string
          heat_number: string
          id?: string
          is_voided?: boolean
          notes?: string | null
          power_mwh?: number | null
          profit_center_id: string
          shift_id: string
          tap_time: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          weight_mt?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          furnace_id?: string
          heat_number?: string
          id?: string
          is_voided?: boolean
          notes?: string | null
          power_mwh?: number | null
          profit_center_id?: string
          shift_id?: string
          tap_time?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          weight_mt?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "heat_logs_furnace_id_fkey"
            columns: ["furnace_id"]
            isOneToOne: false
            referencedRelation: "furnaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_logs_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_logs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_ledger: {
        Row: {
          created_at: string
          created_by: string
          id: string
          material_id: string
          movement_type: string
          notes: string | null
          profit_center_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          stock_location_id: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          material_id: string
          movement_type: string
          notes?: string | null
          profit_center_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          stock_location_id: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          material_id?: string
          movement_type?: string
          notes?: string | null
          profit_center_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          stock_location_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          created_at: string
          display_name: string
          formula: Json
          id: string
          is_active: boolean
          key: string
          profit_center_id: string | null
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          formula?: Json
          id?: string
          is_active?: boolean
          key: string
          profit_center_id?: string | null
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          formula?: Json
          id?: string
          is_active?: boolean
          key?: string
          profit_center_id?: string | null
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_definitions_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_pins: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kpi_definition_id: string
          profit_center_id: string
          scope: string
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kpi_definition_id: string
          profit_center_id: string
          scope?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kpi_definition_id?: string
          profit_center_id?: string
          scope?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      kpi_subscriptions: {
        Row: {
          cadence: string
          created_at: string
          id: string
          is_active: boolean
          kpi_definition_id: string
          profit_center_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cadence: string
          created_at?: string
          id?: string
          is_active?: boolean
          kpi_definition_id: string
          profit_center_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cadence?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kpi_definition_id?: string
          profit_center_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_subscriptions_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_subscriptions_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      material_consumption: {
        Row: {
          created_at: string
          created_by: string
          heat_log_id: string
          id: string
          inventory_ledger_id: string | null
          material_id: string
          profit_center_id: string
          quantity: number
          stock_location_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          heat_log_id: string
          id?: string
          inventory_ledger_id?: string | null
          material_id: string
          profit_center_id: string
          quantity: number
          stock_location_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          heat_log_id?: string
          id?: string
          inventory_ledger_id?: string | null
          material_id?: string
          profit_center_id?: string
          quantity?: number
          stock_location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_consumption_heat_log_id_fkey"
            columns: ["heat_log_id"]
            isOneToOne: false
            referencedRelation: "heat_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_inventory_ledger_id_fkey"
            columns: ["inventory_ledger_id"]
            isOneToOne: false
            referencedRelation: "inventory_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      material_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          parent_group: string
          profit_center_id: string
          subgroup: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          parent_group: string
          profit_center_id: string
          subgroup?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          parent_group?: string
          profit_center_id?: string
          subgroup?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          category: string
          code: string
          created_at: string
          group_name: string | null
          id: string
          is_active: boolean
          max_level: number | null
          min_level: number | null
          name: string
          profit_center_id: string
          reorder_level: number | null
          specs: Json
          std_cost: number | null
          subgroup: string | null
          type: Database["public"]["Enums"]["material_type"] | null
          uom: string
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          group_name?: string | null
          id?: string
          is_active?: boolean
          max_level?: number | null
          min_level?: number | null
          name: string
          profit_center_id: string
          reorder_level?: number | null
          specs?: Json
          std_cost?: number | null
          subgroup?: string | null
          type?: Database["public"]["Enums"]["material_type"] | null
          uom?: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          group_name?: string | null
          id?: string
          is_active?: boolean
          max_level?: number | null
          min_level?: number | null
          name?: string
          profit_center_id?: string
          reorder_level?: number | null
          specs?: Json
          std_cost?: number | null
          subgroup?: string | null
          type?: Database["public"]["Enums"]["material_type"] | null
          uom?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_grants: {
        Row: {
          action: string
          created_at: string
          id: string
          is_active: boolean
          resource: string
          role: Database["public"]["Enums"]["app_role"]
          rule: Json
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          is_active?: boolean
          resource: string
          role: Database["public"]["Enums"]["app_role"]
          rule?: Json
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          is_active?: boolean
          resource?: string
          role?: Database["public"]["Enums"]["app_role"]
          rule?: Json
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          display_name: string | null
          id: string
          job_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          id?: string
          job_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          id?: string
          job_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profit_center_modules: {
        Row: {
          created_at: string
          id: string
          is_default_entry: boolean
          is_enabled: boolean
          module_id: string
          nav_label: string | null
          profit_center_id: string
          route_segment: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default_entry?: boolean
          is_enabled?: boolean
          module_id: string
          nav_label?: string | null
          profit_center_id: string
          route_segment?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default_entry?: boolean
          is_enabled?: boolean
          module_id?: string
          nav_label?: string | null
          profit_center_id?: string
          route_segment?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_center_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "app_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_center_modules_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_center_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          profit_center_id: string
          scope: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          profit_center_id: string
          scope?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          profit_center_id?: string
          scope?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_center_settings_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_centers: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          location_name: string | null
          name: string
          process_profile: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          location_name?: string | null
          name: string
          process_profile?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          location_name?: string | null
          name?: string
          process_profile?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_deliveries: {
        Row: {
          cadence: string
          delivered_at: string
          error_message: string | null
          id: string
          kpi_definition_id: string
          payload: Json
          profit_center_id: string
          status: string
          user_id: string
        }
        Insert: {
          cadence: string
          delivered_at?: string
          error_message?: string | null
          id?: string
          kpi_definition_id: string
          payload?: Json
          profit_center_id: string
          status: string
          user_id: string
        }
        Update: {
          cadence?: string
          delivered_at?: string
          error_message?: string | null
          id?: string
          kpi_definition_id?: string
          payload?: Json
          profit_center_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_deliveries_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_deliveries_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          code: string
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          name: string
          profit_center_id: string
          sort_order: number
          start_time: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          name: string
          profit_center_id: string
          sort_order?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          profit_center_id?: string
          sort_order?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          profit_center_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          profit_center_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          profit_center_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      uom_conversions: {
        Row: {
          created_at: string
          factor: number
          from_uom: string
          id: string
          is_active: boolean
          notes: string | null
          profit_center_id: string
          to_uom: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          factor: number
          from_uom: string
          id?: string
          is_active?: boolean
          notes?: string | null
          profit_center_id: string
          to_uom: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          factor?: number
          from_uom?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          profit_center_id?: string
          to_uom?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profit_centers: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          profit_center_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          profit_center_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          profit_center_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profit_centers_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _compute_kpi_aggregate: {
        Args: {
          _from: string
          _profit_center_id: string
          _spec: Json
          _to: string
        }
        Returns: number
      }
      _compute_kpi_ratio_series: {
        Args: {
          _formula: Json
          _from: string
          _profit_center_id: string
          _to: string
        }
        Returns: Json
      }
      _compute_kpi_series: {
        Args: {
          _from: string
          _profit_center_id: string
          _spec: Json
          _to: string
        }
        Returns: Json
      }
      bulk_reverse_inventory_ledger: {
        Args: { _ids: string[]; _reason: string }
        Returns: Json
      }
      bulk_void_heat_logs: {
        Args: { _ids: string[]; _reason: string }
        Returns: Json
      }
      can_edit_heat_log: {
        Args: { _heat_log_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_profit_center: {
        Args: { _profit_center_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_profile: {
        Args: { _target_user_id: string; _viewer_user_id: string }
        Returns: boolean
      }
      can_void_heat_log: {
        Args: { _heat_log_id: string; _user_id: string }
        Returns: boolean
      }
      compute_kpi: {
        Args: {
          _from: string
          _key: string
          _profit_center_id: string
          _to: string
        }
        Returns: Json
      }
      compute_kpi_consolidated: {
        Args: { _from: string; _key: string; _to: string }
        Returns: Json
      }
      compute_kpi_drilldown: {
        Args: {
          _from: string
          _key: string
          _limit?: number
          _profit_center_id: string
          _to: string
        }
        Returns: Json
      }
      current_stock: {
        Args: {
          _material_id: string
          _profit_center_id: string
          _stock_location_id: string
        }
        Returns: number
      }
      has_elevated_role: { Args: { _user_id: string }; Returns: boolean }
      has_profit_center_access: {
        Args: { _profit_center_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      permission_allows: {
        Args: {
          _action: string
          _resource: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      reverse_inventory_ledger: {
        Args: { _ledger_id: string; _reason: string }
        Returns: Json
      }
      user_can_act: {
        Args: { _action: string; _resource: string; _user_id: string }
        Returns: boolean
      }
      void_heat_log: {
        Args: { _heat_log_id: string; _reason: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "operator"
        | "analyst"
        | "user"
        | "super_admin"
      cost_type: "fixed" | "variable"
      machine_type: "FAD" | "CLU" | "DRI"
      material_type: "RM" | "FG" | "WIP" | "Consumable"
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
      app_role: [
        "admin",
        "manager",
        "operator",
        "analyst",
        "user",
        "super_admin",
      ],
      cost_type: ["fixed", "variable"],
      machine_type: ["FAD", "CLU", "DRI"],
      material_type: ["RM", "FG", "WIP", "Consumable"],
    },
  },
} as const
