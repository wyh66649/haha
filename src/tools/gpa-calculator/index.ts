import { Math } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.gpa-calculator.title'),
  path: '/gpa-calculator',
  description: translate('tools.gpa-calculator.description'),
  keywords: [
    'gpa',
    '绩点',
    '学分绩点',
    '加权平均分',
    '平均学分绩',
    '成绩换算',
    '保研',
    'calculator',
    'grade',
    'credit',
  ],
  component: () => import('./gpa-calculator.vue'),
  icon: Math,
  createdAt: new Date('2026-09-28'),
});
