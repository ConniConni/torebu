// 公式種目（created_by = null）のシード投入スクリプト
// 実行: npm run prisma:seed（内部では `prisma migrate dev` 等からも自動実行される。prisma7.config.ts参照）
//
// データソース: prisma/seed-data/official-exercises.json（77種目、docs/muscle-highlight.md参照）。
// 別プロジェクト（筋トレ部位紐付け）での先行検討で確定した種目マスタを移植したもの。
// main_body_part / source は移行元データの出典メタデータで、本番カラムには含めない
// （docs/schema.mdの方針。実行時のアプリ機能はこれらを参照しない）。
//
// 冪等性について：exercisesテーブルには公式種目名の重複を防ぐDB制約が無い
// （docs/schema.mdの設計方針メモ参照）ため、このスクリプト側で「同名の公式種目が
// 既に存在するかどうか」を確認し、無ければ作成・あれば内容を更新する（upsert相当）。
//
// 総入れ替えについて：新データセットに存在しない旧公式種目（約30種目）は、
// 参照しているworkout_sets/routine_exercisesを先に削除した上で削除する
// （docs/muscle-highlight.md参照。onDelete: Restrictのため）。カスタム種目（created_by値あり）
// および、それらが記録しているworkouts/routinesは対象外で影響を受けない。
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { MuscleGroup } from '../src/generated/prisma/enums.js'
import officialExercisesData from './seed-data/official-exercises.json' with { type: 'json' }

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

type OfficialExerciseSource = {
  main_body_part: string
  name_ja: string
  source: { dataset: string; exercise_id: string | null; note?: string }
  main_muscle: string
  related_muscles: string[]
  equipment: string
  main_zone?: string
}

// main_body_part（日本語）→ MuscleGroup（既存の7分類enum）の対応表
const BODY_PART_TO_MUSCLE_GROUP: Record<string, MuscleGroup> = {
  胸: 'chest',
  背中: 'back',
  脚: 'legs',
  肩: 'shoulders',
  腕: 'arms',
  お尻: 'glutes',
  腹筋: 'abs',
}

const officialExercises = officialExercisesData as OfficialExerciseSource[]

async function removeObsoleteOfficialExercises() {
  const currentNames = officialExercises.map((exercise) => exercise.name_ja)
  const obsolete = await prisma.exercise.findMany({
    where: { createdBy: null, name: { notIn: currentNames } },
  })
  if (obsolete.length === 0) return 0

  for (const exercise of obsolete) {
    await prisma.workoutSet.deleteMany({ where: { exerciseId: exercise.id } })
    await prisma.routineExercise.deleteMany({ where: { exerciseId: exercise.id } })
  }
  await prisma.exercise.deleteMany({
    where: { id: { in: obsolete.map((exercise) => exercise.id) } },
  })
  return obsolete.length
}

async function upsertOfficialExercises() {
  let created = 0
  let updated = 0

  for (const exercise of officialExercises) {
    const muscleGroup = BODY_PART_TO_MUSCLE_GROUP[exercise.main_body_part]
    if (!muscleGroup) {
      throw new Error(`未知のmain_body_part: ${exercise.main_body_part}（${exercise.name_ja}）`)
    }

    const data = {
      muscleGroup,
      equipment: exercise.equipment,
      mainMuscle: exercise.main_muscle,
      relatedMuscles: exercise.related_muscles,
      mainZone: exercise.main_zone ?? null,
    }

    const existing = await prisma.exercise.findFirst({
      where: { name: exercise.name_ja, createdBy: null },
    })
    if (existing) {
      await prisma.exercise.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.exercise.create({ data: { name: exercise.name_ja, createdBy: null, ...data } })
      created++
    }
  }

  return { created, updated }
}

async function main() {
  const removed = await removeObsoleteOfficialExercises()
  const { created, updated } = await upsertOfficialExercises()

  console.log(
    `公式種目シード完了: ${created}件作成, ${updated}件更新, ${removed}件削除（旧マスタの入れ替え分）`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
