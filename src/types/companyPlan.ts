export type RoleKey = "admin" | "producer" | "artist" | "ui" | "model" | "animator" | "programmer";
export type ViewKey = "overview" | "projects" | "people" | "tickets" | "admin";
export type SheetTab = "需求提单" | "延期任务预警" | "任务甘特图";
export type TicketScope = "全部相关" | "我负责的" | "我的提单";
export type Health = "green" | "amber" | "red";
export type Discipline = "美术" | "UI" | "模型" | "动画" | "研发" | "音效";
export type TicketStatus = "排队中" | "进行中" | "阻塞" | "已完成";
export type TicketStatusFilter = TicketStatus | "全部";
export type Priority = "紧急" | "优先" | "普通" | "低优先";

export type TicketAttachment = {
  id: string;
  name: string;
  kind: "图片" | "附件" | "文件";
  size: string;
  mimeType?: string;
  sizeBytes?: number;
  dataBase64?: string;
  openUrl?: string;
  downloadUrl?: string;
};

export type Person = {
  id: string;
  name: string;
  roleKey: RoleKey;
  title: string;
  discipline: Discipline | "管理" | "项目";
  capacity: number;
  completion: number;
  projectIds: string[];
};

export type Project = {
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

export type Ticket = {
  id: string;
  title: string;
  sourceProjectName?: string;
  projectName?: string;
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
  ageHours?: number;
  statusAgeHours?: number;
  dueInHours?: number;
  remainingHours?: number;
  riskWarningHours?: number;
  timelineOffsetDays?: number;
  timelineOffsetHours?: number;
  timelineSpanHours?: number;
  needType: string;
  summary: string;
  hyperlink?: string;
  text?: string;
  attachments?: TicketAttachment[];
};

export type TicketCreatePayload = Omit<
  Ticket,
  | "id"
  | "ageDays"
  | "statusAgeDays"
  | "dueInDays"
  | "ageHours"
  | "statusAgeHours"
  | "remainingHours"
  | "riskWarningHours"
  | "status"
  | "startAt"
>;

export type TicketBoardGroup = {
  label: string;
  tone: string;
  items: Ticket[];
};

export type BootstrapPayload = {
  currentUser: Person;
  people: Person[];
  projects: Project[];
  tickets: Ticket[];
  config: CompanyConfig;
};

export type ProjectNameOption = {
  id: string;
  name: string;
  projectId?: string;
  source?: "local" | "ops-project" | "ops-tenant";
};

export type TicketTypeSetting = {
  typeKey: Discipline;
  label: string;
  defaultDeliveryHours: number;
  riskWarningHours: number;
};

export type CompanyConfig = {
  projectNameOptions: ProjectNameOption[];
  ticketTypeSettings: TicketTypeSetting[];
};

export type LoginPayload = {
  username: string;
  password: string;
};
