export const defaultPipelineStages = [
  { name: "Lead", color: "#94a3b8", probability: 10, position: 0 },
  { name: "Qualified", color: "#3b82f6", probability: 25, position: 1 },
  { name: "Proposal", color: "#8b5cf6", probability: 50, position: 2 },
  { name: "Negotiation", color: "#f59e0b", probability: 75, position: 3 },
  { name: "Closed Won", color: "#22c55e", probability: 100, position: 4 },
  { name: "Closed Lost", color: "#ef4444", probability: 0, position: 5 },
] as const;
