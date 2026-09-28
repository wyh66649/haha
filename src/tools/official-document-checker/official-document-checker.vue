<script setup lang="ts">
import {
  type DocIssue,
  SAMPLE_DOCUMENTS,
  checkOfficialDocument,
  toReportText,
} from './official-document-checker.service';

const documentText = useStorage<string>('campus-toolbox:doc-text', '');
const activeSample = ref(0);
const filterLevel = ref<'all' | 'error' | 'warning' | 'info'>('all');

const result = computed(() => checkOfficialDocument({ text: documentText.value }));

const visibleIssues = computed<DocIssue[]>(() => (filterLevel.value === 'all'
  ? result.value.issues
  : result.value.issues.filter(issue => issue.level === filterLevel.value)));

const reportText = computed(() => toReportText({ result: result.value }));

const scoreColor = computed(() => {
  if (result.value.score >= 90) {
    return '#18a058';
  }
  if (result.value.score >= 70) {
    return '#f0a020';
  }
  return '#d03050';
});

const levelLabel: Record<DocIssue['level'], string> = {
  error: '错误',
  warning: '警告',
  info: '提示',
};

function loadSample({ index }: { index: number }) {
  activeSample.value = index;
  documentText.value = SAMPLE_DOCUMENTS[index].text;
}

function clearText() {
  documentText.value = '';
}
</script>

<template>
  <div style="flex: 0 0 100%">
    <div style="margin: 0 auto; max-width: 1100px">
      <c-card title="① 粘贴公文正文" mb-3>
        <c-input-text
          v-model:value="documentText"
          placeholder="把公文全文粘贴到这里，边打字边出检查结果（标题、主送机关、正文、附件说明、署名、成文日期都贴上）"
          multiline
          :rows="16"
          autosize
        />
        <div mt-3 flex flex-wrap items-center gap-2>
          <span class="hint">示例：</span>
          <c-button
            v-for="(sample, index) in SAMPLE_DOCUMENTS"
            :key="sample.label"
            :type="activeSample === index ? 'primary' : 'default'"
            size="small"
            @click="loadSample({ index })"
          >
            {{ sample.label }}
          </c-button>
          <c-button size="small" type="warning" @click="clearText">
            清空
          </c-button>
        </div>
      </c-card>

      <c-card title="② 检查结果" mb-3>
        <div flex flex-wrap items-center gap-5>
          <div class="score" :style="{ color: scoreColor, borderColor: scoreColor }">
            <div class="score-value">
              {{ result.score }}
            </div>
            <div class="score-label">
              格式规范度 / 100
            </div>
          </div>
          <div class="metrics">
            <div class="metric error">
              <div class="metric-value">
                {{ result.counts.error }}
              </div>
              <div class="metric-label">
                错误
              </div>
            </div>
            <div class="metric warning">
              <div class="metric-value">
                {{ result.counts.warning }}
              </div>
              <div class="metric-label">
                警告
              </div>
            </div>
            <div class="metric info">
              <div class="metric-value">
                {{ result.counts.info }}
              </div>
              <div class="metric-label">
                提示
              </div>
            </div>
          </div>
        </div>

        <div class="stats" mt-5>
          <span>字数（不计空白）<b>{{ result.stats.characters }}</b></span>
          <span>段落 <b>{{ result.stats.paragraphs }}</b></span>
          <span>一级序号 <b>{{ result.stats.level1Count }}</b></span>
          <span>二级序号 <b>{{ result.stats.level2Count }}</b></span>
          <span>三级序号 <b>{{ result.stats.level3Count }}</b></span>
          <span>附件说明 <b>{{ result.stats.hasAttachment ? '有' : '无' }}</b></span>
          <span>发文机关署名 <b>{{ result.stats.hasSignature ? '有' : '无' }}</b></span>
          <span>成文日期 <b>{{ result.stats.hasDate ? '有' : '无' }}</b></span>
        </div>
        <div class="hint" mt-2>
          识别文种：{{ result.stats.docType }}
        </div>
      </c-card>

      <c-card title="③ 问题清单" mb-3>
        <div flex flex-wrap gap-2>
          <c-button :type="filterLevel === 'all' ? 'primary' : 'default'" size="small" @click="filterLevel = 'all'">
            全部 {{ result.issues.length }}
          </c-button>
          <c-button :type="filterLevel === 'error' ? 'primary' : 'default'" size="small" @click="filterLevel = 'error'">
            错误 {{ result.counts.error }}
          </c-button>
          <c-button :type="filterLevel === 'warning' ? 'primary' : 'default'" size="small" @click="filterLevel = 'warning'">
            警告 {{ result.counts.warning }}
          </c-button>
          <c-button :type="filterLevel === 'info' ? 'primary' : 'default'" size="small" @click="filterLevel = 'info'">
            提示 {{ result.counts.info }}
          </c-button>
        </div>

        <div mt-4>
          <div v-for="(issue, index) in visibleIssues" :key="index" class="issue" :class="issue.level">
            <div class="issue-head">
              <span class="tag">{{ levelLabel[issue.level] }}</span>
              <span class="issue-title">{{ issue.title }}</span>
              <span v-if="issue.line > 0" class="issue-line">第 {{ issue.line }} 行</span>
            </div>
            <div class="issue-detail">
              {{ issue.detail }}
            </div>
            <div v-if="issue.excerpt" class="issue-excerpt">
              {{ issue.excerpt }}
            </div>
            <div class="issue-suggestion">
              建议：{{ issue.suggestion }}
            </div>
          </div>

          <div v-if="visibleIssues.length === 0" class="clean">
            这个级别下没有发现问题。
          </div>
        </div>
      </c-card>

      <c-card title="④ 检查报告" mb-3>
        <textarea-copyable :value="reportText" language="markdown" />
      </c-card>

      <c-card>
        <div class="hint">
          说明：全部校验在浏览器本地完成，公文内容不会上传到任何服务器，断网可用。
          规则依据《党政机关公文格式》(GB/T 9704-2012)、《标点符号用法》(GB/T 15834) 与
          《出版物上数字用法》(GB/T 15835)，以「宁可漏报、不可误报」为原则：
          URL、邮箱、小数、英文缩写（如 GPL-3.0）不会被当成半角标点问题。
          各校、各单位可能有更细的内部规范，最终以本单位要求为准。
        </div>
      </c-card>
    </div>
  </div>
</template>

<style lang="less" scoped>
.hint {
  font-size: 12px;
  line-height: 1.7;
  color: #6b7280;
}

.score {
  width: 132px;
  height: 132px;
  border: 2px solid;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.score-value {
  font-size: 38px;
  font-weight: 700;
  line-height: 1.2;
}

.score-label {
  font-size: 11px;
  color: #6b7280;
}

.metrics {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.metric {
  min-width: 92px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  text-align: center;

  &.error {
    border-color: #e88080;
    background: #e8808012;
  }

  &.warning {
    border-color: #f0c060;
    background: #f0c06018;
  }

  &.info {
    border-color: #d0d5dd;
  }

  &-value {
    font-size: 22px;
    font-weight: 600;
  }

  &-label {
    font-size: 12px;
    color: #6b7280;
    margin-top: 4px;
  }
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: 12px;
  color: #6b7280;

  b {
    color: #333;
    margin-left: 4px;
  }
}

.issue {
  padding: 12px 14px;
  border-radius: 4px;
  margin-bottom: 10px;
  border-left: 3px solid #d0d5dd;
  background: #fafafa;
  font-size: 13px;
  line-height: 1.75;

  &.error {
    border-left-color: #d03050;
    background: #d0305008;

    .tag {
      background: #d03050;
    }
  }

  &.warning {
    border-left-color: #f0a020;
    background: #f0a02008;

    .tag {
      background: #f0a020;
    }
  }

  &.info {
    border-left-color: #909399;
    background: #90939908;

    .tag {
      background: #909399;
    }
  }
}

.issue-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag {
  color: #fff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
}

.issue-title {
  font-weight: 600;
}

.issue-line {
  font-size: 11px;
  color: #909399;
}

.issue-detail {
  color: #4b5563;
}

.issue-excerpt {
  margin-top: 4px;
  padding: 4px 8px;
  background: #ffffff;
  border: 1px dashed #e5e7eb;
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
  color: #6b7280;
  word-break: break-all;
}

.issue-suggestion {
  color: #18a058;
}

.clean {
  padding: 18px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
</style>
