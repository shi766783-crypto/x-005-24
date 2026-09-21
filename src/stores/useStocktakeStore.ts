import { computed } from 'vue'
import type { StocktakeRecord } from '../types'
import { useLocalStorage } from '../utils/storage'
import { uid } from '../utils/id'

// 模块级单例状态
const records = useLocalStorage<StocktakeRecord[]>('diy.stocktakes', [])

export function useStocktakeStore() {
  function addRecord(data: Omit<StocktakeRecord, 'id' | 'createdAt'>): StocktakeRecord {
    const record: StocktakeRecord = { ...data, id: uid('stk_'), createdAt: Date.now() }
    records.value.push(record)
    return record
  }

  function removeRecord(id: string) {
    records.value = records.value.filter((r) => r.id !== id)
  }

  /** 按时间倒序，最近的盘点排在前面 */
  const sortedRecords = computed(() => [...records.value].sort((a, b) => b.createdAt - a.createdAt))

  return { records, addRecord, removeRecord, sortedRecords }
}
