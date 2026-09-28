# 校园工具箱 Campus Toolbox

> 一个开源的学生日常工具集合，基于 [IT-Tools](https://github.com/CorentinTh/it-tools)（Vue 3 + TypeScript，GPL-3.0）二次开发。

如果你也已经受够了这些场景：教务系统只能看不能算的绩点、Excel 里手动比对的课表冲突、
被学长学姐一句「格式不对」打回来的公文 —— 那这个项目就是为你做的。

**所有计算都在浏览器本地完成**，成绩单、课表、公文内容不上传任何服务器，断网也能用。

---

## 一、相比原项目做了什么

原项目 [IT-Tools](https://github.com/CorentinTh/it-tools) 是一个面向开发者的在线工具集
（90 个工具、40k+ Star、GPL-3.0）。它的架构是「一个工具 = 一个组件」，加工具成本很低，
但里面的工具对学生日常几乎用不上。

我们保留它的工程能力（Vue 3 + Naive UI + Vite + PWA + 多语言 + 命令面板 + 收藏夹），
把工具集重构成**校园场景**：

| 改造项 | 具体内容 |
| --- | --- |
| **新增工具分类** | 新增 `Campus / 校园` 分类，排在菜单第一位 |
| **新增 3 个校园工具** | GPA 换算器、课表冲突检测器、公文格式自检（原项目完全没有） |
| **中文本地化** | 站点标题、副标题、PWA 应用名、关于页面全量中文化；新增工具界面本身就是中文 |
| **离线可用** | 补全 PWA manifest（`zh-CN`、校园工具箱名称与描述），工具数据落地 localStorage，断网可用 |
| **品牌与来源** | 站点更名为「校园工具箱」，页脚保留 IT-Tools 原始版权与 GPL-3.0 声明 |
| **测试** | 为 3 个新工具的核心逻辑补齐单元测试，共 70+ 断言 |

### 新增工具一览

| 工具 | 路径 | 解决的问题 |
| --- | --- | --- |
| 加权平均分 / GPA 换算器 | `/gpa-calculator` | 同一份成绩单在不同算法下 GPA 能差 0.3+，保研 / 留学申请前必须先算准 |
| 课表冲突检测与空闲时段分析 | `/timetable-planner` | 选课时肉眼比对课表容易漏掉单双周重叠；也解决「我到底哪几个时段是空的」 |
| 公文格式自检 | `/official-document-checker` | 学生会 / 社团公文被退回来重改，绝大多数是标点、序号、日期这类硬伤 |

---

## 二、三个新工具为什么比同类网页工具好用

### 1. 加权平均分 / GPA 换算器

同类网页工具的通病是：**只实现一种算法**，而且默认它就是「标准答案」。
实际上国内高校的绩点规则千差万别，同一份成绩单在 4.0 / 4.5 / 5.0 / 加权百分制下
算出来的数能差 0.3 以上。

我们做了四件它们没做的事：

1. **算法可切换 + 对照展示**：选中一个算法后，下方同时给出全部内置算法下的 GPA，
   一眼看出「换算法会差多少」，避免拿错口径去填申请表。
2. **自定义分段表**：内置算法对不上本校教务处时，直接按「分数下限 绩点」逐行写规则，
   立刻得到本校口径的结果。
3. **粘贴导入**：从教务系统复制整张成绩单直接粘进来，自动识别
   `课程名,学分,成绩`、`课程名 成绩 学分` 等格式，等级制（A- / 优秀 / 合格）自动折算。
4. **目标反推**：输入目标 GPA 与剩余学分，直接告诉你「剩下这些课平均要考到多少分」，
   并判断目标是否已达上限不可达 —— 这是同类工具基本都没有的功能。

另外支持「不计入」勾选（缓考 / 免修 / 二专），以及 Markdown / CSV 导出。

### 2. 课表冲突检测与空闲时段分析

同类工具要么只画个课表格子，要么检测冲突时**不区分周次**，
把「周一 1-2 节单周」和「周一 1-2 节双周」判成冲突 —— 这恰恰是最常见的误报来源。

- **周次表达式全支持**：`1-16`、`1-8,10-16`、`1-16单`、`1-16双`、`全部`，
  冲突检测同时比对「星期 + 节次 + 周次」，只有三者都重叠才算冲突，并给出**重叠周次区间**。
- **空闲时段计算**：按你本校的作息时间表（可编辑，每行「开始-结束」）算出每天的空档，
  标注哪些空档 ≥ 阈值（默认 60 分钟）适合安排自习 / 兼职 / 社团。
- **周视图**：7 列 × 节次网格，多课叠在一格时直接标红并提示「叠了几门」。
- **负荷统计**：每周课时、上课时长、每日课时柱状图、工作日晚满课率、整天空闲的星期。

### 3. 公文格式自检

这类「中文公文校对」在线工具非常少，现有的多是收费的 Word 插件。
我们把它做成纯浏览器工具，规则依据 GB/T 9704-2012《党政机关公文格式》、
GB/T 15834《标点符号用法》、GB/T 15835《出版物上数字用法》。

检查项覆盖：标题（书名号 / 结尾标点 / 长度 / 文种）、主送机关、正文首行缩进、
层次序号（`一、` `（一）` `1.` `（1）` 的顺序、全角括号、顿号误用）、
半角标点混用、符号配对（书名号 / 括号 / 引号）、成文日期汉字数字、
发文机关署名、附件说明、结束语，以及「其它 / 帐 / 我司 / 盼复 / 截止 / 涉及到」等用词问题。

设计上刻意**宁可漏报、不可误报**：检查半角标点前会先屏蔽 URL、邮箱、小数和英文缩写，
所以「遵循 GPL-3.0 许可证，绩点 3.5」不会被误判。每条问题都给出行号、原文片段和修改建议，
并可一键导出 Markdown 检查报告。

---

## 三、快速开始

```bash
# 需要 Node.js 18+，包管理器用 pnpm（仓库锁定 pnpm@9.11.0）
pnpm install

pnpm dev        # 本地开发，默认 http://localhost:5173
pnpm build      # 类型检查 + 生产构建，产物在 dist/
pnpm preview    # 预览构建产物
pnpm test:unit  # 运行单元测试（含新增的 3 个工具的测试）
```

部署：`dist/` 是纯静态站点，扔到任意静态托管即可（Nginx / Vercel / GitHub Pages / 校园服务器）。
仓库自带 `Dockerfile` 与 `nginx.conf`，也可以 `docker build` 后用容器跑。

### 关于离线可用

项目内置 `vite-plugin-pwa`（`generateSW` 策略），构建时会预缓存全部静态资源并注册 Service Worker，
首次打开后即可断网使用。工具数据（成绩、课表、公文）存在浏览器 `localStorage`，刷新不丢。

---

## 四、目录结构（新增部分）

```
src/tools/
├── gpa-calculator/                    # 新增：加权平均分 / GPA 换算器
│   ├── index.ts                       # 工具注册（名称、路径、图标、关键词）
│   ├── gpa-calculator.vue             # 界面
│   ├── gpa-calculator.service.ts      # 纯函数：解析成绩、算法换算、目标反推
│   └── gpa-calculator.service.test.ts
├── timetable-planner/                 # 新增：课表冲突检测 + 空闲时段分析
│   ├── index.ts
│   ├── timetable-planner.vue
│   ├── timetable-planner.service.ts   # 周次解析、冲突检测、空档计算、周视图网格
│   └── timetable-planner.service.test.ts
└── official-document-checker/          # 新增：公文格式自检
    ├── index.ts
    ├── official-document-checker.vue
    ├── official-document-checker.service.ts
    └── official-document-checker.service.test.ts
```

业务逻辑全部抽到 `.service.ts` 纯函数里，和上游 IT-Tools 的做法保持一致：
界面只管交互，规则可单测、可复用。

---

## 五、开源许可（重要）

本项目是 [IT-Tools](https://github.com/CorentinTh/it-tools) 的**衍生作品**，
沿用上游的 **GNU General Public License v3.0**（见 [LICENSE](./LICENSE)）。

原项目版权归 Corentin Thomasset 及贡献者所有，我们的修改部分同样以 GPL-3.0 授权。

**GPL-3.0 具有传染性（copyleft）**，这意味着：

1. 只要本项目的修改版本被**分发或公开部署**（包括放到公网、发给同学用、部署到校园服务器），
   整体就必须继续以 GPL-3.0 授权开源；
2. **不能**把修改后的代码闭源，也不能改成 MIT / Apache 之类更宽松的协议；
3. 必须**保留**原始的版权声明、许可文本和来源说明（本仓库的 `LICENSE`、
   页脚与「关于」页面中的 IT-Tools 署名都不会删除）；
4. 衍生作品也必须向接收者提供完整源代码。

所以本仓库、以及基于本仓库再做的任何校园版本，都必须是开源的 —— 这也是我们选择
GPL 项目做二次开发时就已经接受的约束。

---

## 六、AI 使用说明

在本项目的改造过程中使用了 AI 编程助手（WorkBuddy / Claude 系列模型）辅助完成以下工作：

- **需求拆解与选题论证**：分析 IT-Tools 的工具体系与学生真实痛点的交集，确定三个新工具的方向；
- **代码生成**：新增的 3 个工具的组件、service 层与单元测试初稿由 AI 生成，再人工调整；
- **文案与文档**：README、项目策划书、路演 PPT 的初稿；
- **规则整理**：公文格式检查规则来自 GB/T 9704-2012 等公开标准，由 AI 整理为可执行规则后人工校验。

**人做的部分**：功能取舍与优先级、算法口径的选择与对照表设计、
「宁可漏报不可误报」这条原则的确定、AI 生成规则的逐条复核（例如把误报的
`GPL-3.0`、`3.5 学分` 从小数 / 缩写的误判中排除）、界面交互调整与最终验收。

---

## 七、竞赛交付材料

本项目为「校园工具箱」改造任务（开发者工具箱 → 校园工具箱）的成果，配套交付材料：

- **项目策划书（Word）**：选题论证、三个新工具要解决的真实问题、推广与运营方案、GPL-3.0 合规说明；
- **路演 PPT（PowerPoint）**：用于双创大赛路演的 15 页讲稿。

二进制材料随报名表单独提交，仓库内只保留可运行源码与设计说明，避免把大文件塞进 Git 历史。

---

## 八、鸣谢

- [IT-Tools](https://github.com/CorentinTh/it-tools) —— 本项目的基础框架与工具集，作者 Corentin Thomasset
- [Vue.js](https://vuejs.org/) / [Naive UI](https://www.naiveui.com/) / [Vite](https://vitejs.dev/) / [UnoCSS](https://unocss.dev/)
- 参与测试并提供反馈的同学

欢迎在 [Issues](https://github.com/wyh66649/it-tools/issues) 提需求和 Bug，
也欢迎直接提 PR 加你自己的校园工具 —— 加一个工具只需要新建一个目录。

---

## 附：上游 IT-Tools 原始说明

<details>
<summary>展开查看上游项目的自托管与开发说明（保留原文以便溯源）</summary>

<p align="center">
Useful tools for developer and people working in IT. <a href="https://it-tools.tech">Try it!</a>
</p>

### Functionalities and roadmap

Please check the [issues](https://github.com/CorentinTh/it-tools/issues) to see if some feature listed to be implemented.
You have an idea of a tool? Submit a [feature request](https://github.com/CorentinTh/it-tools/issues/new/choose)!

### Self host

```sh
# From docker hub
docker run -d --name it-tools --restart unless-stopped -p 8080:80 corentinth/it-tools:latest

# From github packages
docker run -d --name it-tools --restart unless-stopped -p 8080:80 ghcr.io/corentinth/it-tools:latest
```

### Contribute

```sh
pnpm install
pnpm dev
```

Adding a new tool is simple: create a folder in `src/tools`, add an `index.ts` with `defineTool(...)`
and a `.vue` component, then register it in `src/tools/index.ts`.

### License

This project is under the [GNU GPLv3](LICENSE).

</details>
