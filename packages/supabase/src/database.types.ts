/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: ordered SQL in supabase/migrations.
 * Regenerate with: npm run db:generate
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      article_media: {
        Row: {
          id: string;
          revision_id: string;
          media_asset_id: string;
          role: Database["public"]["Enums"]["media_role"];
          position: number;
          alt_text: string | null;
          caption: string | null;
          credit_override: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          revision_id: string;
          media_asset_id: string;
          role: Database["public"]["Enums"]["media_role"];
          position?: number;
          alt_text?: string | null;
          caption?: string | null;
          credit_override?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          revision_id?: string;
          media_asset_id?: string;
          role?: Database["public"]["Enums"]["media_role"];
          position?: number;
          alt_text?: string | null;
          caption?: string | null;
          credit_override?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_media_media_asset_id_fkey";
            columns: ["media_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_media_revision_id_fkey";
            columns: ["revision_id"];
            isOneToOne: false;
            referencedRelation: "article_revisions";
            referencedColumns: ["id"];
          },
        ];
      };
      article_revisions: {
        Row: {
          id: string;
          article_id: string;
          revision_number: number;
          revision_kind: Database["public"]["Enums"]["revision_kind"];
          supersedes_revision_id: string | null;
          title: string;
          dek: string | null;
          body_markdown: string;
          body_plain_text: string;
          word_count: number;
          reading_time_minutes: number;
          seo_title: string | null;
          seo_description: string | null;
          social_title: string | null;
          social_description: string | null;
          change_summary: string | null;
          is_material_update: boolean;
          created_by: string | null;
          created_at: string;
          content_checksum: string;
        };
        Insert: {
          id?: string;
          article_id: string;
          revision_number: number;
          revision_kind?: Database["public"]["Enums"]["revision_kind"];
          supersedes_revision_id?: string | null;
          title: string;
          dek?: string | null;
          body_markdown: string;
          body_plain_text: string;
          word_count: number;
          reading_time_minutes: number;
          seo_title?: string | null;
          seo_description?: string | null;
          social_title?: string | null;
          social_description?: string | null;
          change_summary?: string | null;
          is_material_update?: boolean;
          created_by?: string | null;
          created_at?: string;
          content_checksum?: never;
        };
        Update: {
          id?: string;
          article_id?: string;
          revision_number?: number;
          revision_kind?: Database["public"]["Enums"]["revision_kind"];
          supersedes_revision_id?: string | null;
          title?: string;
          dek?: string | null;
          body_markdown?: string;
          body_plain_text?: string;
          word_count?: number;
          reading_time_minutes?: number;
          seo_title?: string | null;
          seo_description?: string | null;
          social_title?: string | null;
          social_description?: string | null;
          change_summary?: string | null;
          is_material_update?: boolean;
          created_by?: string | null;
          created_at?: string;
          content_checksum?: never;
        };
        Relationships: [
          {
            foreignKeyName: "article_revisions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_revisions_supersedes_revision_id_fkey";
            columns: ["supersedes_revision_id"];
            isOneToOne: false;
            referencedRelation: "article_revisions";
            referencedColumns: ["id"];
          },
        ];
      };
      article_tags: {
        Row: {
          article_id: string;
          tag_id: string;
          created_at: string;
        };
        Insert: {
          article_id: string;
          tag_id: string;
          created_at?: string;
        };
        Update: {
          article_id?: string;
          tag_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_tags_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      articles: {
        Row: {
          id: string;
          author_id: string;
          primary_pillar_id: string;
          category_id: string | null;
          canonical_slug: string;
          canonical_path: string;
          status: Database["public"]["Enums"]["article_status"];
          current_draft_revision_id: string | null;
          published_revision_id: string | null;
          revision_counter: number;
          first_published_at: string | null;
          last_published_at: string | null;
          scheduled_for: string | null;
          archived_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
          row_version: number;
        };
        Insert: {
          id?: string;
          author_id: string;
          primary_pillar_id: string;
          category_id?: string | null;
          canonical_slug: string;
          canonical_path: string;
          status?: Database["public"]["Enums"]["article_status"];
          current_draft_revision_id?: string | null;
          published_revision_id?: string | null;
          revision_counter?: number;
          first_published_at?: string | null;
          last_published_at?: string | null;
          scheduled_for?: string | null;
          archived_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
        };
        Update: {
          id?: string;
          author_id?: string;
          primary_pillar_id?: string;
          category_id?: string | null;
          canonical_slug?: string;
          canonical_path?: string;
          status?: Database["public"]["Enums"]["article_status"];
          current_draft_revision_id?: string | null;
          published_revision_id?: string | null;
          revision_counter?: number;
          first_published_at?: string | null;
          last_published_at?: string | null;
          scheduled_for?: string | null;
          archived_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "authors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_current_draft_revision_fk";
            columns: ["current_draft_revision_id"];
            isOneToOne: true;
            referencedRelation: "article_revisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_primary_pillar_id_fkey";
            columns: ["primary_pillar_id"];
            isOneToOne: false;
            referencedRelation: "pillars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_published_revision_fk";
            columns: ["published_revision_id"];
            isOneToOne: true;
            referencedRelation: "article_revisions";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity_table: string;
          entity_pk: Json;
          old_values: Json | null;
          new_values: Json | null;
          request_id: string | null;
          metadata: Json | null;
          occurred_at: string;
        };
        Insert: {
          id?: number;
          actor_id?: string | null;
          action: string;
          entity_table: string;
          entity_pk: Json;
          old_values?: Json | null;
          new_values?: Json | null;
          request_id?: string | null;
          metadata?: Json | null;
          occurred_at?: string;
        };
        Update: {
          id?: number;
          actor_id?: string | null;
          action?: string;
          entity_table?: string;
          entity_pk?: Json;
          old_values?: Json | null;
          new_values?: Json | null;
          request_id?: string | null;
          metadata?: Json | null;
          occurred_at?: string;
        };
        Relationships: [];
      };
      authors: {
        Row: {
          id: string;
          auth_user_id: string | null;
          name: string;
          slug: string;
          bio_markdown: string | null;
          bio_plain_text: string | null;
          website_url: string | null;
          avatar_media_asset_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          name: string;
          slug: string;
          bio_markdown?: string | null;
          bio_plain_text?: string | null;
          website_url?: string | null;
          avatar_media_asset_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          name?: string;
          slug?: string;
          bio_markdown?: string | null;
          bio_plain_text?: string | null;
          website_url?: string | null;
          avatar_media_asset_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "authors_avatar_media_asset_fk";
            columns: ["avatar_media_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          pillar_id: string;
          name: string;
          slug: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pillar_id: string;
          name: string;
          slug: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pillar_id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_pillar_id_fkey";
            columns: ["pillar_id"];
            isOneToOne: false;
            referencedRelation: "pillars";
            referencedColumns: ["id"];
          },
        ];
      };
      citations: {
        Row: {
          id: string;
          revision_id: string;
          source_id: string;
          ordinal: number;
          citation_key: string;
          citation_text: string;
          locator: string | null;
          public_note: string | null;
          quoted_text: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          revision_id: string;
          source_id: string;
          ordinal: number;
          citation_key: string;
          citation_text: string;
          locator?: string | null;
          public_note?: string | null;
          quoted_text?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          revision_id?: string;
          source_id?: string;
          ordinal?: number;
          citation_key?: string;
          citation_text?: string;
          locator?: string | null;
          public_note?: string | null;
          quoted_text?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "citations_revision_id_fkey";
            columns: ["revision_id"];
            isOneToOne: false;
            referencedRelation: "article_revisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "citations_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      featured_collection_items: {
        Row: {
          collection_id: string;
          article_id: string;
          position: number;
          label: string | null;
          created_at: string;
        };
        Insert: {
          collection_id: string;
          article_id: string;
          position: number;
          label?: string | null;
          created_at?: string;
        };
        Update: {
          collection_id?: string;
          article_id?: string;
          position?: number;
          label?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "featured_collection_items_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "featured_collection_items_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "featured_collections";
            referencedColumns: ["id"];
          },
        ];
      };
      featured_collections: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          status: Database["public"]["Enums"]["collection_status"];
          starts_at: string | null;
          ends_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["collection_status"];
          starts_at?: string | null;
          ends_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["collection_status"];
          starts_at?: string | null;
          ends_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      media_assets: {
        Row: {
          id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          original_filename: string;
          original_storage_key: string;
          checksum_sha256: string;
          mime_type: string;
          byte_size: number;
          width: number | null;
          height: number | null;
          duration_seconds: number | null;
          default_alt_text: string | null;
          default_caption: string | null;
          creator_text: string | null;
          credit_text: string | null;
          source_url: string | null;
          rights_status: Database["public"]["Enums"]["media_rights_status"];
          rights_details: string | null;
          rights_expires_at: string | null;
          focal_x: number | null;
          focal_y: number | null;
          processing_status: Database["public"]["Enums"]["media_processing_status"];
          processing_error: string | null;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kind?: Database["public"]["Enums"]["media_kind"];
          original_filename: string;
          original_storage_key: string;
          checksum_sha256: string;
          mime_type: string;
          byte_size: number;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          default_alt_text?: string | null;
          default_caption?: string | null;
          creator_text?: string | null;
          credit_text?: string | null;
          source_url?: string | null;
          rights_status?: Database["public"]["Enums"]["media_rights_status"];
          rights_details?: string | null;
          rights_expires_at?: string | null;
          focal_x?: number | null;
          focal_y?: number | null;
          processing_status?: Database["public"]["Enums"]["media_processing_status"];
          processing_error?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kind?: Database["public"]["Enums"]["media_kind"];
          original_filename?: string;
          original_storage_key?: string;
          checksum_sha256?: string;
          mime_type?: string;
          byte_size?: number;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          default_alt_text?: string | null;
          default_caption?: string | null;
          creator_text?: string | null;
          credit_text?: string | null;
          source_url?: string | null;
          rights_status?: Database["public"]["Enums"]["media_rights_status"];
          rights_details?: string | null;
          rights_expires_at?: string | null;
          focal_x?: number | null;
          focal_y?: number | null;
          processing_status?: Database["public"]["Enums"]["media_processing_status"];
          processing_error?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      media_variants: {
        Row: {
          id: string;
          media_asset_id: string;
          variant_name: string;
          storage_key: string;
          mime_type: string;
          format: string;
          width: number | null;
          height: number | null;
          byte_size: number;
          checksum_sha256: string;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          media_asset_id: string;
          variant_name: string;
          storage_key: string;
          mime_type: string;
          format: string;
          width?: number | null;
          height?: number | null;
          byte_size: number;
          checksum_sha256: string;
          is_public?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          media_asset_id?: string;
          variant_name?: string;
          storage_key?: string;
          mime_type?: string;
          format?: string;
          width?: number | null;
          height?: number | null;
          byte_size?: number;
          checksum_sha256?: string;
          is_public?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_variants_media_asset_id_fkey";
            columns: ["media_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      pillars: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      publication_events: {
        Row: {
          id: number;
          publication_job_id: string;
          sequence: number;
          step: string;
          level: Database["public"]["Enums"]["publication_event_level"];
          message: string;
          details: Json | null;
          occurred_at: string;
        };
        Insert: {
          id?: number;
          publication_job_id: string;
          sequence: number;
          step: string;
          level?: Database["public"]["Enums"]["publication_event_level"];
          message: string;
          details?: Json | null;
          occurred_at?: string;
        };
        Update: {
          id?: number;
          publication_job_id?: string;
          sequence?: number;
          step?: string;
          level?: Database["public"]["Enums"]["publication_event_level"];
          message?: string;
          details?: Json | null;
          occurred_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "publication_events_publication_job_id_fkey";
            columns: ["publication_job_id"];
            isOneToOne: false;
            referencedRelation: "publication_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      publication_jobs: {
        Row: {
          id: string;
          article_id: string;
          target_revision_id: string | null;
          action: Database["public"]["Enums"]["publication_action"];
          status: Database["public"]["Enums"]["publication_job_status"];
          idempotency_key: string;
          expected_content_checksum: string | null;
          attempt_count: number;
          max_attempts: number;
          available_at: string;
          leased_at: string | null;
          lease_expires_at: string | null;
          worker_id: string | null;
          initiated_by: string | null;
          error_code: string | null;
          error_detail: Json | null;
          committed_at: string | null;
          verified_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          article_id: string;
          target_revision_id?: string | null;
          action: Database["public"]["Enums"]["publication_action"];
          status?: Database["public"]["Enums"]["publication_job_status"];
          idempotency_key: string;
          expected_content_checksum?: string | null;
          attempt_count?: number;
          max_attempts?: number;
          available_at?: string;
          leased_at?: string | null;
          lease_expires_at?: string | null;
          worker_id?: string | null;
          initiated_by?: string | null;
          error_code?: string | null;
          error_detail?: Json | null;
          committed_at?: string | null;
          verified_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          article_id?: string;
          target_revision_id?: string | null;
          action?: Database["public"]["Enums"]["publication_action"];
          status?: Database["public"]["Enums"]["publication_job_status"];
          idempotency_key?: string;
          expected_content_checksum?: string | null;
          attempt_count?: number;
          max_attempts?: number;
          available_at?: string;
          leased_at?: string | null;
          lease_expires_at?: string | null;
          worker_id?: string | null;
          initiated_by?: string | null;
          error_code?: string | null;
          error_detail?: Json | null;
          committed_at?: string | null;
          verified_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "publication_jobs_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publication_jobs_target_revision_id_fkey";
            columns: ["target_revision_id"];
            isOneToOne: false;
            referencedRelation: "article_revisions";
            referencedColumns: ["id"];
          },
        ];
      };
      redirects: {
        Row: {
          id: string;
          article_id: string | null;
          from_path: string;
          to_path: string;
          kind: Database["public"]["Enums"]["redirect_kind"];
          http_status: number;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          article_id?: string | null;
          from_path: string;
          to_path: string;
          kind?: Database["public"]["Enums"]["redirect_kind"];
          http_status?: number;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          article_id?: string | null;
          from_path?: string;
          to_path?: string;
          kind?: Database["public"]["Enums"]["redirect_kind"];
          http_status?: number;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "redirects_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      search_projection: {
        Row: {
          article_id: string;
          revision_id: string;
          author_id: string;
          pillar_id: string;
          category_id: string | null;
          slug: string;
          canonical_path: string;
          title: string;
          dek: string | null;
          body_plain_text: string;
          author_name: string;
          pillar_name: string;
          category_name: string | null;
          tags: string[];
          tag_text: string;
          published_at: string;
          projection_updated_at: string;
          search_vector: string;
        };
        Insert: {
          article_id: string;
          revision_id: string;
          author_id: string;
          pillar_id: string;
          category_id?: string | null;
          slug: string;
          canonical_path: string;
          title: string;
          dek?: string | null;
          body_plain_text: string;
          author_name: string;
          pillar_name: string;
          category_name?: string | null;
          tags?: string[];
          tag_text?: string;
          published_at: string;
          projection_updated_at?: string;
          search_vector?: never;
        };
        Update: {
          article_id?: string;
          revision_id?: string;
          author_id?: string;
          pillar_id?: string;
          category_id?: string | null;
          slug?: string;
          canonical_path?: string;
          title?: string;
          dek?: string | null;
          body_plain_text?: string;
          author_name?: string;
          pillar_name?: string;
          category_name?: string | null;
          tags?: string[];
          tag_text?: string;
          published_at?: string;
          projection_updated_at?: string;
          search_vector?: never;
        };
        Relationships: [
          {
            foreignKeyName: "search_projection_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: true;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_projection_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "authors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_projection_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_projection_pillar_id_fkey";
            columns: ["pillar_id"];
            isOneToOne: false;
            referencedRelation: "pillars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_projection_revision_id_fkey";
            columns: ["revision_id"];
            isOneToOne: true;
            referencedRelation: "article_revisions";
            referencedColumns: ["id"];
          },
        ];
      };
      site_settings: {
        Row: {
          key: string;
          value: Json;
          is_public: boolean;
          description: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          is_public?: boolean;
          description?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          is_public?: boolean;
          description?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      slug_history: {
        Row: {
          id: string;
          article_id: string;
          pillar_id: string;
          slug: string;
          path: string;
          redirect_id: string;
          replaced_at: string;
        };
        Insert: {
          id?: string;
          article_id: string;
          pillar_id: string;
          slug: string;
          path: string;
          redirect_id: string;
          replaced_at?: string;
        };
        Update: {
          id?: string;
          article_id?: string;
          pillar_id?: string;
          slug?: string;
          path?: string;
          redirect_id?: string;
          replaced_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "slug_history_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slug_history_pillar_id_fkey";
            columns: ["pillar_id"];
            isOneToOne: false;
            referencedRelation: "pillars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slug_history_redirect_id_fkey";
            columns: ["redirect_id"];
            isOneToOne: true;
            referencedRelation: "redirects";
            referencedColumns: ["id"];
          },
        ];
      };
      source_notes: {
        Row: {
          id: string;
          source_id: string;
          note_markdown: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          note_markdown: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          note_markdown?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_notes_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      sources: {
        Row: {
          id: string;
          source_type: Database["public"]["Enums"]["source_type"];
          title: string;
          author_text: string | null;
          publisher: string | null;
          publication_date: string | null;
          url: string | null;
          archive_url: string | null;
          isbn: string | null;
          doi: string | null;
          accessed_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          source_fingerprint: string;
        };
        Insert: {
          id?: string;
          source_type: Database["public"]["Enums"]["source_type"];
          title: string;
          author_text?: string | null;
          publisher?: string | null;
          publication_date?: string | null;
          url?: string | null;
          archive_url?: string | null;
          isbn?: string | null;
          doi?: string | null;
          accessed_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          source_fingerprint?: never;
        };
        Update: {
          id?: string;
          source_type?: Database["public"]["Enums"]["source_type"];
          title?: string;
          author_text?: string | null;
          publisher?: string | null;
          publication_date?: string | null;
          url?: string | null;
          archive_url?: string | null;
          isbn?: string | null;
          doi?: string | null;
          accessed_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          source_fingerprint?: never;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_redirects: {
        Row: {
          from_path: string | null;
          to_path: string | null;
          http_status: number | null;
        };
        Relationships: [];
      };
      public_site_settings: {
        Row: {
          key: string | null;
          value: Json | null;
          updated_at: string | null;
        };
        Relationships: [];
      };
      published_articles: {
        Row: {
          id: string | null;
          canonical_slug: string | null;
          canonical_path: string | null;
          first_published_at: string | null;
          last_published_at: string | null;
          revision_id: string | null;
          title: string | null;
          dek: string | null;
          body_markdown: string | null;
          word_count: number | null;
          reading_time_minutes: number | null;
          seo_title: string | null;
          seo_description: string | null;
          social_title: string | null;
          social_description: string | null;
          content_checksum: string | null;
          author_id: string | null;
          author_name: string | null;
          author_slug: string | null;
          pillar_id: string | null;
          pillar_name: string | null;
          pillar_slug: string | null;
          category_id: string | null;
          category_name: string | null;
          category_slug: string | null;
          tags: unknown | null;
        };
        Relationships: [];
      };
      published_citations: {
        Row: {
          id: string | null;
          article_id: string | null;
          revision_id: string | null;
          ordinal: number | null;
          citation_key: string | null;
          citation_text: string | null;
          locator: string | null;
          public_note: string | null;
          quoted_text: string | null;
          source_id: string | null;
          source_type: Database["public"]["Enums"]["source_type"] | null;
          source_title: string | null;
          author_text: string | null;
          publisher: string | null;
          publication_date: string | null;
          url: string | null;
          archive_url: string | null;
          isbn: string | null;
          doi: string | null;
          accessed_at: string | null;
        };
        Relationships: [];
      };
      published_featured_collections: {
        Row: {
          id: string | null;
          name: string | null;
          slug: string | null;
          description: string | null;
          position: number | null;
          label: string | null;
          article_id: string | null;
          canonical_path: string | null;
          title: string | null;
          dek: string | null;
          pillar_name: string | null;
          category_name: string | null;
          first_published_at: string | null;
        };
        Relationships: [];
      };
      published_media: {
        Row: {
          article_media_id: string | null;
          article_id: string | null;
          revision_id: string | null;
          role: Database["public"]["Enums"]["media_role"] | null;
          position: number | null;
          alt_text: string | null;
          caption: string | null;
          credit_text: string | null;
          media_asset_id: string | null;
          kind: Database["public"]["Enums"]["media_kind"] | null;
          original_width: number | null;
          original_height: number | null;
          focal_x: number | null;
          focal_y: number | null;
          variant_id: string | null;
          variant_name: string | null;
          storage_key: string | null;
          mime_type: string | null;
          format: string | null;
          width: number | null;
          height: number | null;
          byte_size: number | null;
          checksum_sha256: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      append_publication_event: {
        Args: {
          p_job_id: string;
          p_step: string;
          p_level: Database["public"]["Enums"]["publication_event_level"];
          p_message: string;
          p_details?: Json | null;
        };
        Returns: number;
      };
      extend_publication_job_lease: {
        Args: { p_job_id: string; p_worker_id: string; p_lease_seconds?: number };
        Returns: boolean;
      };
      commit_publication_job: {
        Args: { p_job_id: string; p_worker_id: string };
        Returns: {
          article_id: string;
          publication_action: Database["public"]["Enums"]["publication_action"];
          canonical_path: string;
          pillar_slug: string;
          category_slug: string | null;
          content_checksum: string | null;
          target_revision_id: string | null;
          already_committed: boolean;
        }[];
      };
      mark_publication_job_verifying: {
        Args: { p_job_id: string; p_worker_id: string };
        Returns: undefined;
      };
      succeed_publication_job: {
        Args: { p_job_id: string; p_worker_id: string; p_details?: Json | null };
        Returns: undefined;
      };
      fail_publication_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_error_code: string;
          p_error_detail: Json;
          p_retryable: boolean;
        };
        Returns: {
          final_status: Database["public"]["Enums"]["publication_job_status"];
          next_attempt_at: string | null;
        }[];
      };
      create_story_draft: {
        Args: {
          p_title: string;
          p_slug: string;
          p_excerpt: string;
          p_body_markdown: string;
          p_body_plain_text: string;
          p_pillar_id: string;
          p_category_id: string | null;
          p_word_count: number;
          p_reading_time_minutes: number;
        };
        Returns: { article_id: string; revision_id: string; row_version: number }[];
      };
      save_story_draft: {
        Args: {
          p_article_id: string;
          p_expected_row_version: number;
          p_title: string;
          p_slug: string;
          p_excerpt: string;
          p_body_markdown: string;
          p_body_plain_text: string;
          p_pillar_id: string;
          p_category_id: string | null;
          p_tag_ids: string[];
          p_source_ids: string[];
          p_cover_media_asset_id: string | null;
          p_seo_title: string;
          p_seo_description: string;
          p_word_count: number;
          p_reading_time_minutes: number;
        };
        Returns: {
          article_id: string;
          revision_id: string;
          row_version: number;
          saved_at: string;
        }[];
      };
      request_story_publication: {
        Args: {
          p_article_id: string;
          p_action: Database["public"]["Enums"]["publication_action"];
          p_target_revision_id: string | null;
          p_idempotency_key: string;
        };
        Returns: {
          publication_job_id: string;
          job_status: Database["public"]["Enums"]["publication_job_status"];
        }[];
      };
      claim_publication_jobs: {
        Args: {
          claiming_worker_id: string;
          batch_size?: number;
          lease_seconds?: number;
        };
        Returns: Database["public"]["Tables"]["publication_jobs"]["Row"][];
      };
      search_published_articles: {
        Args: {
          search_query: string;
          pillar_slug?: string | null;
          result_limit?: number;
          result_offset?: number;
        };
        Returns: {
          article_id: string;
          canonical_path: string;
          title: string;
          dek: string | null;
          author_name: string;
          pillar_name: string;
          category_name: string | null;
          tags: string[];
          published_at: string;
          rank: number;
        }[];
      };
    };
    Enums: {
      article_status:
        | "draft"
        | "scheduled"
        | "publishing"
        | "published_pending_verification"
        | "published"
        | "unpublished"
        | "archived";
      collection_status: "draft" | "published" | "archived";
      media_kind: "image" | "audio" | "video" | "document";
      media_processing_status: "pending" | "processing" | "ready" | "failed";
      media_rights_status:
        | "unknown"
        | "owned"
        | "licensed"
        | "public_domain"
        | "creative_commons"
        | "permission_granted"
        | "restricted";
      media_role: "hero" | "inline" | "gallery" | "social";
      publication_action: "publish" | "republish" | "rollback" | "unpublish" | "schedule";
      publication_event_level: "info" | "warning" | "error";
      publication_job_status:
        | "queued"
        | "processing"
        | "committed"
        | "verifying"
        | "succeeded"
        | "failed"
        | "dead_letter"
        | "cancelled";
      redirect_kind: "slug_change" | "pillar_change" | "manual" | "unpublish";
      revision_kind: "draft" | "publication" | "correction" | "rollback" | "import";
      source_type:
        | "book"
        | "journal_article"
        | "news_article"
        | "website"
        | "report"
        | "archive"
        | "interview"
        | "dataset"
        | "video"
        | "other";
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<
  PublicTableNameOrOptions extends
    keyof (Database["public"]["Tables"] & Database["public"]["Views"]) | { schema: keyof Database },
  TableName extends (PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends keyof Database["public"]["Tables"] | { schema: keyof Database },
  TableName extends (PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof Database["public"]["Tables"] | { schema: keyof Database },
  TableName extends (PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends keyof Database["public"]["Enums"] | { schema: keyof Database },
  EnumName extends (PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      article_status: [
        "draft",
        "scheduled",
        "publishing",
        "published_pending_verification",
        "published",
        "unpublished",
        "archived",
      ] as const,
      collection_status: ["draft", "published", "archived"] as const,
      media_kind: ["image", "audio", "video", "document"] as const,
      media_processing_status: ["pending", "processing", "ready", "failed"] as const,
      media_rights_status: [
        "unknown",
        "owned",
        "licensed",
        "public_domain",
        "creative_commons",
        "permission_granted",
        "restricted",
      ] as const,
      media_role: ["hero", "inline", "gallery", "social"] as const,
      publication_action: ["publish", "republish", "rollback", "unpublish", "schedule"] as const,
      publication_event_level: ["info", "warning", "error"] as const,
      publication_job_status: [
        "queued",
        "processing",
        "committed",
        "verifying",
        "succeeded",
        "failed",
        "dead_letter",
        "cancelled",
      ] as const,
      redirect_kind: ["slug_change", "pillar_change", "manual", "unpublish"] as const,
      revision_kind: ["draft", "publication", "correction", "rollback", "import"] as const,
      source_type: [
        "book",
        "journal_article",
        "news_article",
        "website",
        "report",
        "archive",
        "interview",
        "dataset",
        "video",
        "other",
      ] as const,
    },
  },
} as const;
