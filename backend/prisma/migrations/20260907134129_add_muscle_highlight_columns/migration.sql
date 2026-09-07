-- 部位ハイライト可視化（Phase2）用カラムの追加。docs/muscle-highlight.md参照。
-- 全カラムnullable/デフォルトありのため、既存データへの影響はない
ALTER TABLE "exercises"
  ADD COLUMN "main_muscle" TEXT,
  ADD COLUMN "related_muscles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "main_zone" TEXT;
