import { describe, expect, it } from 'vitest';
import {
  SAMPLE_DOCUMENTS,
  checkOfficialDocument,
  detectDocType,
  maskNonChinesePunctuation,
  toReportText,
} from './official-document-checker.service';

function ruleIds(text: string): string[] {
  return checkOfficialDocument({ text }).issues.map(issue => issue.rule);
}

describe('official-document-checker / maskNonChinesePunctuation', () => {
  it('屏蔽小数与英文缩写，避免误判半角标点', () => {
    const masked = maskNonChinesePunctuation('遵循 GPL-3.0 许可证，绩点 3.5 学分');
    expect(masked).not.toContain('3.0');
    expect(masked).not.toContain('3.5');
    expect(masked).toContain('，');
  });

  it('屏蔽 URL 与邮箱', () => {
    const masked = maskNonChinesePunctuation('详见 https://github.com/CorentinTh/it-tools 与 a.b@example.com');
    expect(masked.includes('.')).toBe(false);
    expect(masked.includes('@')).toBe(false);
  });
});

describe('official-document-checker / detectDocType', () => {
  it('从标题识别文种', () => {
    expect(detectDocType({ title: '关于开展校园歌手大赛的通知' })).toBe('通知');
    expect(detectDocType({ title: '关于申请活动场地的请示' })).toBe('请示');
    expect(detectDocType({ title: '随便写写' })).toContain('未识别');
  });
});

describe('official-document-checker / 空文档', () => {
  it('没有内容时给出引导而不是报错', () => {
    const result = checkOfficialDocument({ text: '   \n  ' });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].level).toBe('info');
    expect(result.score).toBe(100);
  });
});

describe('official-document-checker / 规范范本', () => {
  it('规范范本应当零问题、满分', () => {
    const result = checkOfficialDocument({ text: SAMPLE_DOCUMENTS[1].text });
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 });
    expect(result.score).toBe(100);
    expect(result.stats.hasAttachment).toBe(true);
    expect(result.stats.hasSignature).toBe(true);
    expect(result.stats.hasDate).toBe(true);
    expect(result.stats.level1Count).toBe(2);
    expect(result.stats.level2Count).toBe(1);
  });
});

describe('official-document-checker / 问题范本', () => {
  const result = checkOfficialDocument({ text: SAMPLE_DOCUMENTS[0].text });
  const ids = result.issues.map(issue => issue.rule);

  it('能发现多项错误 / 警告 / 提示', () => {
    expect(result.counts.error).toBeGreaterThan(3);
    expect(result.counts.warning).toBeGreaterThan(2);
    expect(result.counts.info).toBeGreaterThan(1);
    expect(result.score).toBeLessThan(80);
  });

  it('命中标题标点、半角标点、序号、日期、附件等关键规则', () => {
    expect(ids).toContain('title-period');
    expect(ids).toContain('punctuation-half-width');
    expect(ids).toContain('numbering-level4-bracket');
    expect(ids).toContain('numbering-level3-separator');
    expect(ids).toContain('date-numeral');
    expect(ids).toContain('attachment-missing');
    expect(ids).toContain('wording');
  });

  it('能定位到具体行号', () => {
    const lines = result.issues
      .filter(issue => issue.rule === 'punctuation-half-width')
      .map(issue => issue.line);
    expect(lines).toContain(2);
    expect(lines.length).toBeGreaterThan(3);
  });
});

describe('official-document-checker / 单项规则', () => {
  it('标题带书名号', () => {
    expect(ruleIds('关于印发《XX管理办法》的通知\n各班级：\n　　现予印发。')).toContain('title-bookmark');
  });

  it('标题以标点结尾', () => {
    expect(ruleIds('关于开展活动的通知。\n各班级：\n　　现通知如下。')).toContain('title-period');
  });

  it('标题缺少文种', () => {
    expect(ruleIds('关于开展校园歌手大赛\n各班级：\n　　现通知如下。')).toContain('title-doc-type');
  });

  it('半角标点会被识别', () => {
    expect(ruleIds('关于开展活动的通知\n各班级：\n　　现将事项通知如下,请遵照执行。')).toContain('punctuation-half-width');
  });

  it('纯中文标点不误报', () => {
    expect(ruleIds('关于开展活动的通知\n各班级：\n　　现将有关事项通知如下，请遵照执行。')).not.toContain('punctuation-half-width');
  });

  it('书名号不成对', () => {
    expect(ruleIds('关于转发《XX管理办法的通知\n各班级：\n　　现予转发。')).toContain('symbol-pairing');
  });

  it('附件说明用半角冒号', () => {
    expect(ruleIds('关于开展活动的通知\n各班级：\n　　详见附件。\n\n附件:评分标准')).toContain('attachment-colon');
  });

  it('成文日期用「零」会被提醒', () => {
    const ids = ruleIds('关于开展活动的通知\n各班级：\n　　特此通知。\n\n　　　　学生会\n　　二零二六年九月二十八日');
    expect(ids).toContain('date-zero');
    expect(ids).not.toContain('date-numeral');
  });

  it('成文日期用阿拉伯数字会被判错', () => {
    expect(ruleIds('关于开展活动的通知\n各班级：\n　　特此通知。\n\n　　　　学生会\n　　2026年9月28日')).toContain('date-numeral');
  });

  it('缺少署名与日期会被警告', () => {
    expect(ruleIds('关于开展活动的通知\n各班级：\n　　特此通知。')).toContain('signature-missing');
  });

  it('用词问题：其它 / 涉及到 / 望批准', () => {
    const ids = ruleIds('关于开展活动的通知\n各班级：\n　　其它事项涉及到场地，望批准。');
    expect(ids.filter(id => id === 'wording')).toHaveLength(3);
  });

  it('层级顺序倒置会被提醒', () => {
    const ids = ruleIds('关于开展活动的通知\n各班级：\n　　1.线上报名。\n　　一、参赛对象\n　　全体学生。');
    expect(ids).toContain('numbering-order');
  });

  it('二级序号用半角括号会被判错', () => {
    expect(ruleIds('关于开展活动的通知\n各班级：\n　　(一)报名方式\n　　线上报名。')).toContain('numbering-level2-bracket');
  });
});

describe('official-document-checker / 报告导出', () => {
  it('能生成 Markdown 报告', () => {
    const result = checkOfficialDocument({ text: SAMPLE_DOCUMENTS[0].text });
    const report = toReportText({ result });
    expect(report).toContain('# 公文格式自检报告');
    expect(report).toContain('自动评分');
    expect(report).toContain('| 级别 |');
  });
});
