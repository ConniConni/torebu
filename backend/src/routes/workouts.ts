import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { shiftDateString, todayInJst } from '../lib/date.js'
import type {
  WorkoutModel,
  WorkoutSetModel,
  WorkoutExerciseModel,
} from '../generated/prisma/models.js'

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

function serializeWorkoutExercise(workoutExercise: WorkoutExerciseModel) {
  return {
    id: workoutExercise.id,
    workoutId: workoutExercise.workoutId,
    exerciseId: workoutExercise.exerciseId,
    sortOrder: workoutExercise.sortOrder,
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

// 通知(Phase4、#144)。自分の記録への自分の操作では作成しない(actorId === recipientIdの場合はスキップ)
async function notifyWorkoutOwner(
  type: 'reaction' | 'comment' | 'comment_reply',
  recipientId: string,
  actorId: string,
  workoutId: string,
) {
  if (recipientId === actorId) return
  await prisma.notification.create({
    data: { recipientId, actorId, type, targetType: 'workout', targetId: workoutId },
  })
}

// コメント通知(#149)。記録の投稿者(comment)に加え、そのworkoutへの過去のコメント投稿者
// (comment_reply)にもスレッド参加者として通知する。投稿者自身・今回のコメント投稿者(actor)は
// 重複しないよう除外する
async function notifyCommentParticipants(
  workoutOwnerId: string,
  actorId: string,
  workoutId: string,
) {
  await notifyWorkoutOwner('comment', workoutOwnerId, actorId, workoutId)

  const pastCommenters = await prisma.comment.findMany({
    where: { targetType: 'workout', targetId: workoutId },
    distinct: ['userId'],
    select: { userId: true },
  })
  const participantIds = new Set(pastCommenters.map((c) => c.userId))
  participantIds.delete(actorId)
  participantIds.delete(workoutOwnerId) // 投稿者には上のnotifyWorkoutOwnerで通知済み

  for (const participantId of participantIds) {
    await notifyWorkoutOwner('comment_reply', participantId, actorId, workoutId)
  }
}

function serializeComment(
  comment: { id: string; userId: string; body: string; createdAt: Date },
  displayName: string,
) {
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
  // performedAtは日付のみ(時刻を持たない)のため、同じ日に複数件記録すると
  // performedAtだけでは同値行の順序が不定になる。createdAtをtie-breakにして登録順(新しい順)を保証する
  const workouts = await prisma.workout.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
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

  // setOrderは種目ごとに1からリセットされる連番のため、異なる種目間では頻繁に同値になる
  // (例:5種目とも1セット目はsetOrder=1)。tie-breakにcreatedAtを追加し、同じ種目内のセットの
  // 表示順が常に安定するようにする(Issue #226)。種目カード自体の並び順は下のexercises(sortOrder)
  // が持つ(Issue #228)
  const [sets, exercises] = await Promise.all([
    prisma.workoutSet.findMany({
      where: { workoutId: workout.id },
      orderBy: [{ setOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.workoutExercise.findMany({
      where: { workoutId: workout.id },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  res.status(200).json({
    ...serializeWorkout(workout, sets.length > 0),
    sets: sets.map(serializeSet),
    exercises: exercises.map(serializeWorkoutExercise),
  })
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

  // セット0件・メモ無しになった場合、中身の無いworkoutをホームに残さないためソフトデリートする
  // (Issue #234)。フロント(useWorkoutSession.tsのupdateMemo)はdeleted:trueを見てセッションを
  // リセットし、既に削除済みのworkoutIdを使い回して後続のAPI呼び出しが404になるのを防ぐ
  const shouldDelete = setCount === 0 && updated.memo === null
  if (shouldDelete) {
    await prisma.workout.update({ where: { id: workout.id }, data: { deletedAt: new Date() } })
  }

  res.status(200).json({ ...serializeWorkout(updated, false), deleted: shouldDelete })
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

// 種目カード(WorkoutExercise)がこのworkoutに無ければ、末尾のsortOrderで作る(Issue #228)。
// 既にある場合は何もしない(セットを追加しただけではカードの並びは動かさない)。
// フロントが並び替え(PATCH .../exercises/:workoutExerciseId)に使うIDをその場で持てるよう、
// 呼び出し側(POST /:id/sets)のレスポンスに含めて返す
async function ensureWorkoutExercise(workoutId: string, exerciseId: string) {
  const aggregate = await prisma.workoutExercise.aggregate({
    where: { workoutId },
    _max: { sortOrder: true },
  })
  return prisma.workoutExercise.upsert({
    where: { workoutId_exerciseId: { workoutId, exerciseId } },
    create: { workoutId, exerciseId, sortOrder: (aggregate._max.sortOrder ?? 0) + 1 },
    update: {},
  })
}

// --- 自己ベスト更新(Issue #253。docs/backlog.md「通知の種類の拡張」①) ---
// 判定基準は種目ごとの最大重量。自重(weightKg: null)のセット・初めて記録した種目(比べる相手が無い)は対象外

type PersonalBest = { exerciseId: string; weightKg: number; previousBestKg: number }

function toWeightNumber(weightKg: WorkoutSetModel['weightKg']) {
  return weightKg === null ? null : Number(weightKg)
}

// 自分の(削除済みでない)記録のうち、条件に合うセットのその種目の最大重量(無ければnull。_maxはnullを無視する)
async function maxOwnWeight(
  userId: string,
  exerciseId: string,
  exclude: { setId: string } | { workoutId: string },
) {
  const aggregate = await prisma.workoutSet.aggregate({
    where: {
      exerciseId,
      workout: { userId, deletedAt: null },
      ...('setId' in exclude
        ? { id: { not: exclude.setId } }
        : { workoutId: { not: exclude.workoutId } }),
    },
    _max: { weightKg: true },
  })
  return toWeightNumber(aggregate._max.weightKg)
}

// 行為者(actorId)が現在所属するアクティブな全グループの、行為者以外のアクティブなメンバーのID
// (受信者ごとに重複排除)。①自己ベスト・C1通算の節目・C2久しぶりの復帰で共通の宛先ロジック(Issue #253, #255)
async function activeGroupRecipientIds(actorId: string) {
  const recipients = await prisma.groupMember.findMany({
    where: {
      leftAt: null,
      userId: { not: actorId },
      group: { deletedAt: null, members: { some: { userId: actorId, leftAt: null } } },
    },
    distinct: ['userId'],
    select: { userId: true },
  })
  return recipients.map((r) => r.userId)
}

// 仲間への自己ベスト更新の通知。宛先は行為者が所属するアクティブな全グループのアクティブなメンバー
// (受信者ごとに重複排除、本人は除く)。同じ記録の同じ種目につき1件まで(既にあれば作らない)。
// payloadに更新前のベストを残し、表示時は「その記録の現在の最大重量 > 更新前のベスト」で確認し直す
// (notifications.tsのfindVisibleNotifications参照)。セットを高速に連続保存したときにまれに重複しうるのは許容
async function notifyPersonalBest(
  actorId: string,
  workoutId: string,
  exerciseId: string,
  previousBestKg: number,
) {
  const existing = await prisma.notification.findFirst({
    where: {
      type: 'personal_best',
      actorId,
      targetType: 'workout',
      targetId: workoutId,
      payload: { path: ['exerciseId'], equals: exerciseId },
    },
    select: { id: true },
  })
  if (existing) return

  const recipientIds = await activeGroupRecipientIds(actorId)
  if (recipientIds.length === 0) return

  await prisma.notification.createMany({
    data: recipientIds.map((recipientId) => ({
      recipientId,
      actorId,
      type: 'personal_best' as const,
      targetType: 'workout' as const,
      targetId: workoutId,
      payload: { exerciseId, previousBestKg },
    })),
  })
}

// --- C1 通算の節目・C2 久しぶりの復帰(Issue #255。docs/backlog.md「通知の種類の拡張」参照) ---
// どちらも判定タイミングは同じ：その日付の自分のセットが初めて1件になったとき(セットのPOSTのみ)

// 自分の(削除済みでない)セットが1件以上ある日付(=workout)の数。「セットがある日」だけを数える方針を
// C1・②ホーム・⑨マイページのトレ日数表示で揃える(1ユーザー1日1workoutのため、workout数=日数になる)
async function countDaysWithSets(userId: string) {
  return prisma.workout.count({ where: { userId, deletedAt: null, sets: { some: {} } } })
}

// 節目は10・30・50・100日、以降100日ごと、および365日
function isMilestoneDayCount(days: number) {
  if (days === 365) return true
  return days === 10 || days === 30 || days === 50 || (days >= 100 && days % 100 === 0)
}

// 仲間への通算の節目の通知。同じ節目は2回通知しない(日付を間違えた記録を消して正しい日付で
// 入れ直す、という操作で重複するため)
async function notifyMilestone(actorId: string, workoutId: string, days: number) {
  const existing = await prisma.notification.findFirst({
    where: { type: 'milestone', actorId, payload: { path: ['days'], equals: days } },
    select: { id: true },
  })
  if (existing) return

  const recipientIds = await activeGroupRecipientIds(actorId)
  if (recipientIds.length === 0) return

  await prisma.notification.createMany({
    data: recipientIds.map((recipientId) => ({
      recipientId,
      actorId,
      type: 'milestone' as const,
      targetType: 'workout' as const,
      targetId: workoutId,
      payload: { days },
    })),
  })
}

// 仲間への久しぶりの復帰の通知。トリガー自体が「その日付の最初のセット」に限られるため、
// personal_best・milestoneのような重複防止のクエリは設けない(セットを高速に連続保存したときの
// まれな重複と同様、許容した既知のずれとして扱う。docs/backlog.md参照)
async function notifyComeback(actorId: string, workoutId: string) {
  const recipientIds = await activeGroupRecipientIds(actorId)
  if (recipientIds.length === 0) return

  await prisma.notification.createMany({
    data: recipientIds.map((recipientId) => ({
      recipientId,
      actorId,
      type: 'comeback' as const,
      targetType: 'workout' as const,
      targetId: workoutId,
    })),
  })
}

type Achievements = { milestoneDays: number | null; comeback: boolean }

// C1・C2の判定。isFirstSetOfWorkoutがfalse(このworkoutに既にセットがある)の場合は判定しない
async function evaluateAchievements(
  userId: string,
  workout: WorkoutModel,
  isFirstSetOfWorkout: boolean,
): Promise<Achievements> {
  if (!isFirstSetOfWorkout) return { milestoneDays: null, comeback: false }

  const totalDays = await countDaysWithSets(userId)
  const milestoneDays = isMilestoneDayCount(totalDays) ? totalDays : null
  if (milestoneDays !== null) {
    await notifyMilestone(userId, workout.id, milestoneDays)
  }

  // C2の対象は日本時間で今日・昨日の記録のみ、かつ初めての記録(totalDays === 1)は対象外
  const performedAt = workout.performedAt.toISOString().slice(0, 10)
  const today = todayInJst()
  const yesterday = shiftDateString(today, -1)
  let comeback = false
  if (totalDays > 1 && (performedAt === today || performedAt === yesterday)) {
    // 「その日付の前14日間と翌日に、セットがある日付が他に無い」を、このworkout以外に
    // 同じ範囲でセットがある記録が無いかで判定する(1ユーザー1日1workoutのため、
    // 日付そのものの比較ではなくworkout単位の除外で十分)
    const rangeStart = shiftDateString(performedAt, -14)
    const rangeEnd = shiftDateString(performedAt, 1)
    const otherDayInRange = await prisma.workout.findFirst({
      where: {
        userId,
        deletedAt: null,
        id: { not: workout.id },
        sets: { some: {} },
        performedAt: {
          gte: new Date(`${rangeStart}T00:00:00Z`),
          lte: new Date(`${rangeEnd}T00:00:00Z`),
        },
      },
      select: { id: true },
    })
    comeback = otherDayInRange === null
  }
  if (comeback) {
    await notifyComeback(userId, workout.id)
  }

  return { milestoneDays, comeback }
}

// 保存したセット(POST/重量を変えたPATCH)の自己ベスト判定。仲間への通知を作り、本人向けの達成内容を返す。
// - 仲間への通知：自分の「他の記録」の最大重量を上回ったとき(同じ記録内の他のセットとは比べない。
//   記録単位で「この日に自己ベストを出した」ことを伝えるため)
// - 本人へのその場の表示：同じ記録内の他のセットも含め、それまでの自分の最高重量を上回るたびに返す
//   (通知の有無とは関係ない)
async function evaluatePersonalBest(
  userId: string,
  set: WorkoutSetModel,
): Promise<PersonalBest | null> {
  const weightKg = toWeightNumber(set.weightKg)
  if (weightKg === null) return null

  const [bestExceptThisSet, bestInOtherWorkouts] = await Promise.all([
    maxOwnWeight(userId, set.exerciseId, { setId: set.id }),
    maxOwnWeight(userId, set.exerciseId, { workoutId: set.workoutId }),
  ])

  if (bestInOtherWorkouts !== null && weightKg > bestInOtherWorkouts) {
    await notifyPersonalBest(userId, set.workoutId, set.exerciseId, bestInOtherWorkouts)
  }

  if (bestExceptThisSet === null || weightKg <= bestExceptThisSet) return null
  return { exerciseId: set.exerciseId, weightKg, previousBestKg: bestExceptThisSet }
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

  const workoutExercise = await ensureWorkoutExercise(workout.id, parsed.data.exerciseId)
  const setOrder = await nextSetOrder(workout.id, parsed.data.exerciseId)
  // C1・C2の判定用に、このセットを追加する前の時点でこのworkoutにセットが無かったか(=その日付の
  // 初めてのセットになるか)を先に見ておく
  const isFirstSetOfWorkout =
    (await prisma.workoutSet.count({ where: { workoutId: workout.id } })) === 0
  const set = await prisma.workoutSet.create({
    data: {
      workoutId: workout.id,
      exerciseId: parsed.data.exerciseId,
      setOrder,
      weightKg: parsed.data.weightKg,
      reps: parsed.data.reps,
    },
  })

  const personalBest = await evaluatePersonalBest(userId, set)
  const achievements = await evaluateAchievements(userId, workout, isFirstSetOfWorkout)

  res.status(201).json({
    ...serializeSet(set),
    workoutExercise: serializeWorkoutExercise(workoutExercise),
    personalBest,
    achievements,
  })
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

  // 自己ベストの判定は重量が変わったときだけ行う。③記録画面は回数欄のblurでも重量ごとPATCHするため、
  // 変わっていないときまで判定すると、同じ達成の表示が何度も出てしまう
  const weightChanged = toWeightNumber(set.weightKg) !== toWeightNumber(updated.weightKg)
  const personalBest = weightChanged ? await evaluatePersonalBest(userId, updated) : null

  res.status(200).json({ ...serializeSet(updated), personalBest })
})

workoutsRouter.delete('/:id/sets/:setId', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findOwnWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  const set = await prisma.workoutSet.findFirst({
    where: { id: req.params.setId as string, workoutId: workout.id },
  })
  if (!set) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  // 削除すると、その種目の残りのsetOrderに欠番ができる(例: 1,2,3から2を消すと1,3が残る)。
  // 採番自体はnextSetOrderが最大値+1で拾うため壊れないが、表示上「1セット目から始まらない」
  // 「セット数と連番がずれる」ことになるため、削除のたびに残りを1から連番に詰め直す
  const shouldDelete = await prisma.$transaction(async (tx) => {
    await tx.workoutSet.delete({ where: { id: set.id } })

    const remaining = await tx.workoutSet.findMany({
      where: { workoutId: set.workoutId, exerciseId: set.exerciseId },
      orderBy: { setOrder: 'asc' },
    })
    for (const [index, s] of remaining.entries()) {
      const setOrder = index + 1
      if (s.setOrder !== setOrder) {
        await tx.workoutSet.update({ where: { id: s.id }, data: { setOrder } })
      }
    }

    // このworkout全体でセットが0件・メモ無しになった場合、中身の無いworkoutをホームに
    // 残さないためソフトデリートする(Issue #234)。上のremainingは「同じ種目」のみを見て
    // いるため、ここでは他種目分も含めたworkout全体のセット数を数え直す
    const totalSetCount = await tx.workoutSet.count({ where: { workoutId: set.workoutId } })
    if (totalSetCount === 0 && workout.memo === null) {
      await tx.workout.update({ where: { id: workout.id }, data: { deletedAt: new Date() } })
      return true
    }
    return false
  })

  // フロント(useWorkoutSession.tsのremoveSet)はdeleted:trueを見てセッションをリセットし、
  // 既に削除済みのworkoutIdを使い回して後続のAPI呼び出しが404になるのを防ぐ
  res.status(200).json({ deleted: shouldDelete })
})

// 種目カードの並び替え(Issue #228。ルーティン画面のPATCH /routines/:id/exercises/:idと同じ方針)
const updateWorkoutExerciseSchema = z.object({
  sortOrder: z.number().int().positive(),
})

async function findOwnWorkoutExercise(
  userId: string,
  workoutId: string,
  workoutExerciseId: string,
) {
  const workout = await findOwnWorkout(userId, workoutId)
  if (!workout) return null
  return prisma.workoutExercise.findFirst({
    where: { id: workoutExerciseId, workoutId: workout.id },
  })
}

workoutsRouter.patch('/:id/exercises/:workoutExerciseId', requireAuth, async (req, res) => {
  const parsed = updateWorkoutExerciseSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workoutExercise = await findOwnWorkoutExercise(
    userId,
    req.params.id as string,
    req.params.workoutExerciseId as string,
  )
  if (!workoutExercise) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const updated = await prisma.workoutExercise.update({
    where: { id: workoutExercise.id },
    data: { sortOrder: parsed.data.sortOrder },
  })

  res.status(200).json(serializeWorkoutExercise(updated))
})

// いいね(Phase4)。対象は所属グループで同席しているメンバーの記録(docs/schema.md参照)。
// 自分の記録には不可(#149)：自分の記録のいいねボタンは「いいねしてくれた人の一覧を開く」専用に
// なるため、トグル操作(いいねする/取り消す)と一覧表示のタップが同じボタンで衝突しないようにする
workoutsRouter.post('/:id/reactions', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findAccessibleWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  if (workout.userId === userId) {
    res.status(400).json({ error: 'cannot_react_to_own_workout' })
    return
  }

  // 既存いいねの有無を先に見ておく(通知は新規いいね時のみ作成し、連打で重複させないため)
  const alreadyReacted = await prisma.reaction.findUnique({
    where: { targetType_targetId_userId: { targetType: 'workout', targetId: workout.id, userId } },
  })

  // 既にいいね済みでも冪等に200を返す(UNIQUE制約違反はここで吸収する)
  await prisma.reaction.upsert({
    where: { targetType_targetId_userId: { targetType: 'workout', targetId: workout.id, userId } },
    create: { targetType: 'workout', targetId: workout.id, userId },
    update: {},
  })

  if (!alreadyReacted) {
    await notifyWorkoutOwner('reaction', workout.userId, userId, workout.id)
  }

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

  await notifyCommentParticipants(workout.userId, userId, workout.id)

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
    where: {
      id: req.params.commentId as string,
      targetType: 'workout',
      targetId: workout.id,
      userId,
    },
  })
  if (!comment) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  await prisma.comment.delete({ where: { id: comment.id } })

  res.status(204).send()
})
