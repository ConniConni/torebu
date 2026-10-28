import { describe, expect, it } from 'vitest'
import { youtubeHowToSearchUrl } from './youtubeSearch'

describe('youtubeHowToSearchUrl', () => {
  it('「種目名 やり方」で検索するURLを作る', () => {
    const url = new URL(youtubeHowToSearchUrl('ベンチプレス'))
    expect(url.origin).toBe('https://www.youtube.com')
    expect(url.pathname).toBe('/results')
    expect(url.searchParams.get('search_query')).toBe('ベンチプレス やり方')
  })

  it('記号を含む種目名でもクエリが壊れない', () => {
    const url = new URL(youtubeHowToSearchUrl('ケーブル&フライ #2 (自作)?'))
    expect([...url.searchParams.keys()]).toEqual(['search_query'])
    expect(url.searchParams.get('search_query')).toBe('ケーブル&フライ #2 (自作)? やり方')
  })

  it('前後の空白は除く', () => {
    const url = new URL(youtubeHowToSearchUrl('  スクワット '))
    expect(url.searchParams.get('search_query')).toBe('スクワット やり方')
  })
})
