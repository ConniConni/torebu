// ログイン済みならログイン／新規登録画面から離脱させる（未ログイン専用ページ用）
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchMe } = useAuth()
  if (!user.value) {
    await fetchMe()
  }
  if (user.value) {
    // 招待リンク経由（?redirect付き）なら、ログイン済みでも本来の戻り先へ送る（Issue #312）
    return navigateTo(safeRedirectPath(to.query.redirect) ?? '/')
  }
})
