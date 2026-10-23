
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "attachments": {
                  Row: {
                    "created_at": string,"id": string,"mime_type": string,"size_bytes": number,"storage_path": string,"trade_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"mime_type": string,"size_bytes": number,"storage_path": string,"trade_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"mime_type"?: string,"size_bytes"?: number,"storage_path"?: string,"trade_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_trade_id_fkey"
      columns: ["trade_id"]
isOneToOne: false
      referencedRelation: "trades"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"created_at": string,"details": NonNullable<Json>,"id": number,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"broker_connections": {
                  Row: {
                    "created_at": string,"id": string,"last_error": string | null,"last_synced_at": string | null,"provider": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"provider"?: string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"provider"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"broker_secrets": {
                  Row: {
                    "access_token_enc": string,"connection_id": string,"expires_at": string,"refresh_token_enc": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token_enc": string,"connection_id": string,"expires_at": string,"refresh_token_enc": string,"updated_at"?: string
                  }
                  Update: {
                    "access_token_enc"?: string,"connection_id"?: string,"expires_at"?: string,"refresh_token_enc"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "broker_secrets_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: true
      referencedRelation: "broker_connections"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_journal": {
                  Row: {
                    "day": string,"mood": number | null,"notes": string | null,"sleep_hours": number | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"mood"?: number | null,"notes"?: string | null,"sleep_hours"?: number | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "day"?: string,"mood"?: number | null,"notes"?: string | null,"sleep_hours"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"executions": {
                  Row: {
                    "account_id": string,"close_detail": Json | null,"commission": number,"executed_at": string,"external_deal_id": string,"external_position_id": string,"id": string,"price": number,"side": string,"symbol": string,"trade_id": string | null,"user_id": string,"volume": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"close_detail"?: Json | null,"commission"?: number,"executed_at": string,"external_deal_id": string,"external_position_id": string,"id"?: string,"price": number,"side": string,"symbol": string,"trade_id"?: string | null,"user_id": string,"volume": number
                  }
                  Update: {
                    "account_id"?: string,"close_detail"?: Json | null,"commission"?: number,"executed_at"?: string,"external_deal_id"?: string,"external_position_id"?: string,"id"?: string,"price"?: number,"side"?: string,"symbol"?: string,"trade_id"?: string | null,"user_id"?: string,"volume"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "executions_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "trading_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "executions_trade_id_fkey"
      columns: ["trade_id"]
isOneToOne: false
      referencedRelation: "trades"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"currency": string,"display_name": string | null,"rules": NonNullable<Json>,"timezone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"display_name"?: string | null,"rules"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"display_name"?: string | null,"rules"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"symbols": {
                  Row: {
                    "account_id": string,"digits": number | null,"external_symbol_id": number,"lot_size": number | null,"name": string,"pip_position": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"digits"?: number | null,"external_symbol_id": number,"lot_size"?: number | null,"name": string,"pip_position"?: number | null,"user_id": string
                  }
                  Update: {
                    "account_id"?: string,"digits"?: number | null,"external_symbol_id"?: number,"lot_size"?: number | null,"name"?: string,"pip_position"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "symbols_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "trading_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_runs": {
                  Row: {
                    "connection_id": string | null,"deals_fetched": number,"error": string | null,"finished_at": string | null,"id": string,"started_at": string,"status": string,"trades_upserted": number,"trigger": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "connection_id"?: string | null,"deals_fetched"?: number,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"started_at"?: string,"status"?: string,"trades_upserted"?: number,"trigger": string,"user_id": string
                  }
                  Update: {
                    "connection_id"?: string | null,"deals_fetched"?: number,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"started_at"?: string,"status"?: string,"trades_upserted"?: number,"trigger"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_runs_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: false
      referencedRelation: "broker_connections"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name": string,"user_id": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"trade_plans": {
                  Row: {
                    "chart_url": string | null,"checklist": NonNullable<Json>,"created_at": string,"entry_price": number | null,"id": string,"risk_percent": number | null,"setup": string | null,"side": string,"status": string,"stop_loss": number | null,"symbol": string,"take_profit": number | null,"thesis": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chart_url"?: string | null,"checklist"?: NonNullable<Json>,"created_at"?: string,"entry_price"?: number | null,"id"?: string,"risk_percent"?: number | null,"setup"?: string | null,"side": string,"status"?: string,"stop_loss"?: number | null,"symbol": string,"take_profit"?: number | null,"thesis"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "chart_url"?: string | null,"checklist"?: NonNullable<Json>,"created_at"?: string,"entry_price"?: number | null,"id"?: string,"risk_percent"?: number | null,"setup"?: string | null,"side"?: string,"status"?: string,"stop_loss"?: number | null,"symbol"?: string,"take_profit"?: number | null,"thesis"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"trade_tags": {
                  Row: {
                    "tag_id": string,"trade_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "tag_id": string,"trade_id": string,"user_id": string
                  }
                  Update: {
                    "tag_id"?: string,"trade_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trade_tags_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trade_tags_trade_id_fkey"
      columns: ["trade_id"]
isOneToOne: false
      referencedRelation: "trades"
      referencedColumns: ["id"]
    }
                  ]
                },"trades": {
                  Row: {
                    "account_id": string | null,"chart_url": string | null,"close_time": string | null,"commission": number,"created_at": string,"emotion_after": string | null,"emotion_before": string | null,"entry_price": number,"exit_price": number | null,"external_position_id": string | null,"followed_plan": boolean | null,"gross_pnl": number,"id": string,"lots": number,"manually_edited": boolean,"net_pnl": number,"notes": string | null,"open_time": string,"pip_size": number | null,"pips": number | null,"plan_id": string | null,"r_multiple": number | null,"rating": number | null,"setup": string | null,"side": string,"source": string,"status": string,"stop_loss": number | null,"swap": number,"symbol": string,"take_profit": number | null,"updated_at": string,"user_id": string,"volume": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"chart_url"?: string | null,"close_time"?: string | null,"commission"?: number,"created_at"?: string,"emotion_after"?: string | null,"emotion_before"?: string | null,"entry_price": number,"exit_price"?: number | null,"external_position_id"?: string | null,"followed_plan"?: boolean | null,"gross_pnl"?: number,"id"?: string,"lots": number,"manually_edited"?: boolean,"net_pnl"?: number,"notes"?: string | null,"open_time": string,"pip_size"?: number | null,"pips"?: number | null,"plan_id"?: string | null,"r_multiple"?: number | null,"rating"?: number | null,"setup"?: string | null,"side": string,"source": string,"status": string,"stop_loss"?: number | null,"swap"?: number,"symbol": string,"take_profit"?: number | null,"updated_at"?: string,"user_id": string,"volume": number
                  }
                  Update: {
                    "account_id"?: string | null,"chart_url"?: string | null,"close_time"?: string | null,"commission"?: number,"created_at"?: string,"emotion_after"?: string | null,"emotion_before"?: string | null,"entry_price"?: number,"exit_price"?: number | null,"external_position_id"?: string | null,"followed_plan"?: boolean | null,"gross_pnl"?: number,"id"?: string,"lots"?: number,"manually_edited"?: boolean,"net_pnl"?: number,"notes"?: string | null,"open_time"?: string,"pip_size"?: number | null,"pips"?: number | null,"plan_id"?: string | null,"r_multiple"?: number | null,"rating"?: number | null,"setup"?: string | null,"side"?: string,"source"?: string,"status"?: string,"stop_loss"?: number | null,"swap"?: number,"symbol"?: string,"take_profit"?: number | null,"updated_at"?: string,"user_id"?: string,"volume"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "trades_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "trading_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trades_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "trade_plans"
      referencedColumns: ["id"]
    }
                  ]
                },"trading_accounts": {
                  Row: {
                    "balance": number | null,"broker": string,"connection_id": string | null,"created_at": string,"currency": string,"external_id": string | null,"id": string,"is_live": boolean,"name": string,"platform": string,"trader_login": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "balance"?: number | null,"broker"?: string,"connection_id"?: string | null,"created_at"?: string,"currency"?: string,"external_id"?: string | null,"id"?: string,"is_live"?: boolean,"name"?: string,"platform": string,"trader_login"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "balance"?: number | null,"broker"?: string,"connection_id"?: string | null,"created_at"?: string,"currency"?: string,"external_id"?: string | null,"id"?: string,"is_live"?: boolean,"name"?: string,"platform"?: string,"trader_login"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trading_accounts_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: false
      referencedRelation: "broker_connections"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
