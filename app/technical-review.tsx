"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  ClipboardCheck,
  Component,
  Database,
  Download,
  FileWarning,
  Network,
  Pencil,
  Route,
  ServerCog,
  TestTube2,
  Webhook,
  Cloud,
  Globe2,
  type LucideIcon,
} from "lucide-react";
import { buildTechnicalReview, type ReviewEdge, type ReviewNode, type ReviewProject } from "./flowspec-review";
import type { RepoNodeKind } from "./flowspec-import";

type ReviewSection = "overview" | "components" | "checks";

interface TechnicalReviewProps {
  project: ReviewProject;
  nodes: ReviewNode[];
  edges: ReviewEdge[];
  onEditPlan: () => void;
  onInspectNode: (nodeId: string) => void;
  onInspectEdge: (edgeId: string) => void;
  onExport: () => void;
}

const KIND_META: Record<RepoNodeKind, { label: string; icon: LucideIcon }> = {
  route: { label: "Route", icon: Route },
  component: { label: "Component", icon: Component },
  hook: { label: "Hook", icon: Webhook },
  state: { label: "State / store", icon: Database },
  service: { label: "Service", icon: ServerCog },
  api: { label: "API", icon: Cloud },
  external: { label: "External", icon: Globe2 },
  test: { label: "Test", icon: TestTube2 },
};

const SECTION_META: Array<{ id: ReviewSection; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: ClipboardCheck },
  { id: "components", label: "Components & flow", icon: Boxes },
  { id: "checks", label: "Review checks", icon: FileWarning },
];

function values(items: string[]): string {
  const populated = items.map((item) => item.trim()).filter(Boolean);
  return populated.length ? populated.join(", ") : "Not recorded";
}

export function TechnicalReview({ project, nodes, edges, onEditPlan, onInspectNode, onInspectEdge, onExport }: TechnicalReviewProps) {
  const [section, setSection] = useState<ReviewSection>("overview");
  const review = useMemo(() => buildTechnicalReview(project, nodes, edges), [edges, nodes, project]);
  const names = useMemo(() => new Map(nodes.map((node) => [node.id, node.label])), [nodes]);
  const groupedGaps = useMemo(() => Array.from(new Set(review.gaps.map((item) => item.area))).map((area) => ({ area, gaps: review.gaps.filter((item) => item.area === area) })), [review.gaps]);

  const inspectGap = (nodeId?: string, edgeId?: string) => {
    if (nodeId) onInspectNode(nodeId);
    else if (edgeId) onInspectEdge(edgeId);
  };

  return (
    <div className="technical-review-layout">
      <aside className="review-navigation" aria-label="Technical review sections">
        <span className="review-navigation-label">Review sections</span>
        {SECTION_META.map((item) => {
          const Icon = item.icon;
          const count = item.id === "checks" ? review.gaps.length : undefined;
          return <button key={item.id} className={section === item.id ? "active" : ""} aria-pressed={section === item.id} onClick={() => setSection(item.id)}><Icon size={15} /><span>{item.label}</span>{count ? <strong>{count}</strong> : null}</button>;
        })}
        <div className="review-navigation-note"><Check size={14} /><span>Generated directly from the current canvas. Manual and imported maps use the same review.</span></div>
      </aside>

      <main className="technical-review-main">
        <header className="technical-review-header">
          <div><span className="eyebrow">Technical review</span><h1>{project.title || "Untitled React plan"}</h1><p>{project.objective || "Add an objective in the project brief to define the intended outcome."}</p></div>
          <div className="technical-review-actions"><button className="button ghost" onClick={onExport}><Download size={14} /> Export .md</button><button className="button" onClick={onEditPlan}><Pencil size={14} /> Edit plan</button></div>
        </header>

        {section === "overview" ? (
          <div className="review-section-content">
            <div className="review-summary-grid">
              <article><span>Architecture</span><strong>{nodes.length} nodes · {edges.length} connections</strong><small>{review.layers.length} populated hierarchy layers</small></article>
              <article><span>Contracts</span><strong>{review.completeContractCount} of {nodes.length} defined</strong><small>Responsibility plus inputs or outputs</small></article>
              <article className={review.reviewGapCount ? "attention" : "complete"}><span>Review state</span><strong>{review.reviewGapCount ? `${review.reviewGapCount} gaps need attention` : "No structural gaps found"}</strong><small>{review.gaps.length - review.reviewGapCount} supporting notes</small></article>
            </div>

            <section className="review-block">
              <div className="review-block-heading"><div><h2>Architecture hierarchy</h2><p>Ordered from user entry through UI, logic, services and system boundaries.</p></div><span>Live from canvas</span></div>
              {review.layers.length ? <div className="review-hierarchy" role="list">{review.layers.map((layer, index) => (
                <div className="review-layer" role="listitem" key={layer.id}>
                  <span className="review-layer-label">{layer.label}</span>
                  <div>{layer.nodes.map((node) => {
                    const meta = KIND_META[node.kind];
                    const Icon = meta.icon;
                    return <button key={node.id} className={`review-node kind-${node.kind}`} onClick={() => onInspectNode(node.id)}><span><Icon size={13} /> {meta.label}</span><strong>{node.label}</strong><small>{node.responsibility || "Responsibility not recorded"}</small></button>;
                  })}</div>
                  {index < review.layers.length - 1 ? <ArrowRight className="review-layer-arrow" size={16} aria-hidden="true" /> : null}
                </div>
              ))}</div> : <div className="review-empty"><Network size={22} /><strong>No architecture to review yet</strong><span>Add a node on the Plan canvas or import a repository map.</span></div>}
            </section>

            <section className="review-block">
              <div className="review-block-heading"><div><h2>Review summary</h2><p>Structural signals only—these checks do not claim to verify repository code.</p></div><button className="review-link" onClick={() => setSection("checks")}>View all checks <ArrowRight size={13} /></button></div>
              {review.gaps.length ? <div className="review-gap-list">{review.gaps.slice(0, 5).map((item) => <button key={item.id} onClick={() => inspectGap(item.nodeId, item.edgeId)} disabled={!item.nodeId && !item.edgeId}><span>{item.area}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><em className={item.severity}>{item.severity === "review" ? "Review" : "Note"}</em></button>)}</div> : <div className="review-success"><Check size={17} /><div><strong>The diagram is structurally complete</strong><span>No missing contracts, disconnected nodes or generic connections were detected.</span></div></div>}
            </section>

            <section className="review-block review-context">
              <div className="review-block-heading"><div><h2>Project context</h2><p>The constraints supplied to build and repository-analysis prompts.</p></div></div>
              <dl><div><dt>Current understanding</dt><dd>{project.existingContext || "Not recorded"}</dd></div><div><dt>Stack</dt><dd>{project.stack || "Not recorded"}</dd></div><div><dt>Constraints</dt><dd>{project.constraints || "Not recorded"}</dd></div></dl>
            </section>
          </div>
        ) : null}

        {section === "components" ? (
          <div className="review-section-content">
            <section className="review-block review-block-first">
              <div className="review-block-heading"><div><h2>Component inventory</h2><p>Responsibilities, contracts, state and evidence for every node.</p></div><span>{review.evidenceCount} with evidence</span></div>
              <div className="review-table-wrap"><table className="review-table"><thead><tr><th>Component or boundary</th><th>Responsibility</th><th>Inputs / props</th><th>Outputs / callbacks</th><th>State</th><th>Evidence</th></tr></thead><tbody>{nodes.map((node) => {
                const meta = KIND_META[node.kind];
                const Icon = meta.icon;
                return <tr key={node.id} onClick={() => onInspectNode(node.id)}><td><button><span className={`review-kind kind-${node.kind}`}><Icon size={12} /> {meta.label}</span><strong>{node.label}</strong></button></td><td>{node.responsibility || "Not recorded"}</td><td>{values(node.inputs)}</td><td>{values(node.outputs)}</td><td>{values(node.state)}</td><td>{node.fileHint || node.notes || "Not recorded"}</td></tr>;
              })}</tbody></table></div>
            </section>

            <section className="review-block">
              <div className="review-block-heading"><div><h2>Connection inventory</h2><p>The mechanism and payload crossing every architectural boundary.</p></div><span>{edges.length} connections</span></div>
              {edges.length ? <div className="review-connections">{edges.map((item) => <button key={item.id} onClick={() => onInspectEdge(item.id)}><div><span>Source</span><strong>{names.get(item.source) ?? item.source}</strong></div><div className="review-connection-contract"><span>{item.relationship || "connects"}</span><strong>{item.payload || "Payload not recorded"}</strong></div><ArrowRight size={15} /><div><span>Target</span><strong>{names.get(item.target) ?? item.target}</strong></div></button>)}</div> : <div className="review-empty"><Network size={22} /><strong>No connections mapped</strong><span>Connect nodes on the Plan canvas to describe the data flow.</span></div>}
            </section>
          </div>
        ) : null}

        {section === "checks" ? (
          <div className="review-section-content">
            <div className="review-check-intro"><FileWarning size={18} /><div><strong>{review.gaps.length ? `${review.gaps.length} review findings` : "No review findings"}</strong><span>FlowSpec checks whether the diagram contains enough structural detail. Repository correctness still needs evidence from VS Code analysis.</span></div></div>
            {groupedGaps.length ? <div className="review-check-groups">{groupedGaps.map((group) => <section className="review-check-group" key={group.area}><div><h2>{group.area}</h2><span>{group.gaps.length}</span></div>{group.gaps.map((item) => <button key={item.id} onClick={() => inspectGap(item.nodeId, item.edgeId)} disabled={!item.nodeId && !item.edgeId}><em className={item.severity}>{item.severity === "review" ? "Review" : "Note"}</em><div><strong>{item.title}</strong><span>{item.detail}</span></div>{item.nodeId || item.edgeId ? <ArrowRight size={14} /> : null}</button>)}</section>)}</div> : <div className="review-success large"><Check size={20} /><div><strong>The diagram has the required structural detail</strong><span>Continue with repository analysis to verify the proposed architecture against the codebase.</span></div></div>}
          </div>
        ) : null}
      </main>
    </div>
  );
}
