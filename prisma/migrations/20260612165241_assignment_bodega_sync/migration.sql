-- AlterTable
ALTER TABLE `asset_movements` MODIFY `movementType` ENUM('RELOCATION', 'LOAN', 'REPAIR', 'RETURN_FROM_REPAIR', 'AUDIT', 'ASSIGNMENT_DELIVERY', 'ASSIGNMENT_RETURN') NOT NULL;

-- AlterTable (idempotent: add column only if it does not exist)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'assignments'
    AND COLUMN_NAME  = 'previousBodegaId'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `assignments` ADD COLUMN `previousBodegaId` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
