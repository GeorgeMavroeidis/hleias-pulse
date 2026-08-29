export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: Json;
          entity_id: string | null;
          entity_type: string;
          id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
        };
        Relationships: [];
      };
      admin_members: {
        Row: {
          created_at: string;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      authors: {
        Row: {
          avatar_url: string;
          created_at: string;
          id: string;
          name: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          avatar_url: string;
          created_at?: string;
          id: string;
          name: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string;
          created_at?: string;
          id?: string;
          name?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      businesses: {
        Row: {
          bio: string;
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          display_name: string;
          id: string;
          profile_id: string | null;
          updated_at: string;
          user_id: string | null;
          verification_status: string;
        };
        Insert: {
          bio?: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          display_name: string;
          id?: string;
          profile_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
          verification_status?: string;
        };
        Update: {
          bio?: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          profile_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
          verification_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "businesses_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          author_id: string | null;
          author_kind: string;
          author_name: string;
          created_at: string;
          cultural_event_id: string | null;
          id: string;
          moderation_status: string;
          place_id: string | null;
          post_id: string | null;
          posting_identity: string;
          profile_id: string | null;
          route_id: string | null;
          sort_order: number;
          target_type: string;
          text: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          author_id?: string | null;
          author_kind?: string;
          author_name: string;
          created_at?: string;
          cultural_event_id?: string | null;
          id?: string;
          moderation_status?: string;
          place_id?: string | null;
          post_id?: string | null;
          posting_identity?: string;
          profile_id?: string | null;
          route_id?: string | null;
          sort_order?: number;
          target_type: string;
          text: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          author_id?: string | null;
          author_kind?: string;
          author_name?: string;
          created_at?: string;
          cultural_event_id?: string | null;
          id?: string;
          moderation_status?: string;
          place_id?: string | null;
          post_id?: string | null;
          posting_identity?: string;
          profile_id?: string | null;
          route_id?: string | null;
          sort_order?: number;
          target_type?: string;
          text?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "authors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_cultural_event_id_fkey";
            columns: ["cultural_event_id"];
            isOneToOne: false;
            referencedRelation: "cultural_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
        ];
      };
      cultural_events: {
        Row: {
          area: string;
          created_at: string;
          description_el: string;
          description_en: string | null;
          event_date: string;
          event_type: string;
          greek_title: string;
          id: string;
          is_official: boolean;
          is_past_event: boolean;
          lat: number | null;
          likes_count: number;
          lng: number | null;
          moderation_status: string;
          organizer_id: string | null;
          organizer_name: string;
          place_id: string | null;
          poster_url: string;
          ticket_url: string | null;
          title: string;
          updated_at: string;
          user_id: string | null;
          venue_name: string;
        };
        Insert: {
          area: string;
          created_at?: string;
          description_el: string;
          description_en?: string | null;
          event_date: string;
          event_type: string;
          greek_title: string;
          id: string;
          is_official?: boolean;
          is_past_event?: boolean;
          lat?: number | null;
          likes_count?: number;
          lng?: number | null;
          moderation_status?: string;
          organizer_id?: string | null;
          organizer_name: string;
          place_id?: string | null;
          poster_url: string;
          ticket_url?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string | null;
          venue_name: string;
        };
        Update: {
          area?: string;
          created_at?: string;
          description_el?: string;
          description_en?: string | null;
          event_date?: string;
          event_type?: string;
          greek_title?: string;
          id?: string;
          is_official?: boolean;
          is_past_event?: boolean;
          lat?: number | null;
          likes_count?: number;
          lng?: number | null;
          moderation_status?: string;
          organizer_id?: string | null;
          organizer_name?: string;
          place_id?: string | null;
          poster_url?: string;
          ticket_url?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
          venue_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cultural_events_organizer_id_fkey";
            columns: ["organizer_id"];
            isOneToOne: false;
            referencedRelation: "organizers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cultural_events_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      cultural_event_likes: {
        Row: {
          created_at: string;
          cultural_event_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          cultural_event_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          cultural_event_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cultural_event_likes_cultural_event_id_fkey";
            columns: ["cultural_event_id"];
            isOneToOne: false;
            referencedRelation: "cultural_events";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_redemptions: {
        Row: {
          business_id: string;
          code: string;
          expires_at: string;
          id: string;
          issued_at: string;
          place_id: string;
          profile_claim_id: string;
          redeemed_at: string | null;
          redeemed_by: string | null;
          status: string;
          user_id: string | null;
        };
        Insert: {
          business_id: string;
          code: string;
          expires_at?: string;
          id?: string;
          issued_at?: string;
          place_id: string;
          profile_claim_id: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          business_id?: string;
          code?: string;
          expires_at?: string;
          id?: string;
          issued_at?: string;
          place_id?: string;
          profile_claim_id?: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "deal_redemptions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_redemptions_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_redemptions_profile_claim_id_fkey";
            columns: ["profile_claim_id"];
            isOneToOne: false;
            referencedRelation: "place_business_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_rsvps: {
        Row: {
          created_at: string;
          event_id: string;
          profile_id: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          profile_id?: string | null;
          status: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          profile_id?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "meet_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_rsvps_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          created_at: string;
          display_time: string;
          id: string;
          place_id: string;
          price: string;
          sort_order: number;
          tags: string[];
          title: string;
          updated_at: string;
          vibe: string;
        };
        Insert: {
          created_at?: string;
          display_time: string;
          id: string;
          place_id: string;
          price: string;
          sort_order?: number;
          tags?: string[];
          title: string;
          updated_at?: string;
          vibe: string;
        };
        Update: {
          created_at?: string;
          display_time?: string;
          id?: string;
          place_id?: string;
          price?: string;
          sort_order?: number;
          tags?: string[];
          title?: string;
          updated_at?: string;
          vibe?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      meet_events: {
        Row: {
          attendee_avatar_urls: string[];
          capacity: number | null;
          category: string;
          cover_url: string;
          created_at: string;
          description: string;
          duration_min: number;
          going_count: number;
          host_avatar_url: string;
          host_name: string;
          host_type: string;
          hot: boolean;
          id: string;
          maybe_count: number;
          moderation_status: string;
          place_id: string;
          price: string;
          profile_id: string | null;
          seed_going_count: number;
          seed_maybe_count: number;
          starts_at: string;
          tags: string[];
          title: string;
          updated_at: string;
          user_id: string | null;
          vibe: string;
        };
        Insert: {
          attendee_avatar_urls?: string[];
          capacity?: number | null;
          category: string;
          cover_url: string;
          created_at?: string;
          description: string;
          duration_min?: number;
          going_count?: number;
          host_avatar_url: string;
          host_name: string;
          host_type?: string;
          hot?: boolean;
          id: string;
          maybe_count?: number;
          moderation_status?: string;
          place_id: string;
          price: string;
          profile_id?: string | null;
          seed_going_count?: number;
          seed_maybe_count?: number;
          starts_at: string;
          tags?: string[];
          title: string;
          updated_at?: string;
          user_id?: string | null;
          vibe: string;
        };
        Update: {
          attendee_avatar_urls?: string[];
          capacity?: number | null;
          category?: string;
          cover_url?: string;
          created_at?: string;
          description?: string;
          duration_min?: number;
          going_count?: number;
          host_avatar_url?: string;
          host_name?: string;
          host_type?: string;
          hot?: boolean;
          id?: string;
          maybe_count?: number;
          moderation_status?: string;
          place_id?: string;
          price?: string;
          profile_id?: string | null;
          seed_going_count?: number;
          seed_maybe_count?: number;
          starts_at?: string;
          tags?: string[];
          title?: string;
          updated_at?: string;
          user_id?: string | null;
          vibe?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meet_events_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meet_events_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizers: {
        Row: {
          bio: string;
          created_at: string;
          display_name: string;
          id: string;
          profile_id: string | null;
          updated_at: string;
          user_id: string | null;
          verification_status: string;
        };
        Insert: {
          bio?: string;
          created_at?: string;
          display_name: string;
          id?: string;
          profile_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
          verification_status?: string;
        };
        Update: {
          bio?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          profile_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
          verification_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      place_avatars: {
        Row: {
          avatar_url: string;
          place_id: string;
          position: number;
        };
        Insert: {
          avatar_url: string;
          place_id: string;
          position: number;
        };
        Update: {
          avatar_url?: string;
          place_id?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "place_avatars_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      places: {
        Row: {
          area: string;
          best_time: string;
          budget: string;
          comment_count: number;
          created_at: string;
          created_by_identity: string;
          crowd: string;
          greek_name: string;
          hotness: number;
          id: string;
          image_url: string;
          lat: number;
          lng: number;
          moderation_status: string;
          mood: string;
          name: string;
          profile_id: string | null;
          pulse: number;
          recent_post_count: number;
          short: string;
          sort_order: number;
          status: string;
          tags: string[];
          type: string;
          updated_at: string;
          user_id: string | null;
          x: number;
          y: number;
        };
        Insert: {
          area: string;
          best_time: string;
          budget: string;
          comment_count?: number;
          created_at?: string;
          created_by_identity?: string;
          crowd: string;
          greek_name: string;
          hotness: number;
          id: string;
          image_url: string;
          lat: number;
          lng: number;
          moderation_status?: string;
          mood: string;
          name: string;
          profile_id?: string | null;
          pulse: number;
          recent_post_count?: number;
          short: string;
          sort_order?: number;
          status: string;
          tags?: string[];
          type: string;
          updated_at?: string;
          user_id?: string | null;
          x: number;
          y: number;
        };
        Update: {
          area?: string;
          best_time?: string;
          budget?: string;
          comment_count?: number;
          created_at?: string;
          created_by_identity?: string;
          crowd?: string;
          greek_name?: string;
          hotness?: number;
          id?: string;
          image_url?: string;
          lat?: number;
          lng?: number;
          moderation_status?: string;
          mood?: string;
          name?: string;
          profile_id?: string | null;
          pulse?: number;
          recent_post_count?: number;
          short?: string;
          sort_order?: number;
          status?: string;
          tags?: string[];
          type?: string;
          updated_at?: string;
          user_id?: string | null;
          x?: number;
          y?: number;
        };
        Relationships: [
          {
            foreignKeyName: "places_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      place_business_profiles: {
        Row: {
          business_id: string;
          created_at: string;
          deal_active: boolean;
          deal_text: string | null;
          hours_text: string | null;
          id: string;
          menu_url: string | null;
          phone: string | null;
          photos: string[];
          place_id: string;
          status: string;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          deal_active?: boolean;
          deal_text?: string | null;
          hours_text?: string | null;
          id?: string;
          menu_url?: string | null;
          phone?: string | null;
          photos?: string[];
          place_id: string;
          status?: string;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          deal_active?: boolean;
          deal_text?: string | null;
          hours_text?: string | null;
          id?: string;
          menu_url?: string | null;
          phone?: string | null;
          photos?: string[];
          place_id?: string;
          status?: string;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "place_business_profiles_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "place_business_profiles_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      post_likes: {
        Row: {
          created_at: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          author_id: string;
          author_kind: string;
          created_at: string;
          display_time: string;
          id: string;
          image_url: string;
          kind: string;
          likes_count: number;
          moderation_status: string;
          place_id: string;
          posting_identity: string;
          profile_id: string | null;
          sort_order: number;
          tags: string[];
          text: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          author_id: string;
          author_kind?: string;
          created_at?: string;
          display_time: string;
          id: string;
          image_url: string;
          kind: string;
          likes_count?: number;
          moderation_status?: string;
          place_id: string;
          posting_identity?: string;
          profile_id?: string | null;
          sort_order?: number;
          tags?: string[];
          text: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          author_id?: string;
          author_kind?: string;
          created_at?: string;
          display_time?: string;
          id?: string;
          image_url?: string;
          kind?: string;
          likes_count?: number;
          moderation_status?: string;
          place_id?: string;
          posting_identity?: string;
          profile_id?: string | null;
          sort_order?: number;
          tags?: string[];
          text?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "authors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          default_identity: string;
          display_name: string | null;
          handle: string | null;
          home_area: string | null;
          id: string;
          profile_completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_path?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          default_identity?: string;
          display_name?: string | null;
          handle?: string | null;
          home_area?: string | null;
          id: string;
          profile_completed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          default_identity?: string;
          display_name?: string | null;
          handle?: string | null;
          home_area?: string | null;
          id?: string;
          profile_completed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      route_stops: {
        Row: {
          body: string;
          display_time: string;
          place_id: string;
          position: number;
          route_id: string;
          title: string;
        };
        Insert: {
          body: string;
          display_time: string;
          place_id: string;
          position: number;
          route_id: string;
          title: string;
        };
        Update: {
          body?: string;
          display_time?: string;
          place_id?: string;
          position?: number;
          route_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_stops_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_stops_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
        ];
      };
      routes: {
        Row: {
          author_id: string;
          budget: string;
          comment_count: number;
          created_at: string;
          duration: string;
          id: string;
          image_url: string;
          lede: string;
          saves_count: number;
          sort_order: number;
          tags: string[];
          title: string;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          budget: string;
          comment_count?: number;
          created_at?: string;
          duration: string;
          id: string;
          image_url: string;
          lede: string;
          saves_count?: number;
          sort_order?: number;
          tags?: string[];
          title: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          budget?: string;
          comment_count?: number;
          created_at?: string;
          duration?: string;
          id?: string;
          image_url?: string;
          lede?: string;
          saves_count?: number;
          sort_order?: number;
          tags?: string[];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "routes_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "authors";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_items: {
        Row: {
          created_at: string;
          id: string;
          place_id: string | null;
          post_id: string | null;
          route_id: string | null;
          target_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          place_id?: string | null;
          post_id?: string | null;
          route_id?: string | null;
          target_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          place_id?: string | null;
          post_id?: string | null;
          route_id?: string | null;
          target_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_items_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_items_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_items_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
        ];
      };
      stories: {
        Row: {
          author_avatar_url: string;
          author_name: string;
          author_type: string;
          caption: string;
          condition: string[];
          created_at: string;
          crowd: string | null;
          expires_after_hours: number | null;
          id: string;
          kind: string;
          label: string;
          media_url: string;
          moderation_status: string;
          parking: string | null;
          place_id: string;
          position: number;
          profile_id: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          author_avatar_url?: string;
          author_name?: string;
          author_type?: string;
          caption?: string;
          condition?: string[];
          created_at?: string;
          crowd?: string | null;
          expires_after_hours?: number | null;
          id: string;
          kind?: string;
          label: string;
          media_url: string;
          moderation_status?: string;
          parking?: string | null;
          place_id: string;
          position: number;
          profile_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          author_avatar_url?: string;
          author_name?: string;
          author_type?: string;
          caption?: string;
          condition?: string[];
          created_at?: string;
          crowd?: string | null;
          expires_after_hours?: number | null;
          id?: string;
          kind?: string;
          label?: string;
          media_url?: string;
          moderation_status?: string;
          parking?: string | null;
          place_id?: string;
          position?: number;
          profile_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stories_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stories_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      story_views: {
        Row: {
          seen_at: string;
          story_id: string;
          user_id: string;
        };
        Insert: {
          seen_at?: string;
          story_id: string;
          user_id: string;
        };
        Update: {
          seen_at?: string;
          story_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
        ];
      };
      user_activity_days: {
        Row: {
          activity_day: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          activity_day: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          activity_day?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_place_visits: {
        Row: {
          place_id: string;
          user_id: string;
          visited_at: string;
        };
        Insert: {
          place_id: string;
          user_id: string;
          visited_at?: string;
        };
        Update: {
          place_id?: string;
          user_id?: string;
          visited_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_place_visits_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          created_at: string;
          home_map_area: string | null;
          language: string;
          location_enabled: boolean;
          updated_at: string;
          user_id: string;
          vibe_chips: string[];
        };
        Insert: {
          created_at?: string;
          home_map_area?: string | null;
          language?: string;
          location_enabled?: boolean;
          updated_at?: string;
          user_id: string;
          vibe_chips?: string[];
        };
        Update: {
          created_at?: string;
          home_map_area?: string | null;
          language?: string;
          location_enabled?: boolean;
          updated_at?: string;
          user_id?: string;
          vibe_chips?: string[];
        };
        Relationships: [];
      };
      user_security_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      vibe_chips: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          position: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          label: string;
          position: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_admin_role: { Args: never; Returns: string | null };
      current_business_id: { Args: never; Returns: string | null };
      current_organizer_id: { Args: never; Returns: string | null };
      get_pulse_bootstrap: { Args: never; Returns: Json };
      issue_deal_code: { Args: { target_place_id: string }; Returns: Json };
      redeem_deal_code: { Args: { code: string }; Returns: Json };
      moderate_content: {
        Args: { next_status: string; target_id: string; target_type: string };
        Returns: undefined;
      };
      review_place_claim: {
        Args: { claim_id: string; next_status: string };
        Returns: undefined;
      };
      set_place_deal: {
        Args: { claim_id: string; deal_active: boolean; deal_text: string | null };
        Returns: undefined;
      };
      refresh_meet_event_rsvp_counts: {
        Args: { target_event_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
