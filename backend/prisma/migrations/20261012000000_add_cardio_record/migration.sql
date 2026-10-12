
-- CreateEnum
CREATE TYPE "SpeedUnit" AS ENUM ('pace', 'kmh');

-- AlterEnum
ALTER TYPE "MuscleGroup" ADD VALUE 'cardio';

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "speed_unit" "SpeedUnit";

-- AlterTable
ALTER TABLE "workout_sets" ADD COLUMN     "distance_km" DECIMAL(6,2),
ADD COLUMN     "duration_sec" INTEGER,
ALTER COLUMN "reps" DROP NOT NULL;

