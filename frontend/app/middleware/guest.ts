// ログイン済みならログイン／新規登録画面から離脱させる（未ログイン専用ページ用）
export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchMe } = useAuth()
  if (!user.value) {
    await fetchMe()
  }
  if (user.value) {
    return navigateTo('/')
  }
})
