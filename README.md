# Nexflow — Visual Workflow Builder

Nexflow is a browser-based workflow editor inspired by tools such as n8n, Zapier, and Make. It lets users assemble a directed graph, configure simulated steps, validate paths, and run workflows locally. It has no production backend and makes no real HTTP requests or notifications.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route sends you to the workflow list.

Useful project commands:

```bash
npm run lint
npm run build
npm start
```

## Pages

- `/workflows` — create, search, duplicate, and delete workflows.
- `/workflows/[id]` — edit one workflow on the visual canvas.
- `/templates` — create a workflow from a sample pattern.
- `/executions` — filter run history and expand node logs and outputs.

## Editor features

- Add nodes from the searchable library by clicking or dragging them onto the canvas.
- Move nodes with the pointer or arrow keys. Hold Shift with an arrow key to move farther.
- Pan by dragging the canvas background. Use zoom controls or **Fit to screen** to change the view.
- Select **Connect**, then choose a source and target node. For an IF node, its first two connections become Yes and No branches.
- Select an edge and use Delete/Backspace or the toolbar action to remove it.
- Configure HTTP Request, IF, Wait, Transform, and Notification nodes in the settings panel.
- Configure HTTP methods, URLs, JSON headers, and request bodies for non-GET methods.
- Validate the graph, simulate a run, and inspect the node outcomes on the canvas or in execution history.
- Undo or redo with the toolbar, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, or Ctrl/Cmd+Y.
- Import or export the active workflow as JSON. Theme choice is saved across pages.

## Sample data and demo

The first visit seeds a **Customer welcome flow**. It starts with sample customer data, makes a mock HTTP request, checks whether `status` equals `active`, and routes to the matching branch. Edit the trigger's sample JSON to exercise another path. Run it with **Run workflow**. The simulator highlights the traversed path and stores its logs in the Executions page.

The Templates page also creates API health check and data cleanup examples. To demonstrate a failed mock request, change an HTTP node URL to include `fail` or `error`, then run it. The simulator records a mock HTTP 500.

A portable JSON version of the customer welcome example is available at [`public/samples/customer-welcome.json`](public/samples/customer-welcome.json) and can be imported from the editor.

## Data and architecture

Workflow graphs and execution records are stored in IndexedDB in the current browser. Theme choice is stored in local storage. Data is not synced between browsers or devices.

See [docs/architecture.md](docs/architecture.md) for the graph model, persistence keys, simulator behavior, business rules, and known limitations.

## Known limitations

- HTTP requests and notifications are simulated. No credentials, network calls, or external integrations are used.
- The simulator starts from the trigger's sample JSON (the built-in demo uses a sample customer payload). Transform expressions support field names, string/number literals, and `+` concatenation; arbitrary JavaScript is not evaluated.
- Delay durations are shortened for demonstration, with a maximum simulated wait of 1.2 seconds per node.
- Execution history is local to the browser and limited to the latest 100 runs.
- This repository currently has lint and production build commands but no automated test suite.
