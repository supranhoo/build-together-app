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
      bunker_feed_tests: {
        Row: {
          created_at: string
          created_by: string
          deviations: Json
          extra_specs: Json
          fc_pct: number | null
          id: string
          material_id: string
          mn_pct: number | null
          moisture_pct: number | null
          notes: string | null
          profit_center_id: string
          result: Database["public"]["Enums"]["bunker_test_result"]
          size_range: string | null
          stock_location_id: string
          tested_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deviations?: Json
          extra_specs?: Json
          fc_pct?: number | null
          id?: string
          material_id: string
          mn_pct?: number | null
          moisture_pct?: number | null
          notes?: string | null
          profit_center_id: string
          result?: Database["public"]["Enums"]["bunker_test_result"]
          size_range?: string | null
          stock_location_id: string
          tested_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deviations?: Json
          extra_specs?: Json
          fc_pct?: number | null
          id?: string
          material_id?: string
          mn_pct?: number | null
          moisture_pct?: number | null
          notes?: string | null
          profit_center_id?: string
          result?: Database["public"]["Enums"]["bunker_test_result"]
          size_range?: string | null
          stock_location_id?: string
          tested_at?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      byproduct_credits: {
        Row: {
          byproduct_type: string
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          notes: string | null
          profit_center_id: string
          rate: number
          uom: string
          updated_at: string
        }
        Insert: {
          byproduct_type: string
          created_at?: string
          created_by: string
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          profit_center_id: string
          rate: number
          uom?: string
          updated_at?: string
        }
        Update: {
          byproduct_type?: string
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          profit_center_id?: string
          rate?: number
          uom?: string
          updated_at?: string
        }
        Relationships: []
      }
      compliance_records: {
        Row: {
          attachments: Json
          created_at: string
          created_by: string
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          issued_at: string | null
          notes: string | null
          profit_center_id: string
          record_type: string
          reference_no: string
          responsible_user_id: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          created_by: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          issued_at?: string | null
          notes?: string | null
          profit_center_id: string
          record_type: string
          reference_no: string
          responsible_user_id?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          issued_at?: string | null
          notes?: string | null
          profit_center_id?: string
          record_type?: string
          reference_no?: string
          responsible_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cost_alert_rules: {
        Row: {
          comparator: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          kpi_key: string
          notes: string | null
          profit_center_id: string
          rule_name: string
          severity: string
          threshold: number
          updated_at: string
        }
        Insert: {
          comparator: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          kpi_key: string
          notes?: string | null
          profit_center_id: string
          rule_name: string
          severity?: string
          threshold: number
          updated_at?: string
        }
        Update: {
          comparator?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          kpi_key?: string
          notes?: string | null
          profit_center_id?: string
          rule_name?: string
          severity?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      cost_comparison_presets: {
        Row: {
          baseline_slot_index: number
          created_at: string
          created_by: string
          id: string
          name: string
          notes: string | null
          profit_center_id: string
          slots: Json
        }
        Insert: {
          baseline_slot_index?: number
          created_at?: string
          created_by: string
          id?: string
          name: string
          notes?: string | null
          profit_center_id: string
          slots?: Json
        }
        Update: {
          baseline_slot_index?: number
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          notes?: string | null
          profit_center_id?: string
          slots?: Json
        }
        Relationships: []
      }
      cost_period_snapshots: {
        Row: {
          created_at: string
          id: string
          locked_at: string
          locked_by: string
          notes: string | null
          payload: Json
          period_end: string
          period_start: string
          profit_center_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked_at?: string
          locked_by: string
          notes?: string | null
          payload?: Json
          period_end: string
          period_start: string
          profit_center_id: string
        }
        Update: {
          created_at?: string
          id?: string
          locked_at?: string
          locked_by?: string
          notes?: string | null
          payload?: Json
          period_end?: string
          period_start?: string
          profit_center_id?: string
        }
        Relationships: []
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
      currencies: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          symbol: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dispatch_clearances: {
        Row: {
          clearance_no: string
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string
          customer: string | null
          fg_inspection_id: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          profit_center_id: string
          status: Database["public"]["Enums"]["dispatch_status"]
          updated_at: string
          vehicle_no: string | null
        }
        Insert: {
          clearance_no: string
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          created_by: string
          customer?: string | null
          fg_inspection_id?: string | null
          hold_reason?: string | null
          id?: string
          notes?: string | null
          profit_center_id: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          updated_at?: string
          vehicle_no?: string | null
        }
        Update: {
          clearance_no?: string
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          created_by?: string
          customer?: string | null
          fg_inspection_id?: string | null
          hold_reason?: string | null
          id?: string
          notes?: string | null
          profit_center_id?: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          updated_at?: string
          vehicle_no?: string | null
        }
        Relationships: []
      }
      ferro_cost_sheets: {
        Row: {
          byproduct_credit: number
          created_at: string
          created_by: string
          grade: string
          gross_cost: number
          heat_log_id: string
          id: string
          net_cost: number
          net_cost_per_mt: number | null
          notes: string | null
          payload: Json
          product: string | null
          production_mt: number
          profit_center_id: string
          sheet_date: string
        }
        Insert: {
          byproduct_credit?: number
          created_at?: string
          created_by: string
          grade: string
          gross_cost: number
          heat_log_id: string
          id?: string
          net_cost: number
          net_cost_per_mt?: number | null
          notes?: string | null
          payload?: Json
          product?: string | null
          production_mt: number
          profit_center_id: string
          sheet_date: string
        }
        Update: {
          byproduct_credit?: number
          created_at?: string
          created_by?: string
          grade?: string
          gross_cost?: number
          heat_log_id?: string
          id?: string
          net_cost?: number
          net_cost_per_mt?: number | null
          notes?: string | null
          payload?: Json
          product?: string | null
          production_mt?: number
          profit_center_id?: string
          sheet_date?: string
        }
        Relationships: []
      }
      fg_inspections: {
        Row: {
          batch_no: string | null
          created_at: string
          created_by: string
          extra_specs: Json
          fg_c_pct: number | null
          fg_mn_pct: number | null
          fg_p_pct: number | null
          fg_s_pct: number | null
          fg_si_pct: number | null
          grade: string | null
          heat_log_id: string | null
          id: string
          inspected_at: string
          inspection_no: string
          notes: string | null
          product: string | null
          profit_center_id: string
          result: Database["public"]["Enums"]["inspection_result"]
          size_range: string | null
          updated_at: string
        }
        Insert: {
          batch_no?: string | null
          created_at?: string
          created_by: string
          extra_specs?: Json
          fg_c_pct?: number | null
          fg_mn_pct?: number | null
          fg_p_pct?: number | null
          fg_s_pct?: number | null
          fg_si_pct?: number | null
          grade?: string | null
          heat_log_id?: string | null
          id?: string
          inspected_at?: string
          inspection_no: string
          notes?: string | null
          product?: string | null
          profit_center_id: string
          result?: Database["public"]["Enums"]["inspection_result"]
          size_range?: string | null
          updated_at?: string
        }
        Update: {
          batch_no?: string | null
          created_at?: string
          created_by?: string
          extra_specs?: Json
          fg_c_pct?: number | null
          fg_mn_pct?: number | null
          fg_p_pct?: number | null
          fg_s_pct?: number | null
          fg_si_pct?: number | null
          grade?: string | null
          heat_log_id?: string | null
          id?: string
          inspected_at?: string
          inspection_no?: string
          notes?: string | null
          product?: string | null
          profit_center_id?: string
          result?: Database["public"]["Enums"]["inspection_result"]
          size_range?: string | null
          updated_at?: string
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
      fx_rates: {
        Row: {
          created_at: string
          created_by: string
          effective_date: string
          from_currency: string
          id: string
          notes: string | null
          profit_center_id: string
          rate: number
          to_currency: string
        }
        Insert: {
          created_at?: string
          created_by: string
          effective_date: string
          from_currency: string
          id?: string
          notes?: string | null
          profit_center_id: string
          rate: number
          to_currency: string
        }
        Update: {
          created_at?: string
          created_by?: string
          effective_date?: string
          from_currency?: string
          id?: string
          notes?: string | null
          profit_center_id?: string
          rate?: number
          to_currency?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_logs: {
        Row: {
          created_at: string
          created_by: string
          fe_pct: number | null
          id: string
          inventory_ledger_id: string
          invoice_no: string | null
          mn_pct: number | null
          moisture_pct: number | null
          notes: string | null
          profit_center_id: string
          vendor: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          fe_pct?: number | null
          id?: string
          inventory_ledger_id: string
          invoice_no?: string | null
          mn_pct?: number | null
          moisture_pct?: number | null
          notes?: string | null
          profit_center_id: string
          vendor?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          fe_pct?: number | null
          id?: string
          inventory_ledger_id?: string
          invoice_no?: string | null
          mn_pct?: number | null
          moisture_pct?: number | null
          notes?: string | null
          profit_center_id?: string
          vendor?: string | null
        }
        Relationships: []
      }
      heat_log_approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          heat_log_id: string
          id: string
          notes: string | null
          profit_center_id: string
          status: Database["public"]["Enums"]["heat_approval_status"]
          submitted_at: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          heat_log_id: string
          id?: string
          notes?: string | null
          profit_center_id: string
          status?: Database["public"]["Enums"]["heat_approval_status"]
          submitted_at?: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          heat_log_id?: string
          id?: string
          notes?: string | null
          profit_center_id?: string
          status?: Database["public"]["Enums"]["heat_approval_status"]
          submitted_at?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: []
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
      heat_metallurgy: {
        Row: {
          aux_power_mwh: number | null
          avg_power_factor: number | null
          batch_no: string | null
          created_at: string
          created_by: string
          dust_mn_pct: number | null
          dust_qty_mt: number | null
          fg_mn_pct: number | null
          furnace_power_mwh: number | null
          grade: string | null
          heat_log_id: string
          id: string
          notes: string | null
          product: string | null
          profit_center_id: string
          slag_mno_pct: number | null
          slag_qty_mt: number | null
          status: Database["public"]["Enums"]["heat_metallurgy_status"]
          tapping_no: string | null
          tapping_power_mwh: number | null
          updated_at: string
        }
        Insert: {
          aux_power_mwh?: number | null
          avg_power_factor?: number | null
          batch_no?: string | null
          created_at?: string
          created_by: string
          dust_mn_pct?: number | null
          dust_qty_mt?: number | null
          fg_mn_pct?: number | null
          furnace_power_mwh?: number | null
          grade?: string | null
          heat_log_id: string
          id?: string
          notes?: string | null
          product?: string | null
          profit_center_id: string
          slag_mno_pct?: number | null
          slag_qty_mt?: number | null
          status?: Database["public"]["Enums"]["heat_metallurgy_status"]
          tapping_no?: string | null
          tapping_power_mwh?: number | null
          updated_at?: string
        }
        Update: {
          aux_power_mwh?: number | null
          avg_power_factor?: number | null
          batch_no?: string | null
          created_at?: string
          created_by?: string
          dust_mn_pct?: number | null
          dust_qty_mt?: number | null
          fg_mn_pct?: number | null
          furnace_power_mwh?: number | null
          grade?: string | null
          heat_log_id?: string
          id?: string
          notes?: string | null
          product?: string | null
          profit_center_id?: string
          slag_mno_pct?: number | null
          slag_qty_mt?: number | null
          status?: Database["public"]["Enums"]["heat_metallurgy_status"]
          tapping_no?: string | null
          tapping_power_mwh?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      import_shipments: {
        Row: {
          bl_number: string | null
          created_at: string
          created_by: string
          currency_code: string
          customs_cost: number | null
          destination_port: string | null
          eta: string | null
          etd: string | null
          freight_cost: number | null
          id: string
          notes: string | null
          origin_country: string | null
          po_id: string | null
          profit_center_id: string
          shipment_no: string
          status: Database["public"]["Enums"]["shipment_status"]
          updated_at: string
          vessel: string | null
        }
        Insert: {
          bl_number?: string | null
          created_at?: string
          created_by: string
          currency_code?: string
          customs_cost?: number | null
          destination_port?: string | null
          eta?: string | null
          etd?: string | null
          freight_cost?: number | null
          id?: string
          notes?: string | null
          origin_country?: string | null
          po_id?: string | null
          profit_center_id: string
          shipment_no: string
          status?: Database["public"]["Enums"]["shipment_status"]
          updated_at?: string
          vessel?: string | null
        }
        Update: {
          bl_number?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          customs_cost?: number | null
          destination_port?: string | null
          eta?: string | null
          etd?: string | null
          freight_cost?: number | null
          id?: string
          notes?: string | null
          origin_country?: string | null
          po_id?: string | null
          profit_center_id?: string
          shipment_no?: string
          status?: Database["public"]["Enums"]["shipment_status"]
          updated_at?: string
          vessel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_shipments_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_shipments_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
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
      power_tariff_slabs: {
        Row: {
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          end_hour: number
          id: string
          is_active: boolean
          notes: string | null
          profit_center_id: string
          rate_per_mwh: number
          season: string | null
          slab_name: string
          start_hour: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          effective_from: string
          effective_to?: string | null
          end_hour: number
          id?: string
          is_active?: boolean
          notes?: string | null
          profit_center_id: string
          rate_per_mwh: number
          season?: string | null
          slab_name: string
          start_hour: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          end_hour?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          profit_center_id?: string
          rate_per_mwh?: number
          season?: string | null
          slab_name?: string
          start_hour?: number
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
      purchase_order_lines: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          material_id: string
          notes: string | null
          po_id: string
          profit_center_id: string
          qty_ordered: number
          qty_received: number
          source_pr_line_id: string | null
          unit_cost: number
          uom: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          id?: string
          material_id: string
          notes?: string | null
          po_id: string
          profit_center_id: string
          qty_ordered: number
          qty_received?: number
          source_pr_line_id?: string | null
          unit_cost: number
          uom: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          material_id?: string
          notes?: string | null
          po_id?: string
          profit_center_id?: string
          qty_ordered?: number
          qty_received?: number
          source_pr_line_id?: string | null
          unit_cost?: number
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_source_pr_line_id_fkey"
            columns: ["source_pr_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisition_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          created_at: string
          created_by: string
          currency_code: string
          expected_delivery_date: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          po_number: string
          profit_center_id: string
          source_pr_id: string | null
          status: Database["public"]["Enums"]["po_status"]
          supplier_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by: string
          currency_code?: string
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          po_number: string
          profit_center_id: string
          source_pr_id?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          supplier_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          po_number?: string
          profit_center_id?: string
          source_pr_id?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          supplier_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_source_pr_id_fkey"
            columns: ["source_pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisition_lines: {
        Row: {
          created_at: string
          currency_code: string
          est_unit_cost: number | null
          id: string
          material_id: string
          notes: string | null
          pr_id: string
          profit_center_id: string
          quantity: number
          uom: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          est_unit_cost?: number | null
          id?: string
          material_id: string
          notes?: string | null
          pr_id: string
          profit_center_id: string
          quantity: number
          uom: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          est_unit_cost?: number | null
          id?: string
          material_id?: string
          notes?: string | null
          pr_id?: string
          profit_center_id?: string
          quantity?: number
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_lines_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_lines_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_lines_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisitions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          notes: string | null
          pr_number: string
          priority: string | null
          profit_center_id: string
          rejected_reason: string | null
          requested_by: string
          requested_for_date: string | null
          status: Database["public"]["Enums"]["pr_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          pr_number: string
          priority?: string | null
          profit_center_id: string
          rejected_reason?: string | null
          requested_by: string
          requested_for_date?: string | null
          status?: Database["public"]["Enums"]["pr_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          pr_number?: string
          priority?: string | null
          profit_center_id?: string
          rejected_reason?: string | null
          requested_by?: string
          requested_for_date?: string | null
          status?: Database["public"]["Enums"]["pr_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_complaints: {
        Row: {
          batch_no: string | null
          closed_at: string | null
          closed_by: string | null
          complaint_no: string
          corrective_action: string | null
          created_at: string
          created_by: string
          customer: string | null
          description: string
          id: string
          product: string | null
          profit_center_id: string
          reported_at: string
          root_cause: string | null
          status: Database["public"]["Enums"]["complaint_status"]
          updated_at: string
        }
        Insert: {
          batch_no?: string | null
          closed_at?: string | null
          closed_by?: string | null
          complaint_no: string
          corrective_action?: string | null
          created_at?: string
          created_by: string
          customer?: string | null
          description: string
          id?: string
          product?: string | null
          profit_center_id: string
          reported_at?: string
          root_cause?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
        }
        Update: {
          batch_no?: string | null
          closed_at?: string | null
          closed_by?: string | null
          complaint_no?: string
          corrective_action?: string | null
          created_at?: string
          created_by?: string
          customer?: string | null
          description?: string
          id?: string
          product?: string | null
          profit_center_id?: string
          reported_at?: string
          root_cause?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
        }
        Relationships: []
      }
      quality_samples: {
        Row: {
          collected_at: string | null
          created_at: string
          created_by: string
          id: string
          lot_reference: string | null
          material_id: string | null
          notes: string | null
          planned_at: string
          profit_center_id: string
          sample_no: string
          status: Database["public"]["Enums"]["sample_status"]
          stock_location_id: string | null
          test_results: Json
          tested_at: string | null
          updated_at: string
        }
        Insert: {
          collected_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          lot_reference?: string | null
          material_id?: string | null
          notes?: string | null
          planned_at?: string
          profit_center_id: string
          sample_no: string
          status?: Database["public"]["Enums"]["sample_status"]
          stock_location_id?: string | null
          test_results?: Json
          tested_at?: string | null
          updated_at?: string
        }
        Update: {
          collected_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          lot_reference?: string | null
          material_id?: string | null
          notes?: string | null
          planned_at?: string
          profit_center_id?: string
          sample_no?: string
          status?: Database["public"]["Enums"]["sample_status"]
          stock_location_id?: string | null
          test_results?: Json
          tested_at?: string | null
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
      risk_events: {
        Row: {
          created_at: string
          created_by: string
          description: string
          id: string
          mitigation_plan: string | null
          occurred_at: string
          profit_center_id: string
          resolved_at: string | null
          risk_type: string
          severity: Database["public"]["Enums"]["risk_severity"]
          status: Database["public"]["Enums"]["risk_status"]
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          id?: string
          mitigation_plan?: string | null
          occurred_at?: string
          profit_center_id: string
          resolved_at?: string | null
          risk_type: string
          severity?: Database["public"]["Enums"]["risk_severity"]
          status?: Database["public"]["Enums"]["risk_status"]
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          mitigation_plan?: string | null
          occurred_at?: string
          profit_center_id?: string
          resolved_at?: string | null
          risk_type?: string
          severity?: Database["public"]["Enums"]["risk_severity"]
          status?: Database["public"]["Enums"]["risk_status"]
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_events_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      selling_prices: {
        Row: {
          created_at: string
          created_by: string
          currency_code: string
          effective_from: string
          effective_to: string | null
          grade: string
          id: string
          is_active: boolean
          notes: string | null
          price_per_mt: number
          product: string | null
          profit_center_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          currency_code?: string
          effective_from: string
          effective_to?: string | null
          grade: string
          id?: string
          is_active?: boolean
          notes?: string | null
          price_per_mt: number
          product?: string | null
          profit_center_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          currency_code?: string
          effective_from?: string
          effective_to?: string | null
          grade?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          price_per_mt?: number
          product?: string | null
          profit_center_id?: string
          updated_at?: string
        }
        Relationships: []
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
      standard_cost_bom: {
        Row: {
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          grade: string
          id: string
          is_active: boolean
          material_id: string
          notes: string | null
          product: string | null
          profit_center_id: string
          std_qty_per_mt: number
          std_rate: number | null
          uom: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          effective_from: string
          effective_to?: string | null
          grade: string
          id?: string
          is_active?: boolean
          material_id: string
          notes?: string | null
          product?: string | null
          profit_center_id: string
          std_qty_per_mt: number
          std_rate?: number | null
          uom?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          grade?: string
          id?: string
          is_active?: boolean
          material_id?: string
          notes?: string | null
          product?: string | null
          profit_center_id?: string
          std_qty_per_mt?: number
          std_rate?: number | null
          uom?: string
          updated_at?: string
        }
        Relationships: []
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
      supplier_evaluations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          notes: string | null
          on_time_pct: number | null
          overall_score: number | null
          period_end: string
          period_start: string
          price_score: number | null
          profit_center_id: string
          quality_pct: number | null
          supplier_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          on_time_pct?: number | null
          overall_score?: number | null
          period_end: string
          period_start: string
          price_score?: number | null
          profit_center_id: string
          quality_pct?: number | null
          supplier_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          on_time_pct?: number | null
          overall_score?: number | null
          period_end?: string
          period_start?: string
          price_score?: number | null
          profit_center_id?: string
          quality_pct?: number | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_evaluations_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_evaluations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          code: string
          contact_person: string | null
          country: string | null
          created_at: string
          created_by: string
          default_currency: string
          email: string | null
          id: string
          is_active: boolean
          is_preferred: boolean
          lead_time_days: number | null
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          profit_center_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          default_currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_preferred?: boolean
          lead_time_days?: number | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          profit_center_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          default_currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_preferred?: boolean
          lead_time_days?: number | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          profit_center_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_profit_center_id_fkey"
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
      bunker_test_result: "pass" | "conditional" | "fail"
      complaint_status:
        | "open"
        | "investigating"
        | "corrective_action"
        | "closed"
      cost_type: "fixed" | "variable"
      dispatch_status: "pending" | "cleared" | "held" | "rejected"
      heat_approval_status: "pending" | "approved" | "rejected"
      heat_metallurgy_status: "draft" | "submitted"
      inspection_result: "pass" | "conditional" | "fail" | "pending"
      machine_type: "FAD" | "CLU" | "DRI"
      material_type: "RM" | "FG" | "WIP" | "Consumable"
      po_status:
        | "draft"
        | "sent"
        | "acknowledged"
        | "partially_received"
        | "received"
        | "closed"
        | "cancelled"
      pr_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "converted"
        | "closed"
      risk_severity: "low" | "medium" | "high" | "critical"
      risk_status: "open" | "mitigated" | "closed"
      sample_status:
        | "planned"
        | "collected"
        | "tested"
        | "released"
        | "rejected"
      shipment_status:
        | "planned"
        | "in_transit"
        | "arrived"
        | "customs"
        | "delivered"
        | "delayed"
        | "cancelled"
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
      bunker_test_result: ["pass", "conditional", "fail"],
      complaint_status: [
        "open",
        "investigating",
        "corrective_action",
        "closed",
      ],
      cost_type: ["fixed", "variable"],
      dispatch_status: ["pending", "cleared", "held", "rejected"],
      heat_approval_status: ["pending", "approved", "rejected"],
      heat_metallurgy_status: ["draft", "submitted"],
      inspection_result: ["pass", "conditional", "fail", "pending"],
      machine_type: ["FAD", "CLU", "DRI"],
      material_type: ["RM", "FG", "WIP", "Consumable"],
      po_status: [
        "draft",
        "sent",
        "acknowledged",
        "partially_received",
        "received",
        "closed",
        "cancelled",
      ],
      pr_status: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "converted",
        "closed",
      ],
      risk_severity: ["low", "medium", "high", "critical"],
      risk_status: ["open", "mitigated", "closed"],
      sample_status: ["planned", "collected", "tested", "released", "rejected"],
      shipment_status: [
        "planned",
        "in_transit",
        "arrived",
        "customs",
        "delivered",
        "delayed",
        "cancelled",
      ],
    },
  },
} as const
