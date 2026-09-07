import assert from "node:assert/strict";
import test from "node:test";
import { soyooClient } from "../ops/soyoo-client.mjs";
import { getFeedbackResponsibles, getResponsibles, buildTicketSnapshot } from "../ops/ops-realtime.mjs";
import { prepareTicketCreate } from "../ops/ops-routes.mjs";

const tags = [{ id: "12", name: "程序" }];
const segments = [{ id: 14, name: "程序第一版", tags, defaultDeliveryHours: 24 }, { id: 15, name: "地编", tags: [{ id: "11", name: "地编" }] }];
const data = { project: { id: 1074, name: "112A", tenant_id: 54, tenant_name: "jx" }, members: [
  { user_id: 9, username: "nick", user_status: "active", tags: [{ id: 13, name: "管理员" }] },
  { user_id: 8, username: "programmer", user_status: "active", tags },
  { user_id: 10, username: "no-tags", user_status: "active", tags: [] },
  { user_id: 11, username: "disabled", user_status: "disabled", tags },
] };
function mockDirectory(t) {
  t.mock.method(soyooClient, "projectMembers", async (ref) => { assert.equal(ref, "1074::version-109"); return structuredClone(data); });
  t.mock.method(soyooClient, "user", async () => ({ id: 7, username: "producer", tags: [{ name: "制片" }] }));
}

test("feedback candidates include admin-only and untagged project members without defaulting them to programmers", async (t) => {
  mockDirectory(t);
  const result = await getFeedbackResponsibles("1074::version-109", segments);
  assert.equal(result.assignmentMode, "project-members");
  assert.deepEqual(result.members.map(member => member.id), ["9", "8", "10"]);
  assert.deepEqual(result.members[0].segmentIds, []);
  assert.deepEqual(result.segments[0].members.map(member => member.id), ["8"]);
  assert.equal(result.segments[1].members.length, 0);
  const standard = await getResponsibles("1074::version-109", segments);
  assert.deepEqual(standard.members.map(member => member.id), ["8"]);
});

test("feedback snapshot uses chosen work tag for nick but standard OPS still rejects mismatched tags", async (t) => {
  mockDirectory(t);
  const input = { projectId: "1074", projectVersionId: "109", ownerId: "9", requesterUserId: "7", segTags: tags };
  assert.match((await buildTicketSnapshot(input)).error, /标签不匹配/);
  const result = await buildTicketSnapshot({ ...input, allowProjectMember: true });
  assert.equal(result.snapshot.owner_username, "nick");
  assert.equal(result.snapshot.tag_id, "12");
  assert.equal(result.snapshot.tag_name, "程序");
  assert.deepEqual(data.members[0].tags, [{ id: 13, name: "管理员" }]);
  assert.match((await buildTicketSnapshot({ ...input, ownerId: "999", allowProjectMember: true })).error, /不在该项目/);
  assert.match((await buildTicketSnapshot({ ...input, ownerId: "11", allowProjectMember: true })).error, /停用/);
  assert.match((await buildTicketSnapshot({ ...input, segTags: [], allowProjectMember: true })).error, /未绑定/);
});

test("actual ticket preparation permits explicit feedback assignment, but a browser body cannot enable it", async (t) => {
  mockDirectory(t);
  const database = {
    ops_segments: { findUnique: async ({ where }) => where.id === 14 ? { id: 14, name: "程序第一版", default_delivery_hours: 24, risk_warning_hours: 4 } : null },
    ops_segment_tags: { findMany: async () => [{ tag_id: 12 }] },
  };
  t.mock.method(soyooClient, "tags", async () => tags);
  const input = { database, user: { id: "7", roleKey: "admin" }, body: { projectId: "1074", projectVersionId: "109", ownerId: "9", segmentId: 14, dueInHours: 8, summary: "反馈修订", feedbackAssignment: true, allowProjectMember: true } };
  assert.match((await prepareTicketCreate(input)).error, /标签不匹配/);
  const result = await prepareTicketCreate({ ...input, feedbackAssignment: true });
  assert.equal(result.data.owner_username, "nick");
  assert.equal(result.data.project_version_id, "109");
  assert.equal(result.data.discipline, "程序第一版");
  assert.equal(result.data.due_in_hours, 8);
  assert.match((await prepareTicketCreate({ ...input, feedbackAssignment: true, body: { ...input.body, segmentId: 999 } })).error, /环节不存在/);
});
