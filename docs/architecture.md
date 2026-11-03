# Architecture and business rules

## Application structure

The app uses the Next.js App Router. Route pages stay separate so each workspace area loads its own page component:

| Route | Responsibility |
| --- | --- |
| `/` | Redirects to `/workflows`. |
| `/workflows` | Reads and manages the local workflow collection. |
| `/workflows/[id]` | Loads the editor for one workflow ID. |
| `/templates` | Creates a new workflow from one of the bundled examples. |
| `/executions` | Reads, filters, and expands saved execution records. |

The editor and page controls are client components because they use React state, event handlers, and browser storage. `ThemeProvider` keeps the selected theme available across route changes. The workflow editor owns the active graph, selection, viewport, validation state, and current simulation state.

## Workflow graph model

A workflow has an `id`, `name`, `updated` label, `nodes` array, and `edges` array. Each node stores an `id`, `kind`, `title`, canvas `x`/`y` coordinates, and a string configuration map. Each edge stores an `id`, source node ID, target node ID, and an optional branch label.

Supported node kinds are:

- `trigger` — entry point for a manual run.
- `http` — simulated request with method and URL.
- `condition` — compares a field from the sample payload and follows a Yes or No edge.
- `delay` — adds a shortened wait to the simulation.
- `transform` — writes a configured output field using the sample first and last name.
- `notify` — records a simulated notification.
- `end` — marks the end of a path.

Connections are directed. The editor prevents accidental self-connections through its two-node connection flow; validation also checks for directed cycles.

## Validation rules

Before a run, validation checks that:

1. At least one trigger exists.
2. Every non-trigger node has an incoming edge.
3. Every node is reachable by following edges from a trigger.
4. Every condition has both a Yes and a No outgoing edge.
5. HTTP URLs begin with `http`.
6. Notification recipients contain `@`.
7. Delay duration is a finite number of at least one.
8. The graph contains no directed cycle.

The first issue is shown in the editor status text. When an issue belongs to a node, that node is selected and marked on the canvas.

## Simulation behavior

Runs begin at all trigger nodes and traverse the graph with a queue. A visited set prevents repeat execution. Non-condition nodes enqueue all outgoing edges. A condition evaluates the current sample value using `equals`, `contains`, numeric `greater than`, or `exists`, then follows only the matching Yes or No edge. Nodes reached through the other branch are logged as skipped.

The sample payload is:

```json
{
  "id": 42,
  "status": "active",
  "name": "Alex Morgan",
  "firstName": "Alex",
  "lastName": "Morgan"
}
```

An HTTP URL containing `fail` or `error` produces a simulated HTTP 500 and ends the run. Other HTTP nodes report a simulated HTTP 200. Notification nodes write a log entry only; they do not send a message. Delay nodes use a short demonstration wait capped at 1.2 seconds. Transform nodes evaluate a small safe expression subset: field names (including dotted paths), quoted string or number literals, and `+` concatenation. Arbitrary JavaScript, function calls, and operators other than `+` are rejected during validation.

Each saved execution includes a run ID, workflow ID/name, status, start time, duration, and per-node status, message, and output snapshot. The canvas separately tracks the current run's node states and traversed edge IDs for highlighting.

## Browser persistence

IndexedDB database: `nexflow`

Object store: `workspace`, keyed by `key`.

| Key | Stored value |
| --- | --- |
| `nexflow-workflows-v1` | Array of workflow graphs. |
| `nexflow-executions-v1` | Newest-first execution records, capped at 100. |

Workflow edits are autosaved after a 350 ms debounce. Creating, importing, and cloning a workflow save before navigating to its editor route. Theme preference is stored in local storage under `nexflow-theme`.

## Editor interactions

- Click or drag a palette item to add a node.
- Drag a node to move it; drag the blank canvas to pan.
- Select **Connect**, then select a source and destination.
- Click an edge to select it. Delete/Backspace or **Delete connection** removes the edge.
- Arrow keys move the selected node by 10 pixels; Shift+arrow moves by 30 pixels.
- Delete/Backspace removes the selected node. Escape exits connection mode.
- Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo. History is in memory and capped at 40 snapshots.
- Zoom controls change scale; **Fit to screen** estimates a scale and scroll position from node bounds.

## Known boundaries

- The app has no backend, accounts, collaboration, real credentials, or external integrations.
- Browser storage does not synchronize between profiles or devices and can be removed by clearing site data.
- The simulator uses the fixed sample payload. It does not fetch real responses, interpret arbitrary expressions, or implement production retry/timeout policies.
- Current repository scripts include lint and build only; automated tests have not been added.
