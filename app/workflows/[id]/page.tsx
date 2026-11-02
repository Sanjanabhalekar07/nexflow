import { Suspense } from "react";
import WorkflowEditor from "@/components/workflow-editor";

export default function WorkflowPage({ params }: PageProps<"/workflows/[id]">) {
  return <Suspense fallback={<div className="route-loading">Loading workflow…</div>}>
    {params.then(({ id }) => <WorkflowEditor workflowId={id} />)}
  </Suspense>;
}
