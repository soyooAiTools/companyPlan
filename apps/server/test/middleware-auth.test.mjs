import assert from "node:assert/strict";
import test from "node:test";
import { mapAuthPerson } from "../middleware/auth.mjs";

test("session identity includes username and role for downstream role-gated apps", () => {
  const user = mapAuthPerson({
    id: "42",
    username: "producer",
    name: "测试制片",
    role_key: "producer",
    title: "",
    discipline: "",
    capacity: 0,
    completion: 0,
  });

  assert.equal(user.username, "producer");
  assert.equal(user.roleKey, "producer");
});
