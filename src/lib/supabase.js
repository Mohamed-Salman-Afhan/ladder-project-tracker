import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  url && key && !url.includes("your-project-ref")
    ? createClient(url, key)
    : null;

export const toDb = (p) => ({
  id: p.id,
  project_name: p.projectName,
  client_name: p.clientName,
  website: p.website || "",
  status: p.status,
  stages: p.tasks,
  is_active: p.isActive !== false,
  lifecycle: p.lifecycle || {},
});

export const fromDb = (r) => ({
  id: r.id,
  projectName: r.project_name,
  clientName: r.client_name,
  website: r.website || "",
  status: r.status,
  tasks: (r.stages || []).map((t, i) => ({
    ...t,
    task_id: t.task_id || crypto.randomUUID(),
    row_type: t.row_type || "main",
    order: t.order !== undefined ? t.order : i,
    assignee: t.assignee ? t.assignee.replace(" LG", "").trim() : "",
  })),
  isActive: r.is_active !== false,
  lifecycle: r.lifecycle || {},
});

// True when a write failed only because the `lifecycle` column isn't in the
// database yet (migration not applied). Callers retry without it.
export const isMissingLifecycleColumn = (error) =>
  !!error && /lifecycle/i.test(`${error.message || ""} ${error.details || ""}`);

export const withoutLifecycle = (row) => {
  const { lifecycle, ...rest } = row; // eslint-disable-line no-unused-vars
  return rest;
};
