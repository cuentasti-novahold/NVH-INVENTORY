-- CreateIndex (idempotent — applied via db push already on local dev)
CREATE INDEX IF NOT EXISTS `audit_logs_createdAt_idx` ON `audit_logs`(`createdAt`);
