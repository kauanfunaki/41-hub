-- =============================================================================
-- FIX: Corrigir timestamps com offset de fuso horário (BRT → UTC)
-- =============================================================================
-- Causa: pool.on("connect") definia SET timezone = 'America/Sao_Paulo',
-- fazendo NOW() inserir horário BRT em colunas TIMESTAMP WITHOUT TIME ZONE.
-- O frontend aplicava conversão UTC→BRT novamente, exibindo 3h a menos.
--
-- Este script adiciona 3 horas a todos os timestamps afetados (uma vez só).
-- Tabelas news_* NÃO precisam de correção (usam TIMESTAMPTZ).
--
-- EXECUTE NO BANCO DE PRODUÇÃO ANTES DE SUBIR A NOVA VERSÃO DO SERVIDOR.
-- =============================================================================

BEGIN;

-- users
UPDATE users SET
  created_at = created_at + INTERVAL '3 hours',
  password_updated_at = CASE WHEN password_updated_at IS NOT NULL THEN password_updated_at + INTERVAL '3 hours' END;

-- admin_settings
UPDATE admin_settings SET updated_at = updated_at + INTERVAL '3 hours';

-- sectors
UPDATE sectors SET created_at = created_at + INTERVAL '3 hours';

-- resources
UPDATE resources SET
  created_at = created_at + INTERVAL '3 hours',
  health_updated_at = CASE WHEN health_updated_at IS NOT NULL THEN health_updated_at + INTERVAL '3 hours' END;

-- resource_overrides
UPDATE resource_overrides SET created_at = created_at + INTERVAL '3 hours';

-- favorites
UPDATE favorites SET created_at = created_at + INTERVAL '3 hours';

-- recent_access
UPDATE recent_access SET last_access_at = last_access_at + INTERVAL '3 hours';

-- audit_logs
UPDATE audit_logs SET created_at = created_at + INTERVAL '3 hours';

-- health_checks
UPDATE health_checks SET last_check_at = last_check_at + INTERVAL '3 hours';

-- ticket_categories
UPDATE ticket_categories SET created_at = created_at + INTERVAL '3 hours';

-- ticket_sla_policies
UPDATE ticket_sla_policies SET created_at = created_at + INTERVAL '3 hours';

-- tickets
UPDATE tickets SET
  created_at = created_at + INTERVAL '3 hours',
  updated_at = updated_at + INTERVAL '3 hours',
  closed_at = CASE WHEN closed_at IS NOT NULL THEN closed_at + INTERVAL '3 hours' END;

-- ticket_assignees
UPDATE ticket_assignees SET assigned_at = assigned_at + INTERVAL '3 hours';

-- ticket_comments
UPDATE ticket_comments SET created_at = created_at + INTERVAL '3 hours';

-- ticket_attachments
UPDATE ticket_attachments SET created_at = created_at + INTERVAL '3 hours';

-- ticket_checklist_items
UPDATE ticket_checklist_items SET
  created_at = created_at + INTERVAL '3 hours',
  done_at = CASE WHEN done_at IS NOT NULL THEN done_at + INTERVAL '3 hours' END;

-- ticket_sla_cycles
UPDATE ticket_sla_cycles SET
  opened_at             = opened_at             + INTERVAL '3 hours',
  first_response_due_at = first_response_due_at + INTERVAL '3 hours',
  resolution_due_at     = resolution_due_at     + INTERVAL '3 hours',
  first_response_at     = CASE WHEN first_response_at IS NOT NULL THEN first_response_at + INTERVAL '3 hours' END,
  resolved_at           = CASE WHEN resolved_at IS NOT NULL THEN resolved_at + INTERVAL '3 hours' END,
  resolution_due_at_updated_at = CASE WHEN resolution_due_at_updated_at IS NOT NULL THEN resolution_due_at_updated_at + INTERVAL '3 hours' END,
  paused_at             = CASE WHEN paused_at IS NOT NULL THEN paused_at + INTERVAL '3 hours' END;

-- ticket_events
UPDATE ticket_events SET created_at = created_at + INTERVAL '3 hours';

-- ticket_approvals
UPDATE ticket_approvals SET
  requested_at = requested_at + INTERVAL '3 hours',
  decided_at   = CASE WHEN decided_at IS NOT NULL THEN decided_at + INTERVAL '3 hours' END;

-- ticket_reopen_requests
UPDATE ticket_reopen_requests SET
  requested_at = requested_at + INTERVAL '3 hours',
  decided_at   = CASE WHEN decided_at IS NOT NULL THEN decided_at + INTERVAL '3 hours' END;

-- ticket_alerts_dedup
UPDATE ticket_alerts_dedup SET created_at = created_at + INTERVAL '3 hours';

-- notification_settings
UPDATE notification_settings SET
  created_at = created_at + INTERVAL '3 hours',
  updated_at = updated_at + INTERVAL '3 hours';

-- notifications
UPDATE notifications SET created_at = created_at + INTERVAL '3 hours';

-- push_subscriptions
UPDATE push_subscriptions SET created_at = created_at + INTERVAL '3 hours';

-- kb_articles
UPDATE kb_articles SET
  created_at = created_at + INTERVAL '3 hours',
  updated_at = updated_at + INTERVAL '3 hours';

-- kb_article_views
UPDATE kb_article_views SET viewed_at = viewed_at + INTERVAL '3 hours';

-- kb_article_feedback
UPDATE kb_article_feedback SET created_at = created_at + INTERVAL '3 hours';

-- typing_texts
UPDATE typing_texts SET created_at = created_at + INTERVAL '3 hours';

-- typing_sessions
UPDATE typing_sessions SET
  started_at   = started_at   + INTERVAL '3 hours',
  expires_at   = expires_at   + INTERVAL '3 hours',
  submitted_at = CASE WHEN submitted_at IS NOT NULL THEN submitted_at + INTERVAL '3 hours' END;

-- typing_scores
UPDATE typing_scores SET created_at = created_at + INTERVAL '3 hours';

-- system_alerts
UPDATE system_alerts SET
  starts_at  = CASE WHEN starts_at IS NOT NULL THEN starts_at + INTERVAL '3 hours' END,
  ends_at    = CASE WHEN ends_at IS NOT NULL THEN ends_at + INTERVAL '3 hours' END,
  created_at = created_at + INTERVAL '3 hours',
  updated_at = updated_at + INTERVAL '3 hours';

-- system_alert_reads
UPDATE system_alert_reads SET read_at = read_at + INTERVAL '3 hours';

-- api_tokens
UPDATE api_tokens SET
  created_at = created_at + INTERVAL '3 hours',
  revoked_at = CASE WHEN revoked_at IS NOT NULL THEN revoked_at + INTERVAL '3 hours' END;

-- platform_feedback
UPDATE platform_feedback SET created_at = created_at + INTERVAL '3 hours';

-- ops_watchers
UPDATE ops_watchers SET created_at = created_at + INTERVAL '3 hours';

-- ops_events
UPDATE ops_events SET processed_at = processed_at + INTERVAL '3 hours';

COMMIT;
