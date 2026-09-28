import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCALES,
  type Course,
  computeGpa,
  createCourseId,
  getScaleMaxPoint,
  parseBulkInput,
  parseScore,
  percentToPoint,
  pointToPercentLabel,
  solveTargetGpa,
} from './gpa-calculator.service';

function course(name: string, credits: number, rawScore: string, excluded = false): Course {
  return { id: createCourseId(), name, credits, rawScore, excluded };
}

const standard4 = DEFAULT_SCALES.find(scale => scale.id === 'standard-4')!;
const weighted100 = DEFAULT_SCALES.find(scale => scale.id === 'weighted-100')!;
const linear5 = DEFAULT_SCALES.find(scale => scale.id === 'linear-5')!;

describe('gpa-calculator / parseScore', () => {
  it('解析百分制数字', () => {
    expect(parseScore('88')).toEqual({ percent: 88, kind: 'percent' });
    expect(parseScore('88.5')).toEqual({ percent: 88.5, kind: 'percent' });
    expect(parseScore('95分')).toEqual({ percent: 95, kind: 'percent' });
  });

  it('解析等级制', () => {
    expect(parseScore('A-').kind).toBe('grade');
    expect(parseScore('a-').percent).toBe(parseScore('A-').percent);
    expect(parseScore('B+').percent).toBe(85);
    expect(parseScore('合格').kind).toBe('grade');
    expect(parseScore('优秀').percent).toBeGreaterThan(90);
  });

  it('空值与非法值', () => {
    expect(parseScore('')).toEqual({ percent: null, kind: 'empty' });
    expect(parseScore('   ')).toEqual({ percent: null, kind: 'empty' });
    expect(parseScore('甲').kind).toBe('invalid');
  });
});

describe('gpa-calculator / percentToPoint', () => {
  it('加权百分制直接返回原分数', () => {
    expect(percentToPoint(88, weighted100)).toBe(88);
  });

  it('标准 4.0 分段边界', () => {
    expect(percentToPoint(90, standard4)).toBe(4);
    expect(percentToPoint(89.9, standard4)).toBe(3.7);
    expect(percentToPoint(85, standard4)).toBe(3.7);
    expect(percentToPoint(60, standard4)).toBe(1);
    expect(percentToPoint(59.9, standard4)).toBe(0);
    expect(percentToPoint(0, standard4)).toBe(0);
  });

  it('5.0 线性换算会被裁剪到 [0, 5]', () => {
    expect(percentToPoint(100, linear5)).toBe(5);
    expect(percentToPoint(60, linear5)).toBe(1);
    expect(percentToPoint(40, linear5)).toBe(0);
    expect(getScaleMaxPoint(linear5)).toBe(5);
  });
});

describe('gpa-calculator / computeGpa', () => {
  it('按学分加权而不是简单平均', () => {
    const result = computeGpa({
      courses: [course('高数', 5, '90'), course('体育', 1, '60')],
      scale: weighted100,
    });

    // (90*5 + 60*1) / 6 = 85
    expect(result.weightedAverage).toBe(85);
    expect(result.arithmeticAverage).toBe(75);
    expect(result.gpa).toBe(85);
    expect(result.effectiveCredits).toBe(6);
  });

  it('忽略 exclude 掉的课程和无法识别的成绩', () => {
    const result = computeGpa({
      courses: [
        course('高数', 5, '90'),
        course('缓考', 3, '90', true),
        course('待定', 2, '待录入'),
      ],
      scale: weighted100,
    });

    expect(result.effectiveCredits).toBe(5);
    expect(result.totalCredits).toBe(10);
    expect(result.weightedAverage).toBe(90);
    expect(result.invalidCount).toBe(1);
  });

  it('统计挂科学分', () => {
    const result = computeGpa({
      courses: [course('高数', 5, '58'), course('英语', 3, '75')],
      scale: standard4,
    });

    expect(result.failedCredits).toBe(5);
    // 58 分 → 0 绩点，75 分 → 2.7 绩点：(0*5 + 2.7*3) / 8 = 1.0125，GPA 保留 3 位小数
    expect(result.pointSum).toBeCloseTo(8.1, 4);
    expect(result.gpa).toBeCloseTo(1.013, 3);
  });

  it('空列表不会崩', () => {
    const result = computeGpa({ courses: [], scale: standard4 });
    expect(result.gpa).toBeNull();
    expect(result.weightedAverage).toBeNull();
    expect(result.arithmeticAverage).toBeNull();
  });
});

describe('gpa-calculator / solveTargetGpa', () => {
  it('算出剩余学分需要的平均绩点', () => {
    // 已修 60 学分、绩点和 210（GPA 3.5），目标 3.6，剩 20 学分
    const solved = solveTargetGpa({
      currentPointSum: 210,
      currentCredits: 60,
      targetGpa: 3.6,
      newCredits: 20,
      scaleMaxPoint: 4,
    });

    expect(solved).not.toBeNull();
    expect(solved!.requiredPoint).toBeCloseTo(3.9, 3);
    expect(solved!.feasible).toBe(true);
  });

  it('目标不可达时标记 infeasible', () => {
    const solved = solveTargetGpa({
      currentPointSum: 100,
      currentCredits: 40,
      targetGpa: 4,
      newCredits: 10,
      scaleMaxPoint: 4,
    });

    expect(solved!.feasible).toBe(false);
  });

  it('剩余学分为 0 时返回 null', () => {
    expect(solveTargetGpa({ currentPointSum: 10, currentCredits: 10, targetGpa: 4, newCredits: 0, scaleMaxPoint: 4 })).toBeNull();
  });
});

describe('gpa-calculator / parseBulkInput', () => {
  it('支持「课程名,学分,成绩」', () => {
    const { courses: parsed, warnings } = parseBulkInput({ text: '高等数学,5,88\n大学英语,3,A-' });

    expect(warnings).toEqual([]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ name: '高等数学', credits: 5, rawScore: '88' });
    expect(parsed[1].rawScore).toBe('A-');
  });

  it('支持「课程名 成绩 学分」顺序', () => {
    const { courses: parsed } = parseBulkInput({ text: '线性代数 76 3.5' });
    expect(parsed[0]).toMatchObject({ name: '线性代数', credits: 3.5, rawScore: '76' });
  });

  it('支持空格分隔与全角逗号', () => {
    const { courses: parsed } = parseBulkInput({ text: '数据结构 4 91\n大学物理，3，83' });
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ name: '数据结构', credits: 4, rawScore: '91' });
    expect(parsed[1]).toMatchObject({ name: '大学物理', credits: 3, rawScore: '83' });
  });

  it('跳过表头和空行', () => {
    const { courses: parsed, warnings } = parseBulkInput({ text: '课程名称,学分,成绩\n\n高等数学,5,88\n' });
    expect(parsed).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('信息不足时给出警告', () => {
    const { courses: parsed, warnings } = parseBulkInput({ text: '高等数学\n大学英语,3,88' });
    expect(parsed).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  it('缺少学分时按 1 学分兜底', () => {
    const { courses: parsed, warnings } = parseBulkInput({ text: '形势与政策 通过' });
    expect(parsed[0].credits).toBe(1);
    expect(warnings.length).toBe(1);
  });
});

describe('gpa-calculator / pointToPercentLabel', () => {
  it('分段算法给出分数下限', () => {
    expect(pointToPercentLabel(3.7, standard4)).toBe('85 分以上');
  });

  it('百分制算法直接返回分值', () => {
    expect(pointToPercentLabel(85, weighted100)).toBe('85 分');
  });

  it('线性算法反解分数', () => {
    expect(pointToPercentLabel(4.0, linear5)).toBe('90 分');
  });
});
