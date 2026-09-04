-- 目安セット(重量・回数の配列)。未設定はnull(docs/schema.mdのhighlight_slugsと同じjsonbカラム方針)
ALTER TABLE "routine_exercises" ADD COLUMN "target_sets" JSONB;
