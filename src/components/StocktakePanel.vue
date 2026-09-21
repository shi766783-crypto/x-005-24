<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Material, StocktakeDiffItem } from '../types'
import { useMaterialStore } from '../stores/useMaterialStore'
import { useStocktakeStore } from '../stores/useStocktakeStore'
import { toNumber } from '../utils/format'

const emit = defineEmits<{ (e: 'exit'): void }>()

const materialStore = useMaterialStore()
const stocktakeStore = useStocktakeStore()

interface StocktakeRow {
  material: Material
  systemQty: number // 进入盘点时的账面快照
  actual: number | null // 实盘数量，null 表示尚未录入
}

// 进入盘点时对账面数量做快照，盘点过程中不随库存变化
const rows = ref<StocktakeRow[]>(
  materialStore.materials.value.map((m) => ({
    material: m,
    systemQty: toNumber(m.quantity),
    actual: null,
  })),
)

const confirmVisible = ref(false)

const enteredCount = computed(() => rows.value.filter((r) => r.actual !== null).length)
const allEntered = computed(() => rows.value.length > 0 && enteredCount.value === rows.value.length)

function diffOf(row: StocktakeRow): number {
  return row.actual === null ? 0 : toNumber(row.actual) - row.systemQty
}

/** 已录入且与账面不一致的行 */
const diffRows = computed(() => rows.value.filter((r) => r.actual !== null && diffOf(r) !== 0))
const surplusCount = computed(() => diffRows.value.filter((r) => diffOf(r) > 0).length)
const shortageCount = computed(() => diffRows.value.filter((r) => diffOf(r) < 0).length)

/** 差异行高亮 */
function rowClassName({ row }: { row: StocktakeRow }): string {
  return row.actual !== null && diffOf(row) !== 0 ? 'diff-row' : ''
}

/** 把未录入的行按账面数量填充（适用于逐项清点后跳过无差异项） */
function fillRemaining() {
  for (const row of rows.value) {
    if (row.actual === null) row.actual = row.systemQty
  }
}

async function cancel() {
  if (enteredCount.value > 0) {
    try {
      await ElMessageBox.confirm('已录入的清点数据将丢失，确定退出盘点模式吗？', '退出盘点', {
        type: 'warning',
        confirmButtonText: '退出',
        cancelButtonText: '继续盘点',
      })
    } catch {
      return
    }
  }
  emit('exit')
}

function openConfirm() {
  if (!allEntered.value) return
  confirmVisible.value = true
}

/** 确认修正：一键把库存修正为实盘数量，差异明细留档 */
function apply() {
  const items: StocktakeDiffItem[] = diffRows.value.map((r) => ({
    materialId: r.material.id,
    name: r.material.name,
    unit: r.material.unit,
    systemQty: r.systemQty,
    actualQty: toNumber(r.actual),
    diff: diffOf(r),
  }))
  materialStore.applyStocktake(items.map((i) => ({ id: i.materialId, quantity: i.actualQty })))
  stocktakeStore.addRecord({
    totalCount: rows.value.length,
    diffCount: items.length,
    items,
  })
  confirmVisible.value = false
  ElMessage.success(
    items.length ? `盘点完成，已修正 ${items.length} 项差异` : '盘点完成，库存与账面一致',
  )
  emit('exit')
}
</script>

<template>
  <div class="card stocktake-panel">
    <div class="stocktake-head">
      <div class="stocktake-status">
        <el-tag type="warning" effect="dark">盘点中</el-tag>
        <span class="muted">已录入 {{ enteredCount }} / {{ rows.length }} 项</span>
        <template v-if="diffRows.length">
          <el-tag type="danger" size="small">{{ diffRows.length }} 项差异</el-tag>
          <el-tag v-if="surplusCount" type="success" size="small">盘盈 {{ surplusCount }}</el-tag>
          <el-tag v-if="shortageCount" type="danger" size="small">盘亏 {{ shortageCount }}</el-tag>
        </template>
        <el-tag v-else-if="enteredCount" type="success" size="small">暂无差异</el-tag>
      </div>
      <div class="stocktake-actions">
        <el-button size="small" @click="fillRemaining">未盘项按账面填充</el-button>
        <el-button size="small" @click="cancel">取消盘点</el-button>
        <el-button
          size="small"
          type="primary"
          :disabled="!allEntered"
          :title="allEntered ? '' : '请先录入所有材料的实盘数量'"
          @click="openConfirm"
        >
          确认修正
        </el-button>
      </div>
    </div>

    <el-table :data="rows" border :row-class-name="rowClassName">
      <el-table-column prop="material.name" label="名称" min-width="130" />
      <el-table-column prop="material.category" label="类别" width="100" />
      <el-table-column label="账面数量" width="110" align="center">
        <template #default="{ row }">{{ row.systemQty }} {{ row.material.unit }}</template>
      </el-table-column>
      <el-table-column label="实盘数量" width="180" align="center">
        <template #default="{ row }">
          <el-input-number
            v-model="row.actual"
            :min="0"
            :placeholder="row.systemQty.toString()"
            size="small"
            style="width: 140px"
          />
        </template>
      </el-table-column>
      <el-table-column label="差异" width="110" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.actual === null" type="info" size="small">未录入</el-tag>
          <el-tag v-else-if="diffOf(row) > 0" type="success" size="small">盘盈 +{{ diffOf(row) }}</el-tag>
          <el-tag v-else-if="diffOf(row) < 0" type="danger" size="small">盘亏 {{ diffOf(row) }}</el-tag>
          <el-tag v-else type="info" size="small">一致</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="material.location" label="存放位置" min-width="120" />
    </el-table>

    <el-dialog v-model="confirmVisible" title="确认盘点结果" width="640px">
      <div class="confirm-summary">
        共盘点 <b>{{ rows.length }}</b> 种材料，
        <template v-if="diffRows.length">
          其中 <b class="diff-text">{{ diffRows.length }}</b> 种存在差异（盘盈 {{ surplusCount }} 种、盘亏
          {{ shortageCount }} 种）。确认后库存将按实盘数量修正，差异明细自动留档。
        </template>
        <template v-else>全部与账面一致，无需修正。确认后生成盘点记录留档。</template>
      </div>
      <el-table v-if="diffRows.length" :data="diffRows" size="small" border max-height="320">
        <el-table-column prop="material.name" label="材料" min-width="120" />
        <el-table-column label="账面数量" width="100" align="center">
          <template #default="{ row }">{{ row.systemQty }} {{ row.material.unit }}</template>
        </el-table-column>
        <el-table-column label="实盘数量" width="100" align="center">
          <template #default="{ row }">{{ row.actual }} {{ row.material.unit }}</template>
        </el-table-column>
        <el-table-column label="差异" width="100" align="center">
          <template #default="{ row }">
            <span :class="diffOf(row) > 0 ? 'diff-plus' : 'diff-minus'">
              {{ diffOf(row) > 0 ? '+' : '' }}{{ diffOf(row) }} {{ row.material.unit }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="confirmVisible = false">再检查一下</el-button>
        <el-button type="primary" @click="apply">确认修正并留档</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.stocktake-panel {
  border-color: var(--warning);
}
.stocktake-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.stocktake-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.stocktake-actions {
  display: flex;
  gap: 8px;
}
.confirm-summary {
  margin-bottom: 12px;
  line-height: 1.6;
}
.diff-text {
  color: var(--danger);
}
.diff-plus {
  color: var(--success);
  font-weight: 600;
}
.diff-minus {
  color: var(--danger);
  font-weight: 600;
}
/* 差异行底色高亮（el-table 行类名挂在 tr 上，需穿透 scoped） */
:deep(.diff-row) {
  background: #fdf6ec;
}
</style>
