<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { useStocktakeStore } from '../stores/useStocktakeStore'
import { formatDateTime } from '../utils/format'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const store = useStocktakeStore()

async function remove(id: string, createdAt: number) {
  await ElMessageBox.confirm(`确定删除 ${formatDateTime(createdAt)} 的盘点记录吗？`, '提示', {
    type: 'warning',
  })
  store.removeRecord(id)
  ElMessage.success('已删除')
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="盘点记录"
    width="760px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-table v-if="store.sortedRecords.value.length" :data="store.sortedRecords.value" border>
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="record-detail">
            <el-table v-if="row.items.length" :data="row.items" size="small" border>
              <el-table-column prop="name" label="材料" min-width="120" />
              <el-table-column label="账面数量" width="110" align="center">
                <template #default="{ row: item }">{{ item.systemQty }} {{ item.unit }}</template>
              </el-table-column>
              <el-table-column label="实盘数量" width="110" align="center">
                <template #default="{ row: item }">{{ item.actualQty }} {{ item.unit }}</template>
              </el-table-column>
              <el-table-column label="差异" width="110" align="center">
                <template #default="{ row: item }">
                  <span :class="item.diff > 0 ? 'diff-plus' : 'diff-minus'">
                    {{ item.diff > 0 ? '+' : '' }}{{ item.diff }} {{ item.unit }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
            <el-tag v-else type="success" size="small">本次盘点全部一致，无差异</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="盘点时间" width="160">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="盘点种数" width="100" align="center">
        <template #default="{ row }">{{ row.totalCount }}</template>
      </el-table-column>
      <el-table-column label="差异" width="120" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.diffCount" type="danger" size="small">{{ row.diffCount }} 项差异</el-tag>
          <el-tag v-else type="success" size="small">无差异</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="盘盈 / 盘亏" min-width="110" align="center">
        <template #default="{ row }">
          <span class="diff-plus">{{ row.items.filter((i: { diff: number }) => i.diff > 0).length }}</span>
          /
          <span class="diff-minus">{{ row.items.filter((i: { diff: number }) => i.diff < 0).length }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" align="center">
        <template #default="{ row }">
          <el-button size="small" type="danger" text @click="remove(row.id, row.createdAt)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else description="暂无盘点记录" :image-size="80" />
  </el-dialog>
</template>

<style scoped>
.record-detail {
  padding: 8px 16px;
}
.diff-plus {
  color: var(--success);
  font-weight: 600;
}
.diff-minus {
  color: var(--danger);
  font-weight: 600;
}
</style>
