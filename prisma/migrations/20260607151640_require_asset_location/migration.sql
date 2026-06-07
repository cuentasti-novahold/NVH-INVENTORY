-- Migration: require-asset-location
-- Asset.locationId changed from nullable to NOT NULL.
-- Table is empty at time of migration; no data backfill required.

ALTER TABLE `Asset`
  MODIFY COLUMN `locationId` VARCHAR(191) NOT NULL,
  DROP FOREIGN KEY `Asset_locationId_fkey`;

ALTER TABLE `Asset`
  ADD CONSTRAINT `Asset_locationId_fkey`
  FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
