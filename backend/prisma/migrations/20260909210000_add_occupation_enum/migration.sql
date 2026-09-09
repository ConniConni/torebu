-- occupationを自由記述からenum化する（Issue #158）。
-- docs/schema.mdの記載どおり、このカラムは現時点でUI・APIから未使用のため全行NULLの前提で
-- 直接キャストする（既存データが無いため空文字列等の変換考慮は不要）。

-- CreateEnum
CREATE TYPE "Occupation" AS ENUM ('student', 'company_employee', 'self_employed', 'executive', 'homemaker', 'other', 'no_answer');

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "occupation" TYPE "Occupation" USING ("occupation"::"Occupation");
