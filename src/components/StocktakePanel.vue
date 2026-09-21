<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { StocktakeItem, StocktakeSession } from '../types'
import { useStocktakeStore } from '../stores/useStocktakeStore'
import { toNumber } from '../utils/format'

// 由父级保证仅在存在进行中的盘点时渲染
const emit = defineEmits<{
  (e: 'finished', id: string): void
  (e: 'cancelled'): void
}>()

const store = useStocktakeStore()

const keyword = ref('')
const onlyDiff = ref(false)
const onlyUnchecked = ref(false)
const rootRef = ref<HTMLElement>()

const session = computed(() => store.activeSession.value)

const total = computed(() => session.value?.items.length ?? 0)
const checkedCount = computed(
  () => session.value?.items.filter((i) => i.actualQty !== null).length ?? 0,
)
const uncheckedCount = computed(() => (session.value ? store.countUnchecked(session.value) : 0))
const diffs = computed<StocktakeItem[]>(() => (session.value ? store.diffItems(session.value) : []))
const diffCount = computed(() => diffs.value.length)
const gainCount = computed(
  () => diffs.value.filter((i) => toNumber(i.actualQty) > i.systemQty).length,
)
const lossCount = computed(
  () => diffs.value.filter((i) => toNumber(i.actualQty) < i.systemQty).length,
)
const percentage = computed(() => (total.value ? Math.round((checkedCount.value / total.value) * 100) : 0))

const filtered = computed(() =>
  (session.value?.items ?? []).filter((i) => {
    const matchKeyword = !keyword.value || i.name.includes(keyword.value)
    const matchDiff = !onlyDiff.value || (i.actualQty !== null && toNumber(i.actualQty) !== i.systemQty)
    const matchUnchecked = !onlyUnchecked.value || i.actualQty === null
    return matchKeyword && matchDiff && matchUnchecked
  }),
)

function deltaOf(item: StocktakeItem): number | null {
  if (item.actualQty === null) return null
  return toNumber(item.actualQty) - toNumber(item.systemQty)
}

function rowClass({ row }: { row: StocktakeItem }): string {
  if (row.actualQty === null) return 'row-unchecked'
  if (toNumber(row.actualQty) !== toNumber(row.systemQty)) return 'row-diff'
  return ''
}

function onQty(row: StocktakeItem, v: number | null) {
  if (session.value) store.setActualQty(session.value.id, row.materialId, v)
}

/** 回车自动聚焦下一项的数量输入框，方便连续清点 */
function focusNext(e: KeyboardEvent) {
  if (!rootRef.value) return
  const inputs = Array.from(rootRef.value.querySelectorAll<HTMLInputElement>('.qty-input input'))
  const idx = inputs.indexOf(e.target as HTMLInputElement)
  if (idx >= 0 && inputs[idx + 1]) inputs[idx + 1].focus()
}

function fillRest() {
  if (!session.value) return
  const n = store.countUnchecked(session.value)
  if (!n) {
    ElMessage.info('所有项目均已清点')
    return
  }
  store.fillUncheckedAsSystem(session.value.id)
  ElMessage.success(`已将剩余 ${n} 项按系统数量录入`)
}

async function cancel() {
  if (!session.value) return
  try {
    await ElMessageBox.confirm('放弃本次盘点？已录入的清点数据将不会保留，也不会生成留档。', '退出盘点', {
      type: 'warning',
      confirmButtonText: '放弃盘点',
    })
  } catch {
    return
  }
  store.cancelStocktake((session.value as StocktakeSession).id)
  ElMessage.info('已退出盘点模式')
  emit('cancelled')
}

async function confirm() {
  if (!session.value || uncheckedCount.value > 0) return
  const s = session.value
  const dCount = diffCount.value
  try {
    await ElMessageBox.confirm(
      dCount
        ? `共有 ${dCount} 项账实不一致（盘盈 ${gainCount.value} 项、盘亏 ${lossCount.value} 项）。确认后将按实盘数量一键修正库存，本次盘点记录将留档。`
        : '全部项目账实一致。确认完成本次盘点并留档？',
      '确认盘点结果',
      { type: 'warning', confirmButtonText: '确认修正库存', cancelButtonText: '再看看' },
    )
  } catch {
    return
  }
  const finished = store.finishStocktake(s.id)
  if (finished) {
    ElMessage.success(dCount ? `盘点完成，已修正 ${dCount} 项库存` : '盘点完成，账实一致')
    emit('finished', finished.id)
  }
}
</script>

<template>
  <div ref="rootRef" class="stocktake-panel">
    <el-alert type="warning" :closable="false" show-icon>
      <template #title>盘点模式进行中</template>
      <div class="alert-desc">
        逐项录入实际清点数量，与系统数量不一致的项目会自动标记差异；确认后将按盘点结果一键修正库存，差异记录自动留档。
      </div>
    </el-alert>

    <div class="card" style="margin-top: 12px">
      <div class="panel-head">
        <div class="panel-tags">
          <span class="section-title">盘点清单</span>
          <el-tag type="info">进度 {{ checkedCount }}/{{ total }}</el-tag>
          <el-tag v-if="uncheckedCount" type="warning">未清点 {{ uncheckedCount }}</el-tag>
          <el-tag v-if="diffCount" type="danger">差异 {{ diffCount }}（盘盈 {{ gainCount }} / 盘亏 {{ lossCount }}）</el-tag>
          <el-tag v-else-if="checkedCount === total && total" type="success">账实一致</el-tag>
        </div>
        <el-progress :percentage="percentage" :stroke-width="10" style="width: 220px" />
      </div>

      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="搜索材料名称" clearable style="width: 200px" />
        <el-checkbox v-model="onlyUnchecked">仅看未清点</el-checkbox>
        <el-checkbox v-model="onlyDiff">仅看差异</el-checkbox>
      </div>

      <el-table :data="filtered" border :row-class-name="rowClass" size="small">
        <el-table-column type="index" label="#" width="48" align="center" />
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="category" label="类别" width="92" />
        <el-table-column label="系统数量" width="110" align="center">
          <template #default="{ row }">{{ row.systemQty }} {{ row.unit }}</template>
        </el-table-column>
        <el-table-column label="实盘数量" width="180" align="center">
          <template #default="{ row }">
            <el-input-number
              class="qty-input"
              :model-value="row.actualQty ?? undefined"
              :value-on-clear="null"
              :min="0"
              size="small"
              controls-position="right"
              placeholder="清点数量"
              @update:model-value="(v: number | undefined) => onQty(row, v ?? null)"
              @keyup.enter="focusNext"
            />
          </template>
        </el-table-column>
        <el-table-column label="差异" width="150" align="center">
          <template #default="{ row }">
            <el-tag v-if="deltaOf(row) === null" type="info" size="small">未清点</el-tag>
            <el-tag v-else-if="deltaOf(row) === 0" type="success" size="small">一致</el-tag>
            <el-tag v-else type="danger" size="small">
              {{ deltaOf(row)! > 0 ? '盘盈' : '盘亏' }} {{ Math.abs(deltaOf(row)!) }} {{ row.unit }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="存放位置" min-width="110">
          <template #default="{ row }">{{ row.location || '—' }}</template>
        </el-table-column>
      </el-table>

      <div class="panel-footer">
        <el-button @click="cancel">放弃盘点</el-button>
        <el-button :disabled="!uncheckedCount" @click="fillRest">未清点项按系统数量</el-button>
        <el-button type="primary" :disabled="uncheckedCount > 0" @click="confirm">
          确认并修正库存
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.alert-desc {
  font-size: 13px;
  line-height: 1.5;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.panel-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.section-title {
  font-weight: 600;
  font-size: 15px;
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.qty-input {
  width: 150px;
}
.panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}
:deep(.row-diff) td {
  background-color: #fef0f0 !important;
}
:deep(.row-unchecked) td {
  background-color: #fdf6ec !important;
}
</style>
