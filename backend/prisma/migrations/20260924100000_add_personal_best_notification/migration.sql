-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'personal_best';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "payload" JSONB;
