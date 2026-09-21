import { computed } from 'vue'
import type { StocktakeSession, StocktakeItem } from '../types'
import { useLocalStorage } from '../utils/storage'
import { useMaterialStore } from './useMaterialStore'
import { uid } from '../utils/id'
import { toNumber } from '../utils/format'

// 模块级单例状态：历史会话（含进行中与已完成）
const sessions = useLocalStorage<StocktakeSession[]>('diy.stocktakes', [])

export function useStocktakeStore() {
  const materialStore = useMaterialStore()

  /** 当前进行中的盘点（至多一个） */
  const activeSession = computed(() => sessions.value.find((s) => s.status === '进行中') ?? null)

  /** 已完成的盘点，按完成时间倒序 */
  const finishedSessions = computed(() =>
    sessions.value
      .filter((s) => s.status === '已完成')
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0)),
  )

  /** 未清点项数 */
  function countUnchecked(session: StocktakeSession): number {
    return session.items.filter((i) => i.actualQty === null).length
  }

  /** 实盘与系统不一致的明细 */
  function diffItems(session: StocktakeSession): StocktakeItem[] {
    return session.items.filter((i) => i.actualQty !== null && toNumber(i.actualQty) !== toNumber(i.systemQty))
  }

  /** 开始盘点：对全部材料建立系统数量快照；已有进行中的盘点时不重复创建 */
  function startStocktake(): StocktakeSession | null {
    if (activeSession.value) return activeSession.value
    if (!materialStore.materials.value.length) return null
    const session: StocktakeSession = {
      id: uid('stk_'),
      status: '进行中',
      startedAt: Date.now(),
      items: materialStore.materials.value.map((m) => ({
        materialId: m.id,
        name: m.name,
        category: m.category,
        unit: m.unit,
        location: m.location,
        systemQty: toNumber(m.quantity),
        actualQty: null,
      })),
    }
    sessions.value.push(session)
    // 从响应式数组中取回，保证调用方拿到的引用与 activeSession 一致
    return activeSession.value
  }

  /** 录入某项的实盘数量 */
  function setActualQty(sessionId: string, materialId: string, qty: number | null) {
    const session = sessions.value.find((s) => s.id === sessionId && s.status === '进行中')
    const item = session?.items.find((i) => i.materialId === materialId)
    if (item) item.actualQty = qty
  }

  /** 未清点项批量按系统数量录入 */
  function fillUncheckedAsSystem(sessionId: string) {
    const session = sessions.value.find((s) => s.id === sessionId && s.status === '进行中')
    if (!session) return
    session.items.forEach((i) => {
      if (i.actualQty === null) i.actualQty = i.systemQty
    })
  }

  /** 放弃盘点（不留档） */
  function cancelStocktake(sessionId: string) {
    sessions.value = sessions.value.filter((s) => s.id !== sessionId)
  }

  /**
   * 确认盘点：按实盘数量一次性修正库存，关闭会话并留档。
   * 存在未清点项时拒绝提交，由调用方提示。
   * 返回已完成会话（未找到或未清点完时返回 null）。
   */
  function finishStocktake(sessionId: string): StocktakeSession | null {
    const session = sessions.value.find((s) => s.id === sessionId && s.status === '进行中')
    if (!session) return null
    if (countUnchecked(session) > 0) return null
    // 修正库存：以盘点快照的材料 ID 为准逐项写入实盘数量
    for (const item of session.items) {
      materialStore.updateMaterial(item.materialId, { quantity: toNumber(item.actualQty) })
    }
    session.status = '已完成'
    session.finishedAt = Date.now()
    return session
  }

  /** 删除一条盘点留档 */
  function removeStocktake(sessionId: string) {
    sessions.value = sessions.value.filter((s) => s.id !== sessionId)
  }

  return {
    sessions,
    activeSession,
    finishedSessions,
    countUnchecked,
    diffItems,
    startStocktake,
    setActualQty,
    fillUncheckedAsSystem,
    cancelStocktake,
    finishStocktake,
    removeStocktake,
  }
}
