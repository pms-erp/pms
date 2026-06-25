// src/db/schema.ts
import {
  mysqlTable,
  varchar,
  text,
  int,
  boolean,
  timestamp,
  mysqlEnum,
  index,
  unique,
  datetime,
  date,
  decimal,
  json,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/* ===============================
   ENUMS
================================= */

export const UserRole = [
  "ADMIN",
  "PROJECT_MANAGER",
  "TEAM_LEADER",
  "DEVELOPER",
  "DESIGNER",
  "PROGRAMMER",
  "QA",
  "CLIENT", // ✅ NEW
] as const;

export const ProjectStatus = [
  "PLANNING",
  "ACTIVE",
  "IN_QA",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

export const DEFAULT_TEAM_TYPES = [
  "DEVELOPER",
  "DESIGNER",
  "PROGRAMMER",
] as const;

export type UserRoleType = (typeof UserRole)[number];
export type ProjectStatusType = (typeof ProjectStatus)[number];

/* ===============================
   TEAMS
================================= */

export const teams = mysqlTable(
  "teams",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    created_at: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow()
      .notNull(),
  },
  (table) => ({
    slugIdx: index("teams_slug_idx").on(table.slug),
  }),
);

/* ===============================
   ATTENDANCE LOCATIONS
================================= */

export const attendanceLocations = mysqlTable("attendance_locations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  radius_meters: int("radius_meters").notNull().default(100),
  is_active: boolean("is_active").notNull().default(true),
  created_by: varchar("created_by", { length: 36 }).notNull(),
  created_at: datetime("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/* ===============================
   USERS
================================= */

export const users = mysqlTable("users", {
  id: varchar("id", { length: 191 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  avatar: varchar("avatar", { length: 500 }),
  password: varchar("password", { length: 255 }).notNull(),
  password_plain: varchar("password_plain", { length: 255 }),
  role: varchar("role", { length: 100 }).notNull(),
  team_type: varchar("team_type", { length: 100 }),
  level: varchar("level", { length: 10 }),
  team_leader_id: varchar("team_leader_id", { length: 191 }),
  base_salary: decimal("base_salary", { precision: 12, scale: 2 }),
  join_date: date("join_date"),
  per_minute_rate: decimal("per_minute_rate", { precision: 10, scale: 4 }),
  bank_name: varchar("bank_name", { length: 100 }),
  bank_account_number: varchar("bank_account_number", { length: 50 }),
  bank_account_title: varchar("bank_account_title", { length: 150 }),
  location_id: varchar("location_id", { length: 36 }).references(
    () => attendanceLocations.id,
    { onDelete: "set null" },
  ),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updated_at: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow()
    .notNull(),
});

/* ===============================
   PROJECTS
================================= */

export const projects = mysqlTable(
  "projects",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    client_name: varchar("client_name", { length: 255 }),
    website_url: varchar("website_url", { length: 255 }),
    files: text("files"),
    fiverr_order_id: varchar("fiverr_order_id", { length: 255 }),
    body: text("body"),
    status: mysqlEnum("status", ProjectStatus).default("PLANNING").notNull(),
    created_by: varchar("created_by", { length: 191 })
      .notNull()
      .references(() => users.id),
    created_at: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow()
      .notNull(),
  },
  (table) => ({
    createdByIdx: index("projects_created_by_idx").on(table.created_by),
  }),
);

/* ===============================
   CLIENT PROJECTS  ✅ NEW
   Maps CLIENT users to the projects they can view.
   One client can have multiple projects; one project can have multiple clients.
================================= */

export const clientProjects = mysqlTable(
  "client_projects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    client_id: varchar("client_id", { length: 191 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    project_id: varchar("project_id", { length: 191 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    invited_by: varchar("invited_by", { length: 191 })
      .notNull()
      .references(() => users.id),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    uniqueClientProject: unique("client_projects_unique").on(
      t.client_id,
      t.project_id,
    ),
    clientIdx: index("client_projects_client_idx").on(t.client_id),
    projectIdx: index("client_projects_project_idx").on(t.project_id),
  }),
);

/* ===============================
   PROJECT MESSAGES  ✅ NEW
   Group chat per project — visible to:
     • ADMIN / PROJECT_MANAGER (all)
     • TEAM_LEADER of any team assigned to the project
     • Users who have tasks assigned on the project
     • CLIENT users linked via client_projects
================================= */

export const projectMessages = mysqlTable(
  "project_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    project_id: varchar("project_id", { length: 191 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sender_id: varchar("sender_id", { length: 191 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    // Optional file attachment (reuse same JSON structure as tasks.files)
    attachment: text("attachment"),
    // ✅ Edit / delete support
    edited_at: datetime("edited_at"),
    is_deleted: boolean("is_deleted").notNull().default(false),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    projectIdx: index("project_messages_project_idx").on(t.project_id),
    senderIdx: index("project_messages_sender_idx").on(t.sender_id),
    createdAtIdx: index("project_messages_created_at_idx").on(t.created_at),
  }),
);

/* ===============================
   TASKS
================================= */

export const tasks = mysqlTable(
  "tasks",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    project_id: varchar("project_id", { length: 191 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    team_type: varchar("team_type", { length: 100 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    files: text("files"),
    priority: mysqlEnum("priority", ["LOW", "MEDIUM", "HIGH"]).notNull(),
    assigned_by: varchar("assigned_by", { length: 191 })
      .notNull()
      .references(() => users.id),
    assigned_to: varchar("assigned_to", { length: 191 })
      .notNull()
      .references(() => users.id),
    qa_assigned_to: varchar("qa_assigned_to", { length: 191 }).references(
      () => users.id,
    ),
    qa_assigned_at: timestamp("qa_assigned_at"),
    estimated_minutes: int("estimated_minutes"),
    due_date: timestamp("due_date"),
    status: mysqlEnum("status", [
      "IN_PROGRESS",
      "WAITING_FOR_QA",
      "APPROVED",
      "REWORK",
    ]).notNull(),
    started_at: timestamp("started_at"),
    completed_at: timestamp("completed_at"),
    locked_at: timestamp("locked_at"),
    rework_count: int("rework_count").default(0).notNull(),
    created_at: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow()
      .notNull(),
  },
  (table) => ({
    projectIdx: index("tasks_project_idx").on(table.project_id),
    assignedToIdx: index("tasks_assigned_to_idx").on(table.assigned_to),
    assignedByIdx: index("tasks_assigned_by_idx").on(table.assigned_by),
  }),
);

/* ===============================
   TASK TIMERS
================================= */

export const taskTimers = mysqlTable(
  "task_timers",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    task_id: varchar("task_id", { length: 191 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    start_time: timestamp("start_time").notNull(),
    end_time: timestamp("end_time"),
    duration_minutes: int("duration_minutes"),
    is_rework: boolean("is_rework").default(false).notNull(),
    created_at: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    taskIdx: index("task_timers_task_idx").on(table.task_id),
  }),
);

/* ===============================
   TASK NOTES
================================= */

export const taskNotes = mysqlTable(
  "task_notes",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    task_id: varchar("task_id", { length: 191 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => users.id),
    note: text("note").notNull(),
    note_type: mysqlEnum("note_type", [
      "COMMENT",
      "APPROVAL",
      "REJECTION",
      "FEEDBACK_IMAGE",
    ]).notNull(),
    metadata: text("metadata"),
    // ✅ NEW — if true, CLIENT users can see this comment in their portal
    is_client_visible: boolean("is_client_visible").default(false).notNull(),
    created_at: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    taskIdx: index("task_notes_task_idx").on(table.task_id),
    userIdx: index("task_notes_user_idx").on(table.user_id),
  }),
);

/* ===============================
   NOTIFICATIONS
================================= */

export const notifications = mysqlTable(
  "notifications",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    user_id: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => users.id),
    task_id: varchar("task_id", { length: 191 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", [
      "TASK_ASSIGNED",
      "TASK_COMPLETED",
      "QA_REVIEWED",
      "READY_FOR_ASSIGNMENT",
      "TIME_EXCEEDED",
      "HELP_REQUEST",
      "TASK_APPROVED",
      "TASK_REWORK",
      "TASK_RESUBMITTED",
    ]).notNull(),
    title: varchar("title", { length: 255 }),
    message: text("message"),
    is_read: boolean("is_read").default(false).notNull(),
    created_at: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    userIdx: index("notifications_user_idx").on(table.user_id),
    taskIdx: index("notifications_task_idx").on(table.task_id),
  }),
);

/* ===============================
   PUSH SUBSCRIPTIONS
================================= */

export const pushSubscriptions = mysqlTable(
  "push_subscriptions",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    user_id: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => users.id),
    endpoint: varchar("endpoint", { length: 500 }).notNull(),
    p256dh: varchar("p256dh", { length: 255 }).notNull(),
    auth: varchar("auth", { length: 255 }).notNull(),
    created_at: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("push_subscriptions_user_idx").on(table.user_id),
    userUnique: unique("push_subscriptions_user_unique").on(table.user_id),
  }),
);

/* ===============================
   TASK VIEWERS
================================= */

export const taskViewers = mysqlTable(
  "task_viewers",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    task_id: varchar("task_id", { length: 191 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    added_by: varchar("added_by", { length: 191 })
      .notNull()
      .references(() => users.id),
    added_at: timestamp("added_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    taskIdx: index("task_viewers_task_idx").on(table.task_id),
    userIdx: index("task_viewers_user_idx").on(table.user_id),
    uniqueViewer: unique("task_viewers_unique").on(
      table.task_id,
      table.user_id,
    ),
  }),
);

/* ===============================
   PROJECT VIEWERS
================================= */

export const projectViewers = mysqlTable(
  "project_viewers",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    project_id: varchar("project_id", { length: 191 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    added_by: varchar("added_by", { length: 191 })
      .notNull()
      .references(() => users.id),
    added_at: timestamp("added_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    projectIdx: index("project_viewers_project_idx").on(table.project_id),
    userIdx: index("project_viewers_user_idx").on(table.user_id),
    uniqueViewer: unique("project_viewers_unique").on(
      table.project_id,
      table.user_id,
    ),
  }),
);

/* ===============================
   DEVICES
================================= */

export const devices = mysqlTable("devices", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", [
    "LAPTOP",
    "DESKTOP",
    "PHONE",
    "TABLET",
    "OTHER",
  ]).notNull(),
  brand: varchar("brand", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  serial_no: varchar("serial_no", { length: 100 }).notNull().unique(),
  status: mysqlEnum("status", [
    "AVAILABLE",
    "ASSIGNED",
    "MAINTENANCE",
    "RETIRED",
  ])
    .notNull()
    .default("AVAILABLE"),
  condition: mysqlEnum("condition", ["NEW", "GOOD", "FAIR", "POOR"])
    .notNull()
    .default("GOOD"),
  has_keyboard: boolean("has_keyboard").notNull().default(false),
  has_extended_screen: boolean("has_extended_screen").notNull().default(false),
  has_mouse: boolean("has_mouse").notNull().default(false),
  has_charger: boolean("has_charger").notNull().default(false),
  password: varchar("password", { length: 255 }),
  notes: text("notes"),
  created_at: datetime("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updated_at: datetime("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/* ===============================
   DEVICE ASSIGNMENTS
================================= */

export const deviceAssignments = mysqlTable("device_assignments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  device_id: varchar("device_id", { length: 36 })
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  user_id: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  assigned_by: varchar("assigned_by", { length: 36 })
    .notNull()
    .references(() => users.id),
  assigned_at: datetime("assigned_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  returned_at: datetime("returned_at"),
  notes: text("notes"),
});

/* ===============================
   ATTENDANCE
================================= */

export const attendance = mysqlTable(
  "attendance",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    check_in: datetime("check_in").notNull(),
    check_out: datetime("check_out"),
    total_hours: decimal("total_hours", { precision: 5, scale: 2 }),
    status: mysqlEnum("status", ["PRESENT", "HALF_DAY", "ABSENT"])
      .notNull()
      .default("PRESENT"),
    notes: text("notes"),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    userDateIdx: index("attendance_user_date_idx").on(
      table.user_id,
      table.date,
    ),
    dateIdx: index("attendance_date_idx").on(table.date),
  }),
);

/* ===============================
   OFFICE CONFIG
================================= */

export const officeConfig = mysqlTable("office_config", {
  id: varchar("id", { length: 36 }).primaryKey(),
  office_start: varchar("office_start", { length: 5 })
    .notNull()
    .default("09:00"),
  office_end: varchar("office_end", { length: 5 }).notNull().default("18:00"),
  checkin_window_minutes: int("checkin_window_minutes").notNull().default(60),
  checkout_window_minutes: int("checkout_window_minutes").notNull().default(60),
  break_start_time: varchar("break_start_time", { length: 5 })
    .notNull()
    .default("14:00"),
  break_end_time: varchar("break_end_time", { length: 5 })
    .notNull()
    .default("14:30"),
  break_start_time_friday: varchar("break_start_time_friday", { length: 5 }),
  break_end_time_friday: varchar("break_end_time_friday", { length: 5 }),
  break_minutes_default: int("break_minutes_default").notNull().default(30),
  break_minutes_friday: int("break_minutes_friday").notNull().default(60),
  break_tracking_enabled: boolean("break_tracking_enabled")
    .notNull()
    .default(true),
  break_grace_minutes: int("break_grace_minutes").notNull().default(5),
  beneficiary_minutes_default: int("beneficiary_minutes_default")
    .notNull()
    .default(0),
  created_by: varchar("created_by", { length: 36 }).notNull(),
  created_at: datetime("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updated_at: datetime("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/* ===============================
   ATTENDANCE CONFIG
================================= */

export const attendanceConfig = mysqlTable(
  "attendance_config",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    month: date("month").notNull().unique(),
    working_days: int("working_days").notNull().default(22),
    daily_work_minutes: int("daily_work_minutes").notNull().default(510),
    notes: text("notes"),
    created_by: varchar("created_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: datetime("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    monthIdx: index("attendance_config_month_idx").on(table.month),
  }),
);

/* ===============================
   PAYROLL
================================= */

export const payroll = mysqlTable(
  "payroll",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    working_days: int("working_days").notNull(),
    daily_work_minutes: int("daily_work_minutes").notNull(),
    break_minutes: int("break_minutes").notNull().default(30),
    break_minutes_friday: int("break_minutes_friday").notNull().default(60),
    expected_minutes: int("expected_minutes").notNull(),
    actual_minutes: decimal("actual_minutes", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    diff_minutes: decimal("diff_minutes", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    base_salary: decimal("base_salary", { precision: 12, scale: 2 }).notNull(),
    per_minute_rate: decimal("per_minute_rate", {
      precision: 10,
      scale: 4,
    }).notNull(),
    excused_days: int("excused_days").default(0).notNull(),
    remaining_amount: decimal("remaining_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    beneficiary_minutes: int("beneficiary_minutes").notNull().default(0),
    extra_pay: decimal("extra_pay", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    work_deduction: decimal("work_deduction", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    break_deduction: decimal("break_deduction", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    deduction: decimal("deduction", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    final_salary: decimal("final_salary", {
      precision: 12,
      scale: 2,
    }).notNull(),
    status: mysqlEnum("status", ["CALCULATED", "PAID"])
      .notNull()
      .default("CALCULATED"),
    manual_deduction_minutes: int("manual_deduction_minutes")
      .notNull()
      .default(0),
    manual_deduction: decimal("manual_deduction", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: datetime("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    userMonthIdx: index("payroll_user_month_idx").on(
      table.user_id,
      table.month,
    ),
    monthIdx: index("payroll_month_idx").on(table.month),
    userMonthUniq: unique("payroll_user_month_unique").on(
      table.user_id,
      table.month,
    ),
  }),
);

/* ===============================
   BREAK SESSIONS
================================= */

export const breakSessions = mysqlTable(
  "break_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    attendance_id: varchar("attendance_id", { length: 36 })
      .notNull()
      .references(() => attendance.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    break_start: datetime("break_start").notNull(),
    break_end: datetime("break_end"),
    actual_minutes: decimal("actual_minutes", { precision: 6, scale: 2 }),
    allowed_minutes: int("allowed_minutes").notNull(),
    overtime_minutes: decimal("overtime_minutes", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    attendanceIdx: index("break_sessions_attendance_idx").on(
      table.attendance_id,
    ),
    userIdx: index("break_sessions_user_idx").on(table.user_id),
  }),
);

export const KpiLevel = ["SENIOR", "JUNIOR"] as const;
export type KpiLevelType = (typeof KpiLevel)[number];

export const sops = mysqlTable(
  "sops",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    created_by: varchar("created_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: datetime("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    createdByIdx: index("sops_created_by_idx").on(t.created_by),
  }),
);

export const userSops = mysqlTable(
  "user_sops",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sop_id: varchar("sop_id", { length: 36 })
      .notNull()
      .references(() => sops.id, { onDelete: "cascade" }),
    assigned_by: varchar("assigned_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    assigned_at: datetime("assigned_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    uniqueAssignment: unique("user_sops_unique").on(t.user_id, t.sop_id),
    userIdx: index("user_sops_user_idx").on(t.user_id),
    sopIdx: index("user_sops_sop_idx").on(t.sop_id),
  }),
);

/* ===============================
   KPIs
================================= */

export const kpis = mysqlTable(
  "kpis",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    level: mysqlEnum("level", ["SENIOR", "JUNIOR"]).notNull(),
    created_by: varchar("created_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: datetime("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    levelIdx: index("kpis_level_idx").on(t.level),
    createdByIdx: index("kpis_created_by_idx").on(t.created_by),
  }),
);

export const userKpis = mysqlTable(
  "user_kpis",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kpi_id: varchar("kpi_id", { length: 36 })
      .notNull()
      .references(() => kpis.id, { onDelete: "cascade" }),
    assigned_by: varchar("assigned_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    assigned_at: datetime("assigned_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    uniqueAssignment: unique("user_kpis_unique").on(t.user_id, t.kpi_id),
    userIdx: index("user_kpis_user_idx").on(t.user_id),
    kpiIdx: index("user_kpis_kpi_idx").on(t.kpi_id),
  }),
);

/* ===============================
   CHECKLISTS
================================= */

export const checklists = mysqlTable(
  "checklists",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    created_by: varchar("created_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: datetime("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    createdByIdx: index("checklists_created_by_idx").on(t.created_by),
  }),
);

export const userChecklists = mysqlTable(
  "user_checklists",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    user_id: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    checklist_id: varchar("checklist_id", { length: 36 })
      .notNull()
      .references(() => checklists.id, { onDelete: "cascade" }),
    assigned_by: varchar("assigned_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    assigned_at: datetime("assigned_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    uniqueAssignment: unique("user_checklists_unique").on(
      t.user_id,
      t.checklist_id,
    ),
    userIdx: index("user_checklists_user_idx").on(t.user_id),
    checklistIdx: index("user_checklists_checklist_idx").on(t.checklist_id),
  }),
);

export const kpiTeamAssignments = mysqlTable(
  "kpi_team_assignments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    kpi_id: varchar("kpi_id", { length: 36 })
      .notNull()
      .references(() => kpis.id, { onDelete: "cascade" }),
    team_type: varchar("team_type", { length: 100 }).notNull(),
    assigned_by: varchar("assigned_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    uniqueTeam: unique("kpi_team_assignments_unique").on(t.kpi_id, t.team_type),
    kpiIdx: index("kpi_team_assignments_kpi_idx").on(t.kpi_id),
  }),
);

export const checklistTeamAssignments = mysqlTable(
  "checklist_team_assignments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    checklist_id: varchar("checklist_id", { length: 36 })
      .notNull()
      .references(() => checklists.id, { onDelete: "cascade" }),
    team_type: varchar("team_type", { length: 100 }).notNull(),
    assigned_by: varchar("assigned_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    uniqueTeam: unique("checklist_team_assignments_unique").on(
      t.checklist_id,
      t.team_type,
    ),
    checklistIdx: index("checklist_team_assignments_checklist_idx").on(
      t.checklist_id,
    ),
  }),
);

export const LeadPlatform = [
  "FIVERR",
  "UPWORK",
  "EMAIL",
  "DRIBBBLE",
  "BEHANCE",
  "LINKEDIN",
  "WEBSITE",
  "REFERRAL",
  "OTHER",
] as const;

export const LeadStatus = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
  "ON_HOLD",
] as const;

export const LeadPriority = ["LOW", "MEDIUM", "HIGH"] as const;

export const ServiceCategory = [
  "WEB",
  "MOBILE_APP",
  "AI_AUTOMATION",
  "ERP",
  "DESIGN",
  "SEO",
  "OTHER",
] as const;

export type LeadPlatformType = (typeof LeadPlatform)[number];
export type LeadStatusType = (typeof LeadStatus)[number];
export type LeadPriorityType = (typeof LeadPriority)[number];
export type ServiceCategoryType = (typeof ServiceCategory)[number];

export const leads = mysqlTable(
  "leads",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    platform: mysqlEnum("platform", LeadPlatform).notNull(),
    client_name: varchar("client_name", { length: 255 }).notNull(),
    username: varchar("username", { length: 255 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    country: varchar("country", { length: 100 }),
    profile_url: varchar("profile_url", { length: 500 }),
    date_received: date("date_received").notNull(),
    project_title: varchar("project_title", { length: 255 }),
    requirements: text("requirements"),
    challenges: text("challenges"),
    budget: decimal("budget", { precision: 12, scale: 2 }),
    estimated_cost: decimal("estimated_cost", { precision: 12, scale: 2 }),
    proposed_quote: decimal("proposed_quote", { precision: 12, scale: 2 }),
    expected_timeline: varchar("expected_timeline", { length: 100 }),
    service_category: mysqlEnum("service_category", ServiceCategory),
    status: mysqlEnum("status", LeadStatus).notNull().default("NEW"),
    priority: mysqlEnum("priority", LeadPriority).notNull().default("MEDIUM"),
    sent_by: varchar("sent_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    assigned_to: varchar("assigned_to", { length: 36 }).references(
      () => users.id,
    ),
    follow_up_date: date("follow_up_date"),
    next_follow_up_date: date("next_follow_up_date"),
    notes: text("notes"),
    deal_value: decimal("deal_value", { precision: 12, scale: 2 }),
    closing_date: date("closing_date"),
    lost_reason: text("lost_reason"),
    won_project_id: varchar("won_project_id", { length: 191 }).references(
      () => projects.id,
      { onDelete: "set null" },
    ),
    platform_data: text("platform_data"),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: datetime("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    platformIdx: index("leads_platform_idx").on(table.platform),
    statusIdx: index("leads_status_idx").on(table.status),
    sentByIdx: index("leads_sent_by_idx").on(table.sent_by),
    assignedToIdx: index("leads_assigned_to_idx").on(table.assigned_to),
    dateIdx: index("leads_date_idx").on(table.date_received),
  }),
);

/* ===============================
   LEAD FOLLOWUPS
================================= */

export const FollowupType = [
  "CALL",
  "EMAIL",
  "FIVERR",
  "UPWORK",
  "MEETING",
  "MESSAGE",
  "OTHER",
] as const;

export type FollowupTypeType = (typeof FollowupType)[number];

export const leadFollowups = mysqlTable(
  "lead_followups",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    lead_id: varchar("lead_id", { length: 36 })
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    followup_date: date("followup_date").notNull(),
    followup_type: mysqlEnum("followup_type", FollowupType).notNull(),
    discussion_summary: text("discussion_summary").notNull(),
    next_action: text("next_action"),
    next_followup_date: date("next_followup_date"),
    created_by: varchar("created_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    leadIdx: index("lead_followups_lead_idx").on(table.lead_id),
    createdByIdx: index("lead_followups_created_by_idx").on(table.created_by),
  }),
);

export const LeadActivityAction = [
  "CREATED",
  "UPDATED",
  "STATUS_CHANGED",
  "FOLLOWUP_ADDED",
  "FOLLOWUP_DELETED",
  "PROJECT_LINKED",
  "PROJECT_UNLINKED",
  "PROJECT_COMPLETED",
  // Feedback + upsell lifecycle
  "FEEDBACK_ATTEMPT_1",
  "FEEDBACK_ATTEMPT_2",
  "FEEDBACK_ATTEMPT_3",
  "FEEDBACK_RECEIVED",
  "FEEDBACK_NONE",
  "UPSELL_IDENTIFIED",
  "UPSELL_CONVERTED",
] as const;

export type LeadActivityActionType = (typeof LeadActivityAction)[number];

export const leadActivityLogs = mysqlTable(
  "lead_activity_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    lead_id: varchar("lead_id", { length: 36 })
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    action: mysqlEnum("action", LeadActivityAction).notNull(),
    summary: varchar("summary", { length: 500 }).notNull(),
    changes: text("changes"),
    performed_by: varchar("performed_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    performed_by_name: varchar("performed_by_name", { length: 255 }).notNull(),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    leadIdx: index("lead_activity_logs_lead_idx").on(table.lead_id),
    performedByIdx: index("lead_activity_logs_performed_by_idx").on(
      table.performed_by,
    ),
  }),
);

export const leadProjects = mysqlTable(
  "lead_projects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    lead_id: varchar("lead_id", { length: 36 })
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    project_id: varchar("project_id", { length: 191 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    linked_by: varchar("linked_by", { length: 191 })
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    is_primary: boolean("is_primary").notNull().default(false),
    linked_at: datetime("linked_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    uniqueLink: unique("lead_projects_unique").on(t.lead_id, t.project_id),
    leadIdx: index("lead_projects_lead_idx").on(t.lead_id),
    projectIdx: index("lead_projects_project_idx").on(t.project_id),
  }),
);

export type LeadProject = typeof leadProjects.$inferSelect;

export const FeedbackStatus = ["PENDING", "RECEIVED", "NO_RESPONSE"] as const;
export type FeedbackStatusType = (typeof FeedbackStatus)[number];

export const leadClientFeedback = mysqlTable(
  "lead_client_feedback",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    lead_id: varchar("lead_id", { length: 36 })
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    project_id: varchar("project_id", { length: 191 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    feedback_attempt: int("feedback_attempt").notNull(), // 1 | 2 | 3
    feedback_date: date("feedback_date"),
    collected_by: varchar("collected_by", { length: 36 }).references(
      () => users.id,
    ),
    rating: int("rating"), // 1–5, nullable
    feedback_text: text("feedback_text"),
    status: mysqlEnum("status", FeedbackStatus).notNull().default("PENDING"),
    upsell_discussed: boolean("upsell_discussed").notNull().default(false),
    upsell_notes: text("upsell_notes"),
    upsell_service_category: mysqlEnum(
      "upsell_service_category",
      ServiceCategory,
    ),
    upsell_estimated_value: decimal("upsell_estimated_value", {
      precision: 12,
      scale: 2,
    }),
    upsell_lead_id: varchar("upsell_lead_id", { length: 36 }).references(
      () => leads.id,
      { onDelete: "set null" },
    ),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: datetime("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    leadIdx: index("lead_client_feedback_lead_idx").on(t.lead_id),
    projectIdx: index("lead_client_feedback_project_idx").on(t.project_id),
    uniqueAttempt: unique("lead_client_feedback_attempt_unique").on(
      t.lead_id,
      t.project_id,
      t.feedback_attempt,
    ),
  }),
);

export const BillingCategory = [
  "HOSTING",
  "DOMAIN",
  "SOFTWARE",
  "SAAS",
  "UTILITY",
  "INTERNET",
  "PHONE",
  "MARKETING",
  "OTHER",
] as const;

export const BillingCycle = [
  "ONE_TIME",
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUAL",
  "ANNUAL",
] as const;

export const BillingStatus = [
  "ACTIVE",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "PAUSED",
] as const;

export type BillingCategoryType = (typeof BillingCategory)[number];
export type BillingCycleType = (typeof BillingCycle)[number];
export type BillingStatusType = (typeof BillingStatus)[number];

export const bills = mysqlTable(
  "bills",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    service_name: varchar("service_name", { length: 255 }).notNull(),
    vendor_name: varchar("vendor_name", { length: 255 }),
    category: mysqlEnum("category", BillingCategory).notNull().default("OTHER"),
    billing_cycle: mysqlEnum("billing_cycle", BillingCycle)
      .notNull()
      .default("MONTHLY"),
    reference_number: varchar("reference_number", { length: 255 }),
    account_number: varchar("account_number", { length: 255 }),
    customer_name: varchar("customer_name", { length: 255 }),
    login_url: varchar("login_url", { length: 500 }),
    login_email: varchar("login_email", { length: 255 }),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("PKR"),
    due_date: date("due_date").notNull(),
    last_paid_date: date("last_paid_date"),
    start_date: date("start_date"),
    reminder_days_before: int("reminder_days_before").default(1),
    whatsapp_sent_at: datetime("whatsapp_sent_at"),
    google_calendar_event_id: varchar("google_calendar_event_id", {
      length: 255,
    }),
    status: mysqlEnum("status", BillingStatus).notNull().default("ACTIVE"),
    notes: text("notes"),
    created_by: varchar("created_by", { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updated_at: datetime("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    dueDateIdx: index("bills_due_date_idx").on(table.due_date),
    statusIdx: index("bills_status_idx").on(table.status),
    categoryIdx: index("bills_category_idx").on(table.category),
  }),
);

export const PortfolioSource = [
  "PMS",
  "FIVERR",
  "UPWORK",
  "DIRECT_CLIENT",
  "REFERRAL",
  "FACEBOOK",
  "LINKEDIN",
  "WEBSITE_LEAD",
  "OTHER",
] as const;

export const PortfolioProjectType = [
  "BUSINESS_WEBSITE",
  "ECOMMERCE_STORE",
  "LANDING_PAGE",
  "PORTFOLIO_WEBSITE",
  "CRM",
  "ERP",
  "SAAS",
  "AI_APPLICATION",
  "MOBILE_APP",
  "WEB_APPLICATION",
  "OTHER",
] as const;

export const PortfolioStatus = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export const PortfolioWebsiteBuilder = [
  "WORDPRESS",
  "SHOPIFY",
  "NEXTJS",
  "REACT",
  "GOHIGHLEVEL",
  "WEBFLOW",
  "WIX",
  "CUSTOM_DEVELOPMENT",
  "OTHER",
] as const;

export type PortfolioSourceType = (typeof PortfolioSource)[number];
export type PortfolioProjectTypeType = (typeof PortfolioProjectType)[number];
export type PortfolioStatusType = (typeof PortfolioStatus)[number];
export type PortfolioWebsiteBuilderType =
  (typeof PortfolioWebsiteBuilder)[number];

// ── Main Portfolio Table ──────────────────────────────────────────────────────

export const portfolio = mysqlTable("portfolio", {
  id: varchar("id", { length: 36 }).primaryKey(),

  // ── Project Identity ────────────────────────────────────────────────────────
  project_date: date("project_date"),
  project_id: varchar("project_id", { length: 100 }), // optional manual project ID
  linked_project_id: varchar("linked_project_id", { length: 36 }), // FK to projects.id (optional)
  project_name: varchar("project_name", { length: 255 }).notNull(),

  // ── Client Info ─────────────────────────────────────────────────────────────
  customer_name: varchar("customer_name", { length: 255 }),
  business_name: varchar("business_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),

  // ── Classification ──────────────────────────────────────────────────────────
  source: mysqlEnum("source", PortfolioSource)
    .notNull()
    .default("DIRECT_CLIENT"),
  project_type: mysqlEnum("project_type", PortfolioProjectType),
  website_builder: mysqlEnum("website_builder", PortfolioWebsiteBuilder),
  status: mysqlEnum("status", PortfolioStatus).notNull().default("DRAFT"),

  // ── URLs ────────────────────────────────────────────────────────────────────
  website_url: varchar("website_url", { length: 500 }),
  figma_url: varchar("figma_url", { length: 500 }),

  // ── Content ─────────────────────────────────────────────────────────────────
  short_description: text("short_description"),

  // ── Media — stored as JSON arrays of file paths/URLs ────────────────────────
  // e.g. ["/uploads/portfolio/abc/featured.jpg"]
  featured_image: varchar("featured_image", { length: 500 }),
  gallery_images: json("gallery_images").$type<string[]>().default([]),
  pdf_documents: json("pdf_documents").$type<string[]>().default([]),

  // ── Visibility ──────────────────────────────────────────────────────────────
  is_public: boolean("is_public").notNull().default(false),
  is_favorite: boolean("is_favorite").notNull().default(false),

  // ── Future Expansion (nullable / optional JSON blobs) ───────────────────────
  // Intentionally left as nullable columns so future features can be added
  // without a schema migration breaking existing records.
  // Examples: testimonial, case_study_id, technologies (JSON), metrics (JSON)

  // ── Audit ───────────────────────────────────────────────────────────────────
  created_by: varchar("created_by", { length: 36 }).notNull(), // FK to users.id
  created_at: datetime("created_at").notNull(),
  updated_at: datetime("updated_at").notNull(),
});

// ── Type Inference ────────────────────────────────────────────────────────────
export type Portfolio = typeof portfolio.$inferSelect;
export type NewPortfolio = typeof portfolio.$inferInsert;
