import { FileText } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.official-document-checker.title'),
  path: '/official-document-checker',
  description: translate('tools.official-document-checker.description'),
  keywords: [
    '公文',
    '公文格式',
    '格式自检',
    '党政机关公文格式',
    'gb/t 9704',
    '通知',
    '请示',
    '报告',
    '学生会',
    '文档校对',
    'official document',
    'proofread',
  ],
  component: () => import('./official-document-checker.vue'),
  icon: FileText,
  createdAt: new Date('2026-09-28'),
});
