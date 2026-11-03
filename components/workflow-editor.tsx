"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listExecutions, saveExecution, type ExecutionNode, type ExecutionRecord } from "@/lib/executions";
import { useTheme } from "@/components/theme-provider";

type Kind = "trigger" | "http" | "condition" | "delay" | "transform" | "notify" | "end";
type FlowNode = { id: string; kind: Kind; title: string; x: number; y: number; config: Record<string, string> };
type Edge = { id: string; from: string; to: string; branch?: string };
type Workflow = { id: string; name: string; updated: string; nodes: FlowNode[]; edges: Edge[] };
type CanvasRunStatus = "running" | "success" | "skipped" | "error";

const palette: { kind: Kind; title: string; group: string; icon: string; color: string; description: string }[] = [
  { kind: "trigger", title: "Manual trigger", group: "TRIGGERS", icon: "▶", color: "violet", description: "Start this workflow manually" },
  { kind: "http", title: "HTTP Request", group: "ACTIONS", icon: "↗", color: "blue", description: "Call an external endpoint" },
  { kind: "condition", title: "IF condition", group: "LOGIC", icon: "⑂", color: "amber", description: "Route data based on a rule" },
  { kind: "delay", title: "Wait", group: "LOGIC", icon: "◷", color: "slate", description: "Pause before continuing" },
  { kind: "transform", title: "Transform data", group: "ACTIONS", icon: "⟡", color: "teal", description: "Shape data for the next step" },
  { kind: "notify", title: "Send notification", group: "ACTIONS", icon: "✉", color: "rose", description: "Send a simulated message" },
  { kind: "end", title: "End workflow", group: "OTHER", icon: "■", color: "slate", description: "Finish this workflow run" },
];
function isWorkflow(value: unknown): value is Workflow {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Workflow>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || typeof candidate.updated !== "string" || !Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) return false;
  const nodeIds = new Set<string>(); const edgeIds = new Set<string>();
  for (const item of candidate.nodes) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || nodeIds.has(item.id) || typeof item.title !== "string" || !palette.some((entry) => entry.kind === item.kind) || !Number.isFinite(item.x) || !Number.isFinite(item.y) || !item.config || typeof item.config !== "object" || Array.isArray(item.config) || Object.values(item.config).some((entry) => typeof entry !== "string")) return false;
    nodeIds.add(item.id);
  }
  for (const edge of candidate.edges) {
    if (!edge || typeof edge !== "object" || typeof edge.id !== "string" || !edge.id || edgeIds.has(edge.id) || typeof edge.from !== "string" || typeof edge.to !== "string" || !nodeIds.has(edge.from) || !nodeIds.has(edge.to) || (edge.branch !== undefined && typeof edge.branch !== "string")) return false;
    edgeIds.add(edge.id);
  }
  return true;
}
const samplePayload: Record<string, unknown> = { id: 42, status: "active", name: "Alex Morgan", firstName: "Alex", lastName: "Morgan" };
const transformExpression = "{{ firstName + ' ' + lastName }}";
function parseSampleInput(source?: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source?.trim() || JSON.stringify(samplePayload));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Sample input must be a JSON object");
  return value as Record<string, unknown>;
}
function readPayloadPath(payload: Record<string, unknown>, path: string): unknown {
  let value: unknown = payload;
  for (const part of path.split(".")) {
    if (part === "__proto__" || part === "prototype" || part === "constructor" || !value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, part)) return "";
    value = (value as Record<string, unknown>)[part];
  }
  return value ?? "";
}
function renderMessage(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}\}/g, (_match, path: string) => String(readPayloadPath(payload, path)));
}
function evaluateTransform(expression: string, payload: Record<string, unknown>): string {
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
      let value: unknown = payload;
      for (const part of match[3].split(".")) {
        if (part === "__proto__" || part === "prototype" || part === "constructor" || !value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, part)) { value = ""; break; }
        value = (value as Record<string, unknown>)[part];
      }
      values.push(value === null || value === undefined ? "" : String(value));
    } else values.push(match[4]);
    cursor = token.lastIndex; needsValue = false;
  }
  if (needsValue || values.length === 0) throw new Error("Expression must contain a value");
  return values.join("");
}
const starter: FlowNode[] = [
  { id: "n1", kind: "trigger", title: "When I run this workflow", x: 180, y: 116, config: {} },
  { id: "n2", kind: "http", title: "Fetch customer record", x: 480, y: 116, config: { method: "GET", url: "https://api.example.com/customers/42" } },
  { id: "n3", kind: "condition", title: "Customer is active?", x: 780, y: 116, config: { field: "status", operator: "equals", value: "active" } },
  { id: "n4", kind: "notify", title: "Send welcome message", x: 1080, y: 30, config: { recipient: "hello@example.com", message: "Welcome back!" } },
  { id: "n5", kind: "end", title: "Done", x: 1380, y: 30, config: {} },
  { id: "n6", kind: "end", title: "Skip notification", x: 1080, y: 240, config: {} },
];
const initial: Workflow = { id: "welcome", name: "Customer welcome flow", updated: "Just now", nodes: starter, edges: [{ id: "e1", from: "n1", to: "n2" }, { id: "e2", from: "n2", to: "n3" }, { id: "e3", from: "n3", to: "n4", branch: "Yes" }, { id: "e4", from: "n4", to: "n5" }, { id: "e5", from: "n3", to: "n6", branch: "No" }] };
const key = "nexflow-workflows-v1";
const uid = () => Math.random().toString(36).slice(2, 9);

function validateWorkflow(flow: Workflow): { message: string; nodeId?: string }[] {
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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("nexflow", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readWorkflows(): Promise<Workflow[] | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("workspace").objectStore("workspace").get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}
async function writeWorkflows(value: Workflow[]) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const req = db.transaction("workspace", "readwrite").objectStore("workspace").put({ key, value });
    req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
  });
}

export default function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [flows, setFlows] = useState<Workflow[]>([initial]);
  const [activeId, setActiveId] = useState(workflowId);
  const [selected, setSelected] = useState("n3");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [runState, setRunState] = useState<"idle" | "success" | "error">("idle");
  const [executionCount, setExecutionCount] = useState(0);
  const [nodeRunStates, setNodeRunStates] = useState<Record<string, CanvasRunStatus>>({});
  const [traversedEdges, setTraversedEdges] = useState<string[]>([]);
  const [invalidNodes, setInvalidNodes] = useState<string[]>([]);
  const [validationMessages, setValidationMessages] = useState<{ message: string; nodeId?: string }[]>([]);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [notice, setNotice] = useState("All changes saved");
  const [drawer, setDrawer] = useState(true);
  const { dark, toggleTheme } = useTheme();
  const [undoStack, setUndoStack] = useState<Workflow[][]>([]);
  const [redoStack, setRedoStack] = useState<Workflow[][]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const paletteSearchRef = useRef<HTMLInputElement>(null);
  const active = flows.find((flow) => flow.id === activeId) ?? flows[0];
  const node = active.nodes.find((item) => item.id === selected);
  const groupedPalette = useMemo(() => {
    const search = query.trim().toLowerCase();
    return palette.filter((item) => `${item.title} ${item.group} ${item.description}`.toLowerCase().includes(search));
  }, [query]);

  useEffect(() => { readWorkflows().then((saved) => { if (saved?.length) { setFlows(saved); const current = saved.find((flow) => flow.id === workflowId) ?? saved[0]; setActiveId(current.id); setSelected(current.nodes[0]?.id ?? ""); } }).catch(() => setNotice("Local storage unavailable")); }, [workflowId]);
  useEffect(() => {
    const focusPaletteSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDrawer(true);
        window.requestAnimationFrame(() => paletteSearchRef.current?.focus());
      }
    };
    window.addEventListener("keydown", focusPaletteSearch);
    return () => window.removeEventListener("keydown", focusPaletteSearch);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { writeWorkflows(flows).then(() => setNotice("All changes saved")).catch(() => setNotice("Could not save changes")); }, 350); return () => window.clearTimeout(timer); }, [flows]);
  useEffect(() => { let cancelled = false; listExecutions().then((records) => { if (!cancelled) setExecutionCount(records.filter((record) => record.workflowId === activeId).length); }).catch(() => { if (!cancelled) setExecutionCount(0); }); return () => { cancelled = true; }; }, [activeId, runState]);

  const commit = useCallback((updater: (flow: Workflow) => Workflow) => {
    setUndoStack((stack) => [...stack.slice(-39), flows]); setRedoStack([]);
    setInvalidNodes([]); setValidationMessages([]);
    setNodeRunStates({}); setTraversedEdges([]); setRunState("idle");
    setFlows((current) => current.map((flow) => flow.id === activeId ? { ...updater(flow), updated: "Just now" } : flow));
    setNotice("Saving…");
  }, [activeId, flows]);
  const addNodeAt = (kind: Kind, x: number, y: number) => {
    const item = palette.find((entry) => entry.kind === kind)!;
    const id = uid();
    commit((flow) => ({ ...flow, nodes: [...flow.nodes, { id, kind, title: item.title, x: Math.max(16, x), y: Math.max(16, y), config: kind === "trigger" ? { sampleData: JSON.stringify(samplePayload, null, 2) } : kind === "http" ? { method: "GET", url: "https://api.example.com", headers: "{}", body: "{}" } : kind === "condition" ? { field: "status", operator: "equals", value: "active" } : kind === "delay" ? { duration: "5", unit: "seconds" } : kind === "notify" ? { recipient: "", message: "" } : {} }] }));
    setSelected(id);
  };
  const addNode = (kind: Kind) => {
    const canvas = canvasRef.current; const rect = canvas?.getBoundingClientRect();
    const x = ((rect?.width ?? 1000) / 2 + (canvas?.scrollLeft ?? 0)) / zoom - 105;
    const y = ((rect?.height ?? 600) / 2 + (canvas?.scrollTop ?? 0)) / zoom - 56;
    addNodeAt(kind, x, y);
  };
  const startCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".workflow-node,.edge-path,.validation-panel,button,a,input")) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const startX = event.clientX, startY = event.clientY, scrollX = canvas.scrollLeft, scrollY = canvas.scrollTop;
    canvas.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => { canvas.scrollLeft = scrollX - (pointer.clientX - startX); canvas.scrollTop = scrollY - (pointer.clientY - startY); };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop, { once: true });
  };
  const dropNode = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/nexflow-node") as Kind;
    if (!palette.some((item) => item.kind === kind)) return;
    const canvas = canvasRef.current; const rect = canvas?.getBoundingClientRect(); if (!canvas || !rect) return;
    addNodeAt(kind, (event.clientX - rect.left + canvas.scrollLeft) / zoom - 105, (event.clientY - rect.top + canvas.scrollTop) / zoom - 56);
  };
  const updateConfig = (field: string, value: string) => commit((flow) => ({ ...flow, nodes: flow.nodes.map((item) => item.id === selected ? { ...item, config: { ...item.config, [field]: value } } : item) }));
  const updateTitle = (value: string) => commit((flow) => ({ ...flow, nodes: flow.nodes.map((item) => item.id === selected ? { ...item, title: value } : item) }));
  const connect = (id: string) => {
    if (!connectMode) return;
    setSelectedEdge(null);
    if (!connectFrom) { setConnectFrom(id); setNotice("Choose a destination node"); return; }
    if (connectFrom === id) { setConnectFrom(null); setNotice("A node cannot connect to itself"); return; }
    const from = active.nodes.find((n) => n.id === connectFrom);
    if (!from) { setConnectFrom(null); setConnectMode(false); setNotice("Source node no longer exists"); return; }
    if (active.edges.some((edge) => edge.from === connectFrom && edge.to === id)) { setConnectFrom(null); setConnectMode(false); setNotice("These nodes are already connected"); return; }
    if (from.kind === "condition") {
      const branches = active.edges.filter((edge) => edge.from === from.id).map((edge) => edge.branch?.toLowerCase());
      const branch = !branches.includes("yes") ? "Yes" : !branches.includes("no") ? "No" : null;
      if (!branch) { setConnectFrom(null); setConnectMode(false); setNotice("IF nodes already have Yes and No connections"); return; }
      commit((flow) => ({ ...flow, edges: [...flow.edges, { id: uid(), from: connectFrom, to: id, branch }] }));
    } else commit((flow) => ({ ...flow, edges: [...flow.edges.filter((edge) => edge.from !== connectFrom), { id: uid(), from: connectFrom, to: id }] }));
    setConnectFrom(null); setConnectMode(false); setNotice(from.kind === "condition" ? "Condition branch connected" : "Connection added");
  };
  const duplicateNode = () => { if (!node) return; const copy = { ...node, id: uid(), title: `${node.title} copy`, x: node.x + 50, y: node.y + 50, config: { ...node.config } }; commit((flow) => ({ ...flow, nodes: [...flow.nodes, copy] })); setSelected(copy.id); };
  const deleteNode = () => { if (!node) return; commit((flow) => ({ ...flow, nodes: flow.nodes.filter((n) => n.id !== node.id), edges: flow.edges.filter((e) => e.from !== node.id && e.to !== node.id) })); setSelected(""); };
  const validate = () => {
    const issues = validateWorkflow(active);
    setInvalidNodes(issues.flatMap((issue) => issue.nodeId ? [issue.nodeId] : []));
    setValidationMessages(issues);
    if (issues.length) { setSelected(issues[0].nodeId ?? ""); setNotice(`${issues.length} issue${issues.length === 1 ? "" : "s"}: ${issues[0].message}`); return false; }
    setNotice("Workflow looks good · 0 issues"); return true;
  };
  const run = async () => {
    if (!validate()) return;
    const startedAt = new Date().toISOString(); const started = Date.now();
    const trigger = active.nodes.find((item) => item.kind === "trigger");
    const output = Object.assign(Object.create(null) as Record<string, unknown>, parseSampleInput(trigger?.config.sampleData));
    const logs: ExecutionNode[] = []; const queue = active.nodes.filter((item) => item.kind === "trigger").map((item) => item.id); const visited = new Set<string>();
    setPlaying(true); setRunState("idle"); setNodeRunStates({}); setTraversedEdges([]);
    try {
      while (queue.length && visited.size < active.nodes.length) {
        const id = queue.shift()!; if (visited.has(id)) continue; visited.add(id);
        const current = active.nodes.find((item) => item.id === id); if (!current) continue;
        setSelected(id); setNodeRunStates((states) => ({ ...states, [id]: "running" }));
        const delayMultiplier = current.config.unit === "hours" ? 3600 : current.config.unit === "minutes" ? 60 : 1;
        const waitMs = current.kind === "delay" ? Math.min(Number(current.config.duration) * delayMultiplier * 180, 1200) : 320;
        await new Promise((resolve) => window.setTimeout(resolve, waitMs));
        if (current.kind === "http" && /fail|error/i.test(current.config.url ?? "")) {
          logs.push({ nodeId: id, nodeName: current.title, status: "error", message: "Mock API returned HTTP 500" }); setNodeRunStates((states) => ({ ...states, [id]: "error" })); break;
        }
        let message = "Node completed successfully"; let outgoing = active.edges.filter((edge) => edge.from === id);
        if (current.kind === "trigger") message = "Manual trigger loaded its configured JSON sample input";
        if (current.kind === "http") {
          const method = current.config.method ?? "GET";
          const request: Record<string, unknown> = { method, url: current.config.url, headers: JSON.parse(current.config.headers ?? "{}") };
          if (method !== "GET" && current.config.body?.trim()) request.body = JSON.parse(current.config.body);
          output.lastRequest = request;
          message = `Mock ${method} request to ${current.config.url} returned HTTP 200`;
        }
        if (current.kind === "transform") {
          const field = current.config.field || "fullName";
          try { output[field] = evaluateTransform(current.config.expression ?? transformExpression, output); message = `Created output field “${field}”`; }
          catch { logs.push({ nodeId: id, nodeName: current.title, status: "error", message: "The transform expression could not be evaluated" }); setNodeRunStates((states) => ({ ...states, [id]: "error" })); break; }
        }
        if (current.kind === "condition") {
          const actual = String(readPayloadPath(output, current.config.field || "status")); const expected = current.config.value ?? ""; const operator = current.config.operator || "equals";
          const matched = operator === "contains" ? actual.includes(expected) : operator === "greater" ? Number(actual) > Number(expected) : operator === "exists" ? actual.length > 0 : actual === expected;
          const branch = matched ? "yes" : "no"; message = `Condition evaluated ${matched ? "true" : "false"} (${actual || "empty"} ${operator} ${expected})`;
          outgoing = outgoing.filter((edge) => edge.branch?.toLowerCase() === branch);
        }
        if (current.kind === "notify") {
          const renderedMessage = renderMessage(current.config.message ?? "", output);
          output.lastNotification = { to: current.config.recipient, message: renderedMessage };
          message = `Simulated notification sent to ${current.config.recipient}: ${renderedMessage}`;
        }
        if (current.kind === "end") message = "Workflow path finished";
        logs.push({ nodeId: id, nodeName: current.title, status: "success", message, output: { ...output } });
        setNodeRunStates((states) => ({ ...states, [id]: "success" }));
        setTraversedEdges((edges) => [...edges, ...outgoing.map((edge) => edge.id)]);
        outgoing.forEach((edge) => queue.push(edge.to));
      }
      const failed = logs.some((item) => item.status === "error");
      const skipReason = failed
        ? "Skipped because the workflow stopped after a previous error"
        : "Skipped because its IF branch was not selected";
      const skippedNodes = active.nodes.filter((item) => !visited.has(item.id));
      skippedNodes.forEach((item) => {
        logs.push({ nodeId: item.id, nodeName: item.title, status: "skipped", message: skipReason });
      });
      if (skippedNodes.length) {
        setNodeRunStates((states) => {
          const next = { ...states };
          skippedNodes.forEach((item) => { if (!next[item.id]) next[item.id] = "skipped"; });
          return next;
        });
      }
      const record: ExecutionRecord = { id: uid(), workflowId: active.id, workflowName: active.name, status: failed ? "failed" : "success", startedAt, durationMs: Date.now() - started, nodes: logs };
      await saveExecution(record); setRunState(failed ? "error" : "success"); setNotice(failed ? "Run failed · mock API returned HTTP 500" : `Run completed · ${logs.filter((item) => item.status === "success").length} nodes executed`);
    } catch { setRunState("error"); setNotice("Run could not be saved to execution history"); }
    finally { setPlaying(false); }
  };
  const cloneWorkflow = async () => { const flow = { ...active, id: uid(), name: `${active.name} copy`, nodes: active.nodes.map((n) => ({ ...n, id: uid(), config: { ...n.config } })), edges: [] as Edge[] }; const idMap = new Map(active.nodes.map((n, i) => [n.id, flow.nodes[i].id])); flow.edges = active.edges.map((e) => ({ ...e, id: uid(), from: idMap.get(e.from)!, to: idMap.get(e.to)! })); const next = [...flows, flow]; setFlows(next); await writeWorkflows(next); setActiveId(flow.id); setSelected(flow.nodes[0]?.id ?? ""); router.push(`/workflows/${flow.id}`); };
  const download = () => { const blob = new Blob([JSON.stringify(active, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${active.name.toLowerCase().replaceAll(" ", "-")}.json`; link.click(); URL.revokeObjectURL(url); };
  const importFile = async (file?: File) => { if (!file) return; try { const parsed: unknown = JSON.parse(await file.text()); if (!isWorkflow(parsed)) throw new Error("Invalid workflow structure"); parsed.id = uid(); const next = [...flows, parsed]; setFlows(next); await writeWorkflows(next); setActiveId(parsed.id); setSelected(parsed.nodes[0]?.id ?? ""); setNotice("Workflow imported"); router.push(`/workflows/${parsed.id}`); } catch { setNotice("Import failed: choose a valid Nexflow workflow JSON file"); } };
  const restore = useCallback((history: Workflow[][], otherSetter: typeof setUndoStack, setter: typeof setUndoStack) => { const snapshot = history.at(-1); if (!snapshot) return; otherSetter((prev) => [...prev, flows]); setter((prev) => prev.slice(0, -1)); setFlows(snapshot); }, [flows]);
  const fitToScreen = () => {
    const canvas = canvasRef.current;
    if (!canvas || active.nodes.length === 0) { setZoom(1); return; }
    const minX = Math.min(...active.nodes.map((item) => item.x)); const minY = Math.min(...active.nodes.map((item) => item.y));
    const maxX = Math.max(...active.nodes.map((item) => item.x + 210)); const maxY = Math.max(...active.nodes.map((item) => item.y + 112));
    const scale = Math.min((canvas.clientWidth - 100) / (maxX - minX), (canvas.clientHeight - 100) / (maxY - minY), 1.25);
    const nextZoom = Math.max(.45, scale); setZoom(nextZoom);
    requestAnimationFrame(() => { canvas.scrollLeft = Math.max(0, minX * nextZoom - 50); canvas.scrollTop = Math.max(0, minY * nextZoom - 50); });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable='true']")) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) restore(redoStack, setUndoStack, setRedoStack); else restore(undoStack, setRedoStack, setUndoStack); return; }
      if (command && event.key.toLowerCase() === "y") { event.preventDefault(); restore(redoStack, setUndoStack, setRedoStack); return; }
      if (event.key === "Escape") { setConnectMode(false); setConnectFrom(null); return; }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedEdge) {
        event.preventDefault(); commit((flow) => ({ ...flow, edges: flow.edges.filter((edge) => edge.id !== selectedEdge) })); setSelectedEdge(null); setNotice("Connection removed"); return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && node) {
        event.preventDefault(); commit((flow) => ({ ...flow, nodes: flow.nodes.filter((item) => item.id !== node.id), edges: flow.edges.filter((edge) => edge.from !== node.id && edge.to !== node.id) })); setSelected(""); return;
      }
      if (selected && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault(); const delta = event.shiftKey ? 30 : 10;
        const dx = event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0;
        const dy = event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0;
        commit((flow) => ({ ...flow, nodes: flow.nodes.map((item) => item.id === selected ? { ...item, x: Math.max(0, item.x + dx), y: Math.max(0, item.y + dy) } : item) }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commit, flows, node, redoStack, restore, selected, selectedEdge, undoStack]);

  return <main className={`app-shell ${dark ? "dark" : ""}`}>
    <aside className="rail"><Link href="/workflows" className="brand-mark">n</Link><Link href="/workflows" className="rail-button active" title="Workflows">⌘</Link><Link href="/executions" className="rail-button" title="Executions">◷</Link><Link href="/templates" className="rail-button" title="Templates">▦</Link><div className="rail-spacer"/><button className="avatar">JD</button></aside>
    <div className="workspace">
      <header className="topbar"><div className="crumb"><Link className="crumb-muted" href="/workflows">Workflows</Link><span className="slash">/</span><input aria-label="Workflow name" className="workflow-name" value={active.name} onChange={(e) => { const value = e.target.value; setFlows((prev) => prev.map((f) => f.id === activeId ? { ...f, name: value } : f)); }}/><span className="save-state"><i/> {notice}</span></div><div className="top-actions"><button className="button subtle" onClick={toggleTheme} aria-pressed={dark} title={dark ? "Switch to light theme" : "Switch to dark theme"}>◐</button><button className="button subtle" onClick={download}>↧ <span>Export</span></button><label className="button subtle file-label">↥ <span>Import</span><input type="file" accept="application/json,.json" onChange={(e) => importFile(e.target.files?.[0])}/></label><button className="button run-button" disabled={playing} onClick={run}><span>▶</span> {playing ? "Running…" : "Run workflow"}</button><button className="more-button" title="More options" onClick={cloneWorkflow}>···</button></div></header>
      <div className="editor-layout">
        <aside className="library"><div className="library-page-link"><Link href="/workflows">← All workflows</Link></div><div className="library-divider"/><div className="section-heading"><span>NODE LIBRARY</span><button title="Collapse node library" onClick={() => setDrawer(!drawer)}>{drawer ? "⌃" : "⌄"}</button></div>{drawer && <><div className="search-box"><span>⌕</span><input ref={paletteSearchRef} aria-label="Search node library" placeholder="Search nodes..." value={query} onChange={(e) => setQuery(e.target.value)}/><kbd>⌘ K</kbd></div><div className="palette-scroll">{["TRIGGERS", "ACTIONS", "LOGIC", "OTHER"].map((group) => { const items = groupedPalette.filter((item) => item.group === group); if (!items.length) return null; return <div className="palette-group" key={group}><div className="group-label">{group}</div>{items.map((item) => <button className="palette-item" key={item.kind} draggable onDragStart={(event) => { event.dataTransfer.setData("application/nexflow-node", item.kind); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => addNode(item.kind)}><span className={`node-icon ${item.color}`}>{item.icon}</span><span><b>{item.title}</b><small>{item.description}</small></span><span className="add-hint">＋</span></button>)}</div>; })}{groupedPalette.length === 0 && <p className="palette-empty" role="status">No nodes match �{query}�.</p>}</div></>}</aside>
        <section className="canvas-column"><div className="canvas-toolbar"><div className="canvas-tabs"><button className="tab active">Workflow</button><Link className="tab" href="/executions">Executions <span className="tab-count">{executionCount}</span></Link></div><div className="canvas-actions">{selectedEdge && <button className="button subtle" onClick={() => { commit((flow) => ({ ...flow, edges: flow.edges.filter((edge) => edge.id !== selectedEdge) })); setSelectedEdge(null); setNotice("Connection removed"); }}>⌫ <span>Delete connection</span></button>}<button className={`button ${connectMode ? "connect-active" : "subtle"}`} onClick={() => { setConnectMode(!connectMode); setConnectFrom(null); setNotice(connectMode ? "Connection mode closed" : "Select a source node, then a destination"); }}>↗ <span>{connectFrom ? "Choose target" : connectMode ? "Select source" : "Connect"}</span></button><span className="tool-separator"/><button className="square-button" title="Undo" onClick={() => restore(undoStack, setRedoStack, setUndoStack)} disabled={!undoStack.length}>↶</button><button className="square-button" title="Redo" onClick={() => restore(redoStack, setUndoStack, setRedoStack)} disabled={!redoStack.length}>↷</button><span className="tool-separator"/><button className="square-button" title="Zoom out" onClick={() => setZoom((v) => Math.max(.5, v - .1))}>−</button><span className="zoom-readout">{Math.round(zoom * 100)}%</span><button className="square-button" title="Zoom in" onClick={() => setZoom((v) => Math.min(1.5, v + .1))}>＋</button><button className="square-button" title="Fit to screen" onClick={fitToScreen}>⛶</button></div></div>
          <div className="canvas" ref={canvasRef} onPointerDown={startCanvasPan} onDragOver={(event) => event.preventDefault()} onDrop={dropNode}><div className="canvas-dots"/>{validationMessages.length > 0 && <section className="validation-panel" role="alert" aria-label="Workflow validation issues"><header><b>{validationMessages.length} validation issue{validationMessages.length === 1 ? "" : "s"}</b><button className="square-button" onClick={() => setValidationMessages([])} aria-label="Dismiss validation issues">×</button></header><ul>{validationMessages.map((issue, index) => <li key={`${issue.nodeId ?? "workflow"}-${index}`}><button disabled={!issue.nodeId} onClick={() => { if (issue.nodeId) { setSelected(issue.nodeId); setSelectedEdge(null); } }}>{issue.message}</button></li>)}</ul></section>}<div className="canvas-world" style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}><svg className="edges" width="1900" height="900" aria-label="Workflow connections">{active.edges.map((edge) => { const a = active.nodes.find((n) => n.id === edge.from), b = active.nodes.find((n) => n.id === edge.to); if (!a || !b) return null; const x1 = a.x + 210, y1 = a.y + 56, x2 = b.x, y2 = b.y + 56, mid = (x1 + x2) / 2; return <g key={edge.id}><path className={`edge-path ${traversedEdges.includes(edge.id) ? "edge-done" : ""} ${selectedEdge === edge.id ? "edge-selected" : ""}`} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} markerEnd="url(#arrow)" tabIndex={0} role="button" aria-label={`Select connection from ${a.title} to ${b.title}`} onFocus={() => { setSelected(""); setSelectedEdge(edge.id); }} onClick={(event) => { event.stopPropagation(); setSelected(""); setSelectedEdge(edge.id); }}/><circle className="edge-endpoint" cx={x2} cy={y2} r="3"/>{edge.branch && <g><rect x={mid - 17} y={(y1 + y2) / 2 - 11} width="34" height="20" rx="6" className="branch-bg"/><text x={mid} y={(y1 + y2) / 2 + 3} textAnchor="middle" className="branch-text">{edge.branch}</text></g>}</g>; })}<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#aeb6c4"/></marker></defs></svg>
          {active.nodes.map((item) => { const meta = palette.find((p) => p.kind === item.kind)!; const isSelected = selected === item.id; const onPointerDown = (e: React.PointerEvent) => { if ((e.target as HTMLElement).closest("button")) return; e.preventDefault(); const startX = e.clientX, startY = e.clientY, originX = item.x, originY = item.y; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const move = (event: PointerEvent) => { const dx = (event.clientX - startX) / zoom, dy = (event.clientY - startY) / zoom; setFlows((prev) => prev.map((flow) => flow.id === activeId ? { ...flow, nodes: flow.nodes.map((n) => n.id === item.id ? { ...n, x: Math.max(0, originX + dx), y: Math.max(0, originY + dy) } : n) } : flow)); }; const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setUndoStack((stack) => [...stack.slice(-39), flows]); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true }); };
            return <article key={item.id} role="button" tabIndex={0} aria-label={`Select ${item.title}`} className={`workflow-node ${isSelected ? "node-selected" : ""} ${playing && isSelected ? "node-running" : ""} ${nodeRunStates[item.id] === "error" ? "node-failed" : nodeRunStates[item.id] === "skipped" ? "node-skipped" : ""} ${connectFrom === item.id ? "node-source" : ""} ${invalidNodes.includes(item.id) ? "node-invalid" : ""}`} style={{ left: item.x, top: item.y }} onPointerDown={onPointerDown} onClick={() => { setSelectedEdge(null); if (connectMode) connect(item.id); else setSelected(item.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (connectMode) connect(item.id); else setSelected(item.id); } }}><div className="node-main"><span className={`node-icon ${meta.color}`}>{meta.icon}</span><div className="node-text"><small>{meta.group === "TRIGGERS" ? "TRIGGER" : meta.group === "OTHER" ? "OUTPUT" : meta.group === "LOGIC" ? "LOGIC" : "ACTION"}</small><b>{item.title}</b><span>{item.kind === "http" ? `${item.config.method ?? "GET"} · ${item.config.url ?? "Set URL"}` : item.kind === "condition" ? `${item.config.field ?? "field"} ${item.config.operator ?? "equals"} ${item.config.value ?? "value"}` : item.kind === "notify" ? item.config.recipient || "Configure recipient" : meta.description}</span></div>{nodeRunStates[item.id] === "success" && <i className="node-check">✓</i>}{nodeRunStates[item.id] === "error" && <i className="node-check node-check-error">!</i>}{nodeRunStates[item.id] === "skipped" && <i className="node-check node-check-skipped">–</i>}</div><div className="node-port left-port"/><div className="node-port right-port"/></article>;
          })}</div><div className="canvas-hint"><span>⌘</span> Drag nodes to arrange <i/> Click <span>＋</span> in the library to add</div><div className="minimap"><div className="minimap-view">{active.nodes.map((n) => <i key={n.id} style={{ left: `${n.x / 18}%`, top: `${n.y / 10}%` }}/>)}</div></div><div className="canvas-zoom">{active.nodes.length} nodes <i/> {active.edges.length} connections</div></div>
          <footer className="statusbar"><span className="status-green"><i/> {runState === "success" ? "Run successful" : "Workflow ready"}</span><span className="status-dot">·</span><span>{active.nodes.length} nodes</span><span className="status-dot">·</span><span>{active.edges.length} connections</span><button onClick={validate}>Check workflow <span>→</span></button></footer>
        </section>
        <aside className="inspector"><div className="inspector-head"><div><span className="eyebrow">{node ? "NODE SETTINGS" : "WORKFLOW"}</span><h2>{node ? "Configure node" : "Overview"}</h2></div><button className="square-button" title="Close panel" onClick={() => setSelected("")}>×</button></div>{node ? <><div className="inspector-node-title"><span className={`node-icon ${palette.find((p) => p.kind === node.kind)?.color}`}>{palette.find((p) => p.kind === node.kind)?.icon}</span><div><b>{node.title}</b><small>{node.kind.toUpperCase()} NODE</small></div><button className="more-button" onClick={duplicateNode} title="Duplicate node">···</button></div><div className="form-section"><label className="field-label">Node name</label><input className="field" value={node.title} onChange={(e) => updateTitle(e.target.value)}/>{node.kind === "http" && <><label className="field-label">Method</label><select className="field" value={node.config.method ?? "GET"} onChange={(e) => updateConfig("method", e.target.value)}><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select><label className="field-label">Request URL <span className="required">*</span></label><input className="field" value={node.config.url ?? ""} onChange={(e) => updateConfig("url", e.target.value)} placeholder="https://api.example.com"/><label className="field-label">Headers (JSON)</label><textarea className="field textarea" value={node.config.headers ?? "{}"} onChange={(e) => updateConfig("headers", e.target.value)} placeholder="{&quot;Authorization&quot;: &quot;Bearer token&quot;}"/>{(node.config.method ?? "GET") !== "GET" && <><label className="field-label">Request body (JSON)</label><textarea className="field textarea" value={node.config.body ?? "{}"} onChange={(e) => updateConfig("body", e.target.value)} placeholder="{&quot;name&quot;: &quot;Alex Morgan&quot;}"/></>}<label className="field-label">Response preview</label><div className="code-preview">{`{\n  "id": 42,\n  "status": "active",\n  "name": "Alex Morgan"\n}`}</div></>}{node.kind === "condition" && <><label className="field-label">Field to check</label><input className="field" value={node.config.field ?? ""} onChange={(e) => updateConfig("field", e.target.value)} placeholder="e.g. status"/><label className="field-label">Condition</label><select className="field" value={node.config.operator ?? "equals"} onChange={(e) => updateConfig("operator", e.target.value)}><option value="equals">Equals</option><option value="contains">Contains</option><option value="greater">Greater than</option><option value="exists">Exists</option></select><label className="field-label">Value</label><input className="field" value={node.config.value ?? ""} onChange={(e) => updateConfig("value", e.target.value)}/><div className="branch-info"><span>↗</span><span><b>True branch</b><small>Runs when the condition matches</small></span></div><div className="branch-info"><span>↘</span><span><b>False branch</b><small>Runs when the condition does not match</small></span></div></>}{node.kind === "delay" && <><label className="field-label">Wait duration</label><div className="field-row"><input className="field" type="number" min="1" value={node.config.duration ?? "5"} onChange={(e) => updateConfig("duration", e.target.value)}/><select className="field" value={node.config.unit ?? "seconds"} onChange={(e) => updateConfig("unit", e.target.value)}><option>seconds</option><option>minutes</option><option>hours</option></select></div></>}{node.kind === "notify" && <><label className="field-label">Recipient email <span className="required">*</span></label><input className="field" type="email" value={node.config.recipient ?? ""} onChange={(e) => updateConfig("recipient", e.target.value)} placeholder="name@example.com"/><label className="field-label">Message</label><textarea className="field textarea" value={node.config.message ?? ""} onChange={(e) => updateConfig("message", e.target.value)} placeholder="Write a message..."/></>}{node.kind === "transform" && <><label className="field-label">Output field</label><input className="field" value={node.config.field ?? "fullName"} onChange={(e) => updateConfig("field", e.target.value)}/><label className="field-label">Expression</label><textarea className="field textarea" value={node.config.expression ?? "{{ firstName + ' ' + lastName }}"} onChange={(e) => updateConfig("expression", e.target.value)}/></>}{node.kind === "trigger" && <><label className="field-label">Sample input (JSON)</label><textarea className="field textarea sample-data" rows={8} spellCheck={false} value={node.config.sampleData ?? JSON.stringify(samplePayload, null, 2)} onChange={(e) => updateConfig("sampleData", e.target.value)}/></>}{(node.kind === "trigger" || node.kind === "end") && <p className="field-description">{node.kind === "trigger" ? "Start a run manually from the workflow toolbar. Sample input data is provided for the simulator." : "This node marks the end of a workflow path."}</p>}</div><div className="inspector-bottom"><button className="delete-button" onClick={deleteNode}>⌫ <span>Delete node</span></button><button className="button primary" onClick={() => setNotice("Node settings saved")}>Done</button></div></> : <div className="overview"><div className="overview-icon">⌘</div><h3>{active.name}</h3><p>A visual workflow that connects automated steps.</p><div className="overview-stats"><div><b>{active.nodes.length}</b><span>Nodes</span></div><div><b>{active.edges.length}</b><span>Connections</span></div><div><b>{executionCount}</b><span>Runs</span></div></div><div className="overview-tip"><b>Quick tip</b><p>Choose a node to configure it, or add steps from the node library.</p></div><button className="button subtle full-width" onClick={cloneWorkflow}>⧉ Duplicate workflow</button></div>}</aside>
      </div>
    </div>
  </main>;
}
