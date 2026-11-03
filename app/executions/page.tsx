"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listExecutions, type ExecutionRecord } from "@/lib/executions";
import { ThemeToggle } from "@/components/theme-provider";

function exportRun(run: ExecutionRecord) {
  const contents = JSON.stringify(run, null, 2);
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  const safeName = run.workflowName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workflow";
  link.href = url;
  link.download = `${safeName}-run-${run.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportRuns(runs: ExecutionRecord[]) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(runs, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `nexflow-executions-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExecutionsPage() {
  const [runs, setRuns] = useState<ExecutionRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { listExecutions().then((records) => { setRuns(records); setNow(Date.now()); }).catch(() => setRuns([])).finally(() => setReady(true)); }, []);
  const shown = useMemo(() => {
    const days = dateRange === "all" ? null : Number.parseInt(dateRange, 10);
    const cutoff = days === null ? null : now - days * 24 * 60 * 60 * 1000;
    const normalizedSearch = search.trim().toLowerCase();
    return runs.filter((run) => {
      const matchesSearch = !normalizedSearch || run.workflowName.toLowerCase().includes(normalizedSearch) || run.nodes.some((node) => node.nodeName.toLowerCase().includes(normalizedSearch));
      return matchesSearch && (filter === "all" || run.status === filter) && (cutoff === null || Date.parse(run.startedAt) >= cutoff);
    });
  }, [runs, filter, dateRange, now, search]);
  const count = (status: "success" | "failed") => runs.filter((run) => run.status === status).length;
  return <main className="hub-shell"><aside className="rail"><Link href="/workflows" className="brand-mark">n</Link><Link href="/workflows" className="rail-button" title="Workflows">⌘</Link><Link href="/executions" className="rail-button active" title="Executions">◷</Link><Link href="/templates" className="rail-button" title="Templates">▦</Link><div className="rail-spacer"/><button className="avatar">JD</button></aside><section className="hub-main"><header className="hub-topbar"><div className="crumb"><span className="crumb-muted">Workspace</span><span className="slash">/</span><b>Executions</b></div><div className="top-actions"><ThemeToggle/><Link className="button subtle" href="/workflows">View workflows</Link></div></header><div className="hub-content"><div className="hub-title-row"><div><span className="eyebrow">ACTIVITY</span><h1>Execution history</h1><p>Review recent workflow runs and their results.</p></div></div><label className="hub-search execution-search"><span aria-hidden="true">?</span><input aria-label="Search executions by workflow or step" placeholder="Search workflow or step..." value={search} onChange={(event) => setSearch(event.target.value)}/></label><div className="execution-filters"><button className={`filter-chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All runs <span>{runs.length}</span></button><button className={`filter-chip ${filter === "success" ? "active" : ""}`} onClick={() => setFilter("success")}>Successful <span>{count("success")}</span></button><button className={`filter-chip ${filter === "failed" ? "active" : ""}`} onClick={() => setFilter("failed")}>Failed <span>{count("failed")}</span></button><button className="button subtle export-history-button" disabled={!ready || shown.length === 0} onClick={() => exportRuns(shown)}>Export visible ({shown.length})</button><label className="date-filter">Date range <select value={dateRange} onChange={(event) => { setDateRange(event.target.value as typeof dateRange); setNow(Date.now()); }}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option></select></label></div>{shown.length ? <div className="run-list">{shown.map((run) => <article className="run-card" key={run.id}><button className="run-summary" aria-expanded={expanded === run.id} onClick={() => setExpanded(expanded === run.id ? null : run.id)}><span className={`run-status ${run.status}`}>{run.status === "success" ? "✓" : "!"}</span><span className="run-workflow"><b>{run.workflowName}</b><small>{new Date(run.startedAt).toLocaleString()}</small></span><span className={`run-badge ${run.status}`}>{run.status === "success" ? "Succeeded" : "Failed"}</span><span className="run-meta">{run.nodes.filter((node) => node.status === "success").length} steps · {run.durationMs} ms</span><span className="run-chevron">{expanded === run.id ? "⌃" : "⌄"}</span></button>{expanded === run.id && <div className="run-details"><button className="export-run-button" onClick={() => exportRun(run)}>Export run JSON</button>{run.nodes.map((node, index) => <div className="log-row" key={`${run.id}-${node.nodeId}-${index}`}><span className={`log-dot ${node.status}`}>{node.status === "success" ? "✓" : node.status === "error" ? "!" : "–"}</span><div><b>{node.nodeName}</b><small>{node.message}</small>{node.output !== undefined && node.status === "success" && <code>{JSON.stringify(node.output)}</code>}</div><span className={`log-status ${node.status}`}>{node.status}</span></div>)}<Link href={`/workflows/${run.workflowId}`} className="open-run-flow">Open workflow →</Link></div>}</article>)}</div> : <div className="empty-state execution-empty"><div>{ready ? "◷" : "…"}</div><b>{ready ? runs.length ? "No runs match these filters" : "No executions yet" : "Loading execution history"}</b><span>{ready ? runs.length ? (search.trim() ? "Try another workflow or step name." : "Change the status or date range to see other runs.") : "Run a workflow to see its status, branch decisions, and outputs here." : "Reading saved runs from this browser."}</span>{ready && <Link className="button run-button" href="/workflows">Open a workflow</Link>}</div>}</div></section></main>;
}
