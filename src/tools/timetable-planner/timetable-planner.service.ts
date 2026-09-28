/**
 * 课表分析核心逻辑：周次解析、冲突检测、空闲时段计算、课业负荷统计。
 * 全部为纯函数，方便单元测试，也方便后续接入教务系统导出的数据。
 */

export interface ClassSlot {
  id: string
  name: string
  /** 1 = 周一 … 7 = 周日 */
  day: number
  startPeriod: number
  endPeriod: number
  /** 周次表达式：1-16、1-8,10-16、1-16单、1-16双、全部 */
  weeks: string
  location: string
}

export interface PeriodTime {
  /** 第几节，从 1 开始 */
  index: number
  start: string
  end: string
}

export interface Conflict {
  a: ClassSlot
  b: ClassSlot
  weeks: number[]
  /** 两门课在同一周次段内、同一天、节次重叠 */
  overlapPeriods: [number, number]
}

export interface FreeSlot {
  day: number
  start: string
  end: string
  minutes: number
  /** 达到最小空档阈值，适合安排自习 / 兼职 / 社团 */
  usable: boolean
}

export interface DayLoad {
  day: number
  periods: number
  minutes: number
  courses: ClassSlot[]
}

export interface TimetableAnalysis {
  conflicts: Conflict[]
  dayLoads: DayLoad[]
  totalPeriods: number
  totalMinutes: number
  courseCount: number
  freeSlots: FreeSlot[]
  usableFreeMinutes: number
  longestFreeSlot: FreeSlot | null
  /** 所选周次里没课的星期（真正的「没课的一天」） */
  freeDays: number[]
}

export const WEEK_DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export const DEFAULT_PERIODS: PeriodTime[] = [
  { index: 1, start: '08:00', end: '08:45' },
  { index: 2, start: '08:55', end: '09:40' },
  { index: 3, start: '10:00', end: '10:45' },
  { index: 4, start: '10:55', end: '11:40' },
  { index: 5, start: '14:00', end: '14:45' },
  { index: 6, start: '14:55', end: '15:40' },
  { index: 7, start: '16:00', end: '16:45' },
  { index: 8, start: '16:55', end: '17:40' },
  { index: 9, start: '19:00', end: '19:45' },
  { index: 10, start: '19:55', end: '20:40' },
  { index: 11, start: '20:50', end: '21:35' },
  { index: 12, start: '21:35', end: '22:20' },
];

/** 把作息时间表文本（每行「开始-结束」）解析成节次表 */
export function parsePeriods({ text }: { text: string }): PeriodTime[] {
  const periods: PeriodTime[] = [];
  (text ?? '').split(/\r?\n/).forEach((line) => {
    const matched = line.trim().match(/^(\d{1,2}:\d{2})\s*[-~—至]\s*(\d{1,2}:\d{2})$/);
    if (matched) {
      periods.push({ index: periods.length + 1, start: matched[1].padStart(5, '0'), end: matched[2].padStart(5, '0') });
    }
  });

  return periods.length > 0 ? periods : DEFAULT_PERIODS;
}

export function formatPeriods({ periods }: { periods: PeriodTime[] }): string {
  return periods.map(period => `${period.start}-${period.end}`).join('\n');
}

export function timeToMinutes(time: string): number {
  const matched = (time ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!matched) {
    return 0;
  }
  return Number.parseInt(matched[1], 10) * 60 + Number.parseInt(matched[2], 10);
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours} 小时` : `${hours} 小时 ${mins} 分`;
}

/** 解析周次表达式 */
export function parseWeeks({ raw, maxWeek = 30 }: { raw: string; maxWeek?: number }): number[] {
  const text = (raw ?? '').trim();
  const range = (from: number, to: number) => {
    const weeks: number[] = [];
    for (let week = from; week <= to; week++) {
      weeks.push(week);
    }
    return weeks;
  };

  if (text === '' || /^(全部|全周|整学期|all)$/i.test(text)) {
    return range(1, maxWeek);
  }

  const oddOnly = /单/.test(text);
  const evenOnly = /双/.test(text);
  const cleaned = text.replace(/[单双]/g, '').replace(/[（）()]/g, '').replace(/第|周/g, '');
  const weeks = new Set<number>();

  cleaned.split(/[,，、;；\s]+/).filter(Boolean).forEach((part) => {
    const matchedRange = part.match(/^(\d+)\s*[-~—至]\s*(\d+)$/);
    if (matchedRange) {
      const from = Math.min(Number(matchedRange[1]), Number(matchedRange[2]));
      const to = Math.max(Number(matchedRange[1]), Number(matchedRange[2]));
      range(from, to).forEach(week => weeks.add(week));
      return;
    }

    if (/^\d+$/.test(part)) {
      weeks.add(Number(part));
    }
  });

  let result = [...weeks].filter(week => week >= 1 && week <= maxWeek).sort((a, b) => a - b);
  if (oddOnly) {
    result = result.filter(week => week % 2 === 1);
  }
  if (evenOnly) {
    result = result.filter(week => week % 2 === 0);
  }
  return result;
}

export function formatWeeks({ weeks }: { weeks: number[] }): string {
  if (weeks.length === 0) {
    return '—';
  }

  const groups: string[] = [];
  let start = weeks[0];
  let previous = weeks[0];

  for (let index = 1; index <= weeks.length; index++) {
    const current = weeks[index];
    if (current !== previous + 1) {
      groups.push(start === previous ? `${start}` : `${start}-${previous}`);
      start = current;
    }
    previous = current;
  }

  return `${groups.join('、')} 周`;
}

function intersects(a: ClassSlot, b: ClassSlot): boolean {
  return a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod;
}

export function findConflicts({ slots, maxWeek = 30 }: { slots: ClassSlot[]; maxWeek?: number }): Conflict[] {
  const conflicts: Conflict[] = [];

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];

      if (a.day !== b.day || !intersects(a, b)) {
        continue;
      }

      const weeksA = parseWeeks({ raw: a.weeks, maxWeek });
      const weeksB = parseWeeks({ raw: b.weeks, maxWeek });
      const shared = weeksA.filter(week => weeksB.includes(week));

      if (shared.length === 0) {
        continue;
      }

      conflicts.push({
        a,
        b,
        weeks: shared,
        overlapPeriods: [
          Math.max(a.startPeriod, b.startPeriod),
          Math.min(a.endPeriod, b.endPeriod),
        ],
      });
    }
  }

  return conflicts;
}

export function computeDayLoads({ slots, week = 0 }: { slots: ClassSlot[]; week?: number }): DayLoad[] {
  const days: DayLoad[] = [];
  for (let day = 1; day <= 7; day++) {
    const courses = slots.filter((slot) => {
      if (slot.day !== day) {
        return false;
      }
      if (week <= 0) {
        return true;
      }
      return parseWeeks({ raw: slot.weeks }).includes(week);
    });

    // 同一门课重复排在同一天同一段时只算一次
    const uniqueKey = new Set<string>();
    const uniqueCourses = courses.filter((slot) => {
      const key = `${slot.name}|${slot.startPeriod}|${slot.endPeriod}`;
      if (uniqueKey.has(key)) {
        return false;
      }
      uniqueKey.add(key);
      return true;
    });

    const periods = uniqueCourses.reduce((sum, slot) => sum + Math.max(0, slot.endPeriod - slot.startPeriod + 1), 0);

    days.push({
      day,
      periods,
      minutes: periods * 45,
      courses: uniqueCourses.sort((a, b) => a.startPeriod - b.startPeriod),
    });
  }
  return days;
}

interface Interval {
  start: number
  end: number
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];

  sorted.forEach((interval) => {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
      return;
    }
    merged.push({ ...interval });
  });

  return merged;
}

export function computeFreeSlots({
  slots,
  periods,
  week = 0,
  minGapMinutes = 60,
}: {
  slots: ClassSlot[]
  periods: PeriodTime[]
  week?: number
  minGapMinutes?: number
}): FreeSlot[] {
  if (periods.length === 0) {
    return [];
  }

  const periodMap = new Map(periods.map(period => [period.index, period]));
  const windowStart = Math.min(...periods.map(period => timeToMinutes(period.start)));
  const windowEnd = Math.max(...periods.map(period => timeToMinutes(period.end)));
  const freeSlots: FreeSlot[] = [];

  for (let day = 1; day <= 7; day++) {
    const busy: Interval[] = slots
      .filter((slot) => {
        if (slot.day !== day) {
          return false;
        }
        return week <= 0 || parseWeeks({ raw: slot.weeks }).includes(week);
      })
      .map((slot) => {
        const startPeriod = periodMap.get(slot.startPeriod) ?? periods[0];
        const endPeriod = periodMap.get(slot.endPeriod) ?? periods[periods.length - 1];
        return {
          start: timeToMinutes(startPeriod.start),
          end: timeToMinutes(endPeriod.end),
        };
      });

    const merged = mergeIntervals(busy);
    const gaps: Interval[] = [];
    let cursor = windowStart;
    merged.forEach((interval) => {
      if (interval.start > cursor) {
        gaps.push({ start: cursor, end: interval.start });
      }
      cursor = Math.max(cursor, interval.end);
    });
    if (cursor < windowEnd) {
      gaps.push({ start: cursor, end: windowEnd });
    }

    gaps.forEach((gap) => {
      const minutes = gap.end - gap.start;
      freeSlots.push({
        day,
        start: minutesToTime(gap.start),
        end: minutesToTime(gap.end),
        minutes,
        usable: minutes >= minGapMinutes,
      });
    });
  }

  return freeSlots;
}

export function analyzeTimetable({
  slots,
  periods = DEFAULT_PERIODS,
  week = 0,
  minGapMinutes = 60,
  maxWeek = 30,
}: {
  slots: ClassSlot[]
  periods?: PeriodTime[]
  week?: number
  minGapMinutes?: number
  maxWeek?: number
}): TimetableAnalysis {
  const conflicts = findConflicts({ slots, maxWeek });
  const relevantConflicts = week <= 0 ? conflicts : conflicts.filter(conflict => conflict.weeks.includes(week));
  const dayLoads = computeDayLoads({ slots, week });
  const freeSlots = computeFreeSlots({ slots, periods, week, minGapMinutes });

  const totalPeriods = dayLoads.reduce((sum, day) => sum + day.periods, 0);
  const usableFree = freeSlots.filter(slot => slot.usable);
  const longest = [...usableFree].sort((a, b) => b.minutes - a.minutes)[0] ?? null;

  const weekFiltered = week <= 0
    ? slots
    : slots.filter(slot => parseWeeks({ raw: slot.weeks, maxWeek }).includes(week));
  const uniqueCourseNames = new Set(weekFiltered.map(slot => slot.name.trim()).filter(Boolean));

  return {
    conflicts: relevantConflicts,
    dayLoads,
    totalPeriods,
    totalMinutes: totalPeriods * 45,
    courseCount: uniqueCourseNames.size,
    freeSlots,
    usableFreeMinutes: usableFree.reduce((sum, slot) => sum + slot.minutes, 0),
    longestFreeSlot: longest,
    freeDays: dayLoads.filter(day => day.periods === 0).map(day => day.day),
  };
}

/** 找出「所有周次里都存在冲突」的周，用来定位最需要处理的排课问题 */
export function findConflictWeeks({ conflicts }: { conflicts: Conflict[] }): number[] {
  const counter = new Map<number, number>();
  conflicts.forEach((conflict) => {
    conflict.weeks.forEach((week) => {
      counter.set(week, (counter.get(week) ?? 0) + 1);
    });
  });

  return [...counter.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([week]) => week);
}

let slotIdSeed = 0;
export function createSlotId(): string {
  slotIdSeed += 1;
  return `s${Date.now().toString(36)}${slotIdSeed}`;
}

export interface GridCell {
  /** 该节次在课程块中的位置，用于画出连续的课程块 */
  position: 'none' | 'single' | 'start' | 'middle' | 'end'
  slot: ClassSlot | null
  /** 这一格里叠了几门课 */
  stackedCount: number
  /** 是否命中冲突 */
  conflicted: boolean
}

/** 生成周视图网格（列 = 周一…周日，行 = 节次） */
export function buildWeekGrid({
  slots,
  periods = DEFAULT_PERIODS,
  week = 0,
  conflictSlotIds = [],
}: {
  slots: ClassSlot[]
  periods?: PeriodTime[]
  week?: number
  conflictSlotIds?: string[]
}): GridCell[][] {
  const conflicted = new Set(conflictSlotIds);
  const maxPeriod = periods.length > 0 ? Math.max(...periods.map(period => period.index)) : 0;

  return Array.from({ length: 7 }, (_, dayIndex) => {
    const day = dayIndex + 1;
    const daySlots = slots.filter((slot) => {
      if (slot.day !== day) {
        return false;
      }
      return week <= 0 || parseWeeks({ raw: slot.weeks }).includes(week);
    });

    return Array.from({ length: maxPeriod }, (_, periodIndex) => {
      const period = periodIndex + 1;
      const covering = daySlots.filter(slot => period >= slot.startPeriod && period <= slot.endPeriod);

      if (covering.length === 0) {
        return { position: 'none', slot: null, stackedCount: 0, conflicted: false } as GridCell;
      }

      const primary = [...covering].sort((a, b) => a.startPeriod - b.startPeriod)[0];
      const isSingle = primary.startPeriod === primary.endPeriod;
      const position = ((): GridCell['position'] => {
        if (isSingle) {
          return 'single';
        }
        if (period === primary.startPeriod) {
          return 'start';
        }
        return period === primary.endPeriod ? 'end' : 'middle';
      })();

      return {
        position,
        slot: primary,
        stackedCount: covering.length,
        conflicted: covering.some(slot => conflicted.has(slot.id)),
      };
    });
  });
}

export function toTimetableText({ slots, periods = DEFAULT_PERIODS }: { slots: ClassSlot[]; periods?: PeriodTime[] }): string {
  const lines: string[] = ['# 课表分析结果', ''];

  lines.push('## 课程明细', '');
  lines.push('| 课程 | 星期 | 节次 | 时间 | 周次 | 地点 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  slots.forEach((slot) => {
    const start = periods.find(period => period.index === slot.startPeriod);
    const end = periods.find(period => period.index === slot.endPeriod);
    const time = start && end ? `${start.start}-${end.end}` : '—';
    lines.push(`| ${slot.name || '未命名'} | ${WEEK_DAY_LABELS[slot.day - 1] ?? slot.day} | ${slot.startPeriod}-${slot.endPeriod} 节 | ${time} | ${slot.weeks || '全部'} | ${slot.location || '—'} |`);
  });

  return lines.join('\n');
}
