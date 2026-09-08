-- ユーザー追加（カスタム）種目の削除機能（Issue #113）。物理削除だと過去のworkout_sets/
-- routine_exercisesのFKが壊れるためソフトデリートにする。既存データはNULL（未削除）のまま
ALTER TABLE "exercises" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);
