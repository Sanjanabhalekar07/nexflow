import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCondition,
  evaluateTransform,
  getSkippedNodes,
  isWorkflow,
  parseSampleInput,
  readPayloadPath,
  renderMessage,
  validateWorkflow,
} from "../lib/workflow-engine.ts";

const workflow = () => ({
  id: "example",
  name: "Example flow",
  updated: "2026-01-01T00:00:00.000Z",
  nodes: [
    { id: "trigger", kind: "trigger", title: "Start", x: 0, y: 0, config: { sampleData: '{"status":"active"}' } },
    { id: "condition", kind: "condition", title: "Active?", x: 250, y: 0, config: { field: "status", operator: "equals", value: "active" } },
    { id: "yes", kind: "end", title: "Continue", x: 500, y: 0, config: {} },
    { id: "no", kind: "end", title: "Stop", x: 500, y: 150, config: {} },
  ],
  edges: [
    { id: "e1", from: "trigger", to: "condition" },
    { id: "e2", from: "condition", to: "yes", branch: "Yes" },
    { id: "e3", from: "condition", to: "no", branch: "No" },
  ],
});

test("accepts a well-formed workflow and rejects invalid graph references", () => {
  const flow = workflow();
  assert.equal(isWorkflow(flow), true);
  flow.edges[0].to = "missing";
  assert.equal(isWorkflow(flow), false);
});

test("validates graph reachability, both condition branches, and cycles", () => {
  const flow = workflow();
  assert.deepEqual(validateWorkflow(flow), []);

  flow.edges = flow.edges.filter((edge) => edge.branch !== "No");
  flow.edges.push({ id: "cycle", from: "yes", to: "condition" });
  const issues = validateWorkflow(flow).map((issue) => issue.message);
  assert.ok(issues.some((message) => message.includes("needs both Yes and No outputs")));
  assert.ok(issues.some((message) => message.includes("contains a cycle")));
});

test("checks HTTP, delay, notification, sample, and transform configuration", () => {
  const flow = workflow();
  flow.nodes.push(
    { id: "request", kind: "http", title: "Request", x: 0, y: 0, config: { method: "POST", url: "ftp://bad", headers: "[]", body: "not-json" } },
    { id: "delay", kind: "delay", title: "Wait", x: 0, y: 0, config: { duration: "0" } },
    { id: "notify", kind: "notify", title: "Notify", x: 0, y: 0, config: { recipient: "invalid", message: " " } },
    { id: "transform", kind: "transform", title: "Transform", x: 0, y: 0, config: { expression: "process.exit()" } },
  );
  flow.edges.push(
    { id: "e4", from: "trigger", to: "request" }, { id: "e5", from: "trigger", to: "delay" },
    { id: "e6", from: "trigger", to: "notify" }, { id: "e7", from: "trigger", to: "transform" },
  );
  const messages = validateWorkflow(flow).map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("valid request URL")));
  assert.ok(messages.some((message) => message.includes("headers must be a JSON object")));
  assert.ok(messages.some((message) => message.includes("body must be valid JSON")));
  assert.ok(messages.some((message) => message.includes("duration of at least 1")));
  assert.ok(messages.some((message) => message.includes("valid recipient email")));
  assert.ok(messages.some((message) => message.includes("needs a message")));
  assert.ok(messages.some((message) => message.includes("unsupported expression")));
});

test("accepts only JSON object sample payloads", () => {
  assert.deepEqual(parseSampleInput('{"user":{"name":"Ada"}}'), { user: { name: "Ada" } });
  assert.throws(() => parseSampleInput("not json"));
  assert.throws(() => parseSampleInput("[]"), /JSON object/);
});

test("evaluates safe transforms and nested paths without executing code", () => {
  const payload = { firstName: "Ada", user: { id: 42 }, score: 7 };
  assert.equal(evaluateTransform("{{ firstName + ' ' + user.id + score }}", payload), "Ada 427");
  assert.equal(evaluateTransform('"hello\\nworld"', payload), "hello\nworld");
  assert.equal(readPayloadPath(payload, "user.id"), 42);
  assert.equal(readPayloadPath(payload, "user.__proto__"), "");
  assert.throws(() => evaluateTransform("globalThis.process.exit()", payload));
});

test("evaluates condition operators and interpolates notification fields", () => {
  assert.equal(evaluateCondition("ready", "ead", "contains"), true);
  assert.equal(evaluateCondition("12", "10", "greater"), true);
  assert.equal(evaluateCondition("present", "", "exists"), true);
  assert.equal(evaluateCondition("active", "inactive", "equals"), false);
  assert.equal(renderMessage("Hello {{ user.name }} (#{{ id }})", { id: 5, user: { name: "Ada" } }), "Hello Ada (#5)");
});

test("records all unvisited nodes as skipped with a reason tied to the run outcome", () => {
  const flow = workflow();
  const visited = new Set(["trigger", "condition", "yes"]);
  assert.deepEqual(getSkippedNodes(flow, visited, false), [{
    nodeId: "no", nodeName: "Stop", status: "skipped", message: "Skipped because its IF branch was not selected",
  }]);
  assert.match(getSkippedNodes(flow, new Set(["trigger"]), true)[0].message, /stopped after a previous error/);
});
