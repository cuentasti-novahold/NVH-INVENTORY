-- Migration: require-asset-location
-- assets.locationId changed from nullable to NOT NULL.

-- Backfill any remaining NULLs (idempotent — no-op if already done).
UPDATE `assets`
SET `locationId` = (SELECT `id` FROM `locations` ORDER BY `createdAt` LIMIT 1)
WHERE `locationId` IS NULL;

-- Drop FK only if it still exists.
ALTER TABLE `assets`
  MODIFY COLUMN `locationId` VARCHAR(191) NOT NULL;

-- Re-add FK with RESTRICT (was SET NULL before).
ALTER TABLE `assets`
  ADD CONSTRAINT `assets_locationId_fkey`
  FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
