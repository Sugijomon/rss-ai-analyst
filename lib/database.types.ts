export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<
  Row,
  Insert,
  UpdateShape,
  Relationships extends readonly unknown[] = [],
> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row> & UpdateShape;
  Relationships: Relationships;
};

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  public: {
    Tables: {
      articles: Table<
        {
          aisa_opportunity: string | null;
          content_type: string | null;
          created_at: string | null;
          id: string;
          opportunity: string | null;
          published_at: string | null;
          run_date: string;
          score: number;
          selected_for_newsletter: boolean | null;
          summary: string[];
          tags: string[] | null;
          title: string;
          url: string;
          used_in_issue: number | null;
          why_matters: string | null;
        },
        {
          aisa_opportunity?: string | null;
          content_type?: string | null;
          created_at?: string | null;
          id?: string;
          opportunity?: string | null;
          published_at?: string | null;
          run_date?: string;
          score: number;
          selected_for_newsletter?: boolean | null;
          summary: string[];
          tags?: string[] | null;
          title: string;
          url: string;
          used_in_issue?: number | null;
          why_matters?: string | null;
        },
        Record<never, never>
      >;
      legal_scan_runs: Table<
        {
          created_at: string;
          error_summary: string | null;
          feeds_attempted: number;
          feeds_failed: number;
          finished_at: string | null;
          id: string;
          items_found: number;
          notifications_sent: number;
          signals_changed: number;
          signals_created: number;
          started_at: string;
          status: 'running' | 'completed' | 'partial' | 'failed';
        },
        {
          created_at?: string;
          error_summary?: string | null;
          feeds_attempted?: number;
          feeds_failed?: number;
          finished_at?: string | null;
          id?: string;
          items_found?: number;
          notifications_sent?: number;
          signals_changed?: number;
          signals_created?: number;
          started_at?: string;
          status?: 'running' | 'completed' | 'partial' | 'failed';
        },
        Record<never, never>
      >;
      legal_signals: Table<
        {
          affected_modules: string[];
          article_id: string | null;
          candidate_legal_status:
            | 'proposed'
            | 'adopted'
            | 'published'
            | 'in_force'
            | 'applicable'
            | 'amended'
            | 'repealed'
            | null;
          candidate_change_type:
            | 'new_obligation'
            | 'amendment'
            | 'guidance'
            | 'enforcement_action'
            | 'case_law'
            | 'delay_or_transition'
            | 'repeal'
            | 'none'
            | null;
          candidate_rationale: string;
          candidate_status: 'candidate';
          candidate_summary: string;
          candidate_type:
            | 'legislation'
            | 'guidance'
            | 'enforcement'
            | 'case_law'
            | 'consultation'
            | 'standard'
            | 'other';
          canonical_url: string;
          change_type: 'new' | 'updated';
          confidence: number;
          content_hash: string;
          created_at: string;
          evidence: string[];
          feed_id: string;
          first_seen_at: string;
          id: string;
          identifier: string | null;
          instrument: string | null;
          jurisdiction: 'EU' | 'NL' | 'other' | null;
          last_seen_at: string;
          model_version: string;
          notification_status: 'pending' | 'sent' | 'failed' | 'skipped';
          notified_at: string | null;
          primary_source_url: string | null;
          prompt_version: string;
          provision: string | null;
          published_at: string | null;
          review_status:
            | 'unreviewed'
            | 'reviewed_relevant'
            | 'reviewed_not_relevant';
          reviewed_at: string | null;
          run_date: string;
          source_level: 'primary' | 'secondary';
          source_name: string;
          source_title: string;
          source_url: string;
        },
        {
          affected_modules?: string[];
          article_id?: string | null;
          candidate_change_type?:
            | 'new_obligation'
            | 'amendment'
            | 'guidance'
            | 'enforcement_action'
            | 'case_law'
            | 'delay_or_transition'
            | 'repeal'
            | 'none'
            | null;
          candidate_legal_status?:
            | 'proposed'
            | 'adopted'
            | 'published'
            | 'in_force'
            | 'applicable'
            | 'amended'
            | 'repealed'
            | null;
          candidate_rationale: string;
          candidate_status?: 'candidate';
          candidate_summary: string;
          candidate_type:
            | 'legislation'
            | 'guidance'
            | 'enforcement'
            | 'case_law'
            | 'consultation'
            | 'standard'
            | 'other';
          canonical_url: string;
          change_type: 'new' | 'updated';
          confidence: number;
          content_hash: string;
          created_at?: string;
          evidence?: string[];
          feed_id: string;
          first_seen_at?: string;
          id?: string;
          identifier?: string | null;
          instrument?: string | null;
          jurisdiction?: 'EU' | 'NL' | 'other' | null;
          last_seen_at?: string;
          model_version: string;
          notification_status?: 'pending' | 'sent' | 'failed' | 'skipped';
          notified_at?: string | null;
          primary_source_url?: string | null;
          prompt_version: string;
          provision?: string | null;
          published_at?: string | null;
          review_status?:
            | 'unreviewed'
            | 'reviewed_relevant'
            | 'reviewed_not_relevant';
          reviewed_at?: string | null;
          run_date?: string;
          source_level: 'primary' | 'secondary';
          source_name: string;
          source_title: string;
          source_url: string;
        },
        Record<never, never>,
        [
          {
            foreignKeyName: 'legal_signals_article_id_fkey';
            columns: ['article_id'];
            isOneToOne: false;
            referencedRelation: 'articles';
            referencedColumns: ['id'];
          },
        ]
      >;
      newsletter_articles: Table<
        {
          article_id: string | null;
          category: string;
          category_summary: string | null;
          created_at: string | null;
          display_order: number | null;
          id: string;
          included: boolean | null;
          issue_id: string | null;
          legal_signal_id: string | null;
        },
        {
          article_id?: string | null;
          category: string;
          category_summary?: string | null;
          created_at?: string | null;
          display_order?: number | null;
          id?: string;
          included?: boolean | null;
          issue_id?: string | null;
          legal_signal_id?: string | null;
        },
        Record<never, never>,
        [
          {
            foreignKeyName: 'newsletter_articles_article_id_fkey';
            columns: ['article_id'];
            isOneToOne: false;
            referencedRelation: 'articles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'newsletter_articles_issue_id_fkey';
            columns: ['issue_id'];
            isOneToOne: false;
            referencedRelation: 'newsletter_issues';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'newsletter_articles_legal_signal_id_fkey';
            columns: ['legal_signal_id'];
            isOneToOne: false;
            referencedRelation: 'legal_signals';
            referencedColumns: ['id'];
          },
        ]
      >;
      newsletter_issues: Table<
        {
          created_at: string | null;
          id: string;
          intro_text: string | null;
          issue_number: number;
          period_end: string;
          period_start: string;
          sent_at: string | null;
          status: string;
          subject: string | null;
          type: string;
        },
        {
          created_at?: string | null;
          id?: string;
          intro_text?: string | null;
          issue_number: number;
          period_end: string;
          period_start: string;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          type?: string;
        },
        Record<never, never>
      >;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
