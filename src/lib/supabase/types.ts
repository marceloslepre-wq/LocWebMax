// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      auditoria_contratos: {
        Row: {
          acao: string
          campos_antigos: Json | null
          campos_novos: Json | null
          created_at: string
          id: string
          ip_usuario: string | null
          rental_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          campos_antigos?: Json | null
          campos_novos?: Json | null
          created_at?: string
          id?: string
          ip_usuario?: string | null
          rental_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          campos_antigos?: Json | null
          campos_novos?: Json | null
          created_at?: string
          id?: string
          ip_usuario?: string | null
          rental_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'auditoria_contratos_rental_id_fkey'
            columns: ['rental_id']
            isOneToOne: false
            referencedRelation: 'rentals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'auditoria_contratos_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      customers: {
        Row: {
          address: Json | null
          attachment: string | null
          comprovante_endereco_url: string | null
          created_at: string
          delivery_address: Json | null
          doc_identificacao_url: string | null
          document: string
          documento_url: Json | null
          email: string | null
          has_different_delivery_address: boolean | null
          id: string
          matricula: string
          name: string
          observations: string | null
          phone_cell: string | null
          phone_com: string | null
          phone_res: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          attachment?: string | null
          comprovante_endereco_url?: string | null
          created_at?: string
          delivery_address?: Json | null
          doc_identificacao_url?: string | null
          document: string
          documento_url?: Json | null
          email?: string | null
          has_different_delivery_address?: boolean | null
          id?: string
          matricula: string
          name: string
          observations?: string | null
          phone_cell?: string | null
          phone_com?: string | null
          phone_res?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          attachment?: string | null
          comprovante_endereco_url?: string | null
          created_at?: string
          delivery_address?: Json | null
          doc_identificacao_url?: string | null
          document?: string
          documento_url?: Json | null
          email?: string | null
          has_different_delivery_address?: boolean | null
          id?: string
          matricula?: string
          name?: string
          observations?: string | null
          phone_cell?: string | null
          phone_com?: string | null
          phone_res?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      estoque_por_local: {
        Row: {
          created_at: string
          id: string
          inventory_id: string
          local_id: string
          quantidade_locada: number
          quantidade_total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id: string
          local_id: string
          quantidade_locada?: number
          quantidade_total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string
          local_id?: string
          quantidade_locada?: number
          quantidade_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'estoque_por_local_inventory_id_fkey'
            columns: ['inventory_id']
            isOneToOne: false
            referencedRelation: 'inventory'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'estoque_por_local_local_id_fkey'
            columns: ['local_id']
            isOneToOne: false
            referencedRelation: 'locais'
            referencedColumns: ['id']
          },
        ]
      }
      exchange_history: {
        Row: {
          available_credit: number
          created_at: string
          days_remaining: number
          days_used: number
          difference_to_pay: number
          exchange_date: string
          extra_days: number
          id: string
          new_cost: number
          new_inventory_id: string | null
          old_inventory_id: string | null
          rental_id: string | null
        }
        Insert: {
          available_credit: number
          created_at?: string
          days_remaining: number
          days_used: number
          difference_to_pay: number
          exchange_date?: string
          extra_days: number
          id?: string
          new_cost: number
          new_inventory_id?: string | null
          old_inventory_id?: string | null
          rental_id?: string | null
        }
        Update: {
          available_credit?: number
          created_at?: string
          days_remaining?: number
          days_used?: number
          difference_to_pay?: number
          exchange_date?: string
          extra_days?: number
          id?: string
          new_cost?: number
          new_inventory_id?: string | null
          old_inventory_id?: string | null
          rental_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'exchange_history_new_inventory_id_fkey'
            columns: ['new_inventory_id']
            isOneToOne: false
            referencedRelation: 'inventory'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'exchange_history_old_inventory_id_fkey'
            columns: ['old_inventory_id']
            isOneToOne: false
            referencedRelation: 'inventory'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'exchange_history_rental_id_fkey'
            columns: ['rental_id']
            isOneToOne: false
            referencedRelation: 'rentals'
            referencedColumns: ['id']
          },
        ]
      }
      historico_trocas: {
        Row: {
          contrato_id: string
          created_at: string | null
          credito_disponivel: number | null
          custo_novo: number | null
          data_troca: string | null
          dias_extras: number | null
          dias_restantes: number | null
          dias_usados: number | null
          diferenca_pagar: number | null
          id: string
          produto_antigo_id: string
          produto_novo_id: string
          valor_diario_novo: number | null
          valor_diario_original: number | null
        }
        Insert: {
          contrato_id: string
          created_at?: string | null
          credito_disponivel?: number | null
          custo_novo?: number | null
          data_troca?: string | null
          dias_extras?: number | null
          dias_restantes?: number | null
          dias_usados?: number | null
          diferenca_pagar?: number | null
          id?: string
          produto_antigo_id: string
          produto_novo_id: string
          valor_diario_novo?: number | null
          valor_diario_original?: number | null
        }
        Update: {
          contrato_id?: string
          created_at?: string | null
          credito_disponivel?: number | null
          custo_novo?: number | null
          data_troca?: string | null
          dias_extras?: number | null
          dias_restantes?: number | null
          dias_usados?: number | null
          diferenca_pagar?: number | null
          id?: string
          produto_antigo_id?: string
          produto_novo_id?: string
          valor_diario_novo?: number | null
          valor_diario_original?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'historico_trocas_contrato_id_fkey'
            columns: ['contrato_id']
            isOneToOne: false
            referencedRelation: 'rentals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'historico_trocas_produto_antigo_id_fkey'
            columns: ['produto_antigo_id']
            isOneToOne: false
            referencedRelation: 'inventory'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'historico_trocas_produto_novo_id_fkey'
            columns: ['produto_novo_id']
            isOneToOne: false
            referencedRelation: 'inventory'
            referencedColumns: ['id']
          },
        ]
      }
      inventory: {
        Row: {
          assets: Json | null
          available_qty: number
          category: string
          code: string
          condition_status: string
          created_at: string
          daily_price: number | null
          description: string | null
          id: string
          image: string | null
          monthly_price: number | null
          name: string
          rented_qty: number
          sale_price: number | null
          total_qty: number
        }
        Insert: {
          assets?: Json | null
          available_qty?: number
          category: string
          code: string
          condition_status?: string
          created_at?: string
          daily_price?: number | null
          description?: string | null
          id?: string
          image?: string | null
          monthly_price?: number | null
          name: string
          rented_qty?: number
          sale_price?: number | null
          total_qty?: number
        }
        Update: {
          assets?: Json | null
          available_qty?: number
          category?: string
          code?: string
          condition_status?: string
          created_at?: string
          daily_price?: number | null
          description?: string | null
          id?: string
          image?: string | null
          monthly_price?: number | null
          name?: string
          rented_qty?: number
          sale_price?: number | null
          total_qty?: number
        }
        Relationships: []
      }
      inventory_locations: {
        Row: {
          available_qty: number
          id: string
          inventory_id: string
          location_id: string
          quantity: number
          rented_qty: number
          updated_at: string
        }
        Insert: {
          available_qty?: number
          id?: string
          inventory_id: string
          location_id: string
          quantity?: number
          rented_qty?: number
          updated_at?: string
        }
        Update: {
          available_qty?: number
          id?: string
          inventory_id?: string
          location_id?: string
          quantity?: number
          rented_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'inventory_locations_inventory_id_fkey'
            columns: ['inventory_id']
            isOneToOne: false
            referencedRelation: 'inventory'
            referencedColumns: ['id']
          },
        ]
      }
      inventory_transfers: {
        Row: {
          created_at: string
          destination_location_id: string
          id: string
          inventory_id: string
          origin_location_id: string
          quantity: number
          status: string
        }
        Insert: {
          created_at?: string
          destination_location_id: string
          id?: string
          inventory_id: string
          origin_location_id: string
          quantity: number
          status?: string
        }
        Update: {
          created_at?: string
          destination_location_id?: string
          id?: string
          inventory_id?: string
          origin_location_id?: string
          quantity?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'inventory_transfers_inventory_id_fkey'
            columns: ['inventory_id']
            isOneToOne: false
            referencedRelation: 'inventory'
            referencedColumns: ['id']
          },
        ]
      }
      locais: {
        Row: {
          ativo: boolean
          created_at: string
          endereco: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      patrimonio: {
        Row: {
          created_at: string
          data_aquisicao: string | null
          estado: string | null
          fornecedor: string | null
          foto_url: string | null
          id: string
          inventory_id: string
          localizacao: string | null
          numero_patrimonio: string
          observacoes: string | null
          updated_at: string
          valor_compra: number | null
        }
        Insert: {
          created_at?: string
          data_aquisicao?: string | null
          estado?: string | null
          fornecedor?: string | null
          foto_url?: string | null
          id?: string
          inventory_id: string
          localizacao?: string | null
          numero_patrimonio: string
          observacoes?: string | null
          updated_at?: string
          valor_compra?: number | null
        }
        Update: {
          created_at?: string
          data_aquisicao?: string | null
          estado?: string | null
          fornecedor?: string | null
          foto_url?: string | null
          id?: string
          inventory_id?: string
          localizacao?: string | null
          numero_patrimonio?: string
          observacoes?: string | null
          updated_at?: string
          valor_compra?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'patrimonio_inventory_id_fkey'
            columns: ['inventory_id']
            isOneToOne: false
            referencedRelation: 'inventory'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          auth_user_id: string | null
          created_at: string
          email: string
          id: string
          name: string
          permissions: Json | null
          role: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          permissions?: Json | null
          role?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          permissions?: Json | null
          role?: string
        }
        Relationships: []
      }
      rentals: {
        Row: {
          actual_return_date: string | null
          contract_number: string | null
          created_at: string
          custom_contract_html: string | null
          custom_contract_text: string | null
          customer_id: string | null
          expected_return_date: string
          id: string
          items: Json
          local_devolucao_id: string | null
          local_retirada_id: string | null
          payment_method: string
          pickup_location_id: string | null
          start_date: string
          status: string
          total: number
          user_id: string | null
        }
        Insert: {
          actual_return_date?: string | null
          contract_number?: string | null
          created_at?: string
          custom_contract_html?: string | null
          custom_contract_text?: string | null
          customer_id?: string | null
          expected_return_date: string
          id?: string
          items?: Json
          local_devolucao_id?: string | null
          local_retirada_id?: string | null
          payment_method?: string
          pickup_location_id?: string | null
          start_date: string
          status?: string
          total?: number
          user_id?: string | null
        }
        Update: {
          actual_return_date?: string | null
          contract_number?: string | null
          created_at?: string
          custom_contract_html?: string | null
          custom_contract_text?: string | null
          customer_id?: string | null
          expected_return_date?: string
          id?: string
          items?: Json
          local_devolucao_id?: string | null
          local_retirada_id?: string | null
          payment_method?: string
          pickup_location_id?: string | null
          start_date?: string
          status?: string
          total?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'rentals_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rentals_local_devolucao_id_fkey'
            columns: ['local_devolucao_id']
            isOneToOne: false
            referencedRelation: 'locais'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rentals_local_retirada_id_fkey'
            columns: ['local_retirada_id']
            isOneToOne: false
            referencedRelation: 'locais'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rentals_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      rentals_backup_dates: {
        Row: {
          actual_return_date: string | null
          contract_number: string | null
          created_at: string | null
          custom_contract_html: string | null
          custom_contract_text: string | null
          customer_id: string | null
          expected_return_date: string | null
          id: string | null
          items: Json | null
          payment_method: string | null
          pickup_location_id: string | null
          start_date: string | null
          status: string | null
          total: number | null
          user_id: string | null
        }
        Insert: {
          actual_return_date?: string | null
          contract_number?: string | null
          created_at?: string | null
          custom_contract_html?: string | null
          custom_contract_text?: string | null
          customer_id?: string | null
          expected_return_date?: string | null
          id?: string | null
          items?: Json | null
          payment_method?: string | null
          pickup_location_id?: string | null
          start_date?: string | null
          status?: string | null
          total?: number | null
          user_id?: string | null
        }
        Update: {
          actual_return_date?: string | null
          contract_number?: string | null
          created_at?: string | null
          custom_contract_html?: string | null
          custom_contract_text?: string | null
          customer_id?: string | null
          expected_return_date?: string | null
          id?: string | null
          items?: Json | null
          payment_method?: string | null
          pickup_location_id?: string | null
          start_date?: string | null
          status?: string | null
          total?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          categories: Json | null
          company_address: string | null
          company_document: string | null
          company_name: string | null
          contract_file_name: string | null
          contract_template_html: string | null
          created_at: string
          id: string
          late_fee_type: string | null
          late_fee_value: number | null
          locations: Json | null
          logo_url: string | null
          primary_color: string | null
          updated_at: string
        }
        Insert: {
          categories?: Json | null
          company_address?: string | null
          company_document?: string | null
          company_name?: string | null
          contract_file_name?: string | null
          contract_template_html?: string | null
          created_at?: string
          id?: string
          late_fee_type?: string | null
          late_fee_value?: number | null
          locations?: Json | null
          logo_url?: string | null
          primary_color?: string | null
          updated_at?: string
        }
        Update: {
          categories?: Json | null
          company_address?: string | null
          company_document?: string | null
          company_name?: string | null
          contract_file_name?: string | null
          contract_template_html?: string | null
          created_at?: string
          id?: string
          late_fee_type?: string | null
          late_fee_value?: number | null
          locations?: Json | null
          logo_url?: string | null
          primary_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_rental_atomic: {
        Args: {
          p_contract_number: string
          p_custom_contract_html: string
          p_customer_id: string
          p_expected_return_date: string
          p_items: Json
          p_local_retirada_id: string
          p_payment_method: string
          p_start_date: string
          p_total: number
        }
        Returns: string
      }
      exchange_rental_item: {
        Args: {
          p_difference_to_pay: number
          p_exchange_history_data: Json
          p_new_expected_return_date: string
          p_new_inventory_id: string
          p_old_inventory_id: string
          p_quantity: number
          p_rental_id: string
        }
        Returns: undefined
      }
      public_add_asset: {
        Args: { p_asset: Json; p_item_id: string }
        Returns: undefined
      }
      return_items_partial: {
        Args: {
          p_actual_return_date: string
          p_items_to_return: Json
          p_local_devolucao_id: string
          p_rental_id: string
        }
        Returns: Json
      }
      return_rental_atomic: {
        Args: {
          p_actual_return_date: string
          p_local_devolucao_id: string
          p_rental_id: string
        }
        Returns: undefined
      }
      transfer_inventory: {
        Args: {
          p_destination_location_id: string
          p_inventory_id: string
          p_origin_location_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      transfer_inventory_batch: {
        Args: {
          p_destination_location_id: string
          p_items: Json
          p_origin_location_id: string
        }
        Returns: undefined
      }
      update_overdue_rentals: { Args: never; Returns: number }
      update_rental_secure:
        | {
            Args: {
              p_custom_text: string
              p_expected_return_date: string
              p_rental_id: string
              p_start_date: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_custom_text: string
              p_expected_return_date: string
              p_justificativa?: string
              p_rental_id: string
              p_start_date: string
              p_user_id: string
            }
            Returns: undefined
          }
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

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
