-- CreateIndex (idempotent — applied via db push already on local dev)
CREATE INDEX `audit_logs_createdAt_idx` ON `audit_logs`(`createdAt`);
