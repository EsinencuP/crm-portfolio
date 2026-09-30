"use client";

import { useState } from "react";

import { move } from "@dnd-kit/helpers";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, LoaderCircle, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Stage = {
  id: string;
  name: string;
  color: string;
  probability: number;
  position: number;
  _count: { deals: number };
};

function StageRow({
  stage,
  index,
  disabled,
  onChange,
}: {
  stage: Stage;
  index: number;
  disabled: boolean;
  onChange: (stage: Stage) => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: stage.id,
    index,
    type: "stage",
    accept: "stage",
    group: "pipeline",
    disabled,
  });
  return (
    <div
      ref={ref}
      className={`grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[auto_minmax(0,1fr)_7rem_7rem_auto] sm:items-end ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`Drag ${stage.name} to reorder`}
        className="flex h-9 w-8 cursor-grab touch-none items-center justify-center text-muted-foreground"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="space-y-1">
        <Label htmlFor={`stage-name-${stage.id}`}>Stage name</Label>
        <Input
          id={`stage-name-${stage.id}`}
          value={stage.name}
          maxLength={80}
          onChange={(event) => onChange({ ...stage, name: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`stage-color-${stage.id}`}>Color</Label>
        <Input
          id={`stage-color-${stage.id}`}
          type="color"
          className="h-9 w-full p-1"
          value={stage.color}
          onChange={(event) => onChange({ ...stage, color: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`stage-prob-${stage.id}`}>Probability %</Label>
        <Input
          id={`stage-prob-${stage.id}`}
          type="number"
          min={0}
          max={100}
          value={stage.probability}
          onChange={(event) => onChange({ ...stage, probability: Number(event.target.value) })}
          disabled={disabled}
        />
      </div>
      <Badge variant="secondary" className="mb-2">
        {stage._count.deals} deals
      </Badge>
    </div>
  );
}

export function PipelineSettings({ initialStages }: { initialStages: Stage[] }) {
  const queryClient = useQueryClient();
  const [stages, setStages] = useState(initialStages);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [probability, setProbability] = useState(10);
  const [error, setError] = useState("");

  async function save(next: Stage[]) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/pipeline-stages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stages: next.map(({ id, name, color: stageColor, probability: chance }) => ({
            id,
            name,
            color: stageColor,
            probability: chance,
          })),
        }),
      });
      const body: { stages?: Stage[]; error?: string } = await response.json();
      if (!response.ok || !body.stages) throw new Error(body.error ?? "Unable to save pipeline.");
      setStages(body.stages);
      setDirty(false);
      toast.success("Pipeline saved");
      await queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save pipeline.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdding(true);
    setError("");
    try {
      if (dirty && !(await save(stages))) return;
      const response = await fetch("/api/pipeline-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color, probability }),
      });
      const body: { stage?: Stage; error?: string } = await response.json();
      if (!response.ok || !body.stage) throw new Error(body.error ?? "Unable to add stage.");
      const stage = body.stage;
      setStages((current) => [...current, { ...stage, _count: { deals: 0 } }]);
      setName("");
      setProbability(10);
      toast.success("Stage added");
      await queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add stage.");
    } finally {
      setAdding(false);
    }
  }

  function endDrag(event: DragEndEvent) {
    if (event.canceled || saving || adding) return;
    const next = move(stages, event);
    if (next === stages) return;
    setStages(next);
    setDirty(true);
    void save(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Pipeline settings</h1>
        <p className="text-muted-foreground">Set stage order, colors, and forecast probabilities.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Stage preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-2">
            {stages.length ? (
              stages.map((stage, index) => (
                <div key={stage.id} className="min-w-36 flex-1 rounded-lg border bg-muted/20 p-3">
                  <div className="mb-2 h-1 rounded-full" style={{ backgroundColor: stage.color }} />
                  <p className="truncate font-medium text-sm">
                    {index + 1}. {stage.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {stage.probability}% · {stage._count.deals} deals
                  </p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">Add a stage to start your pipeline.</p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Stages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Drag the handle to change the order. Stage names used for Closed Won and Closed Lost affect reports.
          </p>
          <DragDropProvider onDragEnd={endDrag}>
            <div className="space-y-2">
              {stages.map((stage, index) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  index={index}
                  disabled={saving || adding}
                  onChange={(updated) => {
                    setStages((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                    setDirty(true);
                  }}
                />
              ))}
            </div>
          </DragDropProvider>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button onClick={() => void save(stages)} disabled={!dirty || saving || adding}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add stage</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="new-stage-name">Name</Label>
              <Input
                id="new-stage-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-stage-color">Color</Label>
              <Input
                id="new-stage-color"
                type="color"
                className="h-9 w-full p-1"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-stage-probability">Probability %</Label>
              <Input
                id="new-stage-probability"
                type="number"
                min={0}
                max={100}
                value={probability}
                onChange={(event) => setProbability(Number(event.target.value))}
              />
            </div>
            <Button type="submit" disabled={adding || saving}>
              {adding ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {adding ? "Adding…" : "Add stage"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
