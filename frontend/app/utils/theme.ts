// ダークモードの土台（Issue #239）。テーマの永続化キーと、保存値の妥当性チェックだけを
// 切り出した純粋ロジック。composable本体（app/composables/useTheme.ts）はNuxtの
// useState・documentに依存するためテスト対象外（CLAUDE.mdのテスト優先順位に沿い、
// vitest.config.tsはapp/utils/配下のみをテスト対象にしている）
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'torebu-theme'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

// localStorageからの読み取り値はnull・不正値もあり得るため、既定値(light)にフォールバックする
export function resolveStoredTheme(raw: string | null): Theme {
  return isTheme(raw) ? raw : 'light'
}
