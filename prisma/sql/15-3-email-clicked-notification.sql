-- Apply after 14-1-notifications.sql, before deploying email click tracking.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EMAIL_CLICKED';
