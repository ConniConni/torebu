import { describe, expect, it } from 'vitest'
import { animalCaption, formatTons, pickSeaAnimal } from './weightDisplay'

describe('formatTons', () => {
  it('kgをtに変換し、小数第1位までにする', () => {
    expect(formatTons(800)).toBe('0.8t')
    expect(formatTons(12500)).toBe('12.5t')
  })

  it('0kg以下は0tを返す（小数点を付けない）', () => {
    expect(formatTons(0)).toBe('0t')
    expect(formatTons(-10)).toBe('0t')
  })
})

describe('pickSeaAnimal', () => {
  it('その動物の体重の1倍未満なら、まだ次の動物には切り替わらない', () => {
    // 4t はシャチ(5.5t)の1倍未満なのでマンボウのまま
    expect(pickSeaAnimal(4).key).toBe('manbou')
    // 100t はクジラ(110t)の1倍未満なのでシャチのまま
    expect(pickSeaAnimal(100).key).toBe('orca')
  })

  it('その動物の体重の1倍以上になったら切り替える', () => {
    expect(pickSeaAnimal(5.5).key).toBe('orca')
    expect(pickSeaAnimal(110).key).toBe('whale')
  })

  it('一番小さい動物の1倍未満でも、一番小さい動物を返す', () => {
    expect(pickSeaAnimal(0.3).key).toBe('manbou')
  })
})

describe('animalCaption', () => {
  it('multiplierTextは倍数を常に小数第1位までの文字列にする。animalNameは動物名を別途持つ', () => {
    expect(animalCaption(800)).toEqual({
      animalKey: 'manbou',
      animalName: 'マンボウ',
      multiplierText: '0.8',
    })
    expect(animalCaption(7_700)).toEqual({
      animalKey: 'orca',
      animalName: 'シャチ',
      multiplierText: '1.4',
    })
  })

  it('倍数が整数のときも小数第1位（.0）まで表示する', () => {
    expect(animalCaption(5_500)).toEqual({
      animalKey: 'orca',
      animalName: 'シャチ',
      multiplierText: '1.0',
    })
  })

  it('0kg以下はnullを返す', () => {
    expect(animalCaption(0)).toBeNull()
    expect(animalCaption(-5)).toBeNull()
  })
})
