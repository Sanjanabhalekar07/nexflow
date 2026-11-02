export type ExecutionNode = {
  nodeId: string;
  nodeName: string;
  status: "success" | "skipped" | "error";
  message: string;
  output?: unknown;
};

export type ExecutionRecord = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "success" | "failed";
  startedAt: string;
  durationMs: number;
  nodes: ExecutionNode[];
};

const STORE = "nexflow-executions-v1";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("nexflow", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listExecutions(): Promise<ExecutionRecord[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("workspace").objectStore("workspace").get(STORE);
    request.onsuccess = () => resolve(request.result?.value ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveExecution(record: ExecutionRecord): Promise<void> {
  const db = await database();
  const records = await listExecutions();
  return new Promise((resolve, reject) => {
    const request = db.transaction("workspace", "readwrite").objectStore("workspace").put({ key: STORE, value: [record, ...records].slice(0, 100) });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
