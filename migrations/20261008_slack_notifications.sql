-- Additive, standalone migration. Apply before deploying the Slack feature.
-- Existing accounts remain disconnected and see the reminder after onboarding.
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS slack_user_id varchar(32),
  ADD COLUMN IF NOT EXISTS slack_team_id varchar(32),
  ADD COLUMN IF NOT EXISTS slack_connect_reminder_dismissed boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS users_slack_user_id_unique
  ON users (slack_user_id);

COMMIT;
