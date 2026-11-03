"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-provider";

const templates = [
  { key: "welcome", icon: "mail", tint: "rose", name: "Customer welcome flow", description: "Fetch a customer record, check their status, and send a welcome message.", steps: "5 steps", category: "Customer experience" },
  { key: "health", icon: "↗", tint: "blue", name: "API health check", description: "Make a mock request and route the result into a status notification.", steps: "4 steps", category: "Monitoring" },
  { key: "cleanup", icon: "◇", tint: "teal", name: "Data cleanup", description: "Transform incoming fields and prepare them for a downstream action.", steps: "3 steps", category: "Data" },
];

type Node = { id: string; kind: string; title: string; x: number; y: number; config: Record<string, string> };
type Edge = { id: string; from: string; to: string; branch?: string };
type Flow = { id: string; name: string; updated: string; nodes: Node[]; edges: Edge[] };

function buildFlow(key: string, name: string): Flow {
  const id = crypto.randomUUID();
  let nodes: Node[]; let edges: Edge[];
  if (key === "cleanup") {
    nodes = [{ id: "a", kind: "trigger", title: "Manual trigger", x: 150, y: 150, config: {} }, { id: "b", kind: "transform", title: "Normalize customer data", x: 470, y: 150, config: { field: "fullName", expression: "{{ firstName + ' ' + lastName }}" } }, { id: "c", kind: "end", title: "Ready to use", x: 790, y: 150, config: {} }];
    edges = [{ id: "e1", from: "a", to: "b" }, { id: "e2", from: "b", to: "c" }];
  } else if (key === "health") {
    nodes = [{ id: "a", kind: "trigger", title: "Manual trigger", x: 100, y: 150, config: {} }, { id: "b", kind: "http", title: "Check service status", x: 400, y: 150, config: { method: "GET", url: "https://api.example.com/health" } }, { id: "c", kind: "condition", title: "Service is healthy?", x: 700, y: 150, config: { field: "status", operator: "equals", value: "ok" } }, { id: "d", kind: "notify", title: "Send status alert", x: 1000, y: 35, config: { recipient: "ops@example.com", message: "Service status needs attention" } }, { id: "f", kind: "end", title: "All clear", x: 1000, y: 260, config: {} }];
    edges = [{ id: "e1", from: "a", to: "b" }, { id: "e2", from: "b", to: "c" }, { id: "e3", from: "c", to: "d", branch: "No" }, { id: "e4", from: "c", to: "f", branch: "Yes" }];
  } else {
    nodes = [{ id: "a", kind: "trigger", title: "Manual trigger", x: 120, y: 150, config: {} }, { id: "b", kind: "http", title: "Fetch customer record", x: 420, y: 150, config: { method: "GET", url: "https://api.example.com/customers/42" } }, { id: "c", kind: "condition", title: "Customer is active?", x: 720, y: 150, config: { field: "status", operator: "equals", value: "active" } }, { id: "d", kind: "notify", title: "Send welcome message", x: 1020, y: 30, config: { recipient: "hello@example.com", message: "Welcome back!" } }, { id: "e", kind: "end", title: "Done", x: 1320, y: 30, config: {} }, { id: "f", kind: "end", title: "Skip notification", x: 1020, y: 260, config: {} }];
    edges = [{ id: "e1", from: "a", to: "b" }, { id: "e2", from: "b", to: "c" }, { id: "e3", from: "c", to: "d", branch: "Yes" }, { id: "e4", from: "d", to: "e" }, { id: "e5", from: "c", to: "f", branch: "No" }];
  }
  const nodeIds = new Map(nodes.map((node) => [node.id, crypto.randomUUID()]));
  return { id, name, updated: new Date().toISOString(), nodes: nodes.map((node) => ({ ...node, id: nodeIds.get(node.id)! })), edges: edges.map((edge) => ({ ...edge, id: crypto.randomUUID(), from: nodeIds.get(edge.from)!, to: nodeIds.get(edge.to)! })) };
}

async function storeFlow(flow: Flow) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("nexflow", 1); request.onupgradeneeded = () => request.result.createObjectStore("workspace", { keyPath: "key" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const old = await new Promise<Flow[]>((resolve, reject) => { const request = db.transaction("workspace").objectStore("workspace").get("nexflow-workflows-v1"); request.onsuccess = () => resolve(request.result?.value ?? []); request.onerror = () => reject(request.error); });
  await new Promise<void>((resolve, reject) => { const request = db.transaction("workspace", "readwrite").objectStore("workspace").put({ key: "nexflow-workflows-v1", value: [...old, flow] }); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}

export default function TemplatesPage() {
  const router = useRouter();
  const createFromTemplate = async (template: typeof templates[number]) => { const flow = buildFlow(template.key, template.name); await storeFlow(flow); router.push(`/workflows/${flow.id}`); };
  return <main className="hub-shell"><aside className="rail"><Link href="/workflows" className="brand-mark">n</Link><Link href="/workflows" className="rail-button" title="Workflows">⌘</Link><Link href="/executions" className="rail-button" title="Executions">◷</Link><Link href="/templates" className="rail-button active" title="Templates">▦</Link><div className="rail-spacer"/><button className="avatar">JD</button></aside><section className="hub-main"><header className="hub-topbar"><div className="crumb"><span className="crumb-muted">Workspace</span><span className="slash">/</span><b>Templates</b></div><div className="top-actions"><ThemeToggle/><Link className="button subtle" href="/workflows">My workflows</Link></div></header><div className="hub-content"><div className="hub-title-row"><div><span className="eyebrow">GET STARTED FASTER</span><h1>Workflow templates</h1><p>Start with a pattern, then tailor it to your process.</p></div></div><div className="template-grid">{templates.map((template) => <article className="template-card" key={template.name}><div className={`template-icon node-icon ${template.tint}`}>{template.icon}</div><span className="template-category">{template.category}</span><h2>{template.name}</h2><p>{template.description}</p><div className="template-footer"><span>{template.steps}</span><button className="button subtle" onClick={() => void createFromTemplate(template)}>Use template →</button></div></article>)}</div><div className="template-note"><span>✦</span><div><b>Templates are a starting point</b><p>Choose a template to create a workflow, then configure its nodes and simulate a run.</p></div></div></div></section></main>;
}
