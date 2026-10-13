-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'workout_recorded';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_workout_recorded" BOOLEAN NOT NULL DEFAULT true;
