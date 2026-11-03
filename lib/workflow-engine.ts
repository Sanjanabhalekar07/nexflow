export type WorkflowKind = "trigger" | "http" | "condition" | "delay" | "transform" | "notify" | "end";
export type WorkflowNode = { id: string; kind: WorkflowKind; title: string; x: number; y: number; config: Record<string, string> };
export type WorkflowEdge = { id: string; from: string; to: string; branch?: string };
export type Workflow = { id: string; name: string; updated: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] };

export const samplePayload: Record<string, unknown> = { id: 42, status: "active", name: "Alex Morgan", firstName: "Alex", lastName: "Morgan" };
export const transformExpression = "{{ firstName + ' ' + lastName }}";
const nodeKinds: WorkflowKind[] = ["trigger", "http", "condition", "delay", "transform", "notify", "end"];

export function isWorkflow(value: unknown): value is Workflow {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Workflow>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || typeof candidate.updated !== "string" || !Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) return false;
  const nodeIds = new Set<string>(); const edgeIds = new Set<string>();
  for (const item of candidate.nodes) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || nodeIds.has(item.id) || typeof item.title !== "string" || !nodeKinds.includes(item.kind) || !Number.isFinite(item.x) || !Number.isFinite(item.y) || !item.config || typeof item.config !== "object" || Array.isArray(item.config) || Object.values(item.config).some((entry) => typeof entry !== "string")) return false;
    nodeIds.add(item.id);
  }
  for (const edge of candidate.edges) {
    if (!edge || typeof edge !== "object" || typeof edge.id !== "string" || !edge.id || edgeIds.has(edge.id) || typeof edge.from !== "string" || typeof edge.to !== "string" || !nodeIds.has(edge.from) || !nodeIds.has(edge.to) || (edge.branch !== undefined && typeof edge.branch !== "string")) return false;
    edgeIds.add(edge.id);
  }
  return true;
}

export function parseSampleInput(source?: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source?.trim() || JSON.stringify(samplePayload));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Sample input must be a JSON object");
  return value as Record<string, unknown>;
}

export function readPayloadPath(payload: Record<string, unknown>, path: string): unknown {
  let value: unknown = payload;
  for (const part of path.split(".")) {
    if (part === "__proto__" || part === "prototype" || part === "constructor" || !value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, part)) return "";
    value = (value as Record<string, unknown>)[part];
  }
  return value ?? "";
}

export function renderMessage(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}\}/g, (_match, path: string) => String(readPayloadPath(payload, path)));
}

export function evaluateTransform(expression: string, payload: Record<string, unknown>): string {
  const source = expression.trim().replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");
  const token = /(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)|(-?\d+(?:\.\d+)?))/y;
  const values: string[] = []; let cursor = 0; let needsValue = true;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] ?? "")) cursor++;
    if (cursor >= source.length) break;
    if (source[cursor] === "+") {
      if (needsValue) throw new Error("Unexpected + operator");
      needsValue = true; cursor++; continue;
    }
    if (!needsValue) throw new Error("Use + between expression values");
    token.lastIndex = cursor; const match = token.exec(source);
    if (!match) throw new Error("Use field names, string or number literals, and + concatenation");
    if (match[1] !== undefined || match[2] !== undefined) {
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t" };
      values.push((match[1] ?? match[2] ?? "").replace(/\\([\\'"nrt])/g, (_all, escaped: string) => escapes[escaped] ?? escaped));
    } else if (match[3] !== undefined) {
      const value = readPayloadPath(payload, match[3]);
      values.push(value === null || value === undefined ? "" : String(value));
    } else values.push(match[4]);
    cursor = token.lastIndex; needsValue = false;
  }
  if (needsValue || values.length === 0) throw new Error("Expression must contain a value");
  return values.join("");
}

export function evaluateCondition(actual: unknown, expected: string, operator: string): boolean {
  const value = String(actual);
  if (operator === "contains") return value.includes(expected);
  if (operator === "greater") return Number(value) > Number(expected);
  if (operator === "exists") return value.length > 0;
  return value === expected;
}

export function getSkippedNodes(flow: Workflow, visited: Set<string>, failed: boolean) {
  const message = failed
    ? "Skipped because the workflow stopped after a previous error"
    : "Skipped because its IF branch was not selected";
  return flow.nodes
    .filter((node) => !visited.has(node.id))
    .map((node) => ({ nodeId: node.id, nodeName: node.title, status: "skipped" as const, message }));
}

export function validateWorkflow(flow: Workflow): { message: string; nodeId?: string }[] {
  const issues: { message: string; nodeId?: string }[] = [];
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]));
  const triggers = flow.nodes.filter((node) => node.kind === "trigger");
  if (!triggers.length) issues.push({ message: "Add a trigger to start this workflow" });
  if (triggers.length > 1) issues.push({ message: "This simulator supports one manual trigger per workflow", nodeId: triggers[1].id });
  for (const node of flow.nodes) {
    if (node.kind !== "trigger" && flow.edges.every((edge) => edge.to !== node.id)) issues.push({ message: `${node.title} has no incoming connection`, nodeId: node.id });
    if (node.kind === "http") {
      if (!node.config.url?.startsWith("http")) issues.push({ message: `${node.title} needs a valid request URL`, nodeId: node.id });
      try { const headers: unknown = JSON.parse(node.config.headers ?? "{}"); if (!headers || typeof headers !== "object" || Array.isArray(headers) || Object.values(headers).some((value) => typeof value !== "string")) throw new Error(); }
      catch { issues.push({ message: `${node.title} headers must be a JSON object with string values`, nodeId: node.id }); }
      if (node.config.method !== "GET" && node.config.body?.trim()) { try { JSON.parse(node.config.body); } catch { issues.push({ message: `${node.title} body must be valid JSON`, nodeId: node.id }); } }
    }
    if (node.kind === "notify") {
      if (!node.config.recipient?.includes("@")) issues.push({ message: `${node.title} needs a valid recipient email`, nodeId: node.id });
      if (!node.config.message?.trim()) issues.push({ message: `${node.title} needs a message`, nodeId: node.id });
    }
    if (node.kind === "delay" && (!Number.isFinite(Number(node.config.duration)) || Number(node.config.duration) < 1)) issues.push({ message: `${node.title} needs a duration of at least 1`, nodeId: node.id });
    if (node.kind === "trigger") { try { parseSampleInput(node.config.sampleData); } catch { issues.push({ message: `${node.title} sample input must be a JSON object`, nodeId: node.id }); } }
    if (node.kind === "transform") { try { evaluateTransform(node.config.expression ?? transformExpression, samplePayload); } catch { issues.push({ message: `${node.title} has an unsupported expression`, nodeId: node.id }); } }
    if (node.kind === "condition") {
      const branches = flow.edges.filter((edge) => edge.from === node.id).map((edge) => edge.branch?.toLowerCase());
      if (!branches.includes("yes") || !branches.includes("no")) issues.push({ message: `${node.title} needs both Yes and No outputs`, nodeId: node.id });
    }
  }
  const reachable = new Set<string>();
  const queue = triggers.map((node) => node.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    flow.edges.filter((edge) => edge.from === id && nodes.has(edge.to)).forEach((edge) => queue.push(edge.to));
  }
  for (const node of flow.nodes) if (!reachable.has(node.id)) issues.push({ message: `${node.title} cannot be reached from a trigger`, nodeId: node.id });
  const color = new Map<string, number>();
  const visit = (id: string): boolean => {
    color.set(id, 1);
    for (const edge of flow.edges.filter((item) => item.from === id)) {
      if (!nodes.has(edge.to)) continue;
      if (color.get(edge.to) === 1 || (!color.has(edge.to) && visit(edge.to))) return true;
    }
    color.set(id, 2);
    return false;
  };
  for (const node of flow.nodes) if (!color.has(node.id) && visit(node.id)) { issues.push({ message: "Workflow contains a cycle", nodeId: node.id }); break; }
  return issues;
}
