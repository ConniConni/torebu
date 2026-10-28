// 種目のやり方をYouTubeの検索結果で見せる（Issue #405）。動画の選定・埋め込みはせず、
// 「種目名 やり方」の検索結果ページへのURLを作るだけ（ライセンス・リンク切れの管理を持たないため。
// 見送った案はdocs/backlog.md「種目のやり方表示」参照）
export function youtubeHowToSearchUrl(exerciseName: string): string {
  const query = `${exerciseName.trim()} やり方`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}
