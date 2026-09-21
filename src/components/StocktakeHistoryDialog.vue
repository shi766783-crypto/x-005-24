<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { StocktakeSession } from '../types'
import { useStocktakeStore } from '../stores/useStocktakeStore'
import { formatDateTime, toNumber } from '../utils/format'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const store = useStocktakeStore()
const list = computed(() => store.finishedSessions.value)

function diffCount(s: StocktakeSession): number {
  return store.diffItems(s).length
}

function deltaOf(s: StocktakeSession): number {
  return store.diffItems(s).reduce((sum, i) => sum + (toNumber(i.actualQty) - toNumber(i.systemQty)), 0)
}

async function remove(s: StocktakeSession) {
  try {
    await ElMessageBox.confirm('确定删除该条盘点留档吗？删除后不可恢复。', '提示', { type: 'warning' })
  } catch {
    return
  }
  store.removeStocktake(s.id)
  ElMessage.success('留档已删除')
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="盘点记录"
    width="780px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-empty v-if="!list.length" description="暂无盘点记录" :image-size="80" />
    <el-collapse v-else accordion>
      <el-collapse-item v-for="s in list" :key="s.id" :name="s.id">
        <template #title>
          <div class="record-title">
            <el-icon><Calendar /></el-icon>
            <span>{{ formatDateTime(s.finishedAt ?? 0) }}</span>
            <el-tag size="small" type="info">{{ s.items.length }} 项</el-tag>
            <el-tag size="small" :type="diffCount(s) ? 'danger' : 'success'">
              {{ diffCount(s) ? `差异 ${diffCount(s)} 项` : '账实一致' }}
            </el-tag>
          </div>
        </template>

        <el-table :data="s.items" size="small" border>
          <el-table-column prop="name" label="名称" min-width="120" />
          <el-table-column prop="category" label="类别" width="86" />
          <el-table-column label="系统数量" width="100" align="center">
            <template #default="{ row }">{{ row.systemQty }} {{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="实盘数量" width="100" align="center">
            <template #default="{ row }">{{ row.actualQty }} {{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="差异" width="130" align="center">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="toNumber(row.actualQty) === toNumber(row.systemQty) ? 'success' : 'danger'"
              >
                <template v-if="toNumber(row.actualQty) === toNumber(row.systemQty)">一致</template>
                <template v-else>
                  {{ toNumber(row.actualQty) > toNumber(row.systemQty) ? '盘盈' : '盘亏' }}
                  {{ Math.abs(toNumber(row.actualQty) - toNumber(row.systemQty)) }} {{ row.unit }}
                </template>
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <div class="record-meta">
          <span class="muted">开始于 {{ formatDateTime(s.startedAt) }}</span>
          <span v-if="diffCount(s)" class="muted">数量净变动 {{ deltaOf(s) > 0 ? '+' : '' }}{{ deltaOf(s) }}</span>
          <el-button size="small" type="danger" text @click="remove(s)">删除留档</el-button>
        </div>
      </el-collapse-item>
    </el-collapse>

    <template #footer>
      <el-button type="primary" @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.record-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.record-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  font-size: 13px;
}
</style>
