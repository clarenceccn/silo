import { FormEvent, useEffect, useMemo, useState } from "react";

type Priority = "high" | "medium" | "low";
type Bucket = "anytime" | "morning" | "day" | "evening";
type Tone = "mint" | "peach" | "sky" | "lilac" | "lemon" | "rose";
type MobileView = "myday" | "priority";

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

type Task = {
  id: string;
  day: string;
  title: string;
  time: string;
  duration: number;
  priority: Priority;
  bucket: Bucket;
  icon: string;
  color: Tone;
  done: boolean;
  checklist: ChecklistItem[];
  focusMinutes: number;
};

type TaskDraft = {
  title: string;
  time: string;
  duration: number;
  priority: Priority;
  bucket: Bucket;
  icon: string;
  color: Tone;
};

type PlannerState = {
  selectedDay: string;
  weekStart: string;
  mobileView: MobileView;
  collapsedPriority: Record<Priority, boolean>;
  tasks: Task[];
};

const STORAGE_KEY = "calm-planner-v1";

const PRIORITIES: Priority[] = ["high", "medium", "low"];
const BUCKETS: Bucket[] = ["anytime", "morning", "day", "evening"];
const COLOR_OPTIONS: Tone[] = ["mint", "peach", "sky", "lilac", "lemon", "rose"];
const ICON_OPTIONS = ["✨", "📊", "🧠", "📌", "☀️", "🏃", "🥗", "🧺", "🛒", "📚", "🎧", "🪴"];
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const BUCKET_META: Record<Bucket, { label: string; icon: string }> = {
  anytime: { label: "Anytime", icon: "🕘" },
  morning: { label: "Morning", icon: "🌤️" },
  day: { label: "Day", icon: "☀️" },
  evening: { label: "Evening", icon: "🌙" },
};

const PRIORITY_META: Record<Priority, { label: string; icon: string }> = {
  high: { label: "High", icon: "▲" },
  medium: { label: "Medium", icon: "●" },
  low: { label: "Low", icon: "▼" },
};

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const DATE_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });
const TIME_LABEL = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function addDays(iso: string, amount: number): string {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + amount);
  return toIsoDate(date);
}

function startOfWeek(iso: string): string {
  const date = fromIsoDate(iso);
  const dayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayOffset);
  return toIsoDate(date);
}

function getWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatTime(time: string): string {
  if (!time) return "Anytime";
  const date = new Date();
  const [hours, minutes] = time.split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return TIME_LABEL.format(date);
}

function createChecklist(title: string): ChecklistItem[] {
  return [
    { id: createId(), label: `Open ${title.toLowerCase()} and start.`, done: false },
    { id: createId(), label: "Work one small chunk.", done: false },
    { id: createId(), label: "Quick review and mark complete.", done: false },
  ];
}

function createDraft(bucket: Bucket = "anytime"): TaskDraft {
  return {
    title: "",
    time: "09:00",
    duration: 30,
    priority: "medium",
    bucket,
    icon: "✨",
    color: "mint",
  };
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const doneDiff = Number(a.done) - Number(b.done);
    if (doneDiff !== 0) return doneDiff;
    return minutesFromTime(a.time) - minutesFromTime(b.time);
  });
}

function createSeedTasks(today: string): Task[] {
  const week = getWeekDays(startOfWeek(today));
  const templates: TaskDraft[] = [
    { title: "Morning routine", time: "07:30", duration: 40, priority: "high", bucket: "morning", icon: "☀️", color: "lemon" },
    { title: "Focused project block", time: "09:30", duration: 90, priority: "high", bucket: "day", icon: "🧠", color: "lilac" },
    { title: "Lunch reset", time: "12:30", duration: 30, priority: "medium", bucket: "day", icon: "🥗", color: "mint" },
    { title: "Messages and follow-ups", time: "15:00", duration: 35, priority: "medium", bucket: "anytime", icon: "📬", color: "sky" },
    { title: "Evening tidy", time: "19:00", duration: 25, priority: "low", bucket: "evening", icon: "🧺", color: "peach" },
  ];

  const tasks: Task[] = [];
  week.forEach((day, dayIndex) => {
    templates.forEach((template, taskIndex) => {
      tasks.push({
        ...template,
        id: `seed-${day}-${taskIndex}`,
        day,
        done: day === today && taskIndex === 0,
        checklist: createChecklist(template.title),
        focusMinutes: taskIndex === 1 ? 20 : 10,
      });
    });
    if (dayIndex === 4) {
      tasks.push({
        id: `seed-${day}-extra`,
        day,
        title: "Prep weekend groceries",
        time: "17:20",
        duration: 30,
        priority: "low",
        bucket: "evening",
        icon: "🛒",
        color: "rose",
        done: false,
        checklist: createChecklist("Prep weekend groceries"),
        focusMinutes: 0,
      });
    }
  });
  return tasks;
}

function createInitialState(): PlannerState {
  const today = toIsoDate(new Date());
  return {
    selectedDay: today,
    weekStart: startOfWeek(today),
    mobileView: "myday",
    collapsedPriority: {
      high: false,
      medium: false,
      low: false,
    },
    tasks: createSeedTasks(today),
  };
}

function useLocalStorageState<T>(key: string, createFallback: () => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // Ignore malformed localStorage and fall back to defaults.
    }
    return createFallback();
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage write errors.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

type TaskCardProps = {
  task: Task;
  showBucket?: boolean;
  onToggleDone: (taskId: string) => void;
  onEdit: (task: Task) => void;
};

function TaskCard({ task, showBucket = false, onToggleDone, onEdit }: TaskCardProps) {
  return (
    <article className={`task-card ${task.done ? "is-done" : ""}`} onClick={() => onEdit(task)}>
      <div className={`icon-chip tone-${task.color}`}>{task.icon}</div>
      <div className="task-body">
        <p className="task-title">{task.title}</p>
        <p className="task-meta">
          {formatTime(task.time)} · {task.duration}m
          {showBucket ? ` · ${BUCKET_META[task.bucket].label}` : ""}
        </p>
      </div>
      <button
        type="button"
        className={`check-toggle ${task.done ? "done" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleDone(task.id);
        }}
        aria-label={task.done ? "Mark as incomplete" : "Mark as complete"}
      />
    </article>
  );
}

type FocusRingProps = {
  progress: number;
  icon: string;
  color: Tone;
};

function FocusRing({ progress, icon, color }: FocusRingProps) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(progress, 100)) / 100) * circumference;

  return (
    <div className="focus-ring-wrap">
      <svg className="focus-ring" viewBox="0 0 132 132" aria-hidden="true">
        <circle className="focus-track" cx="66" cy="66" r={radius} />
        <circle
          className="focus-progress"
          cx="66"
          cy="66"
          r={radius}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <div className={`focus-center tone-${color}`}>{icon}</div>
      <div className="focus-percent">{progress}%</div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useLocalStorageState<PlannerState>(STORAGE_KEY, createInitialState);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(createDraft());

  const weekDays = useMemo(() => getWeekDays(state.weekStart), [state.weekStart]);

  const selectedTasks = useMemo(
    () => sortTasks(state.tasks.filter((task) => task.day === state.selectedDay)),
    [state.tasks, state.selectedDay],
  );

  const tasksByBucket = useMemo(() => {
    return BUCKETS.reduce(
      (acc, bucket) => {
        acc[bucket] = selectedTasks.filter((task) => task.bucket === bucket);
        return acc;
      },
      {} as Record<Bucket, Task[]>,
    );
  }, [selectedTasks]);

  const tasksByPriority = useMemo(() => {
    return PRIORITIES.reduce(
      (acc, priority) => {
        acc[priority] = selectedTasks.filter((task) => task.priority === priority);
        return acc;
      },
      {} as Record<Priority, Task[]>,
    );
  }, [selectedTasks]);

  const focusTask = useMemo(() => {
    return [...selectedTasks]
      .filter((task) => !task.done)
      .sort((a, b) => {
        const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return minutesFromTime(a.time) - minutesFromTime(b.time);
      })[0];
  }, [selectedTasks]);

  const focusProgress = focusTask
    ? Math.round((focusTask.focusMinutes / Math.max(focusTask.duration, 1)) * 100)
    : 0;
  const focusRemaining = focusTask ? Math.max(0, focusTask.duration - focusTask.focusMinutes) : 0;

  const patchTask = (taskId: string, patcher: (task: Task) => Task) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => (task.id === taskId ? patcher(task) : task)),
    }));
  };

  const toggleDone = (taskId: string) => {
    patchTask(taskId, (task) => ({ ...task, done: !task.done }));
  };

  const toggleChecklist = (taskId: string, checklistId: string) => {
    patchTask(taskId, (task) => ({
      ...task,
      checklist: task.checklist.map((item) =>
        item.id === checklistId ? { ...item, done: !item.done } : item,
      ),
    }));
  };

  const nudgeFocusMinutes = (taskId: string, delta: number) => {
    patchTask(taskId, (task) => ({
      ...task,
      focusMinutes: Math.max(0, Math.min(task.duration, task.focusMinutes + delta)),
    }));
  };

  const openCreate = (bucket: Bucket = "anytime") => {
    setEditingTaskId(null);
    setDraft(createDraft(bucket));
    setSheetOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setDraft({
      title: task.title,
      time: task.time,
      duration: task.duration,
      priority: task.priority,
      bucket: task.bucket,
      icon: task.icon,
      color: task.color,
    });
    setSheetOpen(true);
  };

  const closeSheet = () => setSheetOpen(false);

  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;

    setState((prev) => {
      if (editingTaskId) {
        return {
          ...prev,
          tasks: prev.tasks.map((task) =>
            task.id === editingTaskId
              ? { ...task, ...draft, title, duration: Math.max(5, draft.duration) }
              : task,
          ),
        };
      }

      const newTask: Task = {
        id: createId(),
        day: prev.selectedDay,
        title,
        time: draft.time,
        duration: Math.max(5, draft.duration),
        priority: draft.priority,
        bucket: draft.bucket,
        icon: draft.icon,
        color: draft.color,
        done: false,
        checklist: createChecklist(title),
        focusMinutes: 0,
      };

      return {
        ...prev,
        tasks: [...prev.tasks, newTask],
      };
    });

    setSheetOpen(false);
  };

  const deleteEditingTask = () => {
    if (!editingTaskId) return;
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((task) => task.id !== editingTaskId),
    }));
    setSheetOpen(false);
  };

  const shiftWeek = (direction: number) => {
    setState((prev) => {
      const nextStart = addDays(prev.weekStart, direction * 7);
      const weekEnd = addDays(nextStart, 6);
      const selectedInsideWeek = prev.selectedDay >= nextStart && prev.selectedDay <= weekEnd;
      return {
        ...prev,
        weekStart: nextStart,
        selectedDay: selectedInsideWeek ? prev.selectedDay : nextStart,
      };
    });
  };

  const togglePriorityGroup = (priority: Priority) => {
    setState((prev) => ({
      ...prev,
      collapsedPriority: {
        ...prev.collapsedPriority,
        [priority]: !prev.collapsedPriority[priority],
      },
    }));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Calm Planner</p>
          <h1>My Day</h1>
          <p className="subhead">{DATE_LABEL.format(fromIsoDate(state.selectedDay))}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => openCreate()}>
          + Quick Add
        </button>
      </header>

      <section className="panel week-strip">
        <button type="button" className="icon-button" onClick={() => shiftWeek(-1)} aria-label="Previous week">
          ‹
        </button>
        <div className="week-days">
          {weekDays.map((day) => {
            const date = fromIsoDate(day);
            const isActive = day === state.selectedDay;
            return (
              <button
                type="button"
                key={day}
                className={`day-pill ${isActive ? "active" : ""}`}
                onClick={() => setState((prev) => ({ ...prev, selectedDay: day }))}
              >
                <span>{DAY_LABEL.format(date)}</span>
                <strong>{date.getDate()}</strong>
              </button>
            );
          })}
        </div>
        <button type="button" className="icon-button" onClick={() => shiftWeek(1)} aria-label="Next week">
          ›
        </button>
      </section>

      <div className="mobile-toggle">
        <button
          type="button"
          className={state.mobileView === "myday" ? "active" : ""}
          onClick={() => setState((prev) => ({ ...prev, mobileView: "myday" }))}
        >
          My Day
        </button>
        <button
          type="button"
          className={state.mobileView === "priority" ? "active" : ""}
          onClick={() => setState((prev) => ({ ...prev, mobileView: "priority" }))}
        >
          Priority
        </button>
      </div>

      <main className="layout">
        <section className={`panel ${state.mobileView === "myday" ? "mobile-visible" : "mobile-hidden"}`}>
          <div className="section-head">
            <h2>My Day</h2>
            <p>{selectedTasks.length} tasks</p>
          </div>

          <div className="bucket-grid">
            {BUCKETS.map((bucket) => (
              <article key={bucket} className="bucket-card">
                <header className="bucket-head">
                  <span className={`bucket-pill bucket-${bucket}`}>
                    {BUCKET_META[bucket].icon} {BUCKET_META[bucket].label}
                  </span>
                  <button type="button" className="ghost-icon" onClick={() => openCreate(bucket)} aria-label="Add task">
                    +
                  </button>
                </header>

                <div className="task-stack">
                  {tasksByBucket[bucket].length > 0 ? (
                    tasksByBucket[bucket].map((task) => (
                      <TaskCard key={task.id} task={task} onToggleDone={toggleDone} onEdit={openEdit} />
                    ))
                  ) : (
                    <p className="empty-note">Nothing scheduled.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className={`side-column ${state.mobileView === "priority" ? "mobile-visible" : "mobile-hidden"}`}>
          <section className="panel">
            <div className="section-head">
              <h2>Priority</h2>
              <p>Collapse by urgency</p>
            </div>

            <div className="priority-stack">
              {PRIORITIES.map((priority) => (
                <article key={priority} className="priority-card">
                  <button
                    type="button"
                    className={`priority-head priority-${priority}`}
                    onClick={() => togglePriorityGroup(priority)}
                  >
                    <span>
                      {PRIORITY_META[priority].icon} {PRIORITY_META[priority].label} ({tasksByPriority[priority].length})
                    </span>
                    <span>{state.collapsedPriority[priority] ? "▾" : "▴"}</span>
                  </button>

                  {!state.collapsedPriority[priority] && (
                    <div className="task-stack">
                      {tasksByPriority[priority].length > 0 ? (
                        tasksByPriority[priority].map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            showBucket
                            onToggleDone={toggleDone}
                            onEdit={openEdit}
                          />
                        ))
                      ) : (
                        <p className="empty-note">No tasks here.</p>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="panel focus-panel">
            <div className="section-head">
              <h2>Focus Mode</h2>
              <p>{focusTask ? `${focusRemaining} minutes left` : "All caught up"}</p>
            </div>

            {focusTask ? (
              <>
                <div className="focus-head">
                  <FocusRing progress={focusProgress} icon={focusTask.icon} color={focusTask.color} />
                  <div className="focus-meta">
                    <h3>{focusTask.title}</h3>
                    <p>
                      {formatTime(focusTask.time)} · {focusTask.duration}m
                    </p>
                    <div className="focus-controls">
                      <button type="button" onClick={() => nudgeFocusMinutes(focusTask.id, -5)}>
                        -5 min
                      </button>
                      <button type="button" onClick={() => nudgeFocusMinutes(focusTask.id, 5)}>
                        +5 min
                      </button>
                    </div>
                  </div>
                </div>

                <div className="checklist">
                  {focusTask.checklist.slice(0, 3).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`checklist-item ${item.done ? "done" : ""}`}
                      onClick={() => toggleChecklist(focusTask.id, item.id)}
                    >
                      <span className="checklist-mark">{item.done ? "✓" : ""}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="empty-note">Add a task or switch day to start focus mode.</p>
            )}
          </section>
        </aside>
      </main>

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={closeSheet}>
          <section className="sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="sheet-header">
              <h3>{editingTaskId ? "Edit Task" : "Quick Add Task"}</h3>
              <button type="button" className="icon-button" onClick={closeSheet} aria-label="Close task sheet">
                ×
              </button>
            </header>

            <form className="sheet-form" onSubmit={submitDraft}>
              <label className="field">
                <span>Title</span>
                <input
                  required
                  autoFocus
                  value={draft.title}
                  placeholder="What would help today?"
                  onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>

              <div className="field-row">
                <label className="field">
                  <span>Time</span>
                  <input
                    type="time"
                    value={draft.time}
                    onChange={(event) => setDraft((prev) => ({ ...prev, time: event.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>Duration (min)</span>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={draft.duration}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, duration: Number(event.target.value) || 5 }))
                    }
                  />
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span>Priority</span>
                  <select
                    value={draft.priority}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, priority: event.target.value as Priority }))
                    }
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {PRIORITY_META[priority].label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Section</span>
                  <select
                    value={draft.bucket}
                    onChange={(event) => setDraft((prev) => ({ ...prev, bucket: event.target.value as Bucket }))}
                  >
                    {BUCKETS.map((bucket) => (
                      <option key={bucket} value={bucket}>
                        {BUCKET_META[bucket].label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Icon</span>
                <div className="choice-grid">
                  {ICON_OPTIONS.map((icon) => (
                    <button
                      type="button"
                      key={icon}
                      className={`choice-chip ${draft.icon === icon ? "active" : ""}`}
                      onClick={() => setDraft((prev) => ({ ...prev, icon }))}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>Color</span>
                <div className="tone-grid">
                  {COLOR_OPTIONS.map((tone) => (
                    <button
                      type="button"
                      key={tone}
                      className={`tone-pick tone-${tone} ${draft.color === tone ? "active" : ""}`}
                      onClick={() => setDraft((prev) => ({ ...prev, color: tone }))}
                      aria-label={`Set color ${tone}`}
                    />
                  ))}
                </div>
              </label>

              <footer className="sheet-actions">
                {editingTaskId && (
                  <button type="button" className="btn ghost danger" onClick={deleteEditingTask}>
                    Delete
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={closeSheet}>
                  Cancel
                </button>
                <button type="submit" className="btn primary">
                  Save
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
