<script setup lang="ts">
import _ from 'lodash';
import {
  DEFAULT_SCALES,
  type Course,
  type GpaScale,
  computeGpa,
  createCourseId,
  getScaleMaxPoint,
  parseBulkInput,
  pointToPercentLabel,
  solveTargetGpa,
  toCsv,
  toMarkdown,
} from './gpa-calculator.service';

const SAMPLE_COURSES: Course[] = [
  { id: createCourseId(), name: '高等数学（上）', credits: 5, rawScore: '88', excluded: false },
  { id: createCourseId(), name: '大学英语', credits: 3, rawScore: 'A-', excluded: false },
  { id: createCourseId(), name: '线性代数', credits: 3.5, rawScore: '76', excluded: false },
  { id: createCourseId(), name: '数据结构', credits: 4, rawScore: '91', excluded: false },
  { id: createCourseId(), name: '大学物理', credits: 3, rawScore: '83', excluded: false },
  { id: createCourseId(), name: '体育', credits: 1, rawScore: '合格', excluded: false },
];

const CUSTOM_SCALE_ID = 'custom';

/** 数据存在浏览器本地，刷新页面 / 断网都不会丢 */
const courses = useStorage<Course[]>('campus-toolbox:gpa-courses', _.cloneDeep(SAMPLE_COURSES));
const scaleId = useStorage<string>('campus-toolbox:gpa-scale', DEFAULT_SCALES[0].id);
const customSegmentsText = useStorage<string>(
  'campus-toolbox:gpa-custom-segments',
  '90 4.0\n85 3.7\n80 3.3\n75 3.0\n70 2.7\n65 2.3\n60 2.0\n0 0',
);
const customLabel = useStorage<string>('campus-toolbox:gpa-custom-label', '自定义分段');

const bulkText = ref('');
const showBulk = ref(false);
const bulkWarnings = ref<string[]>([]);
const exportFormat = ref<'markdown' | 'csv'>('markdown');

const targetGpa = useStorage<number | null>('campus-toolbox:gpa-target', 3.5);
const remainingCredits = useStorage<number | null>('campus-toolbox:gpa-remaining-credits', 20);

function parseCustomSegments({ text }: { text: string }) {
  const segments = (text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '')
    .map((line) => {
      const [min, point] = line.split(/[,，\s]+/).map(Number.parseFloat);
      return { min, point };
    })
    .filter(segment => !Number.isNaN(segment.min) && !Number.isNaN(segment.point))
    .sort((a, b) => b.min - a.min);

  return segments.length > 0 ? segments : [{ min: 0, point: 0 }];
}

const scale = computed<GpaScale>(() => {
  if (scaleId.value === CUSTOM_SCALE_ID) {
    return {
      id: CUSTOM_SCALE_ID,
      label: customLabel.value || '自定义分段',
      kind: 'segments',
      description: '按「分数下限 绩点」逐行填写的自定义规则，用来对齐你本校教务处的算法。',
      segments: parseCustomSegments({ text: customSegmentsText.value }),
    };
  }

  return DEFAULT_SCALES.find(item => item.id === scaleId.value) ?? DEFAULT_SCALES[0];
});

const scaleOptions = computed(() => [
  ...DEFAULT_SCALES.map(item => ({ label: item.label, value: item.id })),
  { label: `${customLabel.value || '自定义分段'}（可编辑）`, value: CUSTOM_SCALE_ID },
]);

const result = computed(() => computeGpa({ courses: courses.value, scale: scale.value }));

const comparison = computed(() => DEFAULT_SCALES.map(item => ({
  label: item.label,
  gpa: computeGpa({ courses: courses.value, scale: item }).gpa,
  isCurrent: item.id === scale.value.id,
})));

const target = computed(() => solveTargetGpa({
  currentPointSum: result.value.pointSum,
  currentCredits: result.value.effectiveCredits,
  targetGpa: targetGpa.value ?? 0,
  newCredits: remainingCredits.value ?? 0,
  scaleMaxPoint: getScaleMaxPoint(scale.value),
}));

const targetHint = computed(() => {
  if (!target.value) {
    return '';
  }
  if (!target.value.feasible) {
    return `即使剩下 ${remainingCredits.value} 学分全部拿满绩（${getScaleMaxPoint(scale.value)}），也达不到 ${targetGpa.value}。`;
  }
  return `剩下 ${remainingCredits.value} 学分平均绩点需 ≥ ${target.value.requiredPoint}，约合每门课 ${pointToPercentLabel(target.value.requiredPoint, scale.value)}。`;
});

const exportText = computed(() => (exportFormat.value === 'markdown'
  ? toMarkdown({ result: result.value, scale: scale.value })
  : toCsv({ result: result.value, scale: scale.value })));

const hasInvalid = computed(() => result.value.invalidCount > 0);

function addCourse() {
  courses.value.push({ id: createCourseId(), name: '', credits: 3, rawScore: '', excluded: false });
}

function removeCourse({ id }: { id: string }) {
  courses.value = courses.value.filter(course => course.id !== id);
}

function loadSample() {
  courses.value = _.cloneDeep(SAMPLE_COURSES);
}

function clearAll() {
  courses.value = [];
}

function applyBulkImport() {
  const { courses: parsed, warnings } = parseBulkInput({ text: bulkText.value });
  bulkWarnings.value = warnings;
  if (parsed.length > 0) {
    courses.value = [...courses.value.filter(course => course.name !== '' || course.rawScore !== ''), ...parsed];
    bulkText.value = '';
    showBulk.value = false;
  }
}
</script>

<template>
  <div style="flex: 0 0 100%">
    <div style="margin: 0 auto; max-width: 900px">
      <c-card title="① 选择换算算法" mb-3>
        <div flex flex-wrap items-center gap-3>
          <c-select
            v-model:value="scaleId"
            :options="scaleOptions"
            style="min-width: 260px"
          />
          <c-input-text
            v-if="scaleId === CUSTOM_SCALE_ID"
            v-model:value="customLabel"
            placeholder="自定义算法名称"
            style="max-width: 220px"
          />
        </div>

        <div class="hint" mt-3>
          {{ scale.description }}
        </div>

        <div v-if="scaleId === CUSTOM_SCALE_ID" mt-3>
          <c-input-text
            v-model:value="customSegmentsText"
            label="分段规则（每行：分数下限 绩点）"
            placeholder="90 4.0"
            multiline
            :rows="6"
            monospace
          />
        </div>
      </c-card>

      <c-card title="② 录入成绩" mb-3>
        <div class="table">
          <div class="row head">
            <span>课程名称</span>
            <span>学分</span>
            <span>成绩</span>
            <span title="勾选后不计入统计（缓考 / 免修 / 二专等）">不计入</span>
            <span />
          </div>

          <div v-for="course in courses" :key="course.id" class="row">
            <input v-model="course.name" class="cell" placeholder="高等数学（上）" >
            <input v-model.number="course.credits" class="cell center" type="number" step="0.5" min="0" placeholder="学分" >
            <input v-model="course.rawScore" class="cell center" placeholder="88 / A- / 合格" >
            <label class="center">
              <input v-model="course.excluded" type="checkbox" >
            </label>
            <c-button variant="text" type="error" size="small" @click="removeCourse({ id: course.id })">
              删除
            </c-button>
          </div>

          <div v-if="courses.length === 0" class="empty">
            还没有课程，点「添加一行」或「粘贴导入」开始。
          </div>
        </div>

        <div mt-4 flex flex-wrap gap-2>
          <c-button type="primary" @click="addCourse">
            添加一行
          </c-button>
          <c-button @click="showBulk = !showBulk">
            {{ showBulk ? '收起粘贴导入' : '粘贴导入' }}
          </c-button>
          <c-button @click="loadSample">
            载入示例
          </c-button>
          <c-button type="warning" @click="clearAll">
            清空
          </c-button>
        </div>

        <div v-if="showBulk" mt-4>
          <c-input-text
            v-model:value="bulkText"
            label="每行一门课，支持「课程名,学分,成绩」，也支持「课程名 成绩 学分」"
            placeholder="高等数学,5,88&#10;大学英语 3 A-&#10;线性代数 3.5 76"
            multiline
            :rows="6"
            monospace
          />
          <div mt-3 flex items-center gap-3>
            <c-button type="primary" @click="applyBulkImport">
              导入
            </c-button>
            <span class="hint">成绩支持百分制数字，也支持 A+/A/A-/B+/… 或 优秀/良好/合格 等等级。</span>
          </div>
        </div>

        <c-alert v-if="bulkWarnings.length > 0" type="warning" title="有内容没能导入" mt-4>
          <div v-for="(warning, index) in bulkWarnings" :key="index">
            {{ warning }}
          </div>
        </c-alert>

        <c-alert v-if="hasInvalid" type="warning" mt-4>
          有 {{ result.invalidCount }} 条成绩没能识别，请检查是不是写成了「98分」「B加」这类格式。
        </c-alert>
      </c-card>

      <c-card title="③ 结果" mb-3>
        <div class="metrics">
          <div class="metric">
            <div class="metric-value">{{ result.gpa ?? '—' }}</div>
            <div class="metric-label">GPA（{{ scale.label }}）</div>
          </div>
          <div class="metric">
            <div class="metric-value">{{ result.weightedAverage ?? '—' }}</div>
            <div class="metric-label">加权平均分</div>
          </div>
          <div class="metric">
            <div class="metric-value">{{ result.arithmeticAverage ?? '—' }}</div>
            <div class="metric-label">算术平均分</div>
          </div>
          <div class="metric">
            <div class="metric-value">{{ result.effectiveCredits }}</div>
            <div class="metric-label">计入统计学分</div>
          </div>
          <div class="metric">
            <div class="metric-value">{{ result.failedCredits }}</div>
            <div class="metric-label">挂科学分</div>
          </div>
        </div>

        <div class="hint" mt-4>
          GPA = Σ(单科绩点 × 学分) ÷ Σ学分 = {{ result.pointSum }} ÷ {{ result.effectiveCredits }}
          <span v-if="result.invalidCount > 0">；{{ result.invalidCount }} 条无效成绩未计入</span>
        </div>

        <div mt-5 class="hint-title">
          换个算法会差多少？
        </div>
        <div class="compare">
          <div v-for="item in comparison" :key="item.label" class="compare-item" :class="{ current: item.isCurrent }">
            <div class="compare-value">{{ item.gpa ?? '—' }}</div>
            <div class="compare-label">{{ item.label }}</div>
          </div>
        </div>
        <div class="hint" mt-3>
          同一份成绩单在不同算法下 GPA 能差 0.3 以上，填申请表前建议先跟教务处确认本校用的是哪一套。
        </div>
      </c-card>

      <c-card title="④ 目标反推" mb-3>
        <div flex flex-wrap items-end gap-4>
          <div style="min-width: 150px">
            <div class="field-label">
              目标 GPA
            </div>
            <input v-model.number="targetGpa" class="cell" type="number" step="0.1" min="0" >
          </div>
          <div style="min-width: 150px">
            <div class="field-label">
              剩余学分
            </div>
            <input v-model.number="remainingCredits" class="cell" type="number" step="1" min="0" >
          </div>
        </div>
        <div v-if="targetHint" class="target-hint" mt-4>
          {{ targetHint }}
        </div>
      </c-card>

      <c-card title="⑤ 导出" mb-3>
        <div flex items-center gap-2>
          <c-button :type="exportFormat === 'markdown' ? 'primary' : 'default'" size="small" @click="exportFormat = 'markdown'">
            Markdown
          </c-button>
          <c-button :type="exportFormat === 'csv' ? 'primary' : 'default'" size="small" @click="exportFormat = 'csv'">
            CSV（Excel 可直接打开）
          </c-button>
        </div>
        <div mt-3>
          <textarea-copyable :value="exportText" :language="exportFormat === 'csv' ? 'txt' : 'markdown'" />
        </div>
      </c-card>

      <c-card>
        <div class="hint">
          说明：所有计算都在你的浏览器里完成，成绩数据只保存在本机 localStorage，不会上传到任何服务器；
          离线状态下也能正常使用。各校绩点规则差异较大，这里的算法是常见模板，最终请以本校教务处规定为准。
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
  grid-template-columns: 1fr 90px 130px 70px 70px;
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
    text-transform: none;
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

.center {
  text-align: center;
  justify-self: center;
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
  flex: 1 1 120px;
  min-width: 120px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  text-align: center;

  &-value {
    font-size: 22px;
    font-weight: 600;
    line-height: 1.3;
  }

  &-label {
    font-size: 12px;
    color: #6b7280;
    margin-top: 4px;
  }
}

.compare {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.compare-item {
  flex: 1 1 130px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  text-align: center;

  &.current {
    border-color: #18a058;
    background: #18a05814;
  }
}

.compare-value {
  font-size: 18px;
  font-weight: 600;
}

.compare-label {
  font-size: 12px;
  color: #6b7280;
  margin-top: 3px;
}

.target-hint {
  padding: 12px 14px;
  border-radius: 4px;
  background: #18a05814;
  border: 1px solid #18a05840;
  font-size: 14px;
  line-height: 1.7;
}
</style>
