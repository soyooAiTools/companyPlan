import {
  Activity,
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleUserRound,
  ClipboardList,
  Download,
  ExternalLink,
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
  Timer,
  UsersRound,
  Workflow,
  X,
  Maximize2,
  Layers,
  Save,
  Trash2,
} from "lucide-react";
import { FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  BootstrapPayload,
  CompanyConfig,
  Discipline,
  Health,
  Person,
  Priority,
  Project,
  ProjectNameOption,
  RoleKey,
  SheetTab,
  Ticket,
  TicketAttachment,
  TicketBoardGroup,
  TicketCreatePayload,
  TicketScope,
  TicketStatus,
  TicketStatusFilter,
  TicketTypeSetting,
  ViewKey,
} from "../../types";
import {
  createTicketApi,
  getBootstrapApi,
  loginApi,
  logoutApi,
  saveAdminConfigApi,
  updateTicketStatusApi,
  updateTicketTimelineApi,
} from "../../api/modules/companyPlan";
import { arrayBufferToBase64, formatFileSize } from "../../layer/utils/file";
import { initialProjects, people } from "./demoData";


const navItems: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "运营总览", icon: LayoutDashboard },
  { key: "projects", label: "项目池", icon: BriefcaseBusiness },
  { key: "people", label: "人员进度", icon: UsersRound },
  { key: "tickets", label: "需求提单", icon: ClipboardList },
  { key: "admin", label: "管理员", icon: ShieldCheck },
];

const sheetTabs: SheetTab[] = ["需求提单", "延期任务预警", "任务甘特图"];
const ticketScopeOptions: TicketScope[] = ["全部相关", "我负责的", "我的提单"];
const statusOptions: TicketStatus[] = ["排队中", "进行中", "阻塞", "已完成"];
const disciplineOptions: Discipline[] = ["美术", "UI", "模型", "动画", "研发", "音效"];
const priorityOptions: Priority[] = ["紧急", "优先", "普通", "低优先"];
const fallbackCompanyConfig: CompanyConfig = {
  projectNameOptions: [
    { id: "pn-neon-chef", name: "Neon Chef 试玩 - p1" },
    { id: "pn-merge-manor", name: "Merge Manor A/B - p2" },
    { id: "pn-zombie-rush", name: "Zombie Rush Lite - p3" },
    { id: "pn-farm-merge", name: "Farm Merge 4D - p4" },
    { id: "pn-pet-salon", name: "Pet Salon Quest - p5" },
    { id: "pn-idle-miner", name: "Idle Miner Sprint - p6" },
    { id: "pn-puzzle-cruise", name: "Puzzle Cruise - p7" },
    { id: "pn-royal-room", name: "Royal Room Rescue - p8" },
  ],
  ticketTypeSettings: [
    { typeKey: "美术", label: "美术", defaultDeliveryHours: 36, riskWarningHours: 8 },
    { typeKey: "UI", label: "UI", defaultDeliveryHours: 24, riskWarningHours: 6 },
    { typeKey: "模型", label: "模型", defaultDeliveryHours: 48, riskWarningHours: 12 },
    { typeKey: "动画", label: "动画", defaultDeliveryHours: 40, riskWarningHours: 10 },
    { typeKey: "研发", label: "研发", defaultDeliveryHours: 32, riskWarningHours: 8 },
    { typeKey: "音效", label: "音效", defaultDeliveryHours: 16, riskWarningHours: 4 },
  ],
};
const ganttHourWidth = 4;
const ganttMaxOffsetHours = 24 * 10;
const ganttMinSpanHours = 4;
const ganttMaxSpanHours = 24 * 45;


const accounts = people.filter((person) =>
  ["admin", "producer", "artist", "ui", "model", "animator", "programmer"].includes(person.roleKey)
);

const statusTone: Record<TicketStatus, string> = {
  排队中: "tone-slate",
  进行中: "tone-blue",
  阻塞: "tone-red",
  已完成: "tone-green",
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
  programmer: "程序员",
};

function canViewGanttSheet(person: Person) {
  return person.roleKey === "admin" || person.roleKey === "programmer";
}

function canEditTicketStatus(ticket: Ticket, person: Person) {
  return person.roleKey === "admin" || ticket.requesterId === person.id || ticket.ownerId === person.id;
}

function isTicketRelevantToUser(ticket: Ticket, person: Person) {
  if (person.roleKey === "admin") return true;
  return ticket.ownerId === person.id || ticket.requesterId === person.id;
}

// embedded=true 时:不渲染旧的侧边栏/顶栏/登录,只渲染 forcedView 指定的那个 section(供新 app 的路由嵌入调用)。
function App({ embedded = false, forcedView }: { embedded?: boolean; forcedView?: ViewKey } = {}) {
  const [activeView, setActiveView] = useState<ViewKey>(() => {
    // 支持外部深链:/?view=overview|projects|people|tickets|admin(供 /ops 左侧菜单跳转过来)
    const v = new URLSearchParams(window.location.search).get("view");
    return v === "projects" || v === "people" || v === "tickets" || v === "admin" ? (v as ViewKey) : "overview";
  });
  const [selectedProjectId, setSelectedProjectId] = useState("p1");
  const [currentUser, setCurrentUser] = useState<Person | null>(null);
  const [peopleData, setPeopleData] = useState<Person[]>(people);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(fallbackCompanyConfig);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [appError, setAppError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>("全部");
  const [disciplineFilter, setDisciplineFilter] = useState<Discipline | "全部">("全部");
  const [projectFilter, setProjectFilter] = useState<string>("全部");
  const [ownerFilter, setOwnerFilter] = useState<string>("全部");
  const [ticketScope, setTicketScope] = useState<TicketScope>("全部相关");
  const [isTicketFormOpen, setIsTicketFormOpen] = useState(false);

  useEffect(() => {
    void loadBootstrap();
  }, []);

  function applyBootstrap(data: BootstrapPayload) {
    setCurrentUser(data.currentUser);
    setPeopleData(data.people);
    setProjects(data.projects);
    setCompanyConfig(data.config ?? fallbackCompanyConfig);
    setTickets(data.tickets);
    setSelectedProjectId((current) =>
      data.projects.some((project) => project.id === current) ? current : data.projects[0]?.id ?? ""
    );
  }

  async function loadBootstrap() {
    setIsBootstrapping(true);
    setAppError("");
    try {
      const data = await getBootstrapApi();
      if (!data) {
        setCurrentUser(null);
        setTickets([]);
        return;
      }
      applyBootstrap(data);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "加载生产数据失败");
    } finally {
      setIsBootstrapping(false);
    }
  }

  async function login(username: string, password: string) {
    setAppError("");
    await loginApi({ username, password });
    await loadBootstrap();
  }

  async function logout() {
    await logoutApi();
    setCurrentUser(null);
    setTickets([]);
    setActiveView("overview");
  }

  const activeUser = currentUser ?? people[0];
  const effectiveView: ViewKey = forcedView ?? (activeUser.roleKey === "admin" ? activeView : "tickets");
  const accessibleNavItems =
    activeUser.roleKey === "admin" ? navItems : navItems.filter((item) => item.key === "tickets");
  const visibleProjectIds = useMemo(() => {
    if (activeUser.roleKey === "admin") return projects.map((project) => project.id);
    return projects
      .filter((project) => project.ownerId === activeUser.id || project.teamIds.includes(activeUser.id))
      .map((project) => project.id);
  }, [activeUser, projects]);

  const visibleProjects = useMemo(
    () => projects.filter((project) => visibleProjectIds.includes(project.id)),
    [projects, visibleProjectIds]
  );

  const selectedProject =
    visibleProjects.find((project) => project.id === selectedProjectId) ?? visibleProjects[0];

  const visiblePeople = useMemo(() => {
    const projectSet = new Set(visibleProjectIds);
    return peopleData.filter(
      (person) => person.id === activeUser.id || person.projectIds.some((id) => projectSet.has(id))
    );
  }, [activeUser.id, peopleData, visibleProjectIds]);

  const scopedTickets = useMemo(
    () =>
      tickets.filter((ticket) => isTicketRelevantToUser(ticket, activeUser)),
    [activeUser, tickets]
  );

  const ownerFilterOptions = useMemo(() => {
    const ownerIds = new Set(scopedTickets.map((ticket) => ticket.ownerId));
    return peopleData.filter((person) => ownerIds.has(person.id));
  }, [peopleData, scopedTickets]);

  const ticketsBeforeStatusFilter = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return scopedTickets.filter((ticket) => {
      const project = projects.find((item) => item.id === ticket.projectId);
      const owner = peopleData.find((person) => person.id === ticket.ownerId);
      const matchesScope =
        ticketScope === "全部相关" ||
        (ticketScope === "我负责的" && ticket.ownerId === activeUser.id) ||
        (ticketScope === "我的提单" && ticket.requesterId === activeUser.id);
      const matchesQuery =
        !lowered ||
        ticket.title.toLowerCase().includes(lowered) ||
        ticket.id.toLowerCase().includes(lowered) ||
        project?.name.toLowerCase().includes(lowered) ||
        ticket.sourceProjectName?.toLowerCase().includes(lowered) ||
        ticket.projectName?.toLowerCase().includes(lowered) ||
        owner?.name.toLowerCase().includes(lowered);

      return (
        matchesScope &&
        matchesQuery &&
        (disciplineFilter === "全部" || ticket.discipline === disciplineFilter) &&
        (projectFilter === "全部" || ticket.projectId === projectFilter) &&
        (ownerFilter === "全部" || ticket.ownerId === ownerFilter)
      );
    });
  }, [activeUser.id, disciplineFilter, ownerFilter, peopleData, projectFilter, projects, query, scopedTickets, ticketScope]);

  const filteredTickets = useMemo(
    () => ticketsBeforeStatusFilter.filter((ticket) => matchesStatusFilter(ticket, statusFilter)),
    [statusFilter, ticketsBeforeStatusFilter]
  );

  const metrics = useMemo(() => {
    const riskProjects = visibleProjects.filter((project) => project.health !== "green").length;
    const openTickets = scopedTickets.filter((ticket) => ticket.status !== "已完成").length;
    const agedTickets = scopedTickets.filter((ticket) => ticket.status !== "已完成" && getTicketAgeHours(ticket) >= 120).length;
    const averageProgress = Math.round(
      visibleProjects.reduce((sum, project) => sum + project.progress, 0) / Math.max(visibleProjects.length, 1)
    );

    return { riskProjects, openTickets, agedTickets, averageProgress };
  }, [scopedTickets, visibleProjects]);

  async function updateTicketStatus(ticketId: string, status: TicketStatus) {
    try {
      const data = await updateTicketStatusApi(ticketId, status);
      setTickets((items) => items.map((ticket) => (ticket.id === ticketId ? data.ticket : ticket)));
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "更新提单状态失败");
    }
  }

  async function updateTicketTimeline(ticketId: string, offsetHours: number, spanHours: number) {
    try {
      const data = await updateTicketTimelineApi(
        ticketId,
        clampGanttOffsetHours(offsetHours),
        clampGanttSpanHours(spanHours)
      );
      setTickets((items) => items.map((ticket) => (ticket.id === ticketId ? data.ticket : ticket)));
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "更新甘特时间线失败");
    }
  }

  async function createTicket(ticket: TicketCreatePayload) {
    try {
      const data = await createTicketApi(ticket);
      setTickets((items) => [data.ticket, ...items.filter((item) => item.id !== data.ticket.id)]);
      setActiveView("tickets");
      setIsTicketFormOpen(false);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "创建提单失败");
    }
  }

  async function saveAdminConfig(config: CompanyConfig) {
    try {
      const data = await saveAdminConfigApi(config);
      if (data.bootstrap) {
        applyBootstrap(data.bootstrap);
      } else {
        setCompanyConfig(data.config);
        await loadBootstrap();
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "保存管理员配置失败");
    }
  }

  if (isBootstrapping) {
    if (embedded) return <div style={{ padding: 24, color: "#64748b" }}>正在加载生产数据…</div>;
    return (
      <div className="login-screen">
        <div className="login-panel">
          <span className="eyebrow">PlayableOps</span>
          <h1>正在加载生产数据</h1>
          <p>正在校验登录会话和服务端权限。</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    if (embedded) return <div style={{ padding: 24, color: "#64748b" }}>会话失效,请重新登录。</div>;
    return <LoginView onLogin={login} errorMessage={appError} />;
  }

  return (
    <div className={embedded ? undefined : "app-shell"}>
      {!embedded && (
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
          <span className="eyebrow">当前登录</span>
          <div className="session-card">
            <strong>{currentUser.name}</strong>
            <span>{roleLabel[currentUser.roleKey]} · {currentUser.title}</span>
          </div>
          <div className="scope-line">
            <LockKeyhole size={15} />
            <span>{currentUser.roleKey === "admin" ? "全公司项目" : "仅可查看需求提单页"}</span>
          </div>
          <button type="button" className="logout-button" onClick={logout}>
            退出登录
          </button>
        </div>
      </aside>
      )}

      <main className={`workspace ${effectiveView === "tickets" ? "sheet-workspace" : ""}`}>
        {appError && (
          <div className="app-alert" role="alert">
            {appError}
          </div>
        )}
        {!embedded && effectiveView !== "tickets" && (
          <header className="topbar">
            <div>
              <span className="eyebrow">试玩广告制作 · 2026-06</span>
              <h1>{navItems.find((item) => item.key === effectiveView)?.label}</h1>
            </div>
            <div className="topbar-actions">
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
            people={peopleData}
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
            projects={projects}
            people={peopleData}
            tickets={tickets}
            config={companyConfig}
            onSaveConfig={saveAdminConfig}
            onSwitchAdmin={() => undefined}
          />
        )}
      </main>

      {isTicketFormOpen && (
        <TicketForm
          currentUser={currentUser}
          projects={visibleProjects}
          people={visiblePeople}
          config={companyConfig}
          onClose={() => setIsTicketFormOpen(false)}
          onCreate={createTicket}
        />
      )}
    </div>
  );
}

function LoginView({
  onLogin,
  errorMessage,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  errorMessage: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setLocalError("");
    try {
      await onLogin(username, password);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand login-brand">
          <div className="brand-mark">PO</div>
          <div>
            <strong>PlayableOps</strong>
            <span>试玩广告生产中台</span>
          </div>
        </div>
        <div>
          <span className="eyebrow">生产系统登录</span>
          <h1>需求提单数据系统</h1>
        </div>
        <label>
          <span>用户名</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          <span>密码</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </label>
        {(localError || errorMessage) && <div className="app-alert">{localError || errorMessage}</div>}
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "登录中" : "登录"}
        </button>
      </form>
    </main>
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
    .sort((a, b) => getTicketAgeHours(b) - getTicketAgeHours(a))
    .slice(0, 5);

  return (
    <section className="view-stack">
      <div className="kpi-grid">
        <MetricCard icon={BriefcaseBusiness} label="可见项目" value={projects.length} helper="按账号权限过滤" />
        <MetricCard icon={AlertTriangle} label="风险项目" value={metrics.riskProjects} helper="关注与红灯项目" tone="risk" />
        <MetricCard icon={ClipboardList} label="未完成提单" value={metrics.openTickets} helper={`${metrics.agedTickets} 个超过 120 小时`} />
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
              <span className="eyebrow">提单时长</span>
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
        <span>人员人员</span>
        <span>需求提单</span>
        <span>风险/阻塞</span>
        <span>交付</span>
      </div>
      {projects.map((project) => {
        const owner = people.find((person) => person.id === project.ownerId) ?? people.find((person) => person.id === "u-admin");
        const projectTickets = tickets.filter((ticket) => ticket.projectId === project.id);
        const openTickets = projectTickets.filter((ticket) => ticket.status !== "已完成");
        const overdueTickets = openTickets.filter(
          (ticket) => getTicketRemainingHours(ticket) < 0 || getTicketAgeHours(ticket) >= 120
        );
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
  onTimelineMove: (ticketId: string, offsetHours: number, spanHours: number) => void;
  onCreateTicket: () => void;
}) {
  const [activeSheetTab, setActiveSheetTab] = useState<SheetTab>("需求提单");
  const visibleSheetTabs = canViewGanttSheet(currentUser)
    ? sheetTabs
    : sheetTabs.filter((tab) => tab !== "任务甘特图");
  const visibleSheetTab = visibleSheetTabs.includes(activeSheetTab) ? activeSheetTab : "需求提单";
  const groupedTickets = groupTicketsByBoardStatus(tickets);
  const statusSummary = getTicketStatusSummary(statusSummaryTickets);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedTicketIds((current) => {
      const visibleIds = new Set(tickets.map((ticket) => ticket.id));
      const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [tickets]);

  useEffect(() => {
    if (detailTicketId && !tickets.some((ticket) => ticket.id === detailTicketId)) {
      setDetailTicketId(null);
    }
  }, [detailTicketId, tickets]);

  function openTicketDetail(ticketId: string) {
    setActiveSheetTab("需求提单");
    setDetailTicketId(ticketId);
  }

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
            className={statusFilter === "排队中" ? "summary-queue active" : "summary-queue"}
            onClick={() => setStatusFilter("排队中")}
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
            className={statusFilter === "阻塞" ? "summary-blocked active" : "summary-blocked"}
            onClick={() => setStatusFilter("阻塞")}
          >
            阻塞 <strong>{statusSummary.blocked}</strong>
          </button>
          <button
            type="button"
            className={statusFilter === "已完成" ? "summary-done active" : "summary-done"}
            onClick={() => setStatusFilter("已完成")}
          >
            已完成 <strong>{statusSummary.done}</strong>
          </button>
        </div>

        {visibleSheetTab === "需求提单" && (
          <TaskManagementSheet
            currentUser={currentUser}
            groupedTickets={groupedTickets}
            projects={projects}
            people={people}
            selectedTicketIds={selectedTicketIds}
            selectedTicketId={detailTicketId}
            onToggleTicketSelection={toggleTicketSelection}
            onToggleVisibleSelection={toggleVisibleSelection}
            onSelectTicket={setDetailTicketId}
            onStatusChange={onStatusChange}
            onCreateTicket={onCreateTicket}
          />
        )}
        {visibleSheetTab === "延期任务预警" && (
          <OverdueWarningSheet
            tickets={tickets}
            projects={projects}
            people={people}
            onOpenTicketDetail={openTicketDetail}
          />
        )}
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
          <span>状态段：{groupedTickets.filter((group) => group.items.length > 0).length}</span>
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
  selectedTicketId,
  onToggleTicketSelection,
  onToggleVisibleSelection,
  onSelectTicket,
  onStatusChange,
  onCreateTicket,
}: {
  currentUser: Person;
  groupedTickets: TicketBoardGroup[];
  projects: Project[];
  people: Person[];
  selectedTicketIds: Set<string>;
  selectedTicketId: string | null;
  onToggleTicketSelection: (ticketId: string) => void;
  onToggleVisibleSelection: (ticketIds: string[]) => void;
  onSelectTicket: (ticketId: string | null) => void;
  onStatusChange: (ticketId: string, status: TicketStatus) => void;
  onCreateTicket: () => void;
}) {
  const hasRows = groupedTickets.some((group) => group.items.length > 0);
  const visibleGroups = groupedTickets.filter((group) => group.items.length > 0);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const visibleTickets = visibleGroups.flatMap((group) => group.items);
  const selectedTicket = visibleTickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const visibleTicketIds = visibleTickets.map((ticket) => ticket.id);
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  const allVisibleSelected =
    visibleTicketIds.length > 0 && visibleTicketIds.every((ticketId) => selectedTicketIds.has(ticketId));
  const selectedVisibleCount = visibleTicketIds.filter((ticketId) => selectedTicketIds.has(ticketId)).length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

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
          <span>所属项目</span>
          <span>工作内容</span>
          <span>我的提单</span>
          <span>图片/附件/文件</span>
          <span>超链接</span>
          <span>开始日期</span>
          <span>优先级</span>
          <span>状态</span>
          <span>提单时长</span>
          <span>状态停留</span>
          <span>剩余时间</span>
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
            const configuredProjectName = getConfiguredProjectName(ticket, project);
            const userProjectName = getTicketProjectName(ticket);
            const owner = people.find((person) => person.id === ticket.ownerId);
            const requester = people.find((person) => person.id === ticket.requesterId);
            const relation = getTicketRelation(ticket, currentUser, people);
            const canEditStatus = canEditTicketStatus(ticket, currentUser);

            return (
              <article
                className={`task-row ${selectedTicketId === ticket.id ? "selected" : ""}`}
                data-ticket-id={ticket.id}
                data-project-id={ticket.projectId}
                data-requester-id={ticket.requesterId}
                data-owner-id={ticket.ownerId}
                data-discipline={ticket.discipline}
                data-status={ticket.status}
                key={ticket.id}
                onClick={() => onSelectTicket(ticket.id)}
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
                  title={`所属项目：${configuredProjectName} · 项目名称：${userProjectName || "-"} · ${ticket.id} · ${requester?.name ?? "-"}`}
                >
                  <strong>{configuredProjectName}</strong>
                  <small>{userProjectName || "-"}</small>
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
                  <i className={`priority ${getPriorityClass(ticket.priority)}`}>{ticket.priority}</i>
                </span>
                <span>
                  <select
                    className={`status-select ${statusTone[ticket.status]}`}
                    value={ticket.status}
                    disabled={!canEditStatus}
                    title={canEditStatus ? "更新提单状态" : "仅管理员、发起人和负责人可修改状态"}
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
                  <strong className={getTicketAgeHours(ticket) >= 120 && ticket.status !== "已完成" ? "danger-text" : ""}>
                    {formatHours(getTicketAgeHours(ticket))}
                  </strong>
                </span>
                <span className="task-age-cell">
                  <strong className={getTicketStatusAgeHours(ticket) >= 72 && ticket.status !== "已完成" ? "danger-text" : ""}>
                    {formatHours(getTicketStatusAgeHours(ticket))}
                  </strong>
                </span>
                <span className="task-age-cell">
                  <strong className={getTicketRemainingHours(ticket) < 0 ? "danger-text" : ""}>
                    {formatRemainingHours(getTicketRemainingHours(ticket))}
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
                  {Array.from({ length: 13 }).map((_, index) => (
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
          onClose={() => onSelectTicket(null)}
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
  const userProjectName = getTicketProjectName(ticket);
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
          所属项目
          <strong>{getConfiguredProjectName(ticket, project)}</strong>
        </span>
        <span>
          项目名称
          <strong>{userProjectName || "-"}</strong>
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
          <strong>
            提单 {formatHours(getTicketAgeHours(ticket))} / 停留 {formatHours(getTicketStatusAgeHours(ticket))} / {formatRemainingHours(getTicketRemainingHours(ticket))}
          </strong>
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
                <span className="attachment-actions">
                  {attachment.openUrl && (
                    <a href={attachment.openUrl} target="_blank" rel="noreferrer" title={`打开 ${attachment.name}`}>
                      <ExternalLink size={14} />
                      打开
                    </a>
                  )}
                  {attachment.downloadUrl && (
                    <a href={attachment.downloadUrl} download title={`下载 ${attachment.name}`}>
                      <Download size={14} />
                      下载
                    </a>
                  )}
                </span>
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
  onOpenTicketDetail,
}: {
  tickets: Ticket[];
  projects: Project[];
  people: Person[];
  onOpenTicketDetail: (ticketId: string) => void;
}) {
  const warningTickets = tickets
    .filter((ticket) => ticket.status !== "已完成" && getTicketRemainingHours(ticket) <= getTicketRiskWarningHours(ticket))
    .sort((a, b) => getTicketRemainingHours(a) - getTicketRemainingHours(b) || getTicketAgeHours(b) - getTicketAgeHours(a));

  return (
    <div className="sheet-alt-table warning-table">
      <div className="warning-head">
        <span>所属项目</span>
        <span>工作内容</span>
        <span>负责人</span>
        <span>状态</span>
        <span>提单时长</span>
        <span>停留时长</span>
        <span>剩余时间</span>
        <span>风险</span>
        <span>操作</span>
      </div>
      {warningTickets.length === 0 && <div className="sheet-empty-row">暂无延期或临近风险</div>}
      {warningTickets.map((ticket) => {
        const project = resolveTicketProject(ticket, projects);
        const userProjectName = getTicketProjectName(ticket);
        const owner = people.find((person) => person.id === ticket.ownerId);
        return (
          <article
            className="warning-row"
            data-ticket-id={ticket.id}
            data-project-id={ticket.projectId}
            data-requester-id={ticket.requesterId}
            data-owner-id={ticket.ownerId}
            data-discipline={ticket.discipline}
            data-status={ticket.status}
            key={ticket.id}
          >
            <span className="sheet-long-cell project-name-stack">
              <strong>{getConfiguredProjectName(ticket, project)}</strong>
              <small>{userProjectName || "-"}</small>
            </span>
            <span className="sheet-long-cell">{ticket.title}</span>
            <span>
              <strong className={`owner-chip owner-${ticket.discipline}`}>{ticket.discipline}-{owner?.name ?? "-"}</strong>
            </span>
            <span>
              <span className={`pill ${statusTone[ticket.status]}`}>{ticket.status}</span>
            </span>
            <span className={getTicketAgeHours(ticket) >= 120 ? "danger-text" : ""}>{formatHours(getTicketAgeHours(ticket))}</span>
            <span>{formatHours(getTicketStatusAgeHours(ticket))}</span>
            <span className={getTicketRemainingHours(ticket) < 0 ? "danger-text" : ""}>{formatRemainingHours(getTicketRemainingHours(ticket))}</span>
            <span>
              <span className={`warning-chip ${getWarningTone(ticket)}`}>{getWarningLabel(ticket)}</span>
            </span>
            <span>
              <button
                type="button"
                className="warning-detail-button"
                onClick={() => onOpenTicketDetail(ticket.id)}
              >
                查看详情
              </button>
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
  onTimelineMove: (ticketId: string, offsetHours: number, spanHours: number) => void;
}) {
  const [draggingTimeline, setDraggingTimeline] = useState<{
    pointerId: number;
    ticketId: string;
    mode: "move" | "resize";
    startClientX: number;
    startOffsetHours: number;
    startSpanHours: number;
    previewOffsetHours: number;
    previewSpanHours: number;
  } | null>(null);
  const rows = tickets;

  function getPreviewOffsetHours(ticket: Ticket) {
    return draggingTimeline?.ticketId === ticket.id ? draggingTimeline.previewOffsetHours : getGanttOffsetHours(ticket);
  }

  function getPreviewSpanHours(ticket: Ticket) {
    return draggingTimeline?.ticketId === ticket.id ? draggingTimeline.previewSpanHours : getGanttSpanHours(ticket);
  }

  function resolveDrag(clientX: number, drag = draggingTimeline) {
    if (!drag) {
      return { offsetHours: 0, spanHours: ganttMinSpanHours };
    }
    const deltaHours = Math.round((clientX - drag.startClientX) / ganttHourWidth);
    if (drag.mode === "resize") {
      return {
        offsetHours: drag.startOffsetHours,
        spanHours: clampGanttSpanHours(drag.startSpanHours + deltaHours),
      };
    }
    return {
      offsetHours: clampGanttOffsetHours(drag.startOffsetHours + deltaHours),
      spanHours: drag.startSpanHours,
    };
  }

  function startTimelineDrag(event: ReactPointerEvent<HTMLButtonElement>, ticket: Ticket) {
    if (!canEditTimeline) return;
    event.preventDefault();
    event.stopPropagation();
    const startOffsetHours = getGanttOffsetHours(ticket);
    const startSpanHours = getGanttSpanHours(ticket);
    const target = event.target as HTMLElement;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingTimeline({
      pointerId: event.pointerId,
      ticketId: ticket.id,
      mode: target.closest(".gantt-resize-handle") ? "resize" : "move",
      startClientX: event.clientX,
      startOffsetHours,
      startSpanHours,
      previewOffsetHours: startOffsetHours,
      previewSpanHours: startSpanHours,
    });
  }

  function moveTimelineDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingTimeline || draggingTimeline.pointerId !== event.pointerId) return;
    event.preventDefault();
    const preview = resolveDrag(event.clientX);
    setDraggingTimeline((current) =>
      current
        ? {
            ...current,
            previewOffsetHours: preview.offsetHours,
            previewSpanHours: preview.spanHours,
          }
        : current
    );
  }

  function finishTimelineDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingTimeline || draggingTimeline.pointerId !== event.pointerId) return;
    event.preventDefault();
    const next = resolveDrag(event.clientX);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser on cancel.
    }
    onTimelineMove(draggingTimeline.ticketId, next.offsetHours, next.spanHours);
    setDraggingTimeline(null);
  }

  return (
    <div className="sheet-alt-table gantt-sheet">
      <div className="gantt-head">
        <span>所属项目</span>
        <span>工作内容</span>
        <span>负责人</span>
        <span>开始日期</span>
        <span>周期</span>
        <span>时间线</span>
      </div>
      {rows.length === 0 && <div className="sheet-empty-row">暂无甘特图数据</div>}
      {rows.map((ticket) => {
        const project = resolveTicketProject(ticket, projects);
        const userProjectName = getTicketProjectName(ticket);
        const owner = people.find((person) => person.id === ticket.ownerId);
        const spanHours = getPreviewSpanHours(ticket);
        const offsetHours = getPreviewOffsetHours(ticket);
        const offset = offsetHours * ganttHourWidth;
        const width = Math.max(72, Math.min(420, spanHours * ganttHourWidth));
        const isDragging = draggingTimeline?.ticketId === ticket.id;

        return (
          <article
            className="gantt-row"
            data-ticket-id={ticket.id}
            data-project-id={ticket.projectId}
            data-requester-id={ticket.requesterId}
            data-owner-id={ticket.ownerId}
            data-discipline={ticket.discipline}
            data-status={ticket.status}
            data-offset-hours={offsetHours}
            data-span-hours={spanHours}
            data-start-at={ticket.startAt}
            key={ticket.id}
          >
            <span className="sheet-long-cell project-name-stack">
              <strong>{getConfiguredProjectName(ticket, project)}</strong>
              <small>{userProjectName || "-"}</small>
            </span>
            <span className="sheet-long-cell">{ticket.title}</span>
            <span>
              <strong className={`owner-chip owner-${ticket.discipline}`}>{owner?.name ?? "-"}</strong>
            </span>
            <span>{ticket.startAt}</span>
            <span>{formatHours(spanHours)}</span>
            <span className="gantt-timeline">
              <button
                type="button"
                aria-disabled={!canEditTimeline}
                aria-label={`${ticket.title} 甘特时间线，${formatHours(spanHours)}`}
                className={`gantt-bar status-${ticket.status} ${canEditTimeline ? "draggable" : "readonly"} ${
                  isDragging ? "dragging" : ""
                }`}
                onPointerDown={(event) => startTimelineDrag(event, ticket)}
                onPointerMove={moveTimelineDrag}
                onPointerUp={finishTimelineDrag}
                onPointerCancel={finishTimelineDrag}
                style={{ marginLeft: offset, width }}
                title={canEditTimeline ? "拖动条形移动时间线，拖右侧手柄调整长短" : "仅管理员可调整"}
              >
                {canEditTimeline && <span className="gantt-resize-handle" aria-hidden="true" />}
              </button>
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
  config,
  onSaveConfig,
  onSwitchAdmin,
}: {
  currentUser: Person;
  projects: Project[];
  people: Person[];
  tickets: Ticket[];
  config: CompanyConfig;
  onSaveConfig: (config: CompanyConfig) => void | Promise<void>;
  onSwitchAdmin: () => void;
}) {
  const [projectNameDrafts, setProjectNameDrafts] = useState<ProjectNameOption[]>(config.projectNameOptions);
  const [typeSettingDrafts, setTypeSettingDrafts] = useState<TicketTypeSetting[]>(config.ticketTypeSettings);
  const [newProjectName, setNewProjectName] = useState("");
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    setProjectNameDrafts(config.projectNameOptions);
    setTypeSettingDrafts(config.ticketTypeSettings);
  }, [config]);

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
  const overdueTickets = openTickets.filter((ticket) => getTicketRemainingHours(ticket) < 0);
  const averageLoad = Math.round(people.reduce((sum, person) => sum + person.capacity, 0) / people.length);
  const disciplineLoads = disciplineOptions.map((discipline) => {
    const members = people.filter((person) => person.discipline === discipline);
    const load = members.length
      ? Math.round(members.reduce((sum, person) => sum + person.capacity, 0) / members.length)
      : 0;
    return { discipline, load };
  });

  function addProjectName() {
    const name = newProjectName.trim();
    if (!name || projectNameDrafts.some((option) => option.name === name)) return;
    setProjectNameDrafts((items) => [...items, { id: `draft-${Date.now()}`, name }]);
    setNewProjectName("");
  }

  function removeProjectName(id: string) {
    setProjectNameDrafts((items) => (items.length > 1 ? items.filter((item) => item.id !== id) : items));
  }

  function updateTypeSetting(typeKey: Discipline, field: "defaultDeliveryHours" | "riskWarningHours", value: number) {
    setTypeSettingDrafts((items) =>
      items.map((item) =>
        item.typeKey === typeKey
          ? {
              ...item,
              [field]: Math.max(1, Math.round(value || 1)),
            }
          : item
      )
    );
  }

  async function saveConfig() {
    setIsSavingConfig(true);
    try {
      await onSaveConfig({
        projectNameOptions: projectNameDrafts,
        ticketTypeSettings: typeSettingDrafts,
      });
    } finally {
      setIsSavingConfig(false);
    }
  }

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
              <span>本人发起、或本人负责的提单</span>
            </div>
            <div>
              <strong>制作人员</strong>
              <span>本人发起、或本人负责的提单</span>
            </div>
          </div>
        </section>
      </div>

      <section className="admin-config-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">配置</span>
            <h2>提单默认规则</h2>
          </div>
          <button className="primary-button" type="button" onClick={saveConfig} disabled={isSavingConfig}>
            <Save size={17} />
            <span>{isSavingConfig ? "保存中" : "保存配置"}</span>
          </button>
        </div>

        <div className="admin-config-grid">
          <div className="admin-config-block">
            <div className="config-block-head">
              <strong>所属项目列表</strong>
              <small>新建提单时的“所属项目”候选项</small>
            </div>
            <div className="project-name-editor">
              {projectNameDrafts.map((option) => (
                <span key={option.id}>
                  <input
                    value={option.name}
                    onChange={(event) =>
                      setProjectNameDrafts((items) =>
                        items.map((item) => (item.id === option.id ? { ...item, name: event.target.value } : item))
                      )
                    }
                  />
                  <button type="button" title="移除所属项目" onClick={() => removeProjectName(option.id)}>
                    <Trash2 size={15} />
                  </button>
                </span>
              ))}
            </div>
            <div className="project-name-add">
              <input
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="新增所属项目"
              />
              <button type="button" className="ghost-button" onClick={addProjectName}>
                <Plus size={16} />
                <span>添加</span>
              </button>
            </div>
          </div>

          <div className="admin-config-block">
            <div className="config-block-head">
              <strong>类型交付时间</strong>
              <small>新提单按负责人环节自动套用，风险按剩余小时判断</small>
            </div>
            <div className="type-setting-editor">
              {typeSettingDrafts.map((setting) => (
                <div key={setting.typeKey}>
                  <strong>{setting.label}</strong>
                  <label>
                    <span>默认交付小时</span>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={setting.defaultDeliveryHours}
                      onChange={(event) =>
                        updateTypeSetting(setting.typeKey, "defaultDeliveryHours", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    <span>风险阈值小时</span>
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={setting.riskWarningHours}
                      onChange={(event) =>
                        updateTypeSetting(setting.typeKey, "riskWarningHours", Number(event.target.value))
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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
  config,
  onClose,
  onCreate,
}: {
  currentUser: Person;
  projects: Project[];
  people: Person[];
  config: CompanyConfig;
  onClose: () => void;
  onCreate: (ticket: TicketCreatePayload) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const hasOpsProjects = useMemo(() => projects.some((project) => isOpsProjectId(project.id)), [projects]);
  const configuredProjectNames = useMemo(
    () => {
      if (!config.projectNameOptions.length) {
        return projects.map((project) => ({ id: project.id, name: project.name, projectId: project.id }));
      }
      if (!hasOpsProjects) return config.projectNameOptions;
      const visibleClients = new Set(projects.map((project) => project.client));
      const scopedOptions = config.projectNameOptions.filter((option) => option.source !== "ops-tenant" || visibleClients.has(option.name));
      return scopedOptions.length ? scopedOptions : config.projectNameOptions;
    },
    [config.projectNameOptions, hasOpsProjects, projects]
  );
  const [sourceProjectOptionId, setSourceProjectOptionId] = useState(configuredProjectNames[0]?.id ?? "");
  const selectedSourceProject =
    configuredProjectNames.find((option) => option.id === sourceProjectOptionId) ?? configuredProjectNames[0];
  const sourceProjectName = selectedSourceProject?.name ?? projects[0]?.name ?? "";
  const projectNameCandidates = useMemo(() => {
    if (!hasOpsProjects) return [];
    const matchingProjects = projects.filter((project) => project.client === sourceProjectName);
    return matchingProjects.length ? matchingProjects : projects;
  }, [hasOpsProjects, projects, sourceProjectName]);
  const [selectedProjectNameId, setSelectedProjectNameId] = useState(projectNameCandidates[0]?.id ?? projects[0]?.id ?? "p1");
  const selectedProjectName =
    projectNameCandidates.find((project) => project.id === selectedProjectNameId) ?? projectNameCandidates[0];
  const projectId = hasOpsProjects
    ? selectedProjectName?.id ?? projects[0]?.id ?? "p1"
    : selectedSourceProject
      ? resolveProjectNameOptionProjectId(selectedSourceProject, projects)
      : projects[0]?.id ?? "p1";
  const [manualProjectName, setManualProjectName] = useState("");
  const projectName = hasOpsProjects ? selectedProjectName?.name ?? "" : manualProjectName;
  const [discipline, setDiscipline] = useState<Discipline>(
    currentUser.discipline !== "管理" && currentUser.discipline !== "项目" ? currentUser.discipline : "美术"
  );
  const [ownerId, setOwnerId] = useState(people.find((person) => person.discipline === discipline)?.id ?? people[0].id);
  const [priority, setPriority] = useState<Priority>("普通");
  const [needType, setNeedType] = useState("资产补充");
  const [summary, setSummary] = useState("");
  const [hyperlink, setHyperlink] = useState("");
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const ownerCandidates = useMemo(
    () => people.filter((person) => person.discipline === discipline),
    [discipline, people]
  );
  const selectedTypeSetting =
    config.ticketTypeSettings.find((setting) => setting.typeKey === discipline) ??
    fallbackCompanyConfig.ticketTypeSettings.find((setting) => setting.typeKey === discipline);
  const dueInHours = selectedTypeSetting?.defaultDeliveryHours ?? 72;
  const canSubmitTicket = ownerCandidates.some((person) => person.id === ownerId);

  useEffect(() => {
    if (!canSubmitTicket) {
      setOwnerId(ownerCandidates[0]?.id ?? "");
    }
  }, [canSubmitTicket, ownerCandidates]);

  useEffect(() => {
    if (!configuredProjectNames.some((option) => option.id === sourceProjectOptionId)) {
      setSourceProjectOptionId(configuredProjectNames[0]?.id ?? "");
    }
  }, [configuredProjectNames, sourceProjectOptionId]);

  useEffect(() => {
    if (!hasOpsProjects) return;
    if (!projectNameCandidates.some((project) => project.id === selectedProjectNameId)) {
      setSelectedProjectNameId(projectNameCandidates[0]?.id ?? projects[0]?.id ?? "");
    }
  }, [hasOpsProjects, projectNameCandidates, projects, selectedProjectNameId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitTicket) return;
    onCreate({
      title: title.trim() || "未命名需求",
      sourceProjectName: sourceProjectName.trim() || undefined,
      projectName: projectName.trim() || undefined,
      projectId,
      requesterId: currentUser.id,
      ownerId,
      discipline,
      priority,
      dueInHours,
      needType,
      summary: summary.trim() || "待补充说明",
      hyperlink: hyperlink.trim() || undefined,
      text: text.trim() || undefined,
      attachments,
    });
  }

  async function addFiles(files: FileList | null, kindHint?: TicketAttachment["kind"]) {
    if (!files?.length) return;
    const nextAttachments = await Promise.all(
      Array.from(files).map(async (file, index) => ({
        id: `upload-${Date.now()}-${index}-${file.name}`,
        name: file.name,
        kind: kindHint ?? (file.type.startsWith("image/") ? "图片" : "文件"),
        size: formatFileSize(file.size),
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
      }))
    );
    setAttachments((items) => [...items, ...nextAttachments]);
  }

  function removeAttachment(id: string) {
    setAttachments((items) => items.filter((attachment) => attachment.id !== id));
  }

  function changeDiscipline(value: Discipline) {
    setDiscipline(value);
    const nextOwner = people.find((person) => person.discipline === value);
    setOwnerId(nextOwner?.id ?? "");
    const nextSetting = config.ticketTypeSettings.find((setting) => setting.typeKey === value);
    if (!needType.trim() || disciplineOptions.includes(needType as Discipline)) {
      setNeedType(nextSetting?.label ?? value);
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
            <select value={selectedSourceProject?.id ?? ""} onChange={(event) => setSourceProjectOptionId(event.target.value)}>
              {configuredProjectNames.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>项目名称</span>
            {hasOpsProjects ? (
              <select value={selectedProjectName?.id ?? ""} onChange={(event) => setSelectedProjectNameId(event.target.value)}>
                {projectNameCandidates.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={manualProjectName}
                onChange={(event) => setManualProjectName(event.target.value)}
                placeholder="用户填写项目名称"
              />
            )}
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
            <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={!ownerCandidates.length}>
              {!ownerCandidates.length && (
                <option value="">
                  暂无可选负责人
                </option>
              )}
              {ownerCandidates.map((person) => (
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
            <span>期望小时</span>
            <input
              type="number"
              min={1}
              max={720}
              value={dueInHours}
              readOnly
              title="由管理员后台的类型交付时间自动计算"
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
                  void addFiles(event.currentTarget.files, "图片");
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
                  void addFiles(event.currentTarget.files, "附件");
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
                  void addFiles(event.currentTarget.files, "文件");
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
          <button className="primary-button" type="submit" disabled={!canSubmitTicket}>
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
        <span>{getConfiguredProjectName(ticket, project)} · {owner?.name ?? "-"}</span>
      </div>
      <div>
        <span className={`pill ${statusTone[ticket.status]}`}>{ticket.status}</span>
        <b className={getTicketAgeHours(ticket) >= 120 ? "danger-text" : ""}>{formatHours(getTicketAgeHours(ticket))}</b>
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

function resolveProjectNameOptionProjectId(option: ProjectNameOption, projects: Project[]) {
  return (
    option.projectId ??
    projects.find((project) => project.id === option.id)?.id ??
    projects.find((project) => project.name === option.name)?.id ??
    projects[0]?.id ??
    "p1"
  );
}

function isOpsProjectId(id: string) {
  return id.startsWith("ops-project-");
}

function getConfiguredProjectName(ticket: Ticket, project: Project) {
  return ticket.sourceProjectName ?? project.name;
}

function getTicketProjectName(ticket: Ticket) {
  return ticket.projectName?.trim() ?? "";
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
  return { label: `项目相关 ${requester?.name ?? "-"} -> ${owner?.name ?? "-"}`, tone: "relation-related" };
}

function countTicketsByStatus(tickets: Ticket[], status: TicketStatus) {
  return tickets.filter((ticket) => ticket.status === status).length;
}

function matchesStatusFilter(ticket: Ticket, statusFilter: TicketStatusFilter) {
  if (statusFilter === "全部") return true;
  return ticket.status === statusFilter;
}

function getTicketStatusSummary(tickets: Ticket[]) {
  return {
    queue: countTicketsByStatus(tickets, "排队中"),
    doing: countTicketsByStatus(tickets, "进行中"),
    blocked: countTicketsByStatus(tickets, "阻塞"),
    done: countTicketsByStatus(tickets, "已完成"),
  };
}

function getWarningLabel(ticket: Ticket) {
  const remainingHours = getTicketRemainingHours(ticket);
  if (remainingHours < 0) return "已延期";
  if (remainingHours === 0) return "本小时到期";
  if (remainingHours <= getTicketRiskWarningHours(ticket)) return "临近";
  if (getTicketAgeHours(ticket) >= 120) return "久未完成";
  return "观察";
}

function getWarningTone(ticket: Ticket) {
  const remainingHours = getTicketRemainingHours(ticket);
  if (remainingHours < 0 || ticket.status === "阻塞") return "warning-red";
  if (remainingHours <= getTicketRiskWarningHours(ticket) || getTicketAgeHours(ticket) >= 120) return "warning-amber";
  return "warning-blue";
}

function groupTicketsByBoardStatus(tickets: Ticket[]): TicketBoardGroup[] {
  const groups = [
    {
      label: "排队中",
      tone: "queue",
      statuses: ["排队中"] as TicketStatus[],
    },
    {
      label: "进行中",
      tone: "doing",
      statuses: ["进行中"] as TicketStatus[],
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

function formatHours(hours: number) {
  const normalized = Math.max(0, Math.round(hours));
  if (normalized < 24) return `${normalized} 小时`;
  const days = Math.floor(normalized / 24);
  const restHours = normalized % 24;
  return restHours ? `${days} 天 ${restHours} 小时` : `${days} 天`;
}

function formatRemainingHours(hours: number) {
  const normalized = Math.round(hours);
  if (normalized < 0) return `逾期 ${formatHours(Math.abs(normalized))}`;
  if (normalized === 0) return "本小时到期";
  return `剩 ${formatHours(normalized)}`;
}

function getTicketAgeHours(ticket: Ticket) {
  return Math.max(0, Math.round(ticket.ageHours ?? ticket.ageDays * 24));
}

function getTicketStatusAgeHours(ticket: Ticket) {
  return Math.max(0, Math.round(ticket.statusAgeHours ?? ticket.statusAgeDays * 24));
}

function getTicketRemainingHours(ticket: Ticket) {
  return Math.round(ticket.remainingHours ?? ticket.dueInDays * 24);
}

function getTicketRiskWarningHours(ticket: Ticket) {
  return Math.max(1, Math.round(ticket.riskWarningHours ?? 8));
}

function getPriorityClass(priority: Priority) {
  const classes: Record<Priority, string> = {
    紧急: "priority-urgent",
    优先: "priority-high",
    普通: "priority-normal",
    低优先: "priority-low",
  };
  return classes[priority];
}

function clampGanttOffsetHours(hours: number) {
  return Math.max(0, Math.min(ganttMaxOffsetHours, Math.round(hours)));
}

function clampGanttSpanHours(hours: number) {
  return Math.max(ganttMinSpanHours, Math.min(ganttMaxSpanHours, Math.round(hours)));
}

function getGanttOffsetHours(ticket: Ticket) {
  return clampGanttOffsetHours(ticket.timelineOffsetHours ?? (ticket.timelineOffsetDays ?? ticket.ageDays) * 24);
}

function getGanttSpanHours(ticket: Ticket) {
  return clampGanttSpanHours(ticket.timelineSpanHours ?? ticket.dueInHours ?? Math.max(4, ticket.dueInDays * 24));
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

export default App;
