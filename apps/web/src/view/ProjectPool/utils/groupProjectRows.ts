import type { OpsProjectPoolMember, OpsProjectPoolRow } from "@/api/modules/ops";
import { PROJECT_STAGES, PROJECT_STATUSES } from "@/view/Ops/constants";
import { isNextDeadlineOverdue, stageRangeLabel } from "../deadlineUtils";

export type ProjectPoolOwnerRow = OpsProjectPoolRow & {
  ownerTagsText?: string;
};

export type ProjectPoolGroup = {
  key: string;
  title: string;
  avatar?: string;
  segmentIds?: number[];
  ownerName?: string;
  rows: ProjectPoolOwnerRow[];
  stats: {
    projectCount: number;
    deadlineOverdue: number;
    ticketOverdue: number;
    ticketTotal: number;
  };
};

export type ProjectPoolGroupMode = "planner" | "segment" | "stage" | "status" | "owner";

export type ProjectPoolOwnerMember = OpsProjectPoolMember & {
  project: OpsProjectPoolRow;
  matchedTags: string[];
};

const groupStats = (rows: ProjectPoolOwnerRow[]): ProjectPoolGroup["stats"] => ({
  projectCount: rows.length,
  deadlineOverdue: rows.filter(isNextDeadlineOverdue).length,
  ticketOverdue: rows.reduce((sum, row) => sum + (row.overdue || 0), 0),
  ticketTotal: rows.reduce((sum, row) => sum + (row.ticketTotal || 0), 0),
});

const bySizeDesc = (a: ProjectPoolGroup, b: ProjectPoolGroup) => b.rows.length - a.rows.length || a.title.localeCompare(b.title, "zh-CN");
const stageOrder = new Map(PROJECT_STAGES.map((stage, index) => [stage, index]));
const statusOrder = new Map(PROJECT_STATUSES.map((status, index) => [status, index]));

// 按策划分组
export const groupProjectsByPlanner = (rows: OpsProjectPoolRow[]): ProjectPoolGroup[] => {
  const groups = new Map<string, { title: string; avatar?: string; rows: OpsProjectPoolRow[] }>();
  const add = (key: string, title: string, avatar: string | undefined, row: OpsProjectPoolRow) => {
    const group = groups.get(key) || { title, avatar, rows: [] };
    if (!group.avatar && avatar) group.avatar = avatar;
    group.rows.push(row);
    groups.set(key, group);
  };

  for (const row of rows) {
    const planners = row.planners?.length ? row.planners : row.plannerName ? row.plannerName.split(/[、,，/]/).map((name) => ({ name: name.trim(), avatar: "" })) : [];
    const validPlanners = planners.map((planner) => planner.name.trim()).filter(Boolean);
    if (!validPlanners.length) {
      add("__unassigned_planner", "未指定策划", undefined, row);
      continue;
    }
    for (const planner of planners) {
      const plannerName = planner.name.trim();
      if (plannerName) add(plannerName, plannerName, planner.avatar || undefined, row);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => ({ key, title: group.title, avatar: group.avatar, rows: group.rows, stats: groupStats(group.rows) }))
    .sort(bySizeDesc);
};

// 按环节分组
export const groupProjectsBySegment = (rows: OpsProjectPoolRow[]): ProjectPoolGroup[] => {
  const groups = new Map<string, { title: string; segmentId: number; rows: OpsProjectPoolRow[]; ticketTotal: number }>();
  for (const row of rows) {
    if (!row.segments.length) {
      const group = groups.get("__no_segment") || { title: "暂无环节", segmentId: 0, rows: [], ticketTotal: 0 };
      group.rows.push(row);
      groups.set("__no_segment", group);
      continue;
    }
    for (const segment of row.segments) {
      const key = String(segment.id);
      const group = groups.get(key) || { title: segment.name, segmentId: segment.id, rows: [], ticketTotal: 0 };
      group.rows.push(row);
      group.ticketTotal += segment.count || 0;
      groups.set(key, group);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key: `segment-${key}`,
      title: group.title,
      segmentIds: group.segmentId ? [group.segmentId] : undefined,
      rows: group.rows,
      stats: { ...groupStats(group.rows), ticketTotal: group.ticketTotal || groupStats(group.rows).ticketTotal },
    }))
    .sort(bySizeDesc);
};

// 按阶段分组
export const groupProjectsByStage = (rows: OpsProjectPoolRow[]): ProjectPoolGroup[] => {
  const groups = new Map<string, { title: string; rawStage: string; rows: OpsProjectPoolRow[] }>();
  for (const row of rows) {
    const rawStage = row.stage?.trim() || "未设置阶段";
    const key = rawStage || "__no_stage";
    const group = groups.get(key) || { title: rawStage === "未设置阶段" ? rawStage : stageRangeLabel(rawStage), rawStage, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => ({ key: `stage-${key}`, title: group.title, rows: group.rows, stats: groupStats(group.rows), rawStage: group.rawStage }))
    .sort((a, b) => {
      const aOrder = stageOrder.get(a.rawStage) ?? 999;
      const bOrder = stageOrder.get(b.rawStage) ?? 999;
      return aOrder - bOrder || bySizeDesc(a, b);
    });
};

// 按状态分组
export const groupProjectsByStatus = (rows: OpsProjectPoolRow[]): ProjectPoolGroup[] => {
  const groups = new Map<string, { title: string; rows: OpsProjectPoolRow[] }>();
  for (const row of rows) {
    const title = row.status?.trim() || "未设置状态";
    const key = title || "__no_status";
    const group = groups.get(key) || { title, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => ({ key: `status-${key}`, title: group.title, rows: group.rows, stats: groupStats(group.rows) }))
    .sort((a, b) => {
      const aOrder = statusOrder.get(a.title) ?? 999;
      const bOrder = statusOrder.get(b.title) ?? 999;
      return aOrder - bOrder || bySizeDesc(a, b);
    });
};

// 按负责人分组
export const groupProjectsByOwner = (members: ProjectPoolOwnerMember[]): ProjectPoolGroup[] => {
  const groups = new Map<
    string,
    {
      title: string;
      avatar?: string;
      rows: Map<string, ProjectPoolOwnerRow & { ownerTagNames: Set<string> }>;
    }
  >();

  for (const member of members) {
    const title = member.name?.trim() || "未指定负责人";
    const key = title || "__no_owner";
    const group = groups.get(key) || { title, avatar: member.avatar || undefined, rows: new Map() };
    if (!group.avatar && member.avatar) group.avatar = member.avatar;
    const row = group.rows.get(member.project.id) || ({ ...member.project, ownerTagNames: new Set<string>() } as ProjectPoolOwnerRow & { ownerTagNames: Set<string> });
    for (const tag of member.matchedTags) row.ownerTagNames.add(tag);
    row.ownerTagsText = [...row.ownerTagNames].join("、");
    group.rows.set(member.project.id, row);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const rows = [...group.rows.values()].map((row) => {
        const { ownerTagNames: _ownerTagNames, ...projectRow } = row;
        return projectRow;
      });
      return {
        key: `owner-${key}`,
        title: group.title,
        avatar: group.avatar,
        ownerName: group.title,
        rows,
        stats: groupStats(rows),
      };
    })
    .sort(bySizeDesc);
};

export const groupProjects = (rows: OpsProjectPoolRow[], mode: ProjectPoolGroupMode): ProjectPoolGroup[] => {
  if (mode === "planner") return groupProjectsByPlanner(rows);
  if (mode === "segment") return groupProjectsBySegment(rows);
  if (mode === "stage") return groupProjectsByStage(rows);
  if (mode === "status") return groupProjectsByStatus(rows);
  return [];
};
