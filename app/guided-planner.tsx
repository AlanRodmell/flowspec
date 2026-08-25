"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Component, Database, Eye, LayoutGrid, Network, Plus, Route, ServerCog, Sparkles, Webhook, Cloud, Globe2, TestTube2, type LucideIcon } from "lucide-react";
import type { RepoNodeKind } from "./flowspec-import";
import type { ReviewNode } from "./flowspec-review";

export interface GuidedNodeInput {
  kind: RepoNodeKind;
  label: string;
  responsibility: string;
  linkNodeId?: string;
  direction: "from-existing" | "to-existing";
  relationship: string;
  payload: string;
  inputs: string[];
  outputs: string[];
  state: string[];
}

interface GuidedPlannerProps {
  nodes: ReviewNode[];
  relationships: string[];
  onAdd: (input: GuidedNodeInput) => string;
  onOpenCanvas: () => void;
  onOpenReview: () => void;
}

const KIND_META: Record<RepoNodeKind, { label: string; description: string; icon: LucideIcon }> = {
  route: { label: "Page / route", description: "User entry or routed page", icon: Route },
  component: { label: "Component", description: "Visible UI or composition", icon: Component },
  hook: { label: "Hook", description: "Reusable behavior or data access", icon: Webhook },
  state: { label: "State / store", description: "Shared or owned state", icon: Database },
  service: { label: "Service", description: "Application or domain service", icon: ServerCog },
  api: { label: "API", description: "Backend request boundary", icon: Cloud },
  external: { label: "External", description: "Third-party system", icon: Globe2 },
  test: { label: "Test", description: "Verification boundary", icon: TestTube2 },
};

const INITIAL_DRAFT: GuidedNodeInput = {
  kind: "component",
  label: "",
  responsibility: "",
  direction: "from-existing",
  relationship: "renders",
  payload: "",
  inputs: [],
  outputs: [],
  state: [],
};

function list(value: string): string[] {
  return value.split("\n");
}

export function GuidedPlanner({ nodes, relationships, onAdd, onOpenCanvas, onOpenReview }: GuidedPlannerProps) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<GuidedNodeInput>({ ...INITIAL_DRAFT, linkNodeId: nodes[0]?.id });
  const [lastAddedId, setLastAddedId] = useState<string>();
  const selectedLink = nodes.find((node) => node.id === draft.linkNodeId);
  const canContinue = step !== 1 || Boolean(draft.label.trim() && draft.responsibility.trim());
  const steps = useMemo(() => ["Define", "Place", "Contract", "Preview"], []);

  const chooseKind = (kind: RepoNodeKind) => {
    const relationship = kind === "component" ? "renders" : kind === "state" ? "reads state" : kind === "route" ? "navigates" : "calls";
    setDraft((current) => ({ ...current, kind, relationship }));
  };

  const commit = () => {
    const id = onAdd({ ...draft, label: draft.label.trim(), responsibility: draft.responsibility.trim() });
    setLastAddedId(id);
  };

  const addAnother = () => {
    setDraft({ ...INITIAL_DRAFT, linkNodeId: nodes.find((node) => node.id === lastAddedId)?.id ?? nodes[0]?.id });
    setLastAddedId(undefined);
    setStep(1);
  };

  if (lastAddedId) {
    return <div className="guided-layout"><main className="guided-success"><span><Check size={22} /></span><h1>{draft.label} added to the plan</h1><p>The component and its relationship now exist on the same editable canvas and are included in Technical Review and prompt exports.</p><div><button className="button primary" onClick={addAnother}><Plus size={14} /> Add another</button><button className="button" onClick={onOpenCanvas}><LayoutGrid size={14} /> View canvas</button><button className="button" onClick={onOpenReview}><Network size={14} /> Review plan</button></div></main></div>;
  }

  return (
    <div className="guided-layout">
      <aside className="guided-progress">
        <span className="eyebrow">Guided build</span>
        <h2>Add one part at a time</h2>
        <p>FlowSpec turns each answer into nodes, links and contracts.</p>
        <ol>{steps.map((label, index) => <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "complete" : ""}><span>{step > index + 1 ? <Check size={12} /> : index + 1}</span><strong>{label}</strong></li>)}</ol>
        <button className="guided-manual-link" onClick={onOpenCanvas}><LayoutGrid size={14} /> Switch to manual canvas</button>
      </aside>

      <main className="guided-main">
        {step === 1 ? <section className="guided-step"><div className="guided-heading"><span>Step 1 of 4</span><h1>What are you adding?</h1><p>Choose its architectural role, then give it a clear name and responsibility.</p></div><div className="guided-kind-grid">{(Object.keys(KIND_META) as RepoNodeKind[]).map((kind) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          return <button key={kind} className={draft.kind === kind ? "selected" : ""} aria-pressed={draft.kind === kind} onClick={() => chooseKind(kind)}><span><Icon size={15} /></span><div><strong>{meta.label}</strong><small>{meta.description}</small></div>{draft.kind === kind ? <Check size={14} /> : null}</button>;
        })}</div><div className="guided-fields"><label>Name<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="e.g. Product results" autoFocus /></label><label>Responsibility<textarea rows={3} value={draft.responsibility} onChange={(event) => setDraft({ ...draft, responsibility: event.target.value })} placeholder="What is this part solely responsible for?" /></label></div></section> : null}

        {step === 2 ? <section className="guided-step"><div className="guided-heading"><span>Step 2 of 4</span><h1>Where does it fit?</h1><p>Link it to an existing part of the plan. Skip the connection only when this is a new root.</p></div>{nodes.length ? <div className="guided-fields"><label>Existing component<select value={draft.linkNodeId ?? ""} onChange={(event) => setDraft({ ...draft, linkNodeId: event.target.value || undefined })}><option value="">No connection yet</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.label} · {KIND_META[node.kind].label}</option>)}</select></label><fieldset><legend>Direction</legend><div className="guided-direction"><button className={draft.direction === "from-existing" ? "selected" : ""} aria-pressed={draft.direction === "from-existing"} onClick={() => setDraft({ ...draft, direction: "from-existing" })}><strong>{selectedLink?.label ?? "Existing"}</strong><ArrowRight size={14} /><strong>{draft.label}</strong></button><button className={draft.direction === "to-existing" ? "selected" : ""} aria-pressed={draft.direction === "to-existing"} onClick={() => setDraft({ ...draft, direction: "to-existing" })}><strong>{draft.label}</strong><ArrowRight size={14} /><strong>{selectedLink?.label ?? "Existing"}</strong></button></div></fieldset><label>Relationship<select value={draft.relationship} onChange={(event) => setDraft({ ...draft, relationship: event.target.value })}>{relationships.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}</select></label><label>What crosses this link?<input value={draft.payload} onChange={(event) => setDraft({ ...draft, payload: event.target.value })} placeholder="e.g. products: Product[] or onRetry()" /></label></div> : <div className="guided-empty-root"><Route size={22} /><strong>This will become the first node</strong><span>No connection is needed until you add the next part.</span></div>}</section> : null}

        {step === 3 ? <section className="guided-step"><div className="guided-heading"><span>Step 3 of 4</span><h1>Describe its contract</h1><p>Use one item per line. Leave a section empty when it does not apply.</p></div><div className="guided-contract-grid"><label><span><strong>Inputs / props received</strong><small>Props, params and events coming in</small></span><textarea rows={6} value={draft.inputs.join("\n")} onChange={(event) => setDraft({ ...draft, inputs: list(event.target.value) })} placeholder={"filters: ProductFilters\nstatus: QueryStatus"} /></label><label><span><strong>Outputs / callbacks</strong><small>Callbacks, renders and return values</small></span><textarea rows={6} value={draft.outputs.join("\n")} onChange={(event) => setDraft({ ...draft, outputs: list(event.target.value) })} placeholder={"onFilterChange(filters)\nonRetry()"} /></label><label><span><strong>State used or owned</strong><small>Local, shared, URL or server state</small></span><textarea rows={6} value={draft.state.join("\n")} onChange={(event) => setDraft({ ...draft, state: list(event.target.value) })} placeholder={"selectedFilters\nproducts query cache"} /></label></div><button className="guided-skip-preview" onClick={commit}><Plus size={14} /> Add without preview</button></section> : null}

        {step === 4 ? <section className="guided-step"><div className="guided-heading"><span>Optional preview</span><h1>See the link before adding it</h1><p>This is the same structure that will appear on the manual canvas and in Technical Review.</p></div><div className={`guided-live-preview ${selectedLink ? "" : "single"}`}>
          {selectedLink && draft.direction === "from-existing" ? <div className="guided-preview-node existing"><span>{KIND_META[selectedLink.kind].label}</span><strong>{selectedLink.label}</strong><small>{selectedLink.responsibility}</small></div> : <div className="guided-preview-node proposed"><span>{KIND_META[draft.kind].label}</span><strong>{draft.label}</strong><small>{draft.responsibility}</small></div>}
          {selectedLink ? <div className="guided-preview-link"><span>{draft.relationship}</span><ArrowRight size={22} /><strong>{draft.payload || "Payload not recorded"}</strong></div> : null}
          {selectedLink ? draft.direction === "from-existing" ? <div className="guided-preview-node proposed"><span>{KIND_META[draft.kind].label}</span><strong>{draft.label}</strong><small>{draft.responsibility}</small></div> : <div className="guided-preview-node existing"><span>{KIND_META[selectedLink.kind].label}</span><strong>{selectedLink.label}</strong><small>{selectedLink.responsibility}</small></div> : null}
        </div><div className="guided-preview-contract"><div><span>Inputs</span><strong>{draft.inputs.length ? draft.inputs.join(", ") : "None recorded"}</strong></div><div><span>Outputs</span><strong>{draft.outputs.length ? draft.outputs.join(", ") : "None recorded"}</strong></div><div><span>State</span><strong>{draft.state.length ? draft.state.join(", ") : "None recorded"}</strong></div></div></section> : null}

        <footer className="guided-step-actions"><button className="button ghost" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))}><ArrowLeft size={14} /> Back</button>{step < 4 ? <button className="button primary" disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>Continue <ArrowRight size={14} /></button> : <button className="button primary" onClick={commit}><Plus size={14} /> Add to plan</button>}</footer>
      </main>

      <aside className="guided-context"><div><Sparkles size={16} /><strong>Current plan</strong></div><span>{nodes.length} nodes already mapped</span><p>The new item will be added to this plan, not a separate diagram.</p>{draft.label ? <div className="guided-context-summary"><span>Adding</span><strong>{draft.label}</strong><small>{KIND_META[draft.kind].label}</small></div> : null}{step < 4 ? <button onClick={() => setStep(4)} disabled={!draft.label.trim() || !draft.responsibility.trim()}><Eye size={14} /> Jump to preview</button> : null}</aside>
    </div>
  );
}
