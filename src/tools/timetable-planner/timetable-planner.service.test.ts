import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERIODS,
  type ClassSlot,
  analyzeTimetable,
  buildWeekGrid,
  computeFreeSlots,
  createSlotId,
  findConflicts,
  formatDuration,
  formatWeeks,
  minutesToTime,
  parsePeriods,
  parseWeeks,
  timeToMinutes,
} from './timetable-planner.service';

function slot(partial: Partial<ClassSlot> & { name: string; day: number; startPeriod: number; endPeriod: number }): ClassSlot {
  return {
    id: createSlotId(),
    weeks: '1-16',
    location: '',
    ...partial,
  };
}

describe('timetable-planner / parseWeeks', () => {
  it('解析连续周次', () => {
    expect(parseWeeks({ raw: '1-16' })).toHaveLength(16);
    expect(parseWeeks({ raw: '1-4' })).toEqual([1, 2, 3, 4]);
  });

  it('解析不连续周次', () => {
    expect(parseWeeks({ raw: '1-3,8,10-11' })).toEqual([1, 2, 3, 8, 10, 11]);
    expect(parseWeeks({ raw: '1-3、8' })).toEqual([1, 2, 3, 8]);
  });

  it('支持单双周', () => {
    expect(parseWeeks({ raw: '1-8单' })).toEqual([1, 3, 5, 7]);
    expect(parseWeeks({ raw: '1-8双' })).toEqual([2, 4, 6, 8]);
  });

  it('空值与「全部」按整学期处理', () => {
    expect(parseWeeks({ raw: '', maxWeek: 20 })).toHaveLength(20);
    expect(parseWeeks({ raw: '全部', maxWeek: 20 })).toHaveLength(20);
  });

  it('忽略非法输入', () => {
    expect(parseWeeks({ raw: '第一周' })).toEqual([]);
  });
});

describe('timetable-planner / formatWeeks', () => {
  it('合并连续区间', () => {
    expect(formatWeeks({ weeks: [1, 2, 3, 5, 6] })).toBe('1-3、5-6 周');
    expect(formatWeeks({ weeks: [4] })).toBe('4 周');
    expect(formatWeeks({ weeks: [] })).toBe('—');
  });
});

describe('timetable-planner / 时间换算', () => {
  it('时间与分钟互转', () => {
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('08:30')).toBe(510);
    expect(minutesToTime(510)).toBe('08:30');
    expect(minutesToTime(22 * 60 + 20)).toBe('22:20');
  });

  it('时长格式化', () => {
    expect(formatDuration(45)).toBe('45 分钟');
    expect(formatDuration(120)).toBe('2 小时');
    expect(formatDuration(135)).toBe('2 小时 15 分');
  });

  it('作息表文本解析', () => {
    const periods = parsePeriods({ text: '08:00-08:45\n08:55-09:40\n' });
    expect(periods).toHaveLength(2);
    expect(periods[1]).toMatchObject({ index: 2, start: '08:55', end: '09:40' });
  });

  it('作息表为空时回退到默认值', () => {
    expect(parsePeriods({ text: '这是一行说明' })).toEqual(DEFAULT_PERIODS);
  });
});

describe('timetable-planner / findConflicts', () => {
  it('同一天节次重叠且周次相交 → 冲突', () => {
    const conflicts = findConflicts({
      slots: [
        slot({ name: '数据结构', day: 2, startPeriod: 3, endPeriod: 4 }),
        slot({ name: '计算机组成原理', day: 2, startPeriod: 3, endPeriod: 4 }),
      ],
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].weeks).toHaveLength(16);
    expect(conflicts[0].overlapPeriods).toEqual([3, 4]);
  });

  it('节次相邻不算冲突', () => {
    const conflicts = findConflicts({
      slots: [
        slot({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2 }),
        slot({ name: 'B', day: 1, startPeriod: 3, endPeriod: 4 }),
      ],
    });
    expect(conflicts).toHaveLength(0);
  });

  it('周次不相交不算冲突', () => {
    const conflicts = findConflicts({
      slots: [
        slot({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2, weeks: '1-8单' }),
        slot({ name: 'B', day: 1, startPeriod: 1, endPeriod: 2, weeks: '1-8双' }),
      ],
    });
    expect(conflicts).toHaveLength(0);
  });

  it('不同天不算冲突', () => {
    const conflicts = findConflicts({
      slots: [
        slot({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2 }),
        slot({ name: 'B', day: 3, startPeriod: 1, endPeriod: 2 }),
      ],
    });
    expect(conflicts).toHaveLength(0);
  });

  it('部分重叠也能识别，并给出重叠周次', () => {
    const conflicts = findConflicts({
      slots: [
        slot({ name: 'A', day: 4, startPeriod: 5, endPeriod: 7, weeks: '1-10' }),
        slot({ name: 'B', day: 4, startPeriod: 6, endPeriod: 8, weeks: '5-12' }),
      ],
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].weeks).toEqual([5, 6, 7, 8, 9, 10]);
  });
});

describe('timetable-planner / computeFreeSlots', () => {
  it('一天都没课时，整天都是空档', () => {
    const free = computeFreeSlots({ slots: [], periods: DEFAULT_PERIODS.slice(0, 4) });
    expect(free).toHaveLength(7);
    expect(free[0]).toMatchObject({ day: 1, start: '08:00', end: '11:40', minutes: 220 });
  });

  it('上课时间会从空档中挖掉', () => {
    const free = computeFreeSlots({
      slots: [slot({ name: '高数', day: 1, startPeriod: 1, endPeriod: 2 })],
      periods: DEFAULT_PERIODS.slice(0, 4),
    });

    const monday = free.filter(item => item.day === 1);
    expect(monday).toHaveLength(1);
    expect(monday[0]).toMatchObject({ start: '09:40', end: '11:40', minutes: 120 });
    expect(monday[0].usable).toBe(true);
  });

  it('空档时长低于阈值时不标记为可利用', () => {
    const free = computeFreeSlots({
      slots: [slot({ name: '高数', day: 1, startPeriod: 1, endPeriod: 1 })],
      periods: [
        { index: 1, start: '08:00', end: '08:45' },
        { index: 2, start: '09:00', end: '09:30' },
      ],
      minGapMinutes: 60,
    });

    const monday = free.filter(item => item.day === 1);
    expect(monday[0]).toMatchObject({ minutes: 45, usable: false });
  });

  it('指定周次时只统计该周有课的节次', () => {
    const free = computeFreeSlots({
      slots: [slot({ name: '单周课', day: 1, startPeriod: 1, endPeriod: 2, weeks: '1-16单' })],
      periods: DEFAULT_PERIODS.slice(0, 4),
      week: 2,
    });

    const monday = free.filter(item => item.day === 1);
    expect(monday).toHaveLength(1);
    expect(monday[0].start).toBe('08:00');
  });
});

describe('timetable-planner / analyzeTimetable', () => {
  const slots = [
    slot({ name: '高等数学', day: 1, startPeriod: 1, endPeriod: 2 }),
    slot({ name: '大学英语', day: 1, startPeriod: 3, endPeriod: 4 }),
    slot({ name: '数据结构', day: 2, startPeriod: 3, endPeriod: 4 }),
    slot({ name: '计算机组成原理', day: 2, startPeriod: 3, endPeriod: 4 }),
  ];

  it('汇总课时、冲突与空档', () => {
    const analysis = analyzeTimetable({ slots, periods: DEFAULT_PERIODS.slice(0, 4) });

    expect(analysis.conflicts).toHaveLength(1);
    // 周一 4 节 + 周二 4 节（周二两门课叠在一起，各算各的）
    expect(analysis.totalPeriods).toBe(8);
    expect(analysis.totalMinutes).toBe(360);
    expect(analysis.courseCount).toBe(4);
    expect(analysis.freeDays).toEqual([3, 4, 5, 6, 7]);
    expect(analysis.usableFreeMinutes).toBeGreaterThan(0);
    expect(analysis.longestFreeSlot).not.toBeNull();
  });

  it('只看某一周时冲突会被过滤掉', () => {
    const singleWeekSlots = [
      slot({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2, weeks: '1-2' }),
      slot({ name: 'B', day: 1, startPeriod: 2, endPeriod: 3, weeks: '2-4' }),
    ];

    // 两门课只在第 2 周同时存在
    expect(analyzeTimetable({ slots: singleWeekSlots, week: 1 }).conflicts).toHaveLength(0);
    expect(analyzeTimetable({ slots: singleWeekSlots, week: 2 }).conflicts).toHaveLength(1);
    expect(analyzeTimetable({ slots: singleWeekSlots, week: 3 }).conflicts).toHaveLength(0);
    expect(analyzeTimetable({ slots: singleWeekSlots, week: 3 }).totalPeriods).toBe(2);
  });
});

describe('timetable-planner / buildWeekGrid', () => {
  it('连续节次的课程会标出 start / middle / end', () => {
    const three = slot({ name: '高数', day: 1, startPeriod: 1, endPeriod: 3 });
    const grid = buildWeekGrid({ slots: [three], periods: DEFAULT_PERIODS.slice(0, 4) });

    expect(grid).toHaveLength(7);
    expect(grid[0][0]).toMatchObject({ position: 'start', slot: { name: '高数' } });
    expect(grid[0][1].position).toBe('middle');
    expect(grid[0][2].position).toBe('end');
    expect(grid[0][3].position).toBe('none');
    expect(grid[0][3].slot).toBeNull();
  });

  it('单节课标记为 single', () => {
    const one = slot({ name: '班会', day: 5, startPeriod: 2, endPeriod: 2 });
    const grid = buildWeekGrid({ slots: [one], periods: DEFAULT_PERIODS.slice(0, 4) });
    expect(grid[4][1].position).toBe('single');
  });

  it('叠课格会记下叠了几门并标记冲突', () => {
    const a = slot({ name: 'A', day: 2, startPeriod: 1, endPeriod: 2 });
    const b = slot({ name: 'B', day: 2, startPeriod: 1, endPeriod: 2 });
    const grid = buildWeekGrid({ slots: [a, b], periods: DEFAULT_PERIODS.slice(0, 4), conflictSlotIds: [a.id, b.id] });

    expect(grid[1][0].stackedCount).toBe(2);
    expect(grid[1][0].conflicted).toBe(true);
  });

  it('只看某一周时，其他周的课不会画出来', () => {
    const odd = slot({ name: '单周课', day: 1, startPeriod: 1, endPeriod: 2, weeks: '1-16单' });
    const grid = buildWeekGrid({ slots: [odd], periods: DEFAULT_PERIODS.slice(0, 4), week: 2 });
    expect(grid[0][0].position).toBe('none');
  });
});
