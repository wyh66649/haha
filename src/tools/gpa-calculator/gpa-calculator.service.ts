/**
 * 学分绩点（GPA）/ 加权平均分换算核心逻辑。
 *
 * 设计要点：把「学校算法差异」这件事显式建模 —— 内置若干常见分段规则，
 * 同时允许用户自定义分段表，避免像其它在线工具那样把某一所学校的规则
 * 当成放之四海皆准的真理。
 */

export interface Course {
  id: string
  name: string
  credits: number | null
  rawScore: string
  /** 缓考 / 免修 / 通过不计入等情况：统计时排除 */
  excluded: boolean
}

export type GpaScaleKind = 'percentage' | 'segments' | 'linear'

export interface GpaScaleSegment {
  /** 分数下限（含） */
  min: number
  /** 该区间对应的绩点 */
  point: number
}

export interface GpaScale {
  id: string
  label: string
  kind: GpaScaleKind
  /** segments：从高分到低分排列 */
  segments?: GpaScaleSegment[]
  /** linear：绩点 = score * slope + intercept，再裁剪到 [floor, ceil] */
  slope?: number
  intercept?: number
  ceil?: number
  description: string
}

export interface ScoredCourse extends Course {
  percent: number | null
  /** 识别出的成绩类型 */
  kind: 'percent' | 'grade' | 'invalid' | 'empty'
  point: number | null
  /** 绩点 × 学分 */
  weightedPoint: number
  /** 百分制成绩 × 学分 */
  weightedScore: number
}

export interface GpaResult {
  rows: ScoredCourse[]
  /** 计入统计的有效学分 */
  effectiveCredits: number
  /** 所有课程学分（含被排除的） */
  totalCredits: number
  /** 加权平均分（百分制） */
  weightedAverage: number | null
  /** 算术平均分（百分制，仅供参考） */
  arithmeticAverage: number | null
  /** 按所选算法换算出的 GPA */
  gpa: number | null
  /** 挂科（换算后绩点为 0）学分 */
  failedCredits: number
  /** 绩点总和 / 学分总和（用于目标反推） */
  pointSum: number
  invalidCount: number
}

/** 常见等级制成绩 → 百分制中值映射（可自行在界面里覆盖） */
export const GRADE_TO_PERCENT: Record<string, number> = {
  'A+': 98,
  'A': 92,
  'A-': 88,
  'B+': 85,
  'B': 82,
  'B-': 78,
  'C+': 75,
  'C': 72,
  'C-': 68,
  'D+': 65,
  'D': 62,
  'F': 50,
  '优秀': 93,
  '良好': 83,
  '中等': 73,
  '合格': 68,
  '及格': 65,
  '不及格': 50,
  '通过': 70,
};

export const DEFAULT_SCALES: GpaScale[] = [
  {
    id: 'weighted-100',
    label: '加权百分制',
    kind: 'percentage',
    description: '平均学分绩 = Σ(成绩 × 学分) ÷ Σ学分，结果仍是百分制。多数高校的「加权平均分」用这个。',
  },
  {
    id: 'standard-4',
    label: '标准 4.0 分制（九段）',
    kind: 'segments',
    description: '最常见的 4.0 分制分段：90 以上 4.0，60 以下 0。',
    segments: [
      { min: 90, point: 4.0 },
      { min: 85, point: 3.7 },
      { min: 82, point: 3.3 },
      { min: 78, point: 3.0 },
      { min: 75, point: 2.7 },
      { min: 72, point: 2.3 },
      { min: 68, point: 2.0 },
      { min: 64, point: 1.5 },
      { min: 60, point: 1.0 },
      { min: 0, point: 0 },
    ],
  },
  {
    id: 'pku-4',
    label: '4.0 分制（五分一段）',
    kind: 'segments',
    description: '每 5 分一个档的 4.0 分制（北大等校常见）：90→4.0、85→3.7、80→3.3……',
    segments: [
      { min: 90, point: 4.0 },
      { min: 85, point: 3.7 },
      { min: 80, point: 3.3 },
      { min: 75, point: 3.0 },
      { min: 70, point: 2.7 },
      { min: 65, point: 2.3 },
      { min: 60, point: 2.0 },
      { min: 0, point: 0 },
    ],
  },
  {
    id: 'seg-4.5',
    label: '4.5 分制（分段）',
    kind: 'segments',
    description: '满分绩点 4.5 的分段算法，90 以上记 4.5。',
    segments: [
      { min: 90, point: 4.5 },
      { min: 85, point: 4.0 },
      { min: 80, point: 3.5 },
      { min: 75, point: 3.0 },
      { min: 70, point: 2.5 },
      { min: 65, point: 2.0 },
      { min: 60, point: 1.5 },
      { min: 0, point: 0 },
    ],
  },
  {
    id: 'linear-5',
    label: '5.0 分制（线性换算）',
    kind: 'linear',
    slope: 0.1,
    intercept: -5,
    ceil: 5,
    description: '绩点 = 成绩 ÷ 10 − 5（100 分记 5.0，60 分记 1.0），部分高校与出国成绩单用这种换算。',
  },
];

/** 把用户输入的成绩解析成百分制分数。支持 88、88.5、"B+"、"优秀"、"88分"。 */
export function parseScore(raw: string): { percent: number | null; kind: 'percent' | 'grade' | 'invalid' | 'empty' } {
  const text = (raw ?? '').trim();
  if (text === '') {
    return { percent: null, kind: 'empty' };
  }

  const numeric = text.replace(/[分％%]$/, '').trim();
  if (/^-?\d+(\.\d+)?$/.test(numeric)) {
    const value = Number.parseFloat(numeric);
    if (Number.isNaN(value) || value < 0 || value > 100 + 50) {
      return { percent: null, kind: 'invalid' };
    }
    return { percent: value, kind: 'percent' };
  }

  const key = text.toUpperCase().replace(/\s/g, '');
  if (key in GRADE_TO_PERCENT) {
    return { percent: GRADE_TO_PERCENT[key], kind: 'grade' };
  }

  // 兼容「B 加」「A减」这类写法
  const normalized = key.replace(/加/g, '+').replace(/减|-/g, '-');
  if (normalized in GRADE_TO_PERCENT) {
    return { percent: GRADE_TO_PERCENT[normalized], kind: 'grade' };
  }

  return { percent: null, kind: 'invalid' };
}

/** 按分段表/线性公式把百分制成绩换成绩点。 */
export function percentToPoint(percent: number, scale: GpaScale): number {
  if (scale.kind === 'percentage') {
    return percent;
  }

  if (scale.kind === 'linear') {
    const slope = scale.slope ?? 0.1;
    const intercept = scale.intercept ?? -5;
    const ceil = scale.ceil ?? 5;
    const value = percent * slope + intercept;
    return Math.min(ceil, Math.max(0, round(value, 2)));
  }

  const segments = [...(scale.segments ?? [])].sort((a, b) => b.min - a.min);
  for (const segment of segments) {
    if (percent >= segment.min) {
      return segment.point;
    }
  }
  return 0;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function computeGpa({ courses, scale }: { courses: Course[]; scale: GpaScale }): GpaResult {
  const rows: ScoredCourse[] = courses.map((course) => {
    const { percent, kind } = parseScore(course.rawScore);
    const credits = course.credits ?? 0;
    const usable = !course.excluded && percent !== null && credits > 0;
    const point = usable ? percentToPoint(percent as number, scale) : null;

    return {
      ...course,
      percent,
      kind,
      point,
      weightedPoint: point !== null ? round(point * credits, 4) : 0,
      weightedScore: usable ? round((percent as number) * credits, 4) : 0,
    };
  });

  const scored = rows.filter(row => row.point !== null);
  const effectiveCredits = round(
    scored.reduce((sum, row) => sum + (row.credits ?? 0), 0),
    4,
  );
  const totalCredits = round(
    rows.reduce((sum, row) => sum + (row.credits ?? 0), 0),
    4,
  );
  const pointSum = round(
    scored.reduce((sum, row) => sum + row.weightedPoint, 0),
    4,
  );
  const scoreSum = round(
    scored.reduce((sum, row) => sum + row.weightedScore, 0),
    4,
  );

  const withScore = scored.filter(row => row.percent !== null);

  return {
    rows,
    effectiveCredits,
    totalCredits,
    weightedAverage: effectiveCredits > 0 ? round(scoreSum / effectiveCredits, 2) : null,
    arithmeticAverage: withScore.length > 0
      ? round(withScore.reduce((sum, row) => sum + (row.percent as number), 0) / withScore.length, 2)
      : null,
    gpa: effectiveCredits > 0 ? round(pointSum / effectiveCredits, 3) : null,
    failedCredits: round(
      scored.filter(row => (row.point ?? 0) === 0).reduce((sum, row) => sum + (row.credits ?? 0), 0),
      4,
    ),
    pointSum,
    invalidCount: rows.filter(row => row.kind === 'invalid').length,
  };
}

/**
 * 目标反推：在已有成绩基础上再修 newCredits 个学分，
 * 要达到 targetGpa，这批新课需要拿到多少分的平均绩点。
 */
export function solveTargetGpa({
  currentPointSum,
  currentCredits,
  targetGpa,
  newCredits,
  scaleMaxPoint,
}: {
  currentPointSum: number
  currentCredits: number
  targetGpa: number
  newCredits: number
  scaleMaxPoint: number
}): { requiredPoint: number; feasible: boolean } | null {
  if (newCredits <= 0) {
    return null;
  }

  const totalCredits = currentCredits + newCredits;
  const totalPointNeeded = targetGpa * totalCredits;
  const requiredPoint = (totalPointNeeded - currentPointSum) / newCredits;

  const epsilon = 1e-9;
  return {
    requiredPoint: round(requiredPoint, 3),
    feasible: requiredPoint <= scaleMaxPoint + epsilon,
  };
}

export function getScaleMaxPoint(scale: GpaScale): number {
  if (scale.kind === 'percentage') {
    return 100;
  }
  if (scale.kind === 'linear') {
    return scale.ceil ?? 5;
  }
  return Math.max(...(scale.segments ?? [{ min: 0, point: 0 }]).map(segment => segment.point));
}

/** 由所选算法反查：某个绩点大致对应多少分（用于给出「需要考到 X 分左右」） */
export function pointToPercentLabel(point: number, scale: GpaScale): string {
  if (scale.kind === 'percentage') {
    return `${point} 分`;
  }

  const segments = [...(scale.segments ?? [])].sort((a, b) => b.min - a.min);
  if (segments.length > 0) {
    const exact = segments.filter(segment => segment.point >= point).pop() ?? segments[segments.length - 1];
    return `${exact.min} 分以上`;
  }

  if (scale.kind === 'linear') {
    const slope = scale.slope ?? 0.1;
    const intercept = scale.intercept ?? -5;
    if (slope === 0) {
      return '—';
    }
    return `${round((point - intercept) / slope, 1)} 分`;
  }

  return '—';
}

export interface BulkParseResult {
  courses: Course[]
  warnings: string[]
}

let bulkIdSeed = 0;
export function createCourseId(): string {
  bulkIdSeed += 1;
  return `c${Date.now().toString(36)}${bulkIdSeed}`;
}

/**
 * 粘贴导入。支持以下写法（每行一门课，分隔符可用半角/全角逗号、制表符或空格）：
 *   高等数学,4,88
 *   大学英语 3 A-
 *   线性代数  3.5  76
 * 也支持网上复制表格时常见的「课程名 成绩 学分」顺序（靠学分一般 ≤ 30 自动判别）。
 */
export function parseBulkInput({ text }: { text: string }): BulkParseResult {
  const warnings: string[] = [];
  const courses: Course[] = [];
  const lines = (text ?? '').split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') {
      return;
    }

    // 跳过表头
    if (/^(课程|课程名称|科目)/.test(trimmed) && /(学分|成绩|绩点)/.test(trimmed)) {
      return;
    }

    const tokens = trimmed
      .split(/[,，\t;；]|\s{1,}/)
      .map(token => token.trim())
      .filter(token => token !== '');

    if (tokens.length < 2) {
      warnings.push(`第 ${index + 1} 行「${trimmed}」信息不足，已跳过（至少需要课程名 + 成绩）`);
      return;
    }

    const scoreTokenIndex = tokens.findIndex((token, tokenIndex) => {
      if (tokenIndex === 0) {
        return false;
      }
      const { kind } = parseScore(token);
      return kind === 'grade';
    });

    let creditIndex = -1;
    let scoreIndex = scoreTokenIndex;

    if (scoreTokenIndex === -1) {
      const numericIndexes = tokens
        .map((token, tokenIndex) => ({ token, tokenIndex }))
        .filter(({ token, tokenIndex }) => tokenIndex > 0 && parseScore(token).kind === 'percent');

      if (numericIndexes.length === 0) {
        warnings.push(`第 ${index + 1} 行「${trimmed}」没识别出成绩，已跳过`);
        return;
      }

      // 学分通常 ≤ 30，成绩通常 > 30；先按这个判别，两个都像学分就取更靠前的一个
      const creditCandidate = numericIndexes.find(({ token }) => Number.parseFloat(token) <= 30);
      if (creditCandidate) {
        creditIndex = creditCandidate.tokenIndex;
        const scoreCandidate = numericIndexes.find(({ tokenIndex }) => tokenIndex !== creditIndex);
        scoreIndex = scoreCandidate ? scoreCandidate.tokenIndex : -1;
      }
      else {
        const last = numericIndexes[numericIndexes.length - 1];
        scoreIndex = last.tokenIndex;
        const before = numericIndexes.filter(({ tokenIndex }) => tokenIndex < scoreIndex).pop();
        creditIndex = before ? before.tokenIndex : -1;
      }
    }
    else {
      const numericIndexes = tokens
        .map((token, tokenIndex) => ({ token, tokenIndex }))
        .filter(({ token, tokenIndex }) => tokenIndex > 0 && tokenIndex !== scoreTokenIndex && parseScore(token).kind === 'percent');
      const creditCandidate = numericIndexes.find(({ token }) => Number.parseFloat(token) <= 30) ?? numericIndexes[0];
      creditIndex = creditCandidate ? creditCandidate.tokenIndex : -1;
    }

    if (scoreIndex === -1) {
      warnings.push(`第 ${index + 1} 行「${trimmed}」没识别出成绩，已跳过`);
      return;
    }

    // 课程名 = 出现第一个数字/等级之前的那些 token，兜底用第一个 token
    const usedIndexes = [scoreIndex, creditIndex].filter(tokenIndex => tokenIndex >= 0);
    const firstNameIndex = Math.min(...usedIndexes);
    const nameTokens = firstNameIndex > 0
      ? tokens.slice(0, firstNameIndex)
      : tokens.filter((_, tokenIndex) => !usedIndexes.includes(tokenIndex)).slice(0, 1);
    const name = nameTokens.join(' ');

    if (creditIndex === -1) {
      warnings.push(`第 ${index + 1} 行「${trimmed}」没识别出学分，默认按 1 学分处理`);
    }

    courses.push({
      id: createCourseId(),
      name: name.trim() || `未命名课程 ${index + 1}`,
      credits: creditIndex === -1 ? 1 : Number.parseFloat(tokens[creditIndex]),
      rawScore: tokens[scoreIndex],
      excluded: false,
    });
  });

  return { courses, warnings };
}

export function toCsv({ result, scale }: { result: GpaResult; scale: GpaScale }): string {
  const header = '课程名称,学分,成绩,百分制,绩点,绩点×学分';
  const lines = result.rows.map(row => [
    row.name,
    row.credits ?? 0,
    row.rawScore,
    row.percent ?? '',
    row.point ?? '',
    row.weightedPoint,
  ].join(','));
  const footer = [
    `合计,${result.effectiveCredits},,${result.weightedAverage ?? ''},${result.gpa ?? ''},${result.pointSum}`,
    `算法,${scale.label},,,,`,
  ];
  return [header, ...lines, ...footer].join('\n');
}

export function toMarkdown({ result, scale }: { result: GpaResult; scale: GpaScale }): string {
  const lines = [
    `# 成绩汇总（${scale.label}）`,
    '',
    '| 课程 | 学分 | 成绩 | 绩点 | 绩点×学分 |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...result.rows.map(row => `| ${row.name} | ${row.credits ?? 0} | ${row.rawScore}${row.kind === 'grade' ? `（≈${row.percent}）` : ''} | ${row.point ?? '—'} | ${row.weightedPoint} |`),
    '',
    `- 有效学分：${result.effectiveCredits}`,
    `- 加权平均分：${result.weightedAverage ?? '—'}`,
    `- 算术平均分：${result.arithmeticAverage ?? '—'}`,
    `- GPA（${scale.label}）：${result.gpa ?? '—'}`,
    `- 挂科学分：${result.failedCredits}`,
  ];
  return lines.join('\n');
}
