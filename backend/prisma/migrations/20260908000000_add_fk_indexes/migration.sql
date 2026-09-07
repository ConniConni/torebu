-- CreateIndex
CREATE INDEX "workouts_user_id_performed_at_idx" ON "workouts"("user_id", "performed_at");

-- CreateIndex
CREATE INDEX "workout_sets_workout_id_idx" ON "workout_sets"("workout_id");

-- CreateIndex
CREATE INDEX "workout_sets_exercise_id_idx" ON "workout_sets"("exercise_id");

-- CreateIndex
CREATE INDEX "routines_user_id_idx" ON "routines"("user_id");

-- CreateIndex
CREATE INDEX "routine_exercises_routine_id_idx" ON "routine_exercises"("routine_id");

-- CreateIndex
CREATE INDEX "routine_exercises_exercise_id_idx" ON "routine_exercises"("exercise_id");

-- CreateIndex
CREATE INDEX "exercises_created_by_idx" ON "exercises"("created_by");
