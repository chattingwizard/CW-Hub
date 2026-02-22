-- ============================================================
-- CW Hub Migration v3: Task Manager + Knowledge Base
-- ============================================================

-- ── TASKS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  category text DEFAULT 'other'
    CHECK (category IN ('operations', 'coaching', 'content', 'recruitment', 'technical', 'admin', 'other')),
  assignee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  creator_id uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  team text,
  due_date date,
  labels text[] DEFAULT '{}',
  parent_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','chatter_manager','team_leader','script_manager','va','personal_assistant')
    )
  );

CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
  USING (
    creator_id = auth.uid()
    OR assignee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','chatter_manager')
    )
  );

CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated
  USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','chatter_manager')
    )
  );

-- ── TASK COMMENTS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_comments_select" ON task_comments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "task_comments_insert" ON task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "task_comments_delete" ON task_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','chatter_manager')
    )
  );

-- ── DOCUMENTS (Knowledge Base) ───────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'guide'
    CHECK (category IN ('company', 'role_overview', 'workflow', 'training', 'policy', 'guide')),
  target_roles text[] DEFAULT '{}',
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  icon text DEFAULT '📄',
  sort_order int DEFAULT 0,
  parent_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  is_published boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select" ON documents FOR SELECT TO authenticated
  USING (
    is_published = true
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','chatter_manager')
    )
  );

CREATE POLICY "documents_insert" ON documents FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','chatter_manager')
    )
  );

CREATE POLICY "documents_update" ON documents FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','chatter_manager')
    )
  );

CREATE POLICY "documents_delete" ON documents FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

-- ── Updated_at trigger ───────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
