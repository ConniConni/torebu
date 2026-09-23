-- CreateTable
CREATE TABLE "workout_exercises" (
    "id" TEXT NOT NULL,
    "workout_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workout_exercises_workout_id_exercise_id_key" ON "workout_exercises"("workout_id", "exercise_id");

-- CreateIndex
CREATE INDEX "workout_exercises_workout_id_idx" ON "workout_exercises"("workout_id");

-- CreateIndex
CREATE INDEX "workout_exercises_exercise_id_idx" ON "workout_exercises"("exercise_id");

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: 既存のworkout_setsから種目カード単位の行を作る。並び順は現行仕様
-- (各種目を最初に追加した順=createdAt最小。Issue #226)をそのまま引き継ぐ
INSERT INTO "workout_exercises" ("id", "workout_id", "exercise_id", "sort_order")
SELECT gen_random_uuid(), "workout_id", "exercise_id",
       ROW_NUMBER() OVER (PARTITION BY "workout_id" ORDER BY MIN("created_at"))
FROM "workout_sets"
GROUP BY "workout_id", "exercise_id";
