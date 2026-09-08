import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { WorkoutModel, WorkoutSetModel } from '../generated/prisma/models.js'

export const workoutsRouter = Router()

// hasSetsは呼び出し側で数えて渡す(一覧はfindManyの_count、単体はcount済みの値を使い分けるため)
function serializeWorkout(workout: WorkoutModel, hasSets: boolean) {
  return {
    id: workout.id,
    performedAt: workout.performedAt.toISOString().slice(0, 10),
    memo: workout.memo,
    hasSets,
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
  }
}

function serializeSet(set: WorkoutSetModel) {
  return {
    id: set.id,
    workoutId: set.workoutId,
    exerciseId: set.exerciseId,
    setOrder: set.setOrder,
    weightKg: set.weightKg === null ? null : Number(set.weightKg),
    reps: set.reps,
  }
}

// 自分の(ソフトデリートされていない)workoutのみ返す。他人・削除済みは404扱いにしてIDOR対策とする
async function findOwnWorkout(userId: string, workoutId: string) {
  return prisma.workout.findFirst({ where: { id: workoutId, userId, deletedAt: null } })
}

// viewerIdとownerIdが、いずれかのグループでアクティブなメンバーとして同席しているか(自分自身も含む)。
// いいねの対象範囲は「グループの記録フィードで見える記録」と一致させる(docs/schema.md「記録の公開範囲」参照)
async function shareActiveGroup(viewerId: string, ownerId: string) {
  if (viewerId === ownerId) return true

  const viewerGroupIds = (
    await prisma.groupMember.findMany({
      where: { userId: viewerId, leftAt: null, group: { deletedAt: null } },
      select: { groupId: true },
    })
  ).map((m) => m.groupId)
  if (viewerGroupIds.length === 0) return false

  const shared = await prisma.groupMember.findFirst({
    where: { userId: ownerId, leftAt: null, groupId: { in: viewerGroupIds } },
  })
  return shared !== null
}

// いいねの対象にできるworkoutか(=自分の記録、または所属グループで同席しているメンバーの記録)。
// 対象外・削除済み・存在しない場合はnull(404でIDOR対策)
async function findAccessibleWorkout(viewerId: string, workoutId: string) {
  const workout = await prisma.workout.findFirst({ where: { id: workoutId, deletedAt: null } })
  if (!workout) return null
  const accessible = await shareActiveGroup(viewerId, workout.userId)
  return accessible ? workout : null
}

async function countReactions(targetId: string) {
  return prisma.reaction.count({ where: { targetType: 'workout', targetId } })
}

async function countComments(targetId: string) {
  return prisma.comment.count({ where: { targetType: 'workout', targetId } })
}

function serializeComment(comment: { id: string; userId: string; body: string; createdAt: Date }, displayName: string) {
  return {
    id: comment.id,
    userId: comment.userId,
    displayName,
    body: comment.body,
    createdAt: comment.createdAt,
  }
}

// GET /exercisesと同じ基準(公式 or 自分のカスタム)で、記録に使ってよい種目かを確認する。
// 削除済み(ソフトデリート済み)のカスタム種目は、新規にこの種目を選ぶ操作(④種目選択・⑦種目追加)
// では選べない。一方、このworkoutに既にその種目のセットがある場合(=このカードは削除前から
// 既に開かれている)への追加は、新規の種目選択を伴わない「既存カードの編集の延長」とみなし、
// PATCH /workouts/:id/sets/:setId(重量・回数編集)と同じ扱いで許可する(Issue #113)
async function isExerciseVisible(userId: string, exerciseId: string, workoutId?: string) {
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, OR: [{ createdBy: null }, { createdBy: userId }] },
  })
  if (!exercise) return false
  if (exercise.deletedAt === null) return true
  if (!workoutId) return false

  const existingSet = await prisma.workoutSet.findFirst({ where: { workoutId, exerciseId } })
  return existingSet !== null
}

// workouts.memoと同じ上限(1〜500文字)に揃える
const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(500),
})

const createWorkoutSchema = z.object({
  performedAt: z.coerce.date(),
  memo: z.string().trim().min(1).max(500).optional(),
})

workoutsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createWorkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const workout = await prisma.workout.create({
    data: { userId, performedAt: parsed.data.performedAt, memo: parsed.data.memo },
  })

  // 作成直後は必ずセット0件
  res.status(201).json(serializeWorkout(workout, false))
})

workoutsRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  // ②ホームのカレンダー印・記録カードが「セットが1件以上あるか」を判定できるよう、
  // _countで件数だけ添える(sets本体は返さない。一覧では使わないため)
  const workouts = await prisma.workout.findMany({
    where: { userId, deletedAt: null },
    orderBy: { performedAt: 'desc' },
    include: { _count: { select: { sets: true } } },
  })

  res.status(200).json(workouts.map((w) => serializeWorkout(w, w._count.sets > 0)))
})

workoutsRouter.get('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findOwnWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const sets = await prisma.workoutSet.findMany({
    where: { workoutId: workout.id },
    orderBy: { setOrder: 'asc' },
  })

  res.status(200).json({ ...serializeWorkout(workout, sets.length > 0), sets: sets.map(serializeSet) })
})

// performedAtは編集不可(意図的)：③「今日の記録を始める」が「同じ日付のworkoutがあれば再開する」
// という日付ベースの引き当てをしているため、記録日を後から動かせると
// 「移動先の元の日付でworkoutを再開しようとした際に、行き場を失った古い日付の分と合わせて
// 実質的に記録が二重に増える」事故につながる(docs/backlog.md参照)。記録日を固定にすることで
// この事故を構造的に防ぐ
const updateWorkoutSchema = z.object({
  // 空文字列・nullはメモのクリア(null化)として扱う。省略時のみ「変更しない」
  memo: z.string().trim().max(500).nullable(),
})

workoutsRouter.patch('/:id', requireAuth, async (req, res) => {
  const parsed = updateWorkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findOwnWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const updated = await prisma.workout.update({
    where: { id: workout.id },
    // 空文字列はnull(メモ無し)に正規化して保存する
    data: { memo: parsed.data.memo || null },
  })
  const setCount = await prisma.workoutSet.count({ where: { workoutId: workout.id } })

  res.status(200).json(serializeWorkout(updated, setCount > 0))
})

workoutsRouter.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findOwnWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  // ソフトデリート。reactions/comments(Phase2)を残す設計のため物理削除しない
  await prisma.workout.update({ where: { id: workout.id }, data: { deletedAt: new Date() } })

  res.status(204).send()
})

// 重量入力は0.5kg刻み(プレート・ダンベルの一般的な最小刻み幅)、上限は現実的な範囲で緩めに999.5kg
// ルーティンの目安セット(routines.ts)でも同じ基準を使うためexportする
export const weightKgSchema = z
  .number()
  .positive()
  .max(999.5, { message: '重量は999.5kg以下で入力してください' })
  .refine((value) => Math.round(value * 2) === value * 2, {
    message: '重量は0.5kg刻みで入力してください',
  })
export const repsSchema = z.number().int().positive().max(999)

const createSetSchema = z.object({
  exerciseId: z.string().uuid(),
  weightKg: weightKgSchema.optional(),
  reps: repsSchema,
})

// 同じworkout内で同じ種目のsetが並ぶ順番。クライアント指定だと同時追加時にずれる懸念があるため、
// サーバー側で「その種目の既存setの最大setOrder + 1」を採番する(削除で欠番が出ても採番はズレない)
async function nextSetOrder(workoutId: string, exerciseId: string) {
  const aggregate = await prisma.workoutSet.aggregate({
    where: { workoutId, exerciseId },
    _max: { setOrder: true },
  })
  return (aggregate._max.setOrder ?? 0) + 1
}

workoutsRouter.post('/:id/sets', requireAuth, async (req, res) => {
  const parsed = createSetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findOwnWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const visible = await isExerciseVisible(userId, parsed.data.exerciseId, workout.id)
  if (!visible) {
    res.status(400).json({ error: 'invalid_exercise' })
    return
  }

  const setOrder = await nextSetOrder(workout.id, parsed.data.exerciseId)
  const set = await prisma.workoutSet.create({
    data: {
      workoutId: workout.id,
      exerciseId: parsed.data.exerciseId,
      setOrder,
      weightKg: parsed.data.weightKg,
      reps: parsed.data.reps,
    },
  })

  res.status(201).json(serializeSet(set))
})

const updateSetSchema = z
  .object({
    weightKg: weightKgSchema.nullable().optional(),
    reps: repsSchema.optional(),
  })
  // 空のPATCH({})は意味の無い更新なので、PATCH /workouts/:idと同様に最低1項目を要求する
  .refine((data) => data.weightKg !== undefined || data.reps !== undefined, {
    message: 'weightKg・repsのいずれかを指定してください',
  })

async function findOwnSet(userId: string, workoutId: string, setId: string) {
  const workout = await findOwnWorkout(userId, workoutId)
  if (!workout) return null
  return prisma.workoutSet.findFirst({ where: { id: setId, workoutId: workout.id } })
}

workoutsRouter.patch('/:id/sets/:setId', requireAuth, async (req, res) => {
  const parsed = updateSetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const set = await findOwnSet(userId, req.params.id as string, req.params.setId as string)
  if (!set) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const updated = await prisma.workoutSet.update({
    where: { id: set.id },
    data: parsed.data,
  })

  res.status(200).json(serializeSet(updated))
})

workoutsRouter.delete('/:id/sets/:setId', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const set = await findOwnSet(userId, req.params.id as string, req.params.setId as string)
  if (!set) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  await prisma.workoutSet.delete({ where: { id: set.id } })

  res.status(204).send()
})

// いいね(Phase4)。対象は自分の記録、または所属グループで同席しているメンバーの記録(docs/schema.md参照)
workoutsRouter.post('/:id/reactions', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findAccessibleWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  // 既にいいね済みでも冪等に200を返す(UNIQUE制約違反はここで吸収する)
  await prisma.reaction.upsert({
    where: { targetType_targetId_userId: { targetType: 'workout', targetId: workout.id, userId } },
    create: { targetType: 'workout', targetId: workout.id, userId },
    update: {},
  })

  res.status(200).json({ reactionCount: await countReactions(workout.id), reactedByMe: true })
})

workoutsRouter.delete('/:id/reactions', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findAccessibleWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  // 未いいねの状態から呼ばれても冪等に扱う(deleteManyは対象0件でもエラーにならない)
  await prisma.reaction.deleteMany({
    where: { targetType: 'workout', targetId: workout.id, userId },
  })

  res.status(200).json({ reactionCount: await countReactions(workout.id), reactedByMe: false })
})

// コメント(Phase4)。認可はいいねと同じ(自分の記録、または所属グループで同席しているメンバーの記録)
workoutsRouter.get('/:id/comments', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findAccessibleWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const comments = await prisma.comment.findMany({
    where: { targetType: 'workout', targetId: workout.id },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { displayName: true } } },
  })

  res.status(200).json(comments.map((c) => serializeComment(c, c.user.displayName)))
})

workoutsRouter.post('/:id/comments', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findAccessibleWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const parsed = createCommentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }

  const comment = await prisma.comment.create({
    data: { targetType: 'workout', targetId: workout.id, userId, body: parsed.data.body },
    include: { user: { select: { displayName: true } } },
  })

  res.status(201).json(serializeComment(comment, comment.user.displayName))
})

// 自分のコメントのみ削除可(グループオーナーによる削除は今回のスコープ外)
workoutsRouter.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findAccessibleWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const comment = await prisma.comment.findFirst({
    where: { id: req.params.commentId as string, targetType: 'workout', targetId: workout.id, userId },
  })
  if (!comment) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  await prisma.comment.delete({ where: { id: comment.id } })

  res.status(204).send()
})
