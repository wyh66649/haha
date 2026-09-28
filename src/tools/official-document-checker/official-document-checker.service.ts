/**
 * 公文格式自检核心逻辑。
 *
 * 参考《党政机关公文格式》(GB/T 9704-2012) 与《标点符号用法》(GB/T 15834)、
 * 《出版物上数字用法》(GB/T 15835) 中的常见硬性要求，把学生会 / 社团
 * 天天踩的坑做成可自动校验的规则。
 *
 * 设计原则：宁可漏报，不可误报 —— 半角标点检查会先屏蔽 URL、邮箱、
 * 小数、英文缩写，避免把「GPL-3.0」「3.5 学分」当成错误。
 */

export type IssueLevel = 'error' | 'warning' | 'info';

export interface DocIssue {
  level: IssueLevel
  rule: string
  title: string
  detail: string
  /** 1 起算的行号，0 表示整篇 */
  line: number
  excerpt: string
  suggestion: string
}

export interface DocStats {
  characters: number
  paragraphs: number
  docType: string
  level1Count: number
  level2Count: number
  level3Count: number
  hasAttachment: boolean
  hasSignature: boolean
  hasDate: boolean
}

export interface CheckResult {
  issues: DocIssue[]
  stats: DocStats
  score: number
  counts: Record<IssueLevel, number>
}

const DOC_TYPES = ['通知', '通报', '报告', '请示', '批复', '意见', '函', '纪要', '决定', '命令', '公告', '通告', '议案', '决议', '公报'];

const HALF_WIDTH_PUNCTUATION: Array<{ char: string; full: string }> = [
  { char: ',', full: '，' },
  { char: ';', full: '；' },
  { char: ':', full: '：' },
  { char: '?', full: '？' },
  { char: '!', full: '！' },
];

const NUMBERING_PATTERNS = {
  level1: /^[\s\u3000]*(?:[一二三四五六七八九十]+)、/,
  level2: /^[\s\u3000]*[（(][一二三四五六七八九十]+[）)]/,
  level3: /^[\s\u3000]*\d+\s*[.．、]/,
  level4: /^[\s\u3000]*[（(]\d+[）)]/,
};

const CN_DATE_PATTERN = /[〇零一二三四五六七八九十]{2,4}年[〇零一二三四五六七八九十]{1,3}月[〇零一二三四五六七八九十]{1,3}日/;

function hasChinese(text: string): boolean {
  return /[\u4E00-\u9FA5]/.test(text);
}

/** 屏蔽不需要检查标点的片段：URL、邮箱、小数、英文与版本号 */
export function maskNonChinesePunctuation(line: string): string {
  return line
    .replace(/https?:\/\/\S+/g, matched => '□'.repeat(matched.length))
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, matched => '□'.repeat(matched.length))
    .replace(/\d+\.\d+/g, matched => '□'.repeat(matched.length))
    .replace(/[A-Za-z0-9][\w.+#@/-]*/g, matched => '□'.repeat(matched.length));
}

export function detectDocType({ title }: { title: string }): string {
  const matched = DOC_TYPES.find(type => title.includes(type));
  return matched ?? '未识别（常见文种：通知 / 报告 / 请示 / 函 / 纪要）';
}

function countOccurrences(text: string, char: string): number {
  let count = 0;
  for (const item of text) {
    if (item === char) {
      count += 1;
    }
  }
  return count;
}

export function checkOfficialDocument({ text }: { text: string }): CheckResult {
  const raw = text ?? '';
  const issues: DocIssue[] = [];
  const lines = raw.split(/\r?\n/);

  const push = (issue: Omit<DocIssue, 'excerpt'> & { excerpt?: string }) => {
    issues.push({ excerpt: '', ...issue });
  };

  const bodyLines = lines
    .map((content, index) => ({ content, line: index + 1, trimmed: content.trim() }))
    .filter(item => item.trimmed !== '');

  if (bodyLines.length === 0) {
    return {
      issues: [{
        level: 'info',
        rule: 'empty-document',
        title: '还没有内容',
        detail: '把公文正文粘贴到左侧输入框，这里会实时给出格式检查结果。',
        line: 0,
        excerpt: '',
        suggestion: '支持标题、主送机关、正文、附件说明、发文机关署名、成文日期等完整要素。',
      }],
      stats: {
        characters: 0,
        paragraphs: 0,
        docType: '—',
        level1Count: 0,
        level2Count: 0,
        level3Count: 0,
        hasAttachment: false,
        hasSignature: false,
        hasDate: false,
      },
      score: 100,
      counts: { error: 0, warning: 0, info: 1 },
    };
  }

  // ① 标题
  const titleLine = bodyLines[0];
  const title = titleLine.trimmed;
  const docType = detectDocType({ title });

  if (title.includes('《')) {
    push({
      level: 'warning',
      rule: 'title-bookmark',
      title: '标题里出现了书名号',
      detail: '公文标题不用书名号，只有正文中引用文件名称时才用《》。',
      line: titleLine.line,
      excerpt: title,
      suggestion: '去掉标题中的《》，例如「关于印发《XX办法》的通知」这种写法只保留被引用文件的书名号。',
    });
  }

  if (/[。；;]$/.test(title)) {
    push({
      level: 'error',
      rule: 'title-period',
      title: '标题结尾不能加标点',
      detail: '公文标题末不用句号、分号等标点（易被评委直接扣分）。',
      line: titleLine.line,
      excerpt: title,
      suggestion: '删掉标题末尾的标点。',
    });
  }

  if (title.length > 40) {
    push({
      level: 'warning',
      rule: 'title-too-long',
      title: '标题偏长',
      detail: `当前标题 ${title.length} 字，公文标题一般不超过 40 字，回行时要注意词意完整。`,
      line: titleLine.line,
      excerpt: title,
      suggestion: '用「关于……的请示 / 通知 / 报告」结构压缩，把说明性内容移到正文。',
    });
  }

  if (title.startsWith('关于') && docType.startsWith('未识别')) {
    push({
      level: 'warning',
      rule: 'title-doc-type',
      title: '标题里没有文种',
      detail: '「关于……的XX」中的「XX」应当是规范文种，如通知、请示、报告、函、纪要。',
      line: titleLine.line,
      excerpt: title,
      suggestion: '补上文种，例如「关于开展校园歌手大赛的请示」。',
    });
  }

  // ② 主送机关
  const receiverLine = bodyLines[1];
  if (receiverLine && !/[：:]$/.test(receiverLine.trimmed) && receiverLine.line === titleLine.line + 1) {
    push({
      level: 'warning',
      rule: 'receiver-format',
      title: '主送机关格式可能不对',
      detail: '标题下一行是主送机关，应顶格书写、名称后用全角冒号结尾。',
      line: receiverLine.line,
      excerpt: receiverLine.trimmed,
      suggestion: '例如「校学生会各部门：」「各学院团委：」，若确实是无主送机关的公告 / 通告可忽略本条。',
    });
  }

  // ③ 正文首行缩进
  const bodyStart = bodyLines.findIndex(item => item.line > (receiverLine?.line ?? 0));
  const firstParagraph = bodyStart >= 0 ? bodyLines[bodyStart] : undefined;
  if (firstParagraph && !/^[\s\u3000]/.test(firstParagraph.content)) {
    push({
      level: 'info',
      rule: 'paragraph-indent',
      title: '正文段落没有首行缩进',
      detail: '公文正文每段首行缩进两字（复制粘贴时最容易丢）。',
      line: firstParagraph.line,
      excerpt: firstParagraph.trimmed.slice(0, 30),
      suggestion: '在 Word 里设置「首行缩进 2 字符」，而不是用空格凑。',
    });
  }

  // ④ 层次序号
  let level1FirstLine = Number.POSITIVE_INFINITY;
  let level2HalfWidth = 0;
  let level4HalfWidth = 0;
  let level3BadSeparator = 0;
  let level1Count = 0;
  let level2Count = 0;
  let level3Count = 0;
  let level3FirstLine = Number.POSITIVE_INFINITY;

  bodyLines.forEach((item) => {
    if (NUMBERING_PATTERNS.level1.test(item.trimmed)) {
      level1Count += 1;
      level1FirstLine = Math.min(level1FirstLine, item.line);
    }
    if (NUMBERING_PATTERNS.level2.test(item.trimmed)) {
      level2Count += 1;
      if (item.trimmed.includes('(') || item.trimmed.includes(')')) {
        level2HalfWidth += 1;
      }
    }
    if (NUMBERING_PATTERNS.level4.test(item.trimmed) && (item.trimmed.includes('(') || item.trimmed.includes(')'))) {
      level4HalfWidth += 1;
    }
    if (NUMBERING_PATTERNS.level3.test(item.trimmed)) {
      level3Count += 1;
      level3FirstLine = Math.min(level3FirstLine, item.line);
      if (/\d+\s*、/.test(item.trimmed)) {
        level3BadSeparator += 1;
      }
    }
  });

  if (level2HalfWidth > 0) {
    push({
      level: 'error',
      rule: 'numbering-level2-bracket',
      title: `二级序号用了半角括号（${level2HalfWidth} 处）`,
      detail: '公文的层级序号依次是「一、」「（一）」「1.」「（1）」，括号必须用全角。',
      line: 0,
      excerpt: '(一)',
      suggestion: '把 (一) 改成 （一）。',
    });
  }

  if (level4HalfWidth > 0) {
    push({
      level: 'error',
      rule: 'numbering-level4-bracket',
      title: `四级序号用了半角括号（${level4HalfWidth} 处）`,
      detail: '四级序号应为「（1）」，括号用全角。',
      line: 0,
      excerpt: '(1)',
      suggestion: '把 (1) 改成 （1）。',
    });
  }

  if (level3BadSeparator > 0) {
    push({
      level: 'warning',
      rule: 'numbering-level3-separator',
      title: `三级序号用了顿号（${level3BadSeparator} 处）`,
      detail: '三级序号是「1.」而不是「1、」，「、」是顿号，不能当序号分隔符。',
      line: 0,
      excerpt: '1、',
      suggestion: '把「1、」改成「1.」。',
    });
  }

  if (level3Count > 0 && level1Count > 0 && level3FirstLine < level1FirstLine) {
    push({
      level: 'warning',
      rule: 'numbering-order',
      title: '层次序号顺序倒置',
      detail: '三级序号「1.」出现在一级序号「一、」之前，层级顺序应为一、（一）、1.、（1）。',
      line: level3FirstLine,
      excerpt: bodyLines.find(item => item.line === level3FirstLine)?.trimmed.slice(0, 30) ?? '',
      suggestion: '把该层序号上调为「一、」，或在前面补上对应的一级标题。',
    });
  }

  if (level2Count > 0 && level1Count === 0) {
    push({
      level: 'info',
      rule: 'numbering-skip-level',
      title: '跳过了第一层序号',
      detail: '文中出现了「（一）」但没有「一、」，层级不完整。',
      line: 0,
      excerpt: '（一）',
      suggestion: '补上一级标题，或把「（一）」改为「一、」。',
    });
  }

  // ⑤ 标点
  lines.forEach((content, index) => {
    const lineNumber = index + 1;
    const trimmed = content.trim();
    if (trimmed === '' || !hasChinese(trimmed)) {
      return;
    }

    const masked = maskNonChinesePunctuation(trimmed);
    const found: string[] = [];
    HALF_WIDTH_PUNCTUATION.forEach(({ char, full }) => {
      if (masked.includes(char)) {
        found.push(`「${char}」→「${full}」`);
      }
    });
    if (masked.includes('.')) {
      found.push('「.」→「。」');
    }
    if (masked.includes('(') || masked.includes(')')) {
      found.push('半角括号 → 全角括号');
    }

    if (found.length > 0) {
      push({
        level: 'error',
        rule: 'punctuation-half-width',
        title: '中文句子里混用了半角标点',
        detail: found.join('；'),
        line: lineNumber,
        excerpt: trimmed.slice(0, 40),
        suggestion: '中文语境一律用全角标点；数字小数点和英文缩写不受影响。',
      });
    }

    if (masked.includes('"') || /[']\s*[\u4E00-\u9FA5]/.test(masked)) {
      push({
        level: 'warning',
        rule: 'punctuation-quote',
        title: '引号用了英文直引号',
        detail: '公文应使用中文弯引号「“ ”」，直引号在正式材料里很扎眼。',
        line: lineNumber,
        excerpt: trimmed.slice(0, 40),
        suggestion: '把 " " 改成 “ ”。',
      });
    }

    const spaceMatch = masked.match(/[\u4E00-\u9FA5]\s{2,}[\u4E00-\u9FA5]/);
    if (spaceMatch) {
      push({
        level: 'info',
        rule: 'punctuation-space',
        title: '句子中间有连续空格',
        detail: '中文句子内部不需要用空格分隔（首行缩进请用段落格式而不是空格）。',
        line: lineNumber,
        excerpt: trimmed.slice(0, 40),
        suggestion: '删掉多余空格，或改用「首行缩进 2 字符」。',
      });
    }
  });

  // ⑥ 符号配对
  const pairs: Array<{ left: string; right: string; name: string }> = [
    { left: '《', right: '》', name: '书名号' },
    { left: '（', right: '）', name: '全角括号' },
    { left: '“', right: '”', name: '双引号' },
  ];
  pairs.forEach(({ left, right, name }) => {
    const leftCount = countOccurrences(raw, left);
    const rightCount = countOccurrences(raw, right);
    if (leftCount !== rightCount) {
      push({
        level: 'error',
        rule: 'symbol-pairing',
        title: `${name}不成对`,
        detail: `「${left}」出现 ${leftCount} 次，「${right}」出现 ${rightCount} 次。`,
        line: 0,
        excerpt: '',
        suggestion: `检查是否有漏写的「${right}」。`,
      });
    }
  });

  // ⑦ 结构要素
  const attachmentLine = bodyLines.find(item => /^附件\s*[:：]/.test(item.trimmed));
  const hasAttachment = !!attachmentLine;
  const mentionsAttachment = /附件/.test(raw);
  if (mentionsAttachment && !hasAttachment) {
    push({
      level: 'warning',
      rule: 'attachment-missing',
      title: '提到了附件但没有附件说明',
      detail: '正文中出现了「附件」字样，但没找到独立的「附件：」说明行。',
      line: 0,
      excerpt: '',
      suggestion: '在正文结束后空一行写「附件：1.XXX」，附件说明与正文之间空一行。',
    });
  }

  if (attachmentLine && attachmentLine.trimmed.includes(':')) {
    push({
      level: 'error',
      rule: 'attachment-colon',
      title: '附件说明用了半角冒号',
      detail: '「附件：」必须用全角冒号。',
      line: attachmentLine.line,
      excerpt: attachmentLine.trimmed,
      suggestion: '把「附件:」改成「附件：」。',
    });
  }

  const tailLines = bodyLines.slice(-6).map(item => item.trimmed);
  const arabicDate = tailLines.find(line => /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/.test(line));
  const chineseDate = tailLines.find(line => CN_DATE_PATTERN.test(line));
  const hasDate = !!arabicDate || !!chineseDate;
  const hasSignature = tailLines.some(line => line.length <= 22
    && !line.includes('：')
    && !/\d/.test(line)
    && /(学生会|学生委员会|团委|团支部|委员会|办公室|党支部|班级|学院|学校|中心|协会|社团|部|处|科|局|会)$/.test(line)
    && !/^(附件|注|说明)/.test(line));

  if (arabicDate) {
    push({
      level: 'error',
      rule: 'date-numeral',
      title: '成文日期用了阿拉伯数字',
      detail: '《出版物上数字用法》规定成文日期用汉字数字（年份本身可以用阿拉伯数字，例如「2026年度」）。',
      line: 0,
      excerpt: arabicDate,
      suggestion: '改成「二〇二六年九月二十八日」，注意用「〇」而不是「零」。',
    });
  }

  if (chineseDate && chineseDate.includes('零')) {
    push({
      level: 'warning',
      rule: 'date-zero',
      title: '成文日期里的「〇」写成了「零」',
      detail: '规范写法是「二〇二六年」，不是「二零二六年」。',
      line: 0,
      excerpt: chineseDate,
      suggestion: '统一使用「〇」。',
    });
  }

  if (!hasSignature && !hasDate) {
    push({
      level: 'warning',
      rule: 'signature-missing',
      title: '缺少发文机关署名和成文日期',
      detail: '正文末尾应有发文机关署名和成文日期，这是公文的必备要素。',
      line: 0,
      excerpt: '',
      suggestion: '在正文下方补上「XX学院学生会」和成文日期两行。',
    });
  }
  else if (!hasSignature) {
    push({
      level: 'warning',
      rule: 'signature-missing',
      title: '缺少发文机关署名',
      detail: '正文末尾应署上发文机关全称或规范化简称。',
      line: 0,
      excerpt: '',
      suggestion: '在成文日期上方补上「XX学院学生会」。',
    });
  }
  else if (!hasDate) {
    push({
      level: 'warning',
      rule: 'date-missing',
      title: '缺少成文日期',
      detail: '正文末尾应有成文日期，用汉字数字书写。',
      line: 0,
      excerpt: '',
      suggestion: '在署名下方补上日期，例如「二〇二六年九月二十八日」。',
    });
  }

  const closingWords = ['特此通知', '特此报告', '特此函告', '妥否，请批示', '以上意见，请审示', '请予批复', '当否，请批示'];
  if (['通知', '报告', '请示'].some(type => docType === type) && !closingWords.some(word => raw.includes(word))) {
    push({
      level: 'info',
      rule: 'closing-missing',
      title: '结尾缺少规范结束语',
      detail: `${docType}类公文一般以「特此通知」「妥否，请批示」等规范化语句收尾。`,
      line: 0,
      excerpt: '',
      suggestion: `按文种补上结束语，例如「${docType === '通知' ? '特此通知' : docType === '报告' ? '特此报告' : '妥否，请批示'}」。`,
    });
  }

  // ⑧ 用词
  const wordingRules: Array<{ pattern: RegExp; level: IssueLevel; title: string; suggestion: string }> = [
    { pattern: /其它/g, level: 'warning', title: '「其它」应为「其他」', suggestion: '现代公文统一用「其他」。' },
    { pattern: /帐(目|号|户|单|款)/g, level: 'warning', title: '「帐」应为「账」', suggestion: '与钱财相关的都用「账」，如账目、账户、账单。' },
    { pattern: /(我司|贵司|你司)/g, level: 'info', title: '「我司 / 贵司」不符合公文用语', suggestion: '党政机关和学校公文用「我单位」「你单位」。' },
    { pattern: /(盼复|望批准|请领导批准)/g, level: 'warning', title: '「盼复 / 望批准」不是规范结束语', suggestion: '改用「妥否，请批示」「请予批复」。' },
    { pattern: /截止[到于]?(今|目前|\d{4}年|\d{1,2}月)/g, level: 'warning', title: '「截止」与「截至」混用', suggestion: '表示到某个时间点用「截至」，「截止」表示停止，后面不接时间。' },
    { pattern: /涉及到/g, level: 'info', title: '「涉及到」语义重复', suggestion: '直接用「涉及」。' },
    { pattern: /进行(了)?.{0,4}(工作|安排|处理)/g, level: 'info', title: '「进行 + 动词」句式冗余', suggestion: '能用单个动词就用单个动词，例如「进行安排」→「安排」。' },
  ];

  wordingRules.forEach((rule) => {
    const matchedLine = bodyLines.find(item => new RegExp(rule.pattern.source).test(item.trimmed));
    if (matchedLine) {
      push({
        level: rule.level,
        rule: 'wording',
        title: rule.title,
        detail: `出现在第 ${matchedLine.line} 行附近。`,
        line: matchedLine.line,
        excerpt: matchedLine.trimmed.slice(0, 40),
        suggestion: rule.suggestion,
      });
    }
  });

  // ⑨ 版式细节
  let blankRun = 0;
  let maxBlankRun = 0;
  lines.forEach((content) => {
    if (content.trim() === '') {
      blankRun += 1;
      maxBlankRun = Math.max(maxBlankRun, blankRun);
    }
    else {
      blankRun = 0;
    }
  });
  if (maxBlankRun >= 3) {
    push({
      level: 'info',
      rule: 'layout-blank-lines',
      title: '连续空行过多',
      detail: `最多连续出现 ${maxBlankRun} 个空行。`,
      line: 0,
      excerpt: '',
      suggestion: '正文段落之间不空行，用小标题自然分段即可。',
    });
  }

  if (bodyLines.length <= 1) {
    push({
      level: 'warning',
      rule: 'structure-incomplete',
      title: '只有一个段落',
      detail: '这份文本看起来只有一行，缺少主送机关、正文、署名、日期等要素。',
      line: 0,
      excerpt: bodyLines[0].trimmed.slice(0, 40),
      suggestion: '确认是否只粘贴了标题。',
    });
  }

  const counts: Record<IssueLevel, number> = {
    error: issues.filter(issue => issue.level === 'error').length,
    warning: issues.filter(issue => issue.level === 'warning').length,
    info: issues.filter(issue => issue.level === 'info').length,
  };

  const score = Math.max(
    0,
    100 - counts.error * 8 - counts.warning * 3 - counts.info * 1,
  );

  return {
    issues,
    stats: {
      characters: raw.replace(/\s/g, '').length,
      paragraphs: bodyLines.length,
      docType,
      level1Count,
      level2Count,
      level3Count,
      hasAttachment,
      hasSignature,
      hasDate,
    },
    score,
    counts,
  };
}

export interface QualitySample {
  label: string
  text: string
}

export const SAMPLE_DOCUMENTS: QualitySample[] = [
  {
    label: '问题示范（含 7 类常见错误）',
    text: [
      '关于开展校园歌手大赛的通知(草案)。',
      '各位同学,各班级负责人:',
      '为进一步丰富校园文化生活,经研究决定开展校园歌手大赛,现将有关事项通知如下:',
      '一、参赛对象',
      '本次大赛面向全校在校学生,不限年级、专业。',
      '（一）报名方式',
      '1、线上报名：填写问卷星表单。',
      '2.线下报名：学生会办公室(学生活动中心302)。',
      '(1)报名截止时间为2026年10月20日。',
      '二、评比办法',
      '由评委打分,去掉一个最高分和一个最低分后取平均分。评分标准参见附件。',
      '其它未尽事宜,由学生会文艺部负责解释。',
      '本次活动涉及到场地、设备、宣传等费用,由学生会统一进行安排。',
      '望批准。',
      '学生会文艺部',
      '2026年9月28日',
    ].join('\n'),
  },
  {
    label: '规范示范（可对照修改）',
    text: [
      '关于开展校园歌手大赛的通知',
      '各学院学生会、各班级：',
      '　　为进一步丰富校园文化生活，经研究决定开展校园歌手大赛，现将有关事项通知如下：',
      '　　一、参赛对象',
      '　　全体在校学生，不限年级、专业。',
      '　　（一）报名方式',
      '　　1. 线上报名：填写问卷星表单。',
      '　　2. 线下报名：学生会办公室（学生活动中心302）。',
      '　　二、评比办法',
      '　　由评委打分，去掉一个最高分和一个最低分后取平均分。评分标准见附件。',
      '　　其他未尽事宜，由学生会文艺部负责解释。',
      '　　特此通知。',
      '',
      '　　附件：校园歌手大赛评分标准',
      '',
      '　　　　　　　　　　　　　　　　　　学生会文艺部',
      '　　　　　　　　　　　　　　　　二〇二六年九月二十八日',
    ].join('\n'),
  },
];

export function toReportText({ result }: { result: CheckResult }): string {
  const { stats, counts } = result;
  const lines = [
    '# 公文格式自检报告',
    '',
    `- 自动评分：${result.score} / 100`,
    `- 问题统计：错误 ${counts.error} 项、警告 ${counts.warning} 项、提示 ${counts.info} 项`,
    `- 识别文种：${stats.docType}`,
    `- 字数（不计空白）：${stats.characters}`,
    `- 段落数：${stats.paragraphs}`,
    '',
    '| 级别 | 位置 | 问题 | 建议 |',
    '| --- | --- | --- | --- |',
    ...result.issues.map(issue => `| ${issue.level === 'error' ? '错误' : issue.level === 'warning' ? '警告' : '提示'} | ${issue.line > 0 ? `第 ${issue.line} 行` : '整篇'} | ${issue.title} | ${issue.suggestion} |`),
  ];
  return lines.join('\n');
}
