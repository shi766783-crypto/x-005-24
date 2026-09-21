<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Material } from '../types'
import { MATERIAL_CATEGORIES } from '../types'
import { useMaterialStore } from '../stores/useMaterialStore'
import { useStocktakeStore } from '../stores/useStocktakeStore'
import MaterialFormDialog from '../components/MaterialFormDialog.vue'
import StocktakePanel from '../components/StocktakePanel.vue'
import StocktakeHistoryDialog from '../components/StocktakeHistoryDialog.vue'

const materialStore = useMaterialStore()
const stocktakeStore = useStocktakeStore()

const dialogVisible = ref(false)
const editingMaterial = ref<Material | null>(null)

const filterCategory = ref('')
const keyword = ref('')
const onlyLowStock = ref(false)

const historyVisible = ref(false)

const stocktaking = computed(() => stocktakeStore.activeSession.value !== null)

const filtered = computed(() =>
  materialStore.materials.value.filter((m) => {
    const matchCategory = !filterCategory.value || m.category === filterCategory.value
    const matchKeyword = !keyword.value || m.name.includes(keyword.value)
    const matchLowStock = !onlyLowStock.value || m.quantity < m.minStock
    return matchCategory && matchKeyword && matchLowStock
  }),
)

function openAdd() {
  editingMaterial.value = null
  dialogVisible.value = true
}
function openEdit(material: Material) {
  editingMaterial.value = material
  dialogVisible.value = true
}
async function remove(material: Material) {
  await ElMessageBox.confirm(`确定删除材料「${material.name}」吗？`, '提示', { type: 'warning' })
  materialStore.removeMaterial(material.id)
  ElMessage.success('已删除')
}

async function enterStocktake() {
  if (stocktaking.value) return
  if (!materialStore.materials.value.length) {
    ElMessage.warning('还没有材料，先添加材料后再盘点')
    return
  }
  try {
    await ElMessageBox.confirm(
      '盘点开始后会锁定当前系统数量作为对照，期间请逐项录入实际清点数量。',
      '开始盘点',
      { type: 'info', confirmButtonText: '开始盘点' },
    )
  } catch {
    return
  }
  stocktakeStore.startStocktake()
}

function onFinished() {
  historyVisible.value = true
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">材料库存</h2>
      <div class="header-actions">
        <el-badge
          :value="stocktakeStore.finishedSessions.value.length"
          :hidden="!stocktakeStore.finishedSessions.value.length"
          :max="99"
          type="info"
        >
          <el-button @click="historyVisible = true">
            <el-icon><Document /></el-icon>&nbsp;盘点记录
          </el-button>
        </el-badge>
        <el-button :type="stocktaking ? 'warning' : 'primary'" plain :disabled="stocktaking" @click="enterStocktake">
          <el-icon><Aim /></el-icon>&nbsp;{{ stocktaking ? '盘点进行中…' : '盘点模式' }}
        </el-button>
        <el-button type="primary" :disabled="stocktaking" @click="openAdd">
          <el-icon><Plus /></el-icon>&nbsp;添加材料
        </el-button>
      </div>
    </div>

    <!-- 盘点模式：逐项录入实盘数量，自动标差异，确认后一键修正 -->
    <StocktakePanel v-if="stocktaking" @finished="onFinished" />

    <template v-else>
      <section class="card" style="margin-bottom: 16px">
        <div class="section-head">
          <span class="section-title">库存预警面板</span>
          <el-tag v-if="materialStore.lowStockMaterials.value.length" type="warning">
            {{ materialStore.lowStockMaterials.value.length }} 种材料低于最低库存
          </el-tag>
          <el-tag v-else type="success">库存健康</el-tag>
        </div>
        <el-table v-if="materialStore.lowStockMaterials.value.length" :data="materialStore.lowStockMaterials.value" size="small" border>
          <el-table-column prop="name" label="材料" min-width="120" />
          <el-table-column prop="category" label="类别" width="100" />
          <el-table-column label="当前库存" width="110" align="center">
            <template #default="{ row }">
              <span class="gap-missing">{{ row.quantity }} {{ row.unit }}</span>
            </template>
          </el-table-column>
          <el-table-column label="最低预警值" width="110" align="center">
            <template #default="{ row }">{{ row.minStock }} {{ row.unit }}</template>
          </el-table-column>
          <el-table-column prop="location" label="存放位置" min-width="120" />
          <el-table-column label="建议" min-width="100">
            <template #default="{ row }">
              <el-tag type="danger" size="small">需补货 {{ row.minStock - row.quantity }} {{ row.unit }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无预警材料" :image-size="60" />
      </section>

      <div class="card filter-bar">
        <el-input v-model="keyword" placeholder="搜索材料名称" clearable style="width: 200px" />
        <el-select v-model="filterCategory" placeholder="全部类别" clearable style="width: 150px">
          <el-option v-for="c in MATERIAL_CATEGORIES" :key="c" :label="c" :value="c" />
        </el-select>
        <el-checkbox v-model="onlyLowStock">仅看预警</el-checkbox>
        <span class="muted">共 {{ materialStore.categoryCount.value }} 种材料</span>
      </div>

      <div class="card">
        <el-table :data="filtered" border>
          <el-table-column prop="name" label="名称" min-width="130" />
          <el-table-column prop="category" label="类别" width="100" />
          <el-table-column label="数量" width="110" align="center">
            <template #default="{ row }">
              <span :style="{ color: row.quantity < row.minStock ? 'var(--danger)' : 'inherit', fontWeight: row.quantity < row.minStock ? 600 : 400 }">
                {{ row.quantity }} {{ row.unit }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="最低预警值" width="110" align="center">
            <template #default="{ row }">{{ row.minStock }} {{ row.unit }}</template>
          </el-table-column>
          <el-table-column prop="location" label="存放位置" min-width="120" />
          <el-table-column label="操作" width="140" align="center">
            <template #default="{ row }">
              <el-button size="small" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" type="danger" text @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <MaterialFormDialog v-model="dialogVisible" :material="editingMaterial" />
    <StocktakeHistoryDialog v-model="historyVisible" />
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-title {
  font-weight: 600;
  font-size: 15px;
}
</style>
