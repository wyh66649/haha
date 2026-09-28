import { Calendar } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.timetable-planner.title'),
  path: '/timetable-planner',
  description: translate('tools.timetable-planner.description'),
  keywords: [
    '课表',
    '课程表',
    '冲突检测',
    '空闲时间',
    '空档',
    '周次',
    '单双周',
    '选课',
    'timetable',
    'schedule',
    'conflict',
  ],
  component: () => import('./timetable-planner.vue'),
  icon: Calendar,
  createdAt: new Date('2026-09-28'),
});
