<script setup lang="ts">
import _ from 'lodash';
import {
  DEFAULT_PERIODS,
  type ClassSlot,
  type GridCell,
  WEEK_DAY_LABELS,
  analyzeTimetable,
  buildWeekGrid,
  createSlotId,
  findConflictWeeks,
  formatDuration,
  formatPeriods,
  formatWeeks,
  parsePeriods,
  toTimetableText,
} from './timetable-planner.service';

const SAMPLE_SLOTS: ClassSlot[] = [
  { id: createSlotId(), name: '高等数学', day: 1, startPeriod: 1, endPeriod: 2, weeks: '1-16', location: '教三-201' },
  { id: createSlotId(), name: '大学英语', day: 1, startPeriod: 3, endPeriod: 4, weeks: '1-16', location: '外语楼-305' },
  { id: createSlotId(), name: '数据结构', day: 2, startPeriod: 3, endPeriod: 4, weeks: '1-16', location: '计算机楼-402' },
  { id: createSlotId(), name: '计算机组成原理', day: 2, startPeriod: 3, endPeriod: 4, weeks: '1-16', location: '计算机楼-305' },
  { id: createSlotId(), name: '高等数学', day: 3, startPeriod: 1, endPeriod: 2, weeks: '1-16', location: '教三-201' },
  { id: createSlotId(), name: '大学物理', day: 4, startPeriod: 5, endPeriod: 6, weeks: '1-16', location: '理教-108' },
  { id: createSlotId(), name: '线性代数', day: 5, startPeriod: 1, endPeriod: 2, weeks: '1-16', location: '教二-105' },
  { id: createSlotId(), name: '体育（篮球）', day: 3, startPeriod: 7, endPeriod: 8, weeks: '1-16', location: '体育馆' },
  { id: createSlotId(), name: '形势与政策', day: 5, startPeriod: 9, endPeriod: 10, weeks: '3-5,9-11', location: '教一-301' },
];

const slots = useStorage<ClassSlot[]>('campus-toolbox:timetable-slots', _.cloneDeep(SAMPLE_SLOTS));
const periodsText = useStorage<string>(
  'campus-toolbox:timetable-periods',
  formatPeriods({ periods: DEFAULT_PERIODS }),
);
const maxWeek = useStorage<number>('campus-toolbox:timetable-max-week', 16);
const selectedWeek = useStorage<number>('campus-toolbox:timetable-week', 0);
const minGapMinutes = useStorage<number>('campus-toolbox:timetable-min-gap', 60);
const showPeriods = ref(false);

const periods = computed(() => parsePeriods({ text: periodsText.value }));

const analysis = computed(() => analyzeTimetable({
  slots: slots.value,
  periods: periods.value,
  week: selectedWeek.value,
  minGapMinutes: minGapMinutes.value,
  maxWeek: maxWeek.value,
}));

const conflictSlotIds = computed(() => analysis.value.conflicts.flatMap(conflict => [conflict.a.id, conflict.b.id]));

const grid = computed(() => buildWeekGrid({
  slots: slots.value,
  periods: periods.value,
  week: selectedWeek.value,
  conflictSlotIds: conflictSlotIds.value,
}));

const conflictWeeks = computed(() => findConflictWeeks({ conflicts: analyzeTimetable({
  slots: slots.value,
  periods: periods.value,
  maxWeek: maxWeek.value,
}).conflicts }));

const weekOptions = computed(() => [
  { label: '全部周次（按最大周次统计）', value: 0 },
  ...Array.from({ length: Math.max(1, maxWeek.value) }, (_, index) => ({
    label: `第 ${index + 1} 周`,
    value: index + 1,
  })),
]);

const dayOptions = WEEK_DAY_LABELS.map((label, index) => ({ label, value: index + 1 }));

const periodOptions = computed(() => periods.value.map(period => ({
  label: `${period.index} 节`,
  value: period.index,
})));

const maxPeriod = computed(() => (periods.value.length > 0 ? Math.max(...periods.value.map(period => period.index)) : 0));

const exportText = computed(() => toTimetableText({ slots: slots.value, periods: periods.value }));

const loadRate = computed(() => {
  const capacity = maxPeriod.value * 5;
  if (capacity === 0) {
    return 0;
  }
  const used = analysis.value.dayLoads
    .filter(day => day.day <= 5)
    .reduce((sum, day) => sum + day.periods, 0);
  return Math.min(100, Math.round((used / capacity) * 100));
});

function cellClass(cell: GridCell) {
  return [
    `pos-${cell.position}`,
    cell.position === 'none' ? 'empty' : 'has-course',
    { conflict: cell.conflicted },
  ];
}

function addSlot() {  slots.value.push({
    id: createSlotId(),
    name: '',
    day: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: `1-${maxWeek.value}`,
    location: '',
  });
}

function removeSlot({ id }: { id: string }) {
  slots.value = slots.value.filter(slot => slot.id !== id);
}

function loadSample() {
  slots.value = _.cloneDeep(SAMPLE_SLOTS);
}

function clearAll() {
  slots.value = [];
}

function resetPeriods() {
  periodsText.value = formatPeriods({ periods: DEFAULT_PERIODS });
}
</script>

<template>
  <div style="flex: 0 0 100%">
    <div style="margin: 0 auto; max-width: 1100px">
      <c-alert v-if="analysis.conflicts.length > 0" type="warning" title="检测到排课冲突" mb-3>
        <div>
          当前有 {{ analysis.conflicts.length }} 组课程时间重叠，需要联系教务或任课老师调整。冲突周次：
          {{ formatWeeks({ weeks: conflictWeeks }) }}
        </div>
      </c-alert>

      <c-card title="① 基本设置" mb-3>
        <div flex flex-wrap items-end gap-4>
          <div style="min-width: 170px">
            <div class="field-label">
              学期总周数
            </div>
            <input v-model.number="maxWeek" class="cell" type="number" min="1" max="30" >
          </div>
          <div style="min-width: 210px">
            <div class="field-label">
              查看周次
            </div>
            <c-select v-model:value="selectedWeek" :options="weekOptions" />
          </div>
          <div style="min-width: 170px">
            <div class="field-label">
              空档阈值（分钟）
            </div>
            <input v-model.number="minGapMinutes" class="cell" type="number" min="15" step="15" >
          </div>
          <c-button @click="showPeriods = !showPeriods">
            {{ showPeriods ? '收起作息时间表' : '编辑作息时间表' }}
          </c-button>
        </div>

        <div v-if="showPeriods" mt-4>
          <c-input-text
            v-model:value="periodsText"
            label="每行一节课的「开始-结束」时间，改完立即生效（不同学校作息不同，按教务处公布的填）"
            placeholder="08:00-08:45"
            multiline
            :rows="8"
            monospace
          />
          <div mt-3>
            <c-button size="small" @click="resetPeriods">
              恢复默认作息
            </c-button>
          </div>
        </div>
      </c-card>

      <c-card title="② 课程录入" mb-3>
        <div class="table">
          <div class="row head">
            <span>课程名称</span>
            <span>星期</span>
            <span>起始节</span>
            <span>结束节</span>
            <span>周次</span>
            <span>地点</span>
            <span />
          </div>

          <div v-for="item in slots" :key="item.id" class="row" :class="{ conflict: conflictSlotIds.includes(item.id) }">
            <input v-model="item.name" class="cell" placeholder="高等数学" >
            <select v-model.number="item.day" class="cell">
              <option v-for="option in dayOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <select v-model.number="item.startPeriod" class="cell">
              <option v-for="option in periodOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <select v-model.number="item.endPeriod" class="cell">
              <option v-for="option in periodOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <input v-model="item.weeks" class="cell" placeholder="1-16 / 1-8,10-16 / 1-16单" >
            <input v-model="item.location" class="cell" placeholder="教三-201" >
            <c-button variant="text" type="error" size="small" @click="removeSlot({ id: item.id })">
              删除
            </c-button>
          </div>

          <div v-if="slots.length === 0" class="empty">
            还没有课程，点「添加课程」开始；周次支持 1-16、1-8,10-16、1-16单（单周）、1-16双 这些写法。
          </div>
        </div>

        <div mt-4 flex flex-wrap gap-2>
          <c-button type="primary" @click="addSlot">
            添加课程
          </c-button>
          <c-button @click="loadSample">
            载入示例
          </c-button>
          <c-button type="warning" @click="clearAll">
            清空
          </c-button>
        </div>
      </c-card>

      <c-card title="③ 周视图" mb-3>
        <div class="grid-wrap">
          <div class="grid-head">
            <div class="grid-corner">
              节次
            </div>
            <div v-for="(label, index) in WEEK_DAY_LABELS" :key="label" class="grid-day">
              {{ label }}
            </div>
          </div>

          <div v-for="(period, periodIndex) in periods" :key="period.index" class="grid-row">
            <div class="grid-period">
              <div class="period-index">
                {{ period.index }}
              </div>
              <div class="period-time">
                {{ period.start }}
              </div>
            </div>

            <template v-for="(dayCells, dayIndex) in grid" :key="`${periodIndex}-${dayIndex}`">
              <div
                class="grid-cell"
                :class="cellClass(dayCells[periodIndex])"
              >
                <template v-if="dayCells[periodIndex].position === 'start' || dayCells[periodIndex].position === 'single'">
                  <div class="course-name">
                    {{ dayCells[periodIndex].slot?.name || '未命名' }}
                  </div>
                  <div class="course-meta">
                    {{ dayCells[periodIndex].slot?.location }}
                  </div>
                  <div v-if="dayCells[periodIndex].stackedCount > 1" class="course-warn">
                    叠了 {{ dayCells[periodIndex].stackedCount }} 门
                  </div>
                </template>
                <div v-else-if="dayCells[periodIndex].position === 'middle' || dayCells[periodIndex].position === 'end'" class="continued">
                  {{ dayCells[periodIndex].position === 'end' ? '…' : '' }}
                </div>
              </div>
            </template>
          </div>
        </div>
        <div class="hint" mt-3>
          红色格子表示该时段多门课叠在一起。默认只显示每格最靠前的一门，完整冲突清单见下方。
        </div>
      </c-card>

      <c-card title="④ 分析结果" mb-3>
        <div class="metrics">
          <div class="metric">
            <div class="metric-value">{{ analysis.totalPeriods }}</div>
            <div class="metric-label">每周课时（节）</div>
          </div>
          <div class="metric">
            <div class="metric-value">{{ formatDuration(analysis.totalMinutes) }}</div>
            <div class="metric-label">每周上课时长</div>
          </div>
          <div class="metric">
            <div class="metric-value">{{ analysis.courseCount }}</div>
            <div class="metric-label">课程门数</div>
          </div>
          <div class="metric" :class="{ danger: analysis.conflicts.length > 0 }">
            <div class="metric-value">{{ analysis.conflicts.length }}</div>
            <div class="metric-label">冲突组数</div>
          </div>
          <div class="metric" :class="{ danger: loadRate >= 90 }">
            <div class="metric-value">{{ loadRate }}%</div>
            <div class="metric-label">工作日晚满课率</div>
          </div>
        </div>

        <div mt-5 class="hint-title">
          每天负荷
        </div>
        <div class="bars">
          <div v-for="day in analysis.dayLoads" :key="day.day" class="bar-item">
            <div class="bar-track">
              <div class="bar-fill" :style="{ height: `${maxPeriod > 0 ? (day.periods / maxPeriod) * 100 : 0}%` }" />
            </div>
            <div class="bar-label">
              {{ WEEK_DAY_LABELS[day.day - 1] }}
            </div>
            <div class="bar-value">
              {{ day.periods }} 节
            </div>
          </div>
        </div>
        <div v-if="analysis.freeDays.length > 0" class="hint" mt-3>
          完全没课的{{ analysis.freeDays.map(day => WEEK_DAY_LABELS[day - 1]).join('、') }}
          —— {{ selectedWeek > 0 ? `第 ${selectedWeek} 周` : '本学期' }}可以整块用来实习、备赛或自习。
        </div>

        <div v-if="analysis.conflicts.length > 0" mt-6>
          <div class="hint-title">
            冲突明细
          </div>
          <div v-for="(conflict, index) in analysis.conflicts" :key="index" class="conflict-row">
            <div class="conflict-title">
              {{ WEEK_DAY_LABELS[conflict.a.day - 1] }} 第 {{ conflict.overlapPeriods[0] }}-{{ conflict.overlapPeriods[1] }} 节
            </div>
            <div class="conflict-body">
              《{{ conflict.a.name }}》（{{ conflict.a.location || '地点未填' }}）
              ×
              《{{ conflict.b.name }}》（{{ conflict.b.location || '地点未填' }}）
            </div>
            <div class="conflict-weeks">
              重叠周次：{{ formatWeeks({ weeks: conflict.weeks }) }}
            </div>
          </div>
        </div>

        <div mt-6>
          <div class="hint-title">
            空档明细（{{ formatDuration(analysis.usableFreeMinutes) }} 适合连续安排事情）
          </div>
          <div class="table" mt-2>
            <div class="row free head">
              <span>星期</span>
              <span>时间段</span>
              <span>时长</span>
              <span>建议</span>
            </div>
            <div v-for="(free, index) in analysis.freeSlots" :key="index" class="row free">
              <span>{{ WEEK_DAY_LABELS[free.day - 1] }}</span>
              <span>{{ free.start }} - {{ free.end }}</span>
              <span>{{ formatDuration(free.minutes) }}</span>
              <span>{{ free.usable ? '可安排自习 / 兼职 / 社团' : '零碎，建议休息' }}</span>
            </div>
            <div v-if="analysis.freeSlots.length === 0" class="empty">
              没有空档，课表全满。
            </div>
          </div>
        </div>
      </c-card>

      <c-card title="⑤ 导出课表" mb-3>
        <textarea-copyable :value="exportText" language="markdown" />
      </c-card>

      <c-card>
        <div class="hint">
          说明：课表数据只保存在本机浏览器（localStorage），不上传服务器，断网也能用。
          周次表达式支持「1-16」「1-8,10-16」「1-16单」「1-16双」「全部」；单双周和部分周次开课的课程不会再被误判成冲突。
        </div>
      </c-card>
    </div>
  </div>
</template>

<style lang="less" scoped>
.table {
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.row {
  display: grid;
  grid-template-columns: 1fr 96px 84px 84px 170px 140px 60px;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid #eef0f3;
  font-size: 14px;

  &:last-child {
    border-bottom: none;
  }

  &.head {
    background: #f7f8fa;
    font-size: 12px;
    color: #6b7280;
  }

  &.conflict {
    background: #fff7f6;
  }

  &.free {
    grid-template-columns: 90px 160px 120px 1fr;
    font-size: 13px;
  }
}

.cell {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  outline: none;
  color: inherit;

  &:focus {
    border-color: #18a058;
  }
}

.empty {
  padding: 18px 10px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}

.hint {
  font-size: 12px;
  line-height: 1.7;
  color: #6b7280;
}

.hint-title {
  font-size: 13px;
  font-weight: 500;
}

.field-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 5px;
}

.metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.metric {
  flex: 1 1 130px;
  min-width: 130px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  text-align: center;

  &.danger {
    border-color: #e88080;
    background: #e8808012;
  }

  &-value {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.3;
  }

  &-label {
    font-size: 12px;
    color: #6b7280;
    margin-top: 4px;
  }
}

.bars {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  align-items: flex-end;
}

.bar-item {
  flex: 1;
  text-align: center;
}

.bar-track {
  height: 90px;
  display: flex;
  align-items: flex-end;
  background: #f7f8fa;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  width: 100%;
  background: #18a058;
  border-radius: 4px 4px 0 0;
  min-height: 2px;
  transition: height 0.25s ease;
}

.bar-label {
  font-size: 12px;
  margin-top: 6px;
  color: #6b7280;
}

.bar-value {
  font-size: 12px;
  color: #6b7280;
}

.conflict-row {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid #e88080;
  border-radius: 4px;
  background: #e8808012;
  font-size: 13px;
  line-height: 1.7;
}

.conflict-title {
  font-weight: 600;
}

.conflict-weeks {
  color: #6b7280;
  font-size: 12px;
}

.grid-wrap {
  overflow-x: auto;
}

.grid-head,
.grid-row {
  display: grid;
  grid-template-columns: 64px repeat(7, minmax(96px, 1fr));
  gap: 4px;
  min-width: 760px;
}

.grid-head {
  margin-bottom: 4px;
}

.grid-corner,
.grid-day {
  font-size: 12px;
  color: #6b7280;
  text-align: center;
  padding: 4px 0;
}

.grid-row {
  align-items: stretch;
  margin-bottom: 4px;
  grid-auto-rows: 34px;
}

.grid-period {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #6b7280;
  background: #f7f8fa;
  border-radius: 4px;
}

.period-index {
  font-weight: 600;
}

.grid-cell {
  border-radius: 4px;
  border: 1px dashed #e5e7eb;
  padding: 4px 6px;
  font-size: 11px;
  overflow: hidden;

  &.has-course {
    border-style: solid;
    border-color: #18a058;
    background: #18a05814;
  }

  &.conflict {
    border-color: #e88080;
    background: #e8808020;
  }

  &.pos-start {
    border-radius: 4px 4px 0 0;
    border-bottom-style: dotted;
  }

  &.pos-middle, &.pos-end {
    border-radius: 0;
    border-top: none;
    border-bottom-style: dotted;
    padding: 0;
  }

  &.pos-end {
    border-radius: 0 0 4px 4px;
    border-bottom-style: solid;
  }
}

.continued {
  height: 100%;
  min-height: 24px;
}

.course-name {
  font-weight: 600;
  line-height: 1.3;
}

.course-meta {
  color: #6b7280;
}

.course-warn {
  color: #d03050;
}
</style>
