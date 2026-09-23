// ダークモードの土台（Issue #239）。まだユーザー向けの切替UIは無いため、初期化時に
// localStorageの保存値（デフォルトはlight）を読み込んでdocumentElementに反映するだけの
// 状態管理。マイページに切替UIを追加するIssue（Stripe連携着手時）で、この composable の
// setTheme をトグルから呼ぶ形になる想定
import { THEME_STORAGE_KEY, resolveStoredTheme, type Theme } from '~/utils/theme'

export function useTheme() {
  const theme = useState<Theme>('theme', () => 'light')

  const applyTheme = (value: Theme) => {
    if (import.meta.client) {
      document.documentElement.dataset.theme = value
    }
  }

  const setTheme = (value: Theme) => {
    theme.value = value
    applyTheme(value)
    if (import.meta.client) {
      localStorage.setItem(THEME_STORAGE_KEY, value)
    }
  }

  // アプリ起動時（app.vueのonMounted）に1回呼び、保存済みのテーマ（無ければlight）を反映する
  const initTheme = () => {
    if (!import.meta.client) return
    setTheme(resolveStoredTheme(localStorage.getItem(THEME_STORAGE_KEY)))
  }

  return { theme, setTheme, initTheme }
}
