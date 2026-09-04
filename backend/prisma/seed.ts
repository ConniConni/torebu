// 公式種目（created_by = null）のシード投入スクリプト
// 実行: npm run prisma:seed（内部では `prisma migrate dev` 等からも自動実行される。prisma7.config.ts参照）
//
// 冪等性について：exercisesテーブルには公式種目名の重複を防ぐDB制約が無い
// （docs/schema.mdの設計方針メモ参照）ため、このスクリプト側で「同名の公式種目が
// 既に存在するかどうか」を確認してから作成する。複数回実行しても重複登録されない。
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { MuscleGroup } from '../src/generated/prisma/enums.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

type SeedExercise = {
  name: string
  muscleGroup: MuscleGroup
  equipment?: string
}

// 部位（MuscleGroupの7分類）を網羅する、定番の公式種目セット
// default_sort_orderは当面全件null運用のため設定しない（docs/backlog.mdの未決定事項参照）
const officialExercises: SeedExercise[] = [
  // 胸
  { name: 'ベンチプレス', muscleGroup: 'chest', equipment: 'バーベル' },
  { name: 'ダンベルベンチプレス', muscleGroup: 'chest', equipment: 'ダンベル' },
  { name: 'インクラインベンチプレス', muscleGroup: 'chest', equipment: 'バーベル' },
  { name: 'ダンベルフライ', muscleGroup: 'chest', equipment: 'ダンベル' },
  { name: 'プッシュアップ', muscleGroup: 'chest', equipment: '自重' },
  // 背中
  { name: 'デッドリフト', muscleGroup: 'back', equipment: 'バーベル' },
  { name: '懸垂', muscleGroup: 'back', equipment: '自重' },
  { name: 'ラットプルダウン', muscleGroup: 'back', equipment: 'マシン' },
  { name: 'ベントオーバーロウ', muscleGroup: 'back', equipment: 'バーベル' },
  { name: 'ダンベルロウ', muscleGroup: 'back', equipment: 'ダンベル' },
  // 脚
  { name: 'スクワット', muscleGroup: 'legs', equipment: 'バーベル' },
  { name: 'レッグプレス', muscleGroup: 'legs', equipment: 'マシン' },
  { name: 'レッグエクステンション', muscleGroup: 'legs', equipment: 'マシン' },
  { name: 'レッグカール', muscleGroup: 'legs', equipment: 'マシン' },
  { name: 'ランジ', muscleGroup: 'legs', equipment: '自重' },
  // 肩
  { name: 'ショルダープレス', muscleGroup: 'shoulders', equipment: 'ダンベル' },
  { name: 'サイドレイズ', muscleGroup: 'shoulders', equipment: 'ダンベル' },
  { name: 'フロントレイズ', muscleGroup: 'shoulders', equipment: 'ダンベル' },
  { name: 'リアレイズ', muscleGroup: 'shoulders', equipment: 'ダンベル' },
  // 腕
  { name: 'バーベルカール', muscleGroup: 'arms', equipment: 'バーベル' },
  { name: 'ダンベルカール', muscleGroup: 'arms', equipment: 'ダンベル' },
  { name: 'トライセプスエクステンション', muscleGroup: 'arms', equipment: 'ダンベル' },
  { name: 'ディップス', muscleGroup: 'arms', equipment: '自重' },
  // お尻
  { name: 'ヒップスラスト', muscleGroup: 'glutes', equipment: 'バーベル' },
  { name: 'ブルガリアンスクワット', muscleGroup: 'glutes', equipment: '自重' },
  // 腹筋
  { name: 'クランチ', muscleGroup: 'abs', equipment: '自重' },
  { name: 'レッグレイズ', muscleGroup: 'abs', equipment: '自重' },
  { name: 'プランク', muscleGroup: 'abs', equipment: '自重' },
]

async function main() {
  let created = 0
  let skipped = 0

  for (const exercise of officialExercises) {
    const existing = await prisma.exercise.findFirst({
      where: { name: exercise.name, createdBy: null },
    })
    if (existing) {
      skipped++
      continue
    }
    await prisma.exercise.create({
      data: {
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        createdBy: null,
      },
    })
    created++
  }

  console.log(`公式種目シード完了: ${created}件作成, ${skipped}件スキップ（既存）`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
