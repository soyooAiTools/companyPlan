import {
  Activity,
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleUserRound,
  ClipboardList,
  FileImage,
  FileText,
  Gauge,
  LayoutDashboard,
  ListFilter,
  LockKeyhole,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  UsersRound,
  Workflow,
  X,
  Maximize2,
  Layers,
} from "lucide-react";
import { FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";

type RoleKey = "admin" | "producer" | "artist" | "ui" | "model" | "animator";
type ViewKey = "overview" | "projects" | "people" | "tickets" | "admin";
type SheetTab = "需求提单" | "延期任务预警" | "任务甘特图";
type TicketScope = "全部相关" | "我负责的" | "我的提单";
type Health = "green" | "amber" | "red";
type Discipline = "美术" | "UI" | "模型" | "动画" | "研发" | "音效";
type TicketStatus = "待接收" | "处理中" | "待验收" | "已完成" | "阻塞";
type TicketStatusFilter = TicketStatus | "全部" | "进行中";
type Priority = "P0" | "P1" | "P2";
type TicketAttachment = {
  id: string;
  name: string;
  kind: "图片" | "附件" | "文件";
  size: string;
};

type Person = {
  id: string;
  name: string;
  roleKey: RoleKey;
  title: string;
  discipline: Discipline | "管理" | "项目";
  capacity: number;
  completion: number;
  projectIds: string[];
};

type Project = {
  id: string;
  name: string;
  client: string;
  genre: string;
  channel: string;
  ownerId: string;
  status: string;
  phase: string;
  health: Health;
  progress: number;
  dueInDays: number;
  ticketCount: number;
  openTicketCount: number;
  teamIds: string[];
  disciplineProgress: Record<Discipline, number>;
  blocker: string;
};

type Ticket = {
  id: string;
  title: string;
  sourceProjectName?: string;
  projectId: string;
  requesterId: string;
  ownerId: string;
  discipline: Discipline;
  startAt: string;
  status: TicketStatus;
  priority: Priority;
  ageDays: number;
  statusAgeDays: number;
  dueInDays: number;
  timelineOffsetDays?: number;
  needType: string;
  summary: string;
  hyperlink?: string;
  text?: string;
  attachments?: TicketAttachment[];
};

type TicketBoardGroup = {
  label: string;
  tone: string;
  items: Ticket[];
};

const navItems: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "运营总览", icon: LayoutDashboard },
  { key: "projects", label: "项目池", icon: BriefcaseBusiness },
  { key: "people", label: "人员进度", icon: UsersRound },
  { key: "tickets", label: "需求提单", icon: ClipboardList },
  { key: "admin", label: "管理员", icon: ShieldCheck },
];

const sheetTabs: SheetTab[] = ["需求提单", "延期任务预警", "任务甘特图"];
const ticketScopeOptions: TicketScope[] = ["全部相关", "我负责的", "我的提单"];
const statusOptions: TicketStatus[] = ["待接收", "处理中", "待验收", "已完成", "阻塞"];
const disciplineOptions: Discipline[] = ["美术", "UI", "模型", "动画", "研发", "音效"];
const priorityOptions: Priority[] = ["P0", "P1", "P2"];
const ganttDayWidth = 18;
const ganttMaxOffsetDays = 18;

const people: Person[] = [
  {
    id: "u-admin",
    name: "林知远",
    roleKey: "admin",
    title: "运营管理员",
    discipline: "管理",
    capacity: 72,
    completion: 93,
    projectIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"],
  },
  {
    id: "u-producer",
    name: "周牧",
    roleKey: "producer",
    title: "项目负责人",
    discipline: "项目",
    capacity: 88,
    completion: 81,
    projectIds: ["p1", "p2", "p3", "p7"],
  },
  {
    id: "u-artist",
    name: "陈岚",
    roleKey: "artist",
    title: "美术主设",
    discipline: "美术",
    capacity: 91,
    completion: 76,
    projectIds: ["p1", "p4", "p6", "p8"],
  },
  {
    id: "u-ui",
    name: "何苗",
    roleKey: "ui",
    title: "UI 设计",
    discipline: "UI",
    capacity: 84,
    completion: 86,
    projectIds: ["p1", "p2", "p5", "p8"],
  },
  {
    id: "u-model",
    name: "顾远",
    roleKey: "model",
    title: "3D 模型",
    discipline: "模型",
    capacity: 96,
    completion: 69,
    projectIds: ["p1", "p3", "p4", "p6"],
  },
  {
    id: "u-animator",
    name: "许遥",
    roleKey: "animator",
    title: "动画设计",
    discipline: "动画",
    capacity: 79,
    completion: 88,
    projectIds: ["p1", "p5", "p7", "p8"],
  },
  {
    id: "u-dev",
    name: "姜北",
    roleKey: "producer",
    title: "Playable 开发",
    discipline: "研发",
    capacity: 87,
    completion: 82,
    projectIds: ["p1", "p2", "p6", "p7"],
  },
  {
    id: "u-sound",
    name: "宋栖",
    roleKey: "artist",
    title: "音效剪辑",
    discipline: "音效",
    capacity: 63,
    completion: 91,
    projectIds: ["p3", "p4", "p5"],
  },
];

const initialProjects: Project[] = [
  {
    id: "p1",
    name: "Neon Chef 试玩",
    client: "TopJoy Games",
    genre: "烹饪经营",
    channel: "Meta / TikTok",
    ownerId: "u-producer",
    status: "制作中",
    phase: "素材合流",
    health: "amber",
    progress: 68,
    dueInDays: 6,
    ticketCount: 34,
    openTicketCount: 11,
    teamIds: ["u-producer", "u-artist", "u-ui", "u-model", "u-animator", "u-dev"],
    disciplineProgress: { 美术: 72, UI: 80, 模型: 58, 动画: 64, 研发: 66, 音效: 20 },
    blocker: "模型低模包延迟，影响 6 个动画状态机",
  },
  {
    id: "p2",
    name: "Merge Manor A/B",
    client: "River Studio",
    genre: "合成装修",
    channel: "Applovin",
    ownerId: "u-producer",
    status: "制作中",
    phase: "交互开发",
    health: "green",
    progress: 82,
    dueInDays: 3,
    ticketCount: 27,
    openTicketCount: 5,
    teamIds: ["u-producer", "u-ui", "u-dev"],
    disciplineProgress: { 美术: 88, UI: 90, 模型: 0, 动画: 76, 研发: 78, 音效: 65 },
    blocker: "无",
  },
  {
    id: "p3",
    name: "Zombie Rush Lite",
    client: "ArcMint",
    genre: "塔防射击",
    channel: "Unity Ads",
    ownerId: "u-producer",
    status: "排期中",
    phase: "玩法拆解",
    health: "amber",
    progress: 34,
    dueInDays: 12,
    ticketCount: 18,
    openTicketCount: 9,
    teamIds: ["u-producer", "u-model", "u-sound"],
    disciplineProgress: { 美术: 42, UI: 24, 模型: 30, 动画: 22, 研发: 15, 音效: 55 },
    blocker: "客户脚本未确认，P0 开场镜头缺参考",
  },
  {
    id: "p4",
    name: "Farm Merge 4D",
    client: "Mocha Lab",
    genre: "合成农场",
    channel: "Meta",
    ownerId: "u-admin",
    status: "制作中",
    phase: "视觉定稿",
    health: "red",
    progress: 51,
    dueInDays: -2,
    ticketCount: 39,
    openTicketCount: 17,
    teamIds: ["u-artist", "u-model", "u-sound"],
    disciplineProgress: { 美术: 48, UI: 36, 模型: 44, 动画: 35, 研发: 20, 音效: 62 },
    blocker: "核心角色重设，已影响首版交付",
  },
  {
    id: "p5",
    name: "Pet Salon Quest",
    client: "NorthPlay",
    genre: "宠物养成",
    channel: "TikTok",
    ownerId: "u-admin",
    status: "待验收",
    phase: "QA 验收",
    health: "green",
    progress: 91,
    dueInDays: 1,
    ticketCount: 31,
    openTicketCount: 4,
    teamIds: ["u-ui", "u-animator", "u-sound"],
    disciplineProgress: { 美术: 95, UI: 92, 模型: 0, 动画: 88, 研发: 84, 音效: 93 },
    blocker: "无",
  },
  {
    id: "p6",
    name: "Idle Miner Sprint",
    client: "BlueTap",
    genre: "放置采矿",
    channel: "Google UAC",
    ownerId: "u-admin",
    status: "制作中",
    phase: "首版联调",
    health: "amber",
    progress: 59,
    dueInDays: 8,
    ticketCount: 22,
    openTicketCount: 8,
    teamIds: ["u-artist", "u-model", "u-dev"],
    disciplineProgress: { 美术: 66, UI: 52, 模型: 62, 动画: 40, 研发: 58, 音效: 0 },
    blocker: "资源命名规范未统一，联调返工较多",
  },
  {
    id: "p7",
    name: "Puzzle Cruise",
    client: "SailFox",
    genre: "三消冒险",
    channel: "Meta / Mintegral",
    ownerId: "u-producer",
    status: "制作中",
    phase: "动画打磨",
    health: "green",
    progress: 74,
    dueInDays: 7,
    ticketCount: 25,
    openTicketCount: 7,
    teamIds: ["u-producer", "u-animator", "u-dev"],
    disciplineProgress: { 美术: 85, UI: 79, 模型: 0, 动画: 71, 研发: 70, 音效: 62 },
    blocker: "无",
  },
  {
    id: "p8",
    name: "Royal Room Rescue",
    client: "Olive Games",
    genre: "找茬解谜",
    channel: "TikTok",
    ownerId: "u-admin",
    status: "立项",
    phase: "需求确认",
    health: "amber",
    progress: 19,
    dueInDays: 16,
    ticketCount: 12,
    openTicketCount: 10,
    teamIds: ["u-artist", "u-ui", "u-animator"],
    disciplineProgress: { 美术: 18, UI: 26, 模型: 0, 动画: 10, 研发: 0, 音效: 0 },
    blocker: "素材版权清单待客户回传",
  },
];

const baseTickets: Ticket[] = [
  {
    id: "UI-2406-066",
    title: "主界面 3D 图标补模型",
    sourceProjectName: "小主厨解锁餐厅 - ttwj",
    projectId: "p1",
    requesterId: "u-ui",
    ownerId: "u-model",
    discipline: "模型",
    startAt: "2026/06/12 16:20",
    status: "待接收",
    priority: "P1",
    ageDays: 0,
    statusAgeDays: 0,
    dueInDays: 2,
    needType: "模型",
    summary: "UI 侧需要一个低面数 3D 餐厅图标，供主界面入口使用。",
    text: "我提给模型同事",
    attachments: [{ id: "att-ui-66-1", name: "icon_blockout.png", kind: "图片", size: "680 KB" }],
  },
  {
    id: "UI-2406-065",
    title: "截图",
    sourceProjectName: "陨石袭击野牛冲撞塔防版 - fnd",
    projectId: "p1",
    requesterId: "u-producer",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/12 14:33",
    status: "处理中",
    priority: "P1",
    ageDays: 0,
    statusAgeDays: 0,
    dueInDays: 2,
    needType: "UI",
    summary: "按新版本玩法补充截图素材，供同事对照制作。",
    hyperlink: "https://www.kdocs.cn/l/cqJCOLkt7Na0",
    text: "参考图优先级高",
    attachments: [
      { id: "att-ui-65-1", name: "ui_ref_screenshot.png", kind: "图片", size: "1.2 MB" },
    ],
  },
  {
    id: "UI-2406-064",
    title: "多语言 + 截图",
    sourceProjectName: "回收子弹 - fnd",
    projectId: "p3",
    requesterId: "u-producer",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/12 13:30",
    status: "处理中",
    priority: "P1",
    ageDays: 0,
    statusAgeDays: 0,
    dueInDays: 2,
    needType: "UI",
    summary: "多语言文案、按钮和界面截图一起补齐。",
    text: "先出英文和中文",
    attachments: [{ id: "att-ui-64-1", name: "language_pack.xlsx", kind: "文件", size: "86 KB" }],
  },
  {
    id: "UI-2406-063",
    title: "资源入库",
    sourceProjectName: "选国家发展 - mars",
    projectId: "p4",
    requesterId: "u-admin",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/11 13:01",
    status: "处理中",
    priority: "P1",
    ageDays: 1,
    statusAgeDays: 1,
    dueInDays: 2,
    needType: "UI",
    summary: "整理国家选择、发展阶段相关 UI 资产并入库。",
    text: "截图参考表第 1 行",
    attachments: [
      { id: "att-ui-63-1", name: "country_ui_ref.png", kind: "图片", size: "930 KB" },
    ],
  },
  {
    id: "UI-2406-062",
    title: "按钮态和结算页截图",
    sourceProjectName: "部落冲突 - koa",
    projectId: "p2",
    requesterId: "u-producer",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/11 14:06",
    status: "处理中",
    priority: "P1",
    ageDays: 1,
    statusAgeDays: 1,
    dueInDays: 2,
    needType: "UI",
    summary: "补齐战斗按钮态、结算弹窗和基础截图。",
    text: "需要和玩法镜头一致",
    attachments: [{ id: "att-ui-62-1", name: "clash_ui_refs.zip", kind: "文件", size: "8.5 MB" }],
  },
  {
    id: "UI-2406-061",
    title: "卖水杀敌 UI 调整",
    sourceProjectName: "卖水杀敌 - fnd",
    projectId: "p6",
    requesterId: "u-producer",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/11 14:07",
    status: "处理中",
    priority: "P1",
    ageDays: 1,
    statusAgeDays: 1,
    dueInDays: 2,
    needType: "UI",
    summary: "补充售卖流程、杀敌反馈、道具按钮的界面图。",
    text: "注意尺寸统一",
  },
  {
    id: "UI-2406-060",
    title: "渠道包 UI 适配",
    sourceProjectName: "机动组_补渠道",
    projectId: "p1",
    requesterId: "u-producer",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/11 15:05",
    status: "处理中",
    priority: "P1",
    ageDays: 1,
    statusAgeDays: 1,
    dueInDays: 2,
    needType: "UI",
    summary: "按新增渠道补全入口、落地页和 CTA 适配。",
    hyperlink: "svn://47.101.191.213:3690/uiRepo",
  },
  {
    id: "UI-2406-059",
    title: "截图与基础按钮",
    sourceProjectName: "608PA01 - dawnwatch",
    projectId: "p7",
    requesterId: "u-producer",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/12 10:11",
    status: "处理中",
    priority: "P1",
    ageDays: 0,
    statusAgeDays: 0,
    dueInDays: 2,
    needType: "UI",
    summary: "补齐首屏截图和基础按钮态，供投放版使用。",
    attachments: [{ id: "att-ui-59-1", name: "dawnwatch_ui.png", kind: "图片", size: "1.6 MB" }],
  },
  {
    id: "UI-2406-058",
    title: "截图标注",
    sourceProjectName: "112A - jx",
    projectId: "p5",
    requesterId: "u-producer",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/12 10:32",
    status: "处理中",
    priority: "P1",
    ageDays: 0,
    statusAgeDays: 0,
    dueInDays: 2,
    needType: "UI",
    summary: "按关卡流程补截图标注，明确弹窗和点击区域。",
    attachments: [{ id: "att-ui-58-1", name: "112a_note.png", kind: "图片", size: "720 KB" }],
  },
  {
    id: "UI-2406-057",
    title: "确认弹窗和失败页",
    sourceProjectName: "清洗菌毯 - fnd",
    projectId: "p8",
    requesterId: "u-producer",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/12 13:30",
    status: "处理中",
    priority: "P1",
    ageDays: 0,
    statusAgeDays: 0,
    dueInDays: 2,
    needType: "UI",
    summary: "清洗流程的确认弹窗、失败页和重试按钮。",
    text: "参考表第 7 行",
  },
  {
    id: "UI-2406-056",
    title: "剧情选择页补图",
    sourceProjectName: "剧情不选择 - mt",
    projectId: "p3",
    requesterId: "u-producer",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/12 15:20",
    status: "待接收",
    priority: "P2",
    ageDays: 0,
    statusAgeDays: 0,
    dueInDays: 3,
    needType: "UI",
    summary: "剧情分支选择页补充不选择状态的按钮图。",
  },
  {
    id: "UI-2406-055",
    title: "老鼠针界面整理",
    sourceProjectName: "老鼠针 - zyy",
    projectId: "p4",
    requesterId: "u-admin",
    ownerId: "u-ui",
    discipline: "UI",
    startAt: "2026/06/12 16:00",
    status: "已完成",
    priority: "P2",
    ageDays: 1,
    statusAgeDays: 1,
    dueInDays: 1,
    needType: "UI",
    summary: "整理完成，已同步到 UI 资产库。",
    attachments: [{ id: "att-ui-55-1", name: "mouse_needle_final.fig", kind: "文件", size: "3.4 MB" }],
  },
];

const scaledTicketTitles: Array<{
  title: string;
  discipline: Discipline;
  needType: string;
  ownerId: string;
  requesterId: string;
  summary: string;
}> = [
  {
    title: "资产入库",
    discipline: "模型",
    needType: "模型",
    ownerId: "u-model",
    requesterId: "u-producer",
    summary: "整理模型资产、贴图命名和入库目录，供后续动画与开发调用。",
  },
  {
    title: "按钮态补齐",
    discipline: "UI",
    needType: "UI",
    ownerId: "u-ui",
    requesterId: "u-producer",
    summary: "补齐普通、按下、不可点击和高亮状态，统一输出到 UI 资产库。",
  },
  {
    title: "角色减面",
    discipline: "美术",
    needType: "美术",
    ownerId: "u-artist",
    requesterId: "u-producer",
    summary: "根据试玩包体限制压缩角色面数，保留主视角识别度。",
  },
  {
    title: "入场动画调整",
    discipline: "动画",
    needType: "动画",
    ownerId: "u-animator",
    requesterId: "u-ui",
    summary: "调整入场节奏、暂停点和按钮出现时间，配合首屏引导。",
  },
  {
    title: "交互点击区修正",
    discipline: "研发",
    needType: "研发",
    ownerId: "u-dev",
    requesterId: "u-ui",
    summary: "根据 UI 标注修正点击热区、引导遮罩和失败页跳转。",
  },
  {
    title: "音效替换",
    discipline: "音效",
    needType: "音效",
    ownerId: "u-sound",
    requesterId: "u-producer",
    summary: "替换点击、奖励、失败和转场音效，保持平台音量一致。",
  },
  {
    title: "UI 截图标注",
    discipline: "UI",
    needType: "UI",
    ownerId: "u-ui",
    requesterId: "u-model",
    summary: "按最新流程补标注截图，说明模型资源在界面中的摆放比例。",
  },
  {
    title: "低模图标补做",
    discipline: "模型",
    needType: "模型",
    ownerId: "u-model",
    requesterId: "u-ui",
    summary: "补一个低面数图标模型，用于主界面入口和奖励弹窗。",
  },
];

const scaledSourceNames = [
  "甜品工厂 - fnd",
  "花园救援 - zyy",
  "小主厨解锁餐厅 - ttwj",
  "怪物冲刺 - mars",
  "太空温泉 - fnd",
  "消消乐餐厅 - mt",
  "合成小岛 - koa",
  "矿车大亨 - jx",
  "宠物美容院 - bzg",
  "国王房间逃脱 - twj",
  "清洗菌毯 - fnd",
  "回收子弹 - fnd",
];

const scaledStatuses: TicketStatus[] = [
  "待接收",
  "处理中",
  "处理中",
  "待验收",
  "处理中",
  "已完成",
  "阻塞",
  "处理中",
];

function createScaledTickets(count = 72): Ticket[] {
  return Array.from({ length: count }, (_, index) => {
    const template = scaledTicketTitles[index % scaledTicketTitles.length];
    const project = initialProjects[index % initialProjects.length];
    const status = scaledStatuses[index % scaledStatuses.length];
    const hasAttachment = index % 3 === 0;
    const hasLink = index % 5 === 0;
    const ageDays = status === "已完成" ? 1 + (index % 3) : index % 9;
    const statusAgeDays = status === "待接收" ? index % 4 : index % 6;

    return {
      id: `REQ-2406-${String(120 + index).padStart(3, "0")}`,
      title: template.title,
      sourceProjectName: scaledSourceNames[index % scaledSourceNames.length],
      projectId: project.id,
      requesterId: template.requesterId,
      ownerId: template.ownerId,
      discipline: template.discipline,
      startAt: `2026/06/${String(10 + (index % 3)).padStart(2, "0")} ${String(9 + (index % 9)).padStart(2, "0")}:${index % 2 === 0 ? "30" : "05"}`,
      status,
      priority: index % 11 === 0 ? "P0" : index % 4 === 0 ? "P2" : "P1",
      ageDays,
      statusAgeDays,
      dueInDays: status === "阻塞" ? -1 : 1 + (index % 5),
      needType: template.needType,
      summary: template.summary,
      hyperlink: hasLink ? "svn://47.101.191.213:3690/playableAssets" : undefined,
      text: index % 4 === 0 ? "需要同步给上下游确认" : index % 4 === 1 ? "参考上一版投放素材" : "-",
      attachments: hasAttachment
        ? [
            {
              id: `att-scaled-${index}`,
              name: `${template.needType.toLowerCase()}_ref_${index + 1}.png`,
              kind: index % 2 === 0 ? "图片" : index % 5 === 0 ? "文件" : "附件",
              size: `${680 + index * 12} KB`,
            },
          ]
        : undefined,
    };
  });
}

const initialTickets: Ticket[] = [...baseTickets, ...createScaledTickets()];

const accounts = people.filter((person) =>
  ["admin", "producer", "artist", "ui", "model", "animator"].includes(person.roleKey)
);

const statusTone: Record<TicketStatus, string> = {
  待接收: "tone-slate",
  处理中: "tone-blue",
  待验收: "tone-violet",
  已完成: "tone-green",
  阻塞: "tone-red",
};

const healthLabel: Record<Health, string> = {
  green: "正常",
  amber: "关注",
  red: "风险",
};

const healthTone: Record<Health, string> = {
  green: "tone-green",
  amber: "tone-amber",
  red: "tone-red",
};

const roleLabel: Record<RoleKey, string> = {
  admin: "管理员",
  producer: "项目负责人",
  artist: "美术",
  ui: "UI",
  model: "模型",
  animator: "动画",
};

function App() {
  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [accountId, setAccountId] = useState("u-admin");
  const [selectedProjectId, setSelectedProjectId] = useState("p1");
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>("全部");
  const [disciplineFilter, setDisciplineFilter] = useState<Discipline | "全部">("全部");
  const [projectFilter, setProjectFilter] = useState<string>("全部");
  const [ownerFilter, setOwnerFilter] = useState<string>("全部");
  const [ticketScope, setTicketScope] = useState<TicketScope>("全部相关");
  const [isTicketFormOpen, setIsTicketFormOpen] = useState(false);

  const currentUser = people.find((person) => person.id === accountId) ?? people[0];
  const effectiveView: ViewKey = currentUser.roleKey === "admin" ? activeView : "tickets";
  const accessibleNavItems =
    currentUser.roleKey === "admin" ? navItems : navItems.filter((item) => item.key === "tickets");
  const visibleProjectIds = useMemo(() => {
    if (currentUser.roleKey === "admin") return initialProjects.map((project) => project.id);
    return initialProjects
      .filter((project) => project.ownerId === currentUser.id || project.teamIds.includes(currentUser.id))
      .map((project) => project.id);
  }, [currentUser]);

  const visibleProjects = useMemo(
    () => initialProjects.filter((project) => visibleProjectIds.includes(project.id)),
    [visibleProjectIds]
  );

  const selectedProject =
    visibleProjects.find((project) => project.id === selectedProjectId) ?? visibleProjects[0];

  const visiblePeople = useMemo(() => {
    const projectSet = new Set(visibleProjectIds);
    return people.filter(
      (person) => person.id === currentUser.id || person.projectIds.some((id) => projectSet.has(id))
    );
  }, [currentUser.id, visibleProjectIds]);

  const scopedTickets = useMemo(
    () =>
      tickets.filter((ticket) => {
        if (currentUser.roleKey === "admin") return true;
        if (currentUser.roleKey !== "producer") {
          return ticket.ownerId === currentUser.id || ticket.requesterId === currentUser.id;
        }
        return (
          visibleProjectIds.includes(ticket.projectId) ||
          ticket.ownerId === currentUser.id ||
          ticket.requesterId === currentUser.id
        );
      }),
    [currentUser.id, currentUser.roleKey, tickets, visibleProjectIds]
  );

  const ownerFilterOptions = useMemo(() => {
    const ownerIds = new Set(scopedTickets.map((ticket) => ticket.ownerId));
    return people.filter((person) => ownerIds.has(person.id));
  }, [scopedTickets]);

  const ticketsBeforeStatusFilter = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return scopedTickets.filter((ticket) => {
      const project = initialProjects.find((item) => item.id === ticket.projectId);
      const owner = people.find((person) => person.id === ticket.ownerId);
      const matchesScope =
        ticketScope === "全部相关" ||
        (ticketScope === "我负责的" && ticket.ownerId === currentUser.id) ||
        (ticketScope === "我的提单" && ticket.requesterId === currentUser.id);
      const matchesQuery =
        !lowered ||
        ticket.title.toLowerCase().includes(lowered) ||
        ticket.id.toLowerCase().includes(lowered) ||
        project?.name.toLowerCase().includes(lowered) ||
        ticket.sourceProjectName?.toLowerCase().includes(lowered) ||
        owner?.name.toLowerCase().includes(lowered);

      return (
        matchesScope &&
        matchesQuery &&
        (disciplineFilter === "全部" || ticket.discipline === disciplineFilter) &&
        (projectFilter === "全部" || ticket.projectId === projectFilter) &&
        (ownerFilter === "全部" || ticket.ownerId === ownerFilter)
      );
    });
  }, [currentUser.id, disciplineFilter, ownerFilter, projectFilter, query, scopedTickets, ticketScope]);

  const filteredTickets = useMemo(
    () => ticketsBeforeStatusFilter.filter((ticket) => matchesStatusFilter(ticket, statusFilter)),
    [statusFilter, ticketsBeforeStatusFilter]
  );

  const metrics = useMemo(() => {
    const riskProjects = visibleProjects.filter((project) => project.health !== "green").length;
    const openTickets = scopedTickets.filter((ticket) => ticket.status !== "已完成").length;
    const agedTickets = scopedTickets.filter((ticket) => ticket.status !== "已完成" && ticket.ageDays >= 5).length;
    const averageProgress = Math.round(
      visibleProjects.reduce((sum, project) => sum + project.progress, 0) / Math.max(visibleProjects.length, 1)
    );

    return { riskProjects, openTickets, agedTickets, averageProgress };
  }, [scopedTickets, visibleProjects]);

  function updateTicketStatus(ticketId: string, status: TicketStatus) {
    setTickets((items) =>
      items.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              status,
              statusAgeDays: status === ticket.status ? ticket.statusAgeDays : 0,
            }
          : ticket
      )
    );
  }

  function updateTicketTimeline(ticketId: string, offsetDays: number) {
    setTickets((items) =>
      items.map((ticket) => {
        if (ticket.id !== ticketId) return ticket;

        const nextOffsetDays = clampGanttOffsetDays(offsetDays);
        const deltaDays = nextOffsetDays - getGanttOffsetDays(ticket);

        return {
          ...ticket,
          startAt: shiftDateTimeByDays(ticket.startAt, deltaDays),
          timelineOffsetDays: nextOffsetDays,
        };
      })
    );
  }

  function createTicket(ticket: Omit<Ticket, "id" | "ageDays" | "statusAgeDays" | "status" | "startAt">) {
    const nextNumber = 119 + tickets.length;
    setTickets((items) => [
      {
        ...ticket,
        id: `REQ-2406-${nextNumber}`,
        startAt: formatNowDateTime(),
        status: "待接收",
        ageDays: 0,
        statusAgeDays: 0,
      },
      ...items,
    ]);
    setActiveView("tickets");
    setIsTicketFormOpen(false);
  }

  function changeAccount(nextAccountId: string) {
    setAccountId(nextAccountId);
    setQuery("");
    setStatusFilter("全部");
    setDisciplineFilter("全部");
    setProjectFilter("全部");
    setOwnerFilter("全部");
    setTicketScope("全部相关");
    setIsTicketFormOpen(false);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">PO</div>
          <div>
            <strong>PlayableOps</strong>
            <span>试玩广告生产中台</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {accessibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`nav-button ${effectiveView === item.key ? "active" : ""}`}
                onClick={() => setActiveView(item.key)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="scope-panel">
          <span className="eyebrow">当前账号</span>
          <select value={accountId} onChange={(event) => changeAccount(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {roleLabel[account.roleKey]}
              </option>
            ))}
          </select>
          <div className="scope-line">
            <LockKeyhole size={15} />
            <span>{currentUser.roleKey === "admin" ? "全公司项目" : "仅可查看需求提单页"}</span>
          </div>
        </div>
      </aside>

      <main className={`workspace ${effectiveView === "tickets" ? "sheet-workspace" : ""}`}>
        {effectiveView !== "tickets" && (
          <header className="topbar">
            <div>
              <span className="eyebrow">试玩广告制作 · 2026-06</span>
              <h1>{navItems.find((item) => item.key === effectiveView)?.label}</h1>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" title="筛选">
                <SlidersHorizontal size={18} />
              </button>
              <button className="primary-button" onClick={() => setIsTicketFormOpen(true)}>
                <Plus size={18} />
                <span>新建提单</span>
              </button>
            </div>
          </header>
        )}

        {effectiveView === "overview" && (
          <Overview
            currentUser={currentUser}
            metrics={metrics}
            projects={visibleProjects}
            selectedProject={selectedProject}
            tickets={scopedTickets}
            people={visiblePeople}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              setActiveView("projects");
            }}
          />
        )}

        {effectiveView === "projects" && (
          <ProjectsView
            currentUser={currentUser}
            projects={visibleProjects}
            people={visiblePeople}
            selectedProject={selectedProject}
            tickets={scopedTickets}
            onSelectProject={setSelectedProjectId}
          />
        )}

        {effectiveView === "people" && (
          <PeopleView projects={visibleProjects} people={visiblePeople} tickets={scopedTickets} />
        )}

        {effectiveView === "tickets" && (
          <TicketsView
            currentUser={currentUser}
            projects={visibleProjects}
            people={people}
            query={query}
            setQuery={setQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            disciplineFilter={disciplineFilter}
            setDisciplineFilter={setDisciplineFilter}
            projectFilter={projectFilter}
            setProjectFilter={setProjectFilter}
            ownerFilter={ownerFilter}
            setOwnerFilter={setOwnerFilter}
            ownerOptions={ownerFilterOptions}
            ticketScope={ticketScope}
            setTicketScope={setTicketScope}
            tickets={filteredTickets}
            statusSummaryTickets={ticketsBeforeStatusFilter}
            onStatusChange={updateTicketStatus}
            onTimelineMove={updateTicketTimeline}
            onCreateTicket={() => setIsTicketFormOpen(true)}
          />
        )}

        {effectiveView === "admin" && (
          <AdminView
            currentUser={currentUser}
            projects={initialProjects}
            people={people}
            tickets={tickets}
            onSwitchAdmin={() => changeAccount("u-admin")}
          />
        )}
      </main>

      {isTicketFormOpen && (
        <TicketForm
          currentUser={currentUser}
          projects={visibleProjects}
          people={visiblePeople}
          onClose={() => setIsTicketFormOpen(false)}
          onCreate={createTicket}
        />
      )}
    </div>
  );
}

function Overview({
  currentUser,
  metrics,
  projects,
  selectedProject,
  tickets,
  people,
  onSelectProject,
}: {
  currentUser: Person;
  metrics: {
    riskProjects: number;
    openTickets: number;
    agedTickets: number;
    averageProgress: number;
  };
  projects: Project[];
  selectedProject?: Project;
  tickets: Ticket[];
  people: Person[];
  onSelectProject: (id: string) => void;
}) {
  const urgentTickets = tickets
    .filter((ticket) => ticket.status !== "已完成")
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 5);

  return (
    <section className="view-stack">
      <div className="kpi-grid">
        <MetricCard icon={BriefcaseBusiness} label="可见项目" value={projects.length} helper="按账号权限过滤" />
        <MetricCard icon={AlertTriangle} label="风险项目" value={metrics.riskProjects} helper="关注与红灯项目" tone="risk" />
        <MetricCard icon={ClipboardList} label="未完成提单" value={metrics.openTickets} helper={`${metrics.agedTickets} 个超过 5 天`} />
        <MetricCard icon={Gauge} label="平均进度" value={`${metrics.averageProgress}%`} helper={currentUser.title} tone="progress" />
      </div>

      <section className="table-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">项目情况表</span>
            <h2>{currentUser.roleKey === "admin" ? "全局项目总表" : `${currentUser.name} 的项目`}</h2>
          </div>
          <Activity size={20} />
        </div>
        <ProjectSituationTable
          currentUser={currentUser}
          onSelectProject={onSelectProject}
          people={people}
          projects={projects}
          selectedProject={selectedProject}
          tickets={tickets}
        />
      </section>

      <div className="overview-grid single-side">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">提单天数</span>
              <h2>高优先级队列</h2>
            </div>
            <Timer size={20} />
          </div>
          <div className="ticket-stack">
            {urgentTickets.map((ticket) => (
              <TicketMiniCard key={ticket.id} ticket={ticket} people={people} projects={projects} />
            ))}
          </div>
        </section>
      </div>

      {selectedProject && (
        <ProjectDetail project={selectedProject} tickets={tickets} people={people} compact={false} />
      )}
    </section>
  );
}

function ProjectsView({
  currentUser,
  projects,
  people,
  selectedProject,
  tickets,
  onSelectProject,
}: {
  currentUser: Person;
  projects: Project[];
  people: Person[];
  selectedProject?: Project;
  tickets: Ticket[];
  onSelectProject: (id: string) => void;
}) {
  return (
    <section className="view-stack">
      <div className="table-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">项目池</span>
            <h2>项目进度与风险表</h2>
          </div>
          <ListFilter size={20} />
        </div>
        <ProjectSituationTable
          currentUser={currentUser}
          onSelectProject={onSelectProject}
          people={people}
          projects={projects}
          selectedProject={selectedProject}
          tickets={tickets}
        />
      </div>

      {selectedProject && <ProjectDetail project={selectedProject} tickets={tickets} people={people} compact={false} />}
    </section>
  );
}

function ProjectSituationTable({
  currentUser,
  projects,
  people,
  tickets,
  selectedProject,
  onSelectProject,
}: {
  currentUser: Person;
  projects: Project[];
  people: Person[];
  tickets: Ticket[];
  selectedProject?: Project;
  onSelectProject: (id: string) => void;
}) {
  return (
    <div className="project-situation-table">
      <div className="project-situation-head">
        <span>项目名称</span>
        <span>当前阶段</span>
        <span>我的职责</span>
        <span>我的环节</span>
        <span>协作人员</span>
        <span>需求提单</span>
        <span>风险/阻塞</span>
        <span>交付</span>
      </div>
      {projects.map((project) => {
        const owner = people.find((person) => person.id === project.ownerId) ?? people.find((person) => person.id === "u-admin");
        const projectTickets = tickets.filter((ticket) => ticket.projectId === project.id);
        const openTickets = projectTickets.filter((ticket) => ticket.status !== "已完成");
        const overdueTickets = openTickets.filter((ticket) => ticket.dueInDays < 0 || ticket.ageDays >= 5);
        const team = people.filter((person) => project.teamIds.includes(person.id));
        const relation =
          currentUser.roleKey === "admin"
            ? "管理员视图"
            : project.ownerId === currentUser.id
              ? "项目负责人"
              : project.teamIds.includes(currentUser.id)
                ? `${currentUser.discipline}执行`
                : "无权限";
        const myProgress =
          currentUser.discipline !== "管理" && currentUser.discipline !== "项目"
            ? project.disciplineProgress[currentUser.discipline] ?? 0
            : project.progress;

        return (
          <button
            className={`project-situation-row ${selectedProject?.id === project.id ? "selected" : ""}`}
            key={project.id}
            onClick={() => onSelectProject(project.id)}
          >
            <span className="table-main-cell">
              <strong>{project.name}</strong>
              <small>{project.client} · {project.genre} · {project.channel}</small>
            </span>
            <span>
              <i className={`dot dot-${project.health}`} />
              {project.status} · {project.phase}
            </span>
            <span>
              <strong>{relation}</strong>
              <small>负责人：{owner?.name ?? "-"}</small>
            </span>
            <span>
              <b>{myProgress}%</b>
              <ProgressLine value={myProgress} />
            </span>
            <span>
              <strong>{team.length} 人</strong>
              <small>{team.slice(0, 3).map((person) => person.name).join("、")}{team.length > 3 ? " 等" : ""}</small>
            </span>
            <span>
              <strong>{openTickets.length}/{projectTickets.length}</strong>
              <small>{overdueTickets.length} 个超时/逾期</small>
            </span>
            <span>
              <span className={`pill ${healthTone[project.health]}`}>{healthLabel[project.health]}</span>
              <small>{project.blocker}</small>
            </span>
            <span className={project.dueInDays < 0 ? "danger-text" : ""}>{formatDue(project.dueInDays)}</span>
          </button>
        );
      })}
    </div>
  );
}

function PeopleView({ projects, people, tickets }: { projects: Project[]; people: Person[]; tickets: Ticket[] }) {
  const visibleProjectIds = projects.map((project) => project.id);

  return (
    <section className="view-stack">
      <div className="people-grid">
        {people.map((person) => {
          const ownedOpenTickets = tickets.filter(
            (ticket) => ticket.ownerId === person.id && ticket.status !== "已完成"
          ).length;
          return (
            <article className="person-card" key={person.id}>
              <div className="avatar-line">
                <div className="avatar">{person.name.slice(0, 1)}</div>
                <div>
                  <strong>{person.name}</strong>
                  <span>{person.title}</span>
                </div>
              </div>
              <div className="person-stats">
                <span>负载 {person.capacity}%</span>
                <span>完成 {person.completion}%</span>
                <span>待办 {ownedOpenTickets}</span>
              </div>
              <ProgressLine value={person.capacity} />
            </article>
          );
        })}
      </div>

      <section className="table-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">协作矩阵</span>
            <h2>人员 × 项目进度</h2>
          </div>
          <UsersRound size={20} />
        </div>
        <div className="matrix">
          <div className="matrix-head">
            <span>成员</span>
            {projects.slice(0, 6).map((project) => (
              <span key={project.id}>{project.name}</span>
            ))}
          </div>
          {people.map((person) => (
            <div className="matrix-row" key={person.id}>
              <span>
                <strong>{person.name}</strong>
                <small>{person.discipline}</small>
              </span>
              {visibleProjectIds.slice(0, 6).map((projectId) => {
                const project = projects.find((item) => item.id === projectId);
                const value =
                  project && person.projectIds.includes(projectId) && person.discipline in project.disciplineProgress
                    ? project.disciplineProgress[person.discipline as Discipline]
                    : 0;
                return (
                  <span className={value ? "matrix-cell active" : "matrix-cell"} key={`${person.id}-${projectId}`}>
                    {value ? `${value}%` : "-"}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function TicketsView({
  currentUser,
  projects,
  people,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  disciplineFilter,
  setDisciplineFilter,
  projectFilter,
  setProjectFilter,
  ownerFilter,
  setOwnerFilter,
  ownerOptions,
  ticketScope,
  setTicketScope,
  tickets,
  statusSummaryTickets,
  onStatusChange,
  onTimelineMove,
  onCreateTicket,
}: {
  currentUser: Person;
  projects: Project[];
  people: Person[];
  query: string;
  setQuery: (value: string) => void;
  statusFilter: TicketStatusFilter;
  setStatusFilter: (value: TicketStatusFilter) => void;
  disciplineFilter: Discipline | "全部";
  setDisciplineFilter: (value: Discipline | "全部") => void;
  projectFilter: string;
  setProjectFilter: (value: string) => void;
  ownerFilter: string;
  setOwnerFilter: (value: string) => void;
  ownerOptions: Person[];
  ticketScope: TicketScope;
  setTicketScope: (value: TicketScope) => void;
  tickets: Ticket[];
  statusSummaryTickets: Ticket[];
  onStatusChange: (ticketId: string, status: TicketStatus) => void;
  onTimelineMove: (ticketId: string, offsetDays: number) => void;
  onCreateTicket: () => void;
}) {
  const [activeSheetTab, setActiveSheetTab] = useState<SheetTab>("需求提单");
  const visibleSheetTabs = sheetTabs;
  const visibleSheetTab = visibleSheetTabs.includes(activeSheetTab) ? activeSheetTab : "需求提单";
  const groupedTickets = groupTicketsByBoardStatus(tickets);
  const statusSummary = getTicketStatusSummary(statusSummaryTickets);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedTicketIds((current) => {
      const visibleIds = new Set(tickets.map((ticket) => ticket.id));
      const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [tickets]);

  function toggleTicketSelection(ticketId: string) {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  }

  function toggleVisibleSelection(ticketIds: string[]) {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      const allVisibleSelected = ticketIds.length > 0 && ticketIds.every((id) => next.has(id));
      ticketIds.forEach((id) => {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }

  return (
    <section className="view-stack">
      <div className="sheet-toolbar">
        <button type="button" onClick={onCreateTicket} className="sheet-add-record">
          <Plus size={15} />
          添加记录
        </button>
        <button type="button" onClick={() => searchInputRef.current?.focus()}>
          <Search size={15} />
          查找
        </button>
      </div>

      <div className="sheet-surface">
        <div className="filters sheet-filters">
          <div className="ticket-scope-toggle" role="group" aria-label="提单范围">
            {ticketScopeOptions.map((scope) => (
              <button
                key={scope}
                type="button"
                className={ticketScope === scope ? "active" : ""}
                onClick={() => {
                  setTicketScope(scope);
                  setStatusFilter("全部");
                }}
              >
                {scope}
              </button>
            ))}
          </div>
          <label className="search-box">
            <Search size={18} />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索需求、项目、负责人"
            />
          </label>
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="全部">全部项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TicketStatusFilter)}
          >
            <option value="全部">全部状态</option>
            <option value="进行中">进行中</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            value={disciplineFilter}
            onChange={(event) => setDisciplineFilter(event.target.value as Discipline | "全部")}
          >
            <option value="全部">全部环节</option>
            {disciplineOptions.map((discipline) => (
              <option key={discipline} value={discipline}>
                {discipline}
              </option>
            ))}
          </select>
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
            <option value="全部">全部负责人</option>
            {ownerOptions.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.discipline}
              </option>
            ))}
          </select>
        </div>
        <div className="ticket-status-summary" aria-label="当前提单状态汇总">
          <button type="button" className={statusFilter === "全部" ? "active" : ""} onClick={() => setStatusFilter("全部")}>
            当前 {ticketScope}
            <strong>{statusSummaryTickets.length}</strong>
          </button>
          <button
            type="button"
            className={statusFilter === "待接收" ? "summary-queue active" : "summary-queue"}
            onClick={() => setStatusFilter("待接收")}
          >
            排队中 <strong>{statusSummary.queue}</strong>
          </button>
          <button
            type="button"
            className={statusFilter === "进行中" ? "summary-doing active" : "summary-doing"}
            onClick={() => setStatusFilter("进行中")}
          >
            进行中 <strong>{statusSummary.doing}</strong>
          </button>
          <button
            type="button"
            className={statusFilter === "已完成" ? "summary-done active" : "summary-done"}
            onClick={() => setStatusFilter("已完成")}
          >
            已完成 <strong>{statusSummary.done}</strong>
          </button>
          <button
            type="button"
            className={statusFilter === "阻塞" ? "summary-blocked active" : "summary-blocked"}
            onClick={() => setStatusFilter("阻塞")}
          >
            阻塞 <strong>{statusSummary.blocked}</strong>
          </button>
        </div>

        {visibleSheetTab === "需求提单" && (
          <TaskManagementSheet
            currentUser={currentUser}
            groupedTickets={groupedTickets}
            projects={projects}
            people={people}
            selectedTicketIds={selectedTicketIds}
            onToggleTicketSelection={toggleTicketSelection}
            onToggleVisibleSelection={toggleVisibleSelection}
            onStatusChange={onStatusChange}
            onCreateTicket={onCreateTicket}
          />
        )}
        {visibleSheetTab === "延期任务预警" && <OverdueWarningSheet tickets={tickets} projects={projects} people={people} />}
        {visibleSheetTab === "任务甘特图" && (
          <GanttSheet
            canEditTimeline={currentUser.roleKey === "admin"}
            tickets={tickets}
            projects={projects}
            people={people}
            onTimelineMove={onTimelineMove}
          />
        )}

        <div className="sheet-statusbar">
          <span>当前结果：{tickets.length} 条</span>
          <span>{ticketScope}：{statusSummaryTickets.length} 条</span>
          <span>非空分组：{groupedTickets.filter((group) => group.items.length > 0).length}</span>
          {selectedTicketIds.size > 0 && <span>已选：{selectedTicketIds.size} 条</span>}
        </div>

        <div className="sheet-bottom-bar">
          <div className="sheet-tab-tools" aria-label="工作表工具">
            <button type="button" title="视图列表">
              <Layers size={15} />
            </button>
            <button type="button" title="上一张表">
              ‹
            </button>
            <button type="button" title="下一张表">
              ›
            </button>
          </div>
          <div className="sheet-tabs">
            {visibleSheetTabs.map((tab) => (
              <button
                className={visibleSheetTab === tab ? "active" : ""}
                key={tab}
                type="button"
                onClick={() => setActiveSheetTab(tab)}
              >
                {tab}
              </button>
            ))}
            {currentUser.roleKey === "admin" && (
              <button type="button" className="sheet-tab-add" title="新增工作表">
                +
              </button>
            )}
          </div>
          <div className="sheet-view-controls" aria-label="视图控制">
            <button type="button">100%</button>
            <button type="button" title="全屏">
              <Maximize2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function TaskManagementSheet({
  currentUser,
  groupedTickets,
  projects,
  people,
  selectedTicketIds,
  onToggleTicketSelection,
  onToggleVisibleSelection,
  onStatusChange,
  onCreateTicket,
}: {
  currentUser: Person;
  groupedTickets: TicketBoardGroup[];
  projects: Project[];
  people: Person[];
  selectedTicketIds: Set<string>;
  onToggleTicketSelection: (ticketId: string) => void;
  onToggleVisibleSelection: (ticketIds: string[]) => void;
  onStatusChange: (ticketId: string, status: TicketStatus) => void;
  onCreateTicket: () => void;
}) {
  const hasRows = groupedTickets.some((group) => group.items.length > 0);
  const visibleGroups = groupedTickets.filter((group) => group.items.length > 0);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const visibleTickets = visibleGroups.flatMap((group) => group.items);
  const selectedTicket = visibleTickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const visibleTicketIds = visibleTickets.map((ticket) => ticket.id);
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  const allVisibleSelected =
    visibleTicketIds.length > 0 && visibleTicketIds.every((ticketId) => selectedTicketIds.has(ticketId));
  const selectedVisibleCount = visibleTicketIds.filter((ticketId) => selectedTicketIds.has(ticketId)).length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (selectedTicketId && !visibleTickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(null);
    }
  }, [selectedTicketId, visibleTickets]);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  function toggleGroup(label: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <>
      <div className="task-board-table">
        <div className="task-table-head">
          <span>
            <input
              ref={headerCheckboxRef}
              type="checkbox"
              className="row-checkbox"
              aria-label="选择当前可见提单"
              checked={allVisibleSelected}
              disabled={visibleTicketIds.length === 0}
              onChange={() => onToggleVisibleSelection(visibleTicketIds)}
            />
            <span className="sheet-row-number-label">#</span>
          </span>
          <span>项目名称</span>
          <span>工作内容</span>
          <span>我的提单</span>
          <span>图片/附件/文件</span>
          <span>超链接</span>
          <span>开始日期</span>
          <span>优先级</span>
          <span>状态</span>
          <span>提单天数</span>
          <span>状态停留</span>
          <span>负责人</span>
          <span>任务类别</span>
          <span>备注</span>
        </div>
        {!hasRows && <div className="sheet-empty-row">暂无符合条件的提单</div>}
        {visibleGroups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.label);

          return (
            <div className="task-group" key={group.label}>
              <button
                type="button"
                className="task-group-head"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={!isCollapsed}
              >
                <span className="task-group-sticky">
                  <span className="task-group-caret">{isCollapsed ? "▸" : "▾"}</span>
                  <span className={`status-group-pill ${group.tone}`}>{group.label}</span>
                  <small>总数：{group.items.length}</small>
                </span>
              </button>
              {!isCollapsed && group.items.map((ticket, index) => {
            const project = resolveTicketProject(ticket, projects);
            const owner = people.find((person) => person.id === ticket.ownerId);
            const requester = people.find((person) => person.id === ticket.requesterId);
            const relation = getTicketRelation(ticket, currentUser, people);

            return (
              <article
                className={`task-row ${selectedTicketId === ticket.id ? "selected" : ""}`}
                key={ticket.id}
                onClick={() => setSelectedTicketId(ticket.id)}
                title={`${ticket.id} · ${ticket.title} · ${ticket.summary}`}
              >
                <span className="task-index">
                  <label className="row-check" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="row-checkbox"
                      checked={selectedTicketIds.has(ticket.id)}
                      onChange={() => onToggleTicketSelection(ticket.id)}
                      aria-label={`选择 ${ticket.title}`}
                    />
                    <span>{index + 1}</span>
                  </label>
                </span>
                <span
                  className="task-project-cell"
                  title={`${ticket.sourceProjectName ?? project.name} · ${ticket.id} · ${requester?.name ?? "-"}`}
                >
                  <strong>{ticket.sourceProjectName ?? project.name}</strong>
                </span>
                <span className="task-content-cell" title={ticket.summary}>
                  <strong>{ticket.title}</strong>
                </span>
                <span>
                  <span className={`relation-chip ${relation.tone}`}>{relation.label}</span>
                </span>
                <span>
                  <AttachmentSummary attachments={ticket.attachments ?? []} />
                </span>
                <span>
                  {ticket.hyperlink ? (
                    <a
                      className="link-chip"
                      href={ticket.hyperlink}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      链接
                    </a>
                  ) : (
                    <small className="muted-text">-</small>
                  )}
                </span>
                <span>{ticket.startAt}</span>
                <span>
                  <i className={`priority priority-${ticket.priority.toLowerCase()}`}>{ticket.priority}</i>
                </span>
                <span>
                  <select
                    className={`status-select ${statusTone[ticket.status]}`}
                    value={ticket.status}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onStatusChange(ticket.id, event.target.value as TicketStatus)}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="task-age-cell">
                  <strong className={ticket.ageDays >= 5 && ticket.status !== "已完成" ? "danger-text" : ""}>
                    {ticket.ageDays} 天
                  </strong>
                </span>
                <span className="task-age-cell">
                  <strong className={ticket.statusAgeDays >= 3 && ticket.status !== "已完成" ? "danger-text" : ""}>
                    {ticket.statusAgeDays} 天
                  </strong>
                </span>
                <span>
                  <strong className={`owner-chip owner-${ticket.discipline}`}>{ticket.discipline}-{owner?.name ?? "-"}</strong>
                </span>
                <span>
                  <span className="task-type-chip">{ticket.needType}</span>
                </span>
                <span className="task-text-cell">
                  {ticket.text ? <small>{ticket.text}</small> : <small className="muted-text">-</small>}
                </span>
              </article>
	              );
	            })}
              {!isCollapsed && (
                <button type="button" className="task-add-row" onClick={onCreateTicket}>
                  <span>+</span>
                  <span>添加提单</span>
                  {Array.from({ length: 12 }).map((_, index) => (
                    <span key={index} />
                  ))}
                </button>
              )}
	          </div>
	        );
	      })}
      </div>
      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          currentUser={currentUser}
          projects={projects}
          people={people}
          onClose={() => setSelectedTicketId(null)}
        />
      )}
    </>
  );
}

function TicketDetailPanel({
  ticket,
  currentUser,
  projects,
  people,
  onClose,
}: {
  ticket: Ticket;
  currentUser: Person;
  projects: Project[];
  people: Person[];
  onClose: () => void;
}) {
  const project = resolveTicketProject(ticket, projects);
  const requester = people.find((person) => person.id === ticket.requesterId);
  const owner = people.find((person) => person.id === ticket.ownerId);
  const relation = getTicketRelation(ticket, currentUser, people);
  const attachments = ticket.attachments ?? [];

  return (
    <aside className="ticket-detail-panel" aria-label="提单详情">
      <div className="ticket-detail-head">
        <div>
          <span className="eyebrow">{ticket.id}</span>
          <h3>{ticket.title}</h3>
        </div>
        <button type="button" className="icon-button" onClick={onClose} title="关闭详情">
          <X size={16} />
        </button>
      </div>

      <div className="ticket-detail-grid">
        <span>
          项目
          <strong>{ticket.sourceProjectName ?? project.name}</strong>
        </span>
        <span>
          状态
          <strong>{ticket.status}</strong>
        </span>
        <span>
          提单关系
          <strong>{relation.label}</strong>
        </span>
        <span>
          负责人
          <strong>{ticket.discipline}-{owner?.name ?? "-"}</strong>
        </span>
        <span>
          任务类别
          <strong>{ticket.needType}</strong>
        </span>
        <span>
          发起人
          <strong>{requester?.name ?? "-"}</strong>
        </span>
        <span>
          时间
          <strong>提单 {ticket.ageDays} 天 / 停留 {ticket.statusAgeDays} 天</strong>
        </span>
      </div>

      <div className="ticket-detail-block">
        <span>工作内容</span>
        <p>{ticket.summary}</p>
      </div>

      <div className="ticket-detail-block">
        <span>图片、附件、文件</span>
        {attachments.length > 0 ? (
          <div className="detail-attachment-list">
            {attachments.map((attachment) => (
              <span key={attachment.id}>
                {attachment.kind === "图片" ? <FileImage size={15} /> : <Paperclip size={15} />}
                <strong>{attachment.name}</strong>
                <small>{attachment.kind} · {attachment.size}</small>
              </span>
            ))}
          </div>
        ) : (
          <p className="muted-text">暂无附件</p>
        )}
      </div>

      <div className="ticket-detail-actions">
        {ticket.hyperlink && (
          <a className="link-chip" href={ticket.hyperlink} target="_blank" rel="noreferrer">
            打开链接
          </a>
        )}
        {ticket.text && <small>备注：{ticket.text}</small>}
      </div>
    </aside>
  );
}

function OverdueWarningSheet({
  tickets,
  projects,
  people,
}: {
  tickets: Ticket[];
  projects: Project[];
  people: Person[];
}) {
  const warningTickets = tickets
    .filter((ticket) => ticket.status !== "已完成" && (ticket.dueInDays <= 1 || ticket.ageDays >= 1 || ticket.statusAgeDays >= 1))
    .sort((a, b) => a.dueInDays - b.dueInDays || b.ageDays - a.ageDays);

  return (
    <div className="sheet-alt-table warning-table">
      <div className="warning-head">
        <span>项目名称</span>
        <span>工作内容</span>
        <span>负责人</span>
        <span>状态</span>
        <span>提单天数</span>
        <span>停留天数</span>
        <span>剩余天数</span>
        <span>风险</span>
      </div>
      {warningTickets.length === 0 && <div className="sheet-empty-row">暂无延期或临近风险</div>}
      {warningTickets.map((ticket) => {
        const owner = people.find((person) => person.id === ticket.ownerId);
        return (
          <article className="warning-row" key={ticket.id}>
            <span className="sheet-long-cell">{getTicketProjectName(ticket, projects)}</span>
            <span className="sheet-long-cell">{ticket.title}</span>
            <span>
              <strong className={`owner-chip owner-${ticket.discipline}`}>{ticket.discipline}-{owner?.name ?? "-"}</strong>
            </span>
            <span>
              <span className={`pill ${statusTone[ticket.status]}`}>{ticket.status}</span>
            </span>
            <span className={ticket.ageDays >= 5 ? "danger-text" : ""}>{ticket.ageDays} 天</span>
            <span>{ticket.statusAgeDays} 天</span>
            <span className={ticket.dueInDays < 0 ? "danger-text" : ""}>{formatDue(ticket.dueInDays)}</span>
            <span>
              <span className={`warning-chip ${getWarningTone(ticket)}`}>{getWarningLabel(ticket)}</span>
            </span>
          </article>
        );
      })}
    </div>
  );
}

function GanttSheet({
  canEditTimeline,
  tickets,
  projects,
  people,
  onTimelineMove,
}: {
  canEditTimeline: boolean;
  tickets: Ticket[];
  projects: Project[];
  people: Person[];
  onTimelineMove: (ticketId: string, offsetDays: number) => void;
}) {
  const [draggingTimeline, setDraggingTimeline] = useState<{
    pointerId: number;
    ticketId: string;
    startClientX: number;
    startOffsetDays: number;
    previewOffsetDays: number;
  } | null>(null);
  const rows = [...tickets].sort((a, b) => a.startAt.localeCompare(b.startAt));

  function getPreviewOffsetDays(ticket: Ticket) {
    return draggingTimeline?.ticketId === ticket.id ? draggingTimeline.previewOffsetDays : getGanttOffsetDays(ticket);
  }

  function resolveDragOffset(clientX: number, drag = draggingTimeline) {
    if (!drag) return 0;
    const deltaDays = Math.round((clientX - drag.startClientX) / ganttDayWidth);
    return clampGanttOffsetDays(drag.startOffsetDays + deltaDays);
  }

  function startTimelineDrag(event: ReactPointerEvent<HTMLButtonElement>, ticket: Ticket) {
    if (!canEditTimeline) return;
    event.preventDefault();
    event.stopPropagation();
    const startOffsetDays = getGanttOffsetDays(ticket);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingTimeline({
      pointerId: event.pointerId,
      ticketId: ticket.id,
      startClientX: event.clientX,
      startOffsetDays,
      previewOffsetDays: startOffsetDays,
    });
  }

  function moveTimelineDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingTimeline || draggingTimeline.pointerId !== event.pointerId) return;
    event.preventDefault();
    const previewOffsetDays = resolveDragOffset(event.clientX);
    setDraggingTimeline((current) => (current ? { ...current, previewOffsetDays } : current));
  }

  function finishTimelineDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingTimeline || draggingTimeline.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nextOffsetDays = resolveDragOffset(event.clientX);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser on cancel.
    }
    onTimelineMove(draggingTimeline.ticketId, nextOffsetDays);
    setDraggingTimeline(null);
  }

  return (
    <div className="sheet-alt-table gantt-sheet">
      <div className="gantt-head">
        <span>项目名称</span>
        <span>工作内容</span>
        <span>负责人</span>
        <span>开始日期</span>
        <span>周期</span>
        <span>时间线</span>
      </div>
      {rows.length === 0 && <div className="sheet-empty-row">暂无甘特图数据</div>}
      {rows.map((ticket) => {
        const owner = people.find((person) => person.id === ticket.ownerId);
        const duration = Math.max(1, ticket.ageDays + Math.max(ticket.dueInDays, 0));
        const offsetDays = getPreviewOffsetDays(ticket);
        const offset = offsetDays * ganttDayWidth;
        const width = Math.max(72, Math.min(280, duration * 34));
        const isDragging = draggingTimeline?.ticketId === ticket.id;

        return (
          <article
            className="gantt-row"
            data-ticket-id={ticket.id}
            data-owner-id={ticket.ownerId}
            data-offset-days={offsetDays}
            key={ticket.id}
          >
            <span className="sheet-long-cell">{getTicketProjectName(ticket, projects)}</span>
            <span className="sheet-long-cell">{ticket.title}</span>
            <span>
              <strong className={`owner-chip owner-${ticket.discipline}`}>{owner?.name ?? "-"}</strong>
            </span>
            <span>{ticket.startAt}</span>
            <span>{duration} 天</span>
            <span className="gantt-timeline">
              <button
                type="button"
                aria-disabled={!canEditTimeline}
                aria-label={`${ticket.title} 甘特时间线`}
                className={`gantt-bar status-${ticket.status} ${canEditTimeline ? "draggable" : "readonly"} ${
                  isDragging ? "dragging" : ""
                }`}
                onPointerDown={(event) => startTimelineDrag(event, ticket)}
                onPointerMove={moveTimelineDrag}
                onPointerUp={finishTimelineDrag}
                onPointerCancel={finishTimelineDrag}
                style={{ marginLeft: offset, width }}
                title={canEditTimeline ? "拖动调整开始日期" : "仅管理员可调整"}
              />
            </span>
          </article>
        );
      })}
    </div>
  );
}

function AdminView({
  currentUser,
  projects,
  people,
  tickets,
  onSwitchAdmin,
}: {
  currentUser: Person;
  projects: Project[];
  people: Person[];
  tickets: Ticket[];
  onSwitchAdmin: () => void;
}) {
  if (currentUser.roleKey !== "admin") {
    return (
      <section className="empty-state">
        <ShieldCheck size={44} />
        <h2>管理员视图</h2>
        <p>当前账号只能查看自己参与项目的需求、进度和协作成员。</p>
        <button className="primary-button" onClick={onSwitchAdmin}>
          <CircleUserRound size={18} />
          <span>切换管理员</span>
        </button>
      </section>
    );
  }

  const openTickets = tickets.filter((ticket) => ticket.status !== "已完成");
  const overdueTickets = openTickets.filter((ticket) => ticket.dueInDays < 0);
  const averageLoad = Math.round(people.reduce((sum, person) => sum + person.capacity, 0) / people.length);
  const disciplineLoads = disciplineOptions.map((discipline) => {
    const members = people.filter((person) => person.discipline === discipline);
    const load = members.length
      ? Math.round(members.reduce((sum, person) => sum + person.capacity, 0) / members.length)
      : 0;
    return { discipline, load };
  });

  return (
    <section className="view-stack">
      <div className="kpi-grid admin-kpis">
        <MetricCard icon={CalendarClock} label="月项目量" value="150" helper="月均新建项目" />
        <MetricCard icon={Workflow} label="在线项目" value={projects.length * 6} helper="样本项目映射全量池" tone="progress" />
        <MetricCard icon={ClipboardList} label="未结提单" value={openTickets.length} helper={`${overdueTickets.length} 个已逾期`} tone="risk" />
        <MetricCard icon={Gauge} label="平均负载" value={`${averageLoad}%`} helper="超过 90% 需调度" />
      </div>

      <div className="admin-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">产能</span>
              <h2>岗位负载</h2>
            </div>
            <UsersRound size={20} />
          </div>
          <div className="load-list">
            {disciplineLoads.map((item) => (
              <div className="load-row" key={item.discipline}>
                <span>{item.discipline}</span>
                <ProgressLine value={item.load} />
                <strong>{item.load}%</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">权限</span>
              <h2>角色可见范围</h2>
            </div>
            <LockKeyhole size={20} />
          </div>
          <div className="permission-list">
            <div>
              <strong>管理员</strong>
              <span>全局项目、人员、提单、权限、报表</span>
            </div>
            <div>
              <strong>项目负责人</strong>
              <span>负责项目、项目成员、项目提单、交付风险</span>
            </div>
            <div>
              <strong>制作人员</strong>
              <span>参与项目、自己相关提单、所在项目进度</span>
            </div>
          </div>
        </section>
      </div>

      <section className="table-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">风险</span>
            <h2>全局项目预警</h2>
          </div>
          <AlertTriangle size={20} />
        </div>
        <div className="risk-board">
          {projects
            .filter((project) => project.health !== "green")
            .map((project) => (
              <article key={project.id}>
                <span className={`pill ${healthTone[project.health]}`}>{healthLabel[project.health]}</span>
                <strong>{project.name}</strong>
                <p>{project.blocker}</p>
                <ProgressLine value={project.progress} />
              </article>
            ))}
        </div>
      </section>
    </section>
  );
}

function ProjectDetail({
  project,
  tickets,
  people,
  compact,
}: {
  project: Project;
  tickets: Ticket[];
  people: Person[];
  compact: boolean;
}) {
  const projectTickets = tickets.filter((ticket) => ticket.projectId === project.id);
  const openTickets = projectTickets.filter((ticket) => ticket.status !== "已完成");
  const team = people.filter((person) => project.teamIds.includes(person.id));

  return (
    <section className={compact ? "panel" : "project-detail"}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{project.client} · {project.channel}</span>
          <h2>{project.name}</h2>
        </div>
        <span className={`pill ${healthTone[project.health]}`}>{healthLabel[project.health]}</span>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <div className="stage-line">
            {["立项", "素材", "开发", "QA", "交付"].map((stage, index) => (
              <span key={stage} className={index <= stageIndex(project.progress) ? "done" : ""}>
                {index <= stageIndex(project.progress) ? <CheckCircle2 size={15} /> : <i />}
                {stage}
              </span>
            ))}
          </div>

          <div className="discipline-bars">
            {disciplineOptions.map((discipline) => (
              <div key={discipline}>
                <span>{discipline}</span>
                <ProgressLine value={project.disciplineProgress[discipline]} />
                <b>{project.disciplineProgress[discipline]}%</b>
              </div>
            ))}
          </div>
        </div>

        <div className="detail-side">
          <div>
            <span className="eyebrow">阻塞点</span>
            <p>{project.blocker}</p>
          </div>
          <div className="team-list">
            {team.map((person) => (
              <span key={person.id}>
                {person.name}
                <small>{person.discipline}</small>
              </span>
            ))}
          </div>
          <div className="side-metrics">
            <span>未结提单 <strong>{openTickets.length}</strong></span>
            <span>交付 {formatDue(project.dueInDays)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function TicketForm({
  currentUser,
  projects,
  people,
  onClose,
  onCreate,
}: {
  currentUser: Person;
  projects: Project[];
  people: Person[];
  onClose: () => void;
  onCreate: (ticket: Omit<Ticket, "id" | "ageDays" | "statusAgeDays" | "status" | "startAt">) => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "p1");
  const [sourceProjectName, setSourceProjectName] = useState(projects[0]?.name ?? "");
  const [discipline, setDiscipline] = useState<Discipline>(
    currentUser.discipline !== "管理" && currentUser.discipline !== "项目" ? currentUser.discipline : "美术"
  );
  const [ownerId, setOwnerId] = useState(people.find((person) => person.discipline === discipline)?.id ?? people[0].id);
  const [priority, setPriority] = useState<Priority>("P1");
  const [needType, setNeedType] = useState("资产补充");
  const [summary, setSummary] = useState("");
  const [hyperlink, setHyperlink] = useState("");
  const [text, setText] = useState("");
  const [dueInDays, setDueInDays] = useState(3);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      title: title.trim() || "未命名需求",
      sourceProjectName: sourceProjectName.trim() || undefined,
      projectId,
      requesterId: currentUser.id,
      ownerId,
      discipline,
      priority,
      dueInDays,
      needType,
      summary: summary.trim() || "待补充说明",
      hyperlink: hyperlink.trim() || undefined,
      text: text.trim() || undefined,
      attachments,
    });
  }

  function addFiles(files: FileList | null, kindHint?: TicketAttachment["kind"]) {
    if (!files?.length) return;
    const nextAttachments = Array.from(files).map((file, index) => ({
      id: `upload-${Date.now()}-${index}-${file.name}`,
      name: file.name,
      kind: kindHint ?? (file.type.startsWith("image/") ? "图片" : "文件"),
      size: formatFileSize(file.size),
    }));
    setAttachments((items) => [...items, ...nextAttachments]);
  }

  function removeAttachment(id: string) {
    setAttachments((items) => items.filter((attachment) => attachment.id !== id));
  }

  function changeDiscipline(value: Discipline) {
    setDiscipline(value);
    const nextOwner = people.find((person) => person.discipline === value);
    if (nextOwner) setOwnerId(nextOwner.id);
  }

  function changeProject(value: string) {
    const previousProject = projects.find((project) => project.id === projectId);
    const nextProject = projects.find((project) => project.id === value);
    setProjectId(value);
    if (!sourceProjectName.trim() || sourceProjectName.trim() === previousProject?.name) {
      setSourceProjectName(nextProject?.name ?? "");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="ticket-form" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">需求提单</span>
            <h2>新建需求</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <label>
          <span>需求标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例：主角色跑步动画补帧" />
        </label>

        <div className="form-grid">
          <label>
            <span>所属项目</span>
            <select value={projectId} onChange={(event) => changeProject(event.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>表格项目名称</span>
            <input
              value={sourceProjectName}
              onChange={(event) => setSourceProjectName(event.target.value)}
              placeholder="例：小主厨解锁餐厅 - ttwj"
            />
          </label>
          <label>
            <span>环节</span>
            <select value={discipline} onChange={(event) => changeDiscipline(event.target.value as Discipline)}>
              {disciplineOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>负责人</span>
            <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              {people
                .filter((person) => person.discipline === discipline)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>优先级</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              {priorityOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>任务类别</span>
            <input value={needType} onChange={(event) => setNeedType(event.target.value)} />
          </label>
          <label>
            <span>期望天数</span>
            <input
              type="number"
              min={1}
              max={14}
              value={dueInDays}
              onChange={(event) => setDueInDays(Number(event.target.value))}
            />
          </label>
        </div>

        <label>
          <span>说明</span>
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} />
        </label>

        <div className="form-grid">
          <label>
            <span>超链接</span>
            <input
              value={hyperlink}
              onChange={(event) => setHyperlink(event.target.value)}
              placeholder="SVN、蓝湖、Figma、参考文档链接"
            />
          </label>
          <label>
            <span>备注</span>
            <input value={text} onChange={(event) => setText(event.target.value)} placeholder="补充备注或交付说明" />
          </label>
        </div>

        <div className="upload-section">
          <span className="field-label">图片、附件、文件</span>
          <div className="upload-grid">
            <label className="upload-tile">
              <FileImage size={20} />
              <strong>添加图片</strong>
              <span>截图、参考图、标注图</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  addFiles(event.currentTarget.files, "图片");
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label className="upload-tile">
              <Paperclip size={20} />
              <strong>添加附件</strong>
              <span>参考表、说明文档、截图包</span>
              <input
                type="file"
                multiple
                onChange={(event) => {
                  addFiles(event.currentTarget.files, "附件");
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label className="upload-tile">
              <FileText size={20} />
              <strong>添加文件</strong>
              <span>PSD、Figma、模型包、文档、压缩包</span>
              <input
                type="file"
                multiple
                onChange={(event) => {
                  addFiles(event.currentTarget.files, "文件");
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          {attachments.length > 0 && (
            <div className="attachment-list">
              {attachments.map((attachment) => (
                <span key={attachment.id}>
                  {attachment.kind === "图片" ? <FileImage size={15} /> : <Paperclip size={15} />}
                  <b>{attachment.name}</b>
                  <small>{attachment.kind}</small>
                  <small>{attachment.size}</small>
                  <button type="button" onClick={() => removeAttachment(attachment.id)} title="移除附件">
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            <span>提交</span>
          </button>
        </div>
      </form>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
}: {
  icon: typeof LayoutDashboard;
  label: string;
  value: string | number;
  helper: string;
  tone?: "default" | "risk" | "progress";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <Icon size={21} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

function TicketMiniCard({ ticket, projects, people }: { ticket: Ticket; projects: Project[]; people: Person[] }) {
  const project = projects.find((item) => item.id === ticket.projectId) ?? initialProjects[0];
  const owner = people.find((person) => person.id === ticket.ownerId);

  return (
    <article className="ticket-mini">
      <div>
        <strong>{ticket.title}</strong>
        <span>{project.name} · {owner?.name ?? "-"}</span>
      </div>
      <div>
        <span className={`pill ${statusTone[ticket.status]}`}>{ticket.status}</span>
        <b className={ticket.ageDays >= 5 ? "danger-text" : ""}>{ticket.ageDays} 天</b>
      </div>
    </article>
  );
}

function AttachmentSummary({ attachments }: { attachments: TicketAttachment[] }) {
  const imageCount = attachments.filter((attachment) => attachment.kind === "图片").length;
  const attachmentCount = attachments.filter((attachment) => attachment.kind === "附件").length;
  const fileCount = attachments.filter((attachment) => attachment.kind === "文件").length;

  if (!attachments.length) return <small className="muted-text">无</small>;

  return (
    <span
      className="attachment-summary"
      title={attachments.map((attachment) => `${attachment.kind}：${attachment.name}`).join("\n")}
    >
      {imageCount > 0 && (
        <small>
          <FileImage size={14} />
          图{imageCount}
        </small>
      )}
      {attachmentCount > 0 && (
        <small>
          <Paperclip size={14} />
          附{attachmentCount}
        </small>
      )}
      {fileCount > 0 && (
        <small className="file-count-chip">
          <Paperclip size={14} />
          文{fileCount}
        </small>
      )}
    </span>
  );
}

function ProgressLine({ value }: { value: number }) {
  return (
    <div className="bar">
      <i style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </div>
  );
}

function stageIndex(progress: number) {
  if (progress >= 90) return 4;
  if (progress >= 70) return 3;
  if (progress >= 45) return 2;
  if (progress >= 20) return 1;
  return 0;
}

function resolveTicketProject(ticket: Ticket, projects: Project[]) {
  return projects.find((item) => item.id === ticket.projectId) ?? initialProjects.find((item) => item.id === ticket.projectId) ?? initialProjects[0];
}

function getTicketProjectName(ticket: Ticket, projects: Project[]) {
  return ticket.sourceProjectName ?? resolveTicketProject(ticket, projects).name;
}

function getTicketRelation(ticket: Ticket, currentUser: Person, people: Person[]) {
  const requester = people.find((person) => person.id === ticket.requesterId);
  const owner = people.find((person) => person.id === ticket.ownerId);

  if (ticket.requesterId === currentUser.id && ticket.ownerId === currentUser.id) {
    return { label: "我自办", tone: "relation-self" };
  }
  if (ticket.requesterId === currentUser.id) {
    return { label: `我提给 ${owner?.name ?? "-"}`, tone: "relation-requested" };
  }
  if (ticket.ownerId === currentUser.id) {
    return { label: "指派给我", tone: "relation-assigned" };
  }
  return { label: `${requester?.name ?? "-"} -> ${owner?.name ?? "-"}`, tone: "relation-related" };
}

function countTicketsByStatus(tickets: Ticket[], status: TicketStatus) {
  return tickets.filter((ticket) => ticket.status === status).length;
}

function matchesStatusFilter(ticket: Ticket, statusFilter: TicketStatusFilter) {
  if (statusFilter === "全部") return true;
  if (statusFilter === "进行中") return ticket.status === "处理中" || ticket.status === "待验收";
  return ticket.status === statusFilter;
}

function getTicketStatusSummary(tickets: Ticket[]) {
  return {
    queue: countTicketsByStatus(tickets, "待接收"),
    doing: tickets.filter((ticket) => ticket.status === "处理中" || ticket.status === "待验收").length,
    done: countTicketsByStatus(tickets, "已完成"),
    blocked: countTicketsByStatus(tickets, "阻塞"),
  };
}

function getWarningLabel(ticket: Ticket) {
  if (ticket.dueInDays < 0) return "已延期";
  if (ticket.dueInDays === 0) return "今日到期";
  if (ticket.dueInDays === 1) return "临近";
  if (ticket.ageDays >= 5) return "久未完成";
  return "观察";
}

function getWarningTone(ticket: Ticket) {
  if (ticket.dueInDays < 0 || ticket.status === "阻塞") return "warning-red";
  if (ticket.dueInDays <= 1 || ticket.ageDays >= 5) return "warning-amber";
  return "warning-blue";
}

function groupTicketsByBoardStatus(tickets: Ticket[]): TicketBoardGroup[] {
  const groups = [
    {
      label: "排队中",
      tone: "queue",
      statuses: ["待接收"] as TicketStatus[],
    },
    {
      label: "进行中",
      tone: "doing",
      statuses: ["处理中", "待验收"] as TicketStatus[],
    },
    {
      label: "阻塞",
      tone: "blocked",
      statuses: ["阻塞"] as TicketStatus[],
    },
    {
      label: "已完成",
      tone: "done",
      statuses: ["已完成"] as TicketStatus[],
    },
  ];

  return groups.map((group) => ({
    label: group.label,
    tone: group.tone,
    items: tickets.filter((ticket) => group.statuses.includes(ticket.status)),
  }));
}

function formatDue(days: number) {
  if (days < 0) return `逾期 ${Math.abs(days)} 天`;
  if (days === 0) return "今日";
  return `剩 ${days} 天`;
}

function clampGanttOffsetDays(days: number) {
  return Math.max(0, Math.min(ganttMaxOffsetDays, Math.round(days)));
}

function getGanttOffsetDays(ticket: Ticket) {
  return clampGanttOffsetDays(ticket.timelineOffsetDays ?? ticket.ageDays);
}

function shiftDateTimeByDays(value: string, deltaDays: number) {
  if (deltaDays === 0) return value;

  const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return value;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  date.setDate(date.getDate() + deltaDays);
  return formatDateTime(date);
}

function formatNowDateTime() {
  return formatDateTime(new Date());
}

function formatDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

export default App;
