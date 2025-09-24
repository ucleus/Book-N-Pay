export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          phone: string | null;
          role: "provider" | "customer" | "admin";
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          phone?: string | null;
          role: "provider" | "customer" | "admin";
          created_at?: string;
        };
        Update: {
          email?: string;
          phone?: string | null;
          role?: "provider" | "customer" | "admin";
        };
      };
      providers: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          handle: string;
          bio: string | null;
          currency: string;
          payout_meta: Json | null;
          reschedule_fee_cents: number;
          late_cancel_hours: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name: string;
          handle: string;
          bio?: string | null;
          currency?: string;
          payout_meta?: Json | null;
          reschedule_fee_cents?: number;
          late_cancel_hours?: number;
          created_at?: string;
        };
        Update: {
          display_name?: string;
          handle?: string;
          bio?: string | null;
          currency?: string;
          payout_meta?: Json | null;
          reschedule_fee_cents?: number;
          late_cancel_hours?: number;
        };
      };
      customers: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          email?: string;
          phone?: string | null;
        };
      };
      services: {
        Row: {
          id: string;
          provider_id: string;
          name: string;
          description: string | null;
          duration_min: number;
          base_price_cents: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          name: string;
          description?: string | null;
          duration_min: number;
          base_price_cents: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          duration_min?: number;
          base_price_cents?: number;
          is_active?: boolean;
        };
      };
      availability_rules: {
        Row: {
          id: string;
          provider_id: string;
          dow: number;
          start_time: string;
          end_time: string;
          exceptions: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          dow: number;
          start_time: string;
          end_time: string;
          exceptions?: Json | null;
          created_at?: string;
        };
        Update: {
          dow?: number;
          start_time?: string;
          end_time?: string;
          exceptions?: Json | null;
        };
      };
      blackout_dates: {
        Row: {
          id: string;
          provider_id: string;
          day: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          day: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          day?: string;
          reason?: string | null;
        };
      };
      bookings: {
        Row: {
          id: string;
          provider_id: string;
          service_id: string;
          customer_id: string;
          start_at: string;
          end_at: string | null;
          status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
          pay_mode: "credit" | "per_booking" | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          service_id: string;
          customer_id: string;
          start_at: string;
          end_at?: string | null;
          status?: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
          pay_mode?: "credit" | "per_booking" | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          start_at?: string;
          end_at?: string | null;
          status?: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
          pay_mode?: "credit" | "per_booking" | null;
          notes?: string | null;
          updated_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          booking_id: string | null;
          provider_id: string;
          status: "initiated" | "succeeded" | "failed" | "refunded";
          amount_cents: number;
          gateway: string;
          gateway_ref: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id?: string | null;
          provider_id: string;
          status: "initiated" | "succeeded" | "failed" | "refunded";
          amount_cents: number;
          gateway: string;
          gateway_ref: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          booking_id?: string | null;
          provider_id?: string;
          status?: "initiated" | "succeeded" | "failed" | "refunded";
          amount_cents?: number;
          gateway?: string;
          gateway_ref?: string;
          metadata?: Json | null;
        };
      };
      wallets: {
        Row: {
          id: string;
          provider_id: string;
          balance_credits: number;
          currency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          balance_credits?: number;
          currency?: string;
          created_at?: string;
        };
        Update: {
          balance_credits?: number;
          currency?: string;
        };
      };
      wallet_ledger: {
        Row: {
          id: string;
          wallet_id: string;
          booking_id: string | null;
          change_credits: number;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          booking_id?: string | null;
          change_credits: number;
          description: string;
          created_at?: string;
        };
        Update: {
          wallet_id?: string;
          booking_id?: string | null;
          change_credits?: number;
          description?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          booking_id: string | null;
          channel: "email" | "whatsapp";
          recipient: string;
          payload: Json;
          status: "pending" | "sent" | "failed";
          created_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          booking_id?: string | null;
          channel: "email" | "whatsapp";
          recipient: string;
          payload: Json;
          status?: "pending" | "sent" | "failed";
          created_at?: string;
          sent_at?: string | null;
        };
        Update: {
          booking_id?: string | null;
          channel?: "email" | "whatsapp";
          recipient?: string;
          payload?: Json;
          status?: "pending" | "sent" | "failed";
          sent_at?: string | null;
        };
      };
      webhook_events: {
        Row: {
          id: string;
          gateway: string;
          external_id: string;
          payload: Json;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          gateway: string;
          external_id: string;
          payload: Json;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          gateway?: string;
          external_id?: string;
          payload?: Json;
          processed_at?: string | null;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};
