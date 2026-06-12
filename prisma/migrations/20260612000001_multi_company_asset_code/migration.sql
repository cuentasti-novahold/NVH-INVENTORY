-- Migration: multi_company_asset_code
-- Data-aware ordered migration. See design artifact ADR-1, ADR-2, ADR-3, MIG-01.
-- NVH deterministic company id: clnvhcompany000000000001

-- Step 1: Create companies table
CREATE TABLE `companies` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `companies_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Step 2: Insert NVH with deterministic id (referenced in steps 4 and 6)
INSERT INTO `companies` (`id`, `code`, `name`, `isActive`, `createdAt`, `updatedAt`)
VALUES ('clnvhcompany000000000001', 'NVH', 'Novahold', true, NOW(), NOW());

-- Step 3: Create company_category_sequences table
CREATE TABLE `company_category_sequences` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `company_category_sequences_companyId_categoryId_key`(`companyId`, `categoryId`),
    INDEX `company_category_sequences_companyId_fkey`(`companyId`),
    INDEX `company_category_sequences_categoryId_fkey`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Step 4: Seed junction from existing Category.sequence values for NVH
-- Every category that has accumulated a sequence counter gets its own row.
-- Categories with sequence=0 are skipped; the upsert in the app will create them on first use.
INSERT INTO `company_category_sequences` (`id`, `companyId`, `categoryId`, `sequence`, `createdAt`, `updatedAt`)
SELECT CONCAT('ccs_', `id`), 'clnvhcompany000000000001', `id`, `sequence`, NOW(), NOW()
FROM `categories`
WHERE `sequence` > 0;

-- Step 5: Add companyId as nullable first (safe for existing rows)
ALTER TABLE `assets` ADD COLUMN `companyId` VARCHAR(191) NULL;

-- Step 6: Backfill all existing assets to NVH
UPDATE `assets` SET `companyId` = 'clnvhcompany000000000001' WHERE `companyId` IS NULL;

-- Step 7: Make companyId NOT NULL now that all rows are filled
ALTER TABLE `assets` MODIFY `companyId` VARCHAR(191) NOT NULL;

-- Step 8: Add FK from assets to companies
ALTER TABLE `assets` ADD CONSTRAINT `assets_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 9: Add FKs for company_category_sequences
ALTER TABLE `company_category_sequences` ADD CONSTRAINT `company_category_sequences_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `company_category_sequences` ADD CONSTRAINT `company_category_sequences_categoryId_fkey`
    FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
