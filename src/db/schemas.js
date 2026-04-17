// ============================================================================
// SCHEMAS.JS - Centralized database schema definitions
// Used by both Offline (VaultDB) and Cloud (Dataverse) modes
// ============================================================================

// ── User Schema (Cloud Mode Only) ──────────────────────────────────────────
export const userSchema = {
  id: String,                       // Unique user ID (UUID v4)
  email: String,                    // Unique, encrypted in transit
  displayName: String,              // User's full name
  passwordHash: String,             // Argon2 hash (never stored client-side in offline mode)
  role: String,                     // 'admin' | 'manager' | 'contributor' | 'viewer'
  status: String,                   // 'active' | 'inactive' | 'pending'
  avatar: String,                   // Base64 or URL to avatar image
  createdAt: String,                // ISO8601 timestamp
  lastLogin: String,                // ISO8601 timestamp
  preferences: {
    theme: String,                  // 'light' | 'dark' | 'system'
    autoLockMinutes: Number,        // Session timeout (0 = never)
    defaultView: String,            // 'kanban' | 'grid' | 'list' | 'canvas'
    emailNotifications: Boolean,
    pushNotifications: Boolean,
  },
  // Multi-factor auth settings
  mfaEnabled: Boolean,
  mfaSecret: String,                // TOTP secret (encrypted)
  backupCodes: Array,               // Array of recovery codes (encrypted)
}

// ── Workspace Schema (Cloud Mode Only) ─────────────────────────────────────
export const workspaceSchema = {
  id: String,
  name: String,
  description: String,
  ownerId: String,                  // User ID of workspace owner
  memberIds: Array,                 // Array of user IDs with access
  settings: {
    visibility: String,             // 'private' | 'team' | 'public'
    allowGuestAccess: Boolean,
    defaultPermission: String,      // 'read' | 'write' | 'admin'
  },
  createdAt: String,
  createdBy: String,                // User ID
  lastModified: String,
}

// ── Permission Schema (Cloud Mode Only) ────────────────────────────────────
export const permissionSchema = {
  id: String,
  resourceType: String,             // 'project' | 'task' | 'client' | 'workspace'
  resourceId: String,               // ID of the resource
  subjectType: String,              // 'user' | 'team'
  subjectId: String,                // User ID or Team ID
  permission: String,               // 'read' | 'write' | 'admin' | 'none'
  grantedBy: String,                // User ID who granted permission
  grantedAt: String,                // ISO8601 timestamp
  expiresAt: String,                // Optional expiration (ISO8601 or null)
}

// ── Audit Log Schema (Cloud Mode Only) ─────────────────────────────────────
export const auditLogSchema = {
  id: String,
  userId: String,                   // Who performed the action
  action: String,                   // 'created' | 'updated' | 'deleted' | 'viewed' | 'login' | 'logout'
  resourceType: String,             // 'project' | 'task' | 'user' | 'workspace' etc.
  resourceId: String,               // ID of affected resource
  changes: Object,                  // JSON diff of changes (before/after)
  metadata: {
    ipAddress: String,              // Optional (privacy consideration)
    userAgent: String,
    deviceId: String,
  },
  timestamp: String,                // ISO8601
}

// ── Comment Schema (Both Modes) ────────────────────────────────────────────
export const commentSchema = {
  id: String,
  resourceType: String,             // 'project' | 'task' | 'client'
  resourceId: String,
  userId: String,                   // Author (or 'offline-user' in offline mode)
  text: String,                     // Comment content (markdown supported)
  mentions: Array,                  // Array of user IDs mentioned (@username)
  attachments: Array,               // Array of file references
  createdAt: String,
  editedAt: String,                 // ISO8601 or null
  reactions: Object,                // { '👍': ['userId1', 'userId2'], '❤️': [...] }
  parentId: String,                 // For threaded replies (null = top-level)
}

// ── Notification Schema (Cloud Mode Only) ──────────────────────────────────
export const notificationSchema = {
  id: String,
  userId: String,                   // Recipient
  type: String,                     // 'mention' | 'assignment' | 'comment' | 'deadline' | 'system'
  title: String,
  message: String,
  resourceType: String,             // Optional: related resource
  resourceId: String,
  actionUrl: String,                // Optional: deep link (e.g., /projects/123)
  read: Boolean,
  createdAt: String,
}

// ── Time Entry Schema (Both Modes) ─────────────────────────────────────────
export const timeEntrySchema = {
  id: String,
  userId: String,                   // Who logged the time (or 'offline-user')
  taskId: String,                   // Optional: link to task
  projectId: String,                // Optional: link to project
  startTime: String,                // ISO8601
  endTime: String,                  // ISO8601 (null if timer running)
  duration: Number,                 // Seconds
  billable: Boolean,
  notes: String,
  createdAt: String,
}

// ── UPDATED: Project Schema ────────────────────────────────────────────────
// Enhanced with user tracking, visibility, comments
export const projectSchema = {
  id: String,
  name: String,
  deptId: String,
  clientId: String,
  ownerId: String,                  // Person ID (existing) or User ID (new Cloud mode)
  stage: String,
  priority: String,
  sortOrder: Number,
  x: Number,
  y: Number,
  startDate: String,
  dueDate: String,
  narrative: String,
  notes: Array,                     // Existing notes array
  lastTouch: String,
  workspaceLayout: Object,

  // NEW FIELDS
  createdBy: String,                // User ID (Cloud mode only)
  createdAt: String,                // ISO8601
  modifiedBy: String,               // User ID of last editor
  lastModified: String,             // ISO8601
  visibility: String,               // 'private' | 'shared' | 'team' | 'public'
  sharedWith: Array,                // Array of user IDs with access
  archived: Boolean,                // Soft delete flag
  archivedAt: String,               // ISO8601 or null
  completedAt: String,              // ISO8601 or null
  estimatedHours: Number,           // Project estimate
  actualHours: Number,              // Tracked time (computed from time entries)
  tags: Array,                      // Array of tag strings
  customFields: Object,             // Extensible custom data
}

// ── UPDATED: Task Schema ───────────────────────────────────────────────────
export const taskSchema = {
  id: String,
  projectId: String,
  title: String,
  description: String,
  assigneeId: String,               // Person ID or User ID
  dueDate: String,
  effort: String,
  done: Boolean,
  subtasks: Array,

  // NEW FIELDS
  createdBy: String,
  createdAt: String,
  modifiedBy: String,
  lastModified: String,
  completedAt: String,              // ISO8601 or null
  completedBy: String,              // User ID
  priority: String,                 // 'low' | 'medium' | 'high' | 'urgent'
  status: String,                   // 'todo' | 'in_progress' | 'blocked' | 'done'
  blockedBy: Array,                 // Array of task IDs that block this task
  blocks: Array,                    // Array of task IDs blocked by this task
  dependencyType: String,           // 'finish-to-start' | 'start-to-start' | null
  estimatedHours: Number,
  actualHours: Number,
  recurrence: Object,               // { enabled, pattern, interval, endDate }
  tags: Array,
}

// ── UPDATED: Person Schema ─────────────────────────────────────────────────
export const personSchema = {
  id: String,
  name: String,
  email: String,
  role: String,                     // Now purely descriptive (RBAC uses users.role in Cloud mode)
  x: Number,
  y: Number,

  // NEW FIELDS
  phone: String,
  department: String,
  title: String,                    // Job title
  location: String,
  timezone: String,
  userId: String,                   // Link to User account (Cloud mode only)
  skills: Array,                    // Array of skill strings
  availability: Object,             // { hours: 40, startDate: '...', endDate: '...' }
  avatarUrl: String,
}

// ── UPDATED: Client Schema ─────────────────────────────────────────────────
export const clientSchema = {
  id: String,
  name: String,
  contactName: String,
  email: String,
  phone: String,
  notes: String,
  x: Number,
  y: Number,

  // NEW FIELDS
  createdBy: String,
  createdAt: String,
  modifiedBy: String,
  lastModified: String,
  company: String,
  address: String,
  website: String,
  industry: String,
  status: String,                   // 'active' | 'inactive' | 'prospect'
  tags: Array,
  customFields: Object,
}

// ── UPDATED: Communication Schema ──────────────────────────────────────────
export const communicationSchema = {
  id: String,
  clientId: String,
  personId: String,
  date: String,
  type: String,
  notes: String,

  // NEW FIELDS
  createdBy: String,
  createdAt: String,
  subject: String,
  attachments: Array,
  followUpDate: String,
  status: String,                   // 'pending' | 'completed' | 'cancelled'
}

// ── Department Schema (Existing, No Changes) ───────────────────────────────
export const departmentSchema = {
  id: String,
  name: String,
}

// ── Export all schemas ─────────────────────────────────────────────────────
export const ALL_SCHEMAS = {
  users: userSchema,
  workspaces: workspaceSchema,
  permissions: permissionSchema,
  auditLogs: auditLogSchema,
  comments: commentSchema,
  notifications: notificationSchema,
  timeEntries: timeEntrySchema,
  projects: projectSchema,
  tasks: taskSchema,
  people: personSchema,
  clients: clientSchema,
  communications: communicationSchema,
  departments: departmentSchema,
}

// ── Dataverse Column Mappings (Cloud Mode) ─────────────────────────────────
export const DATAVERSE_COLUMN_MAPS = {
  users: {
    id: 'aa_userid',
    email: 'aa_email',
    displayName: 'aa_displayname',
    role: 'aa_role',
    status: 'aa_status',
    avatar: 'aa_avatar_url',
    createdAt: 'createdon',
    lastLogin: 'aa_lastlogin',
    preferences: 'aa_preferences_json',
    mfaEnabled: 'aa_mfa_enabled',
    mfaSecret: 'aa_mfa_secret',
    backupCodes: 'aa_backup_codes_json',
  },
  workspaces: {
    id: 'aa_workspaceid',
    name: 'aa_name',
    description: 'aa_description',
    ownerId: 'aa_ownerid',
    memberIds: 'aa_member_ids_json',
    settings: 'aa_settings_json',
    createdAt: 'createdon',
    createdBy: 'aa_createdby',
    lastModified: 'modifiedon',
  },
  permissions: {
    id: 'aa_permissionid',
    resourceType: 'aa_resourcetype',
    resourceId: 'aa_resourceid',
    subjectType: 'aa_subjecttype',
    subjectId: 'aa_subjectid',
    permission: 'aa_permission',
    grantedBy: 'aa_grantedby',
    grantedAt: 'createdon',
    expiresAt: 'aa_expiresat',
  },
  auditLogs: {
    id: 'aa_auditlogid',
    userId: 'aa_userid',
    action: 'aa_action',
    resourceType: 'aa_resourcetype',
    resourceId: 'aa_resourceid',
    changes: 'aa_changes_json',
    metadata: 'aa_metadata_json',
    timestamp: 'createdon',
  },
  comments: {
    id: 'aa_commentid',
    resourceType: 'aa_resourcetype',
    resourceId: 'aa_resourceid',
    userId: 'aa_userid',
    text: 'aa_text',
    mentions: 'aa_mentions_json',
    attachments: 'aa_attachments_json',
    createdAt: 'createdon',
    editedAt: 'aa_editedat',
    reactions: 'aa_reactions_json',
    parentId: 'aa_parentid',
  },
  notifications: {
    id: 'aa_notificationid',
    userId: 'aa_userid',
    type: 'aa_type',
    title: 'aa_title',
    message: 'aa_message',
    resourceType: 'aa_resourcetype',
    resourceId: 'aa_resourceid',
    actionUrl: 'aa_actionurl',
    read: 'aa_read',
    createdAt: 'createdon',
  },
  timeEntries: {
    id: 'aa_timeentryid',
    userId: 'aa_userid',
    taskId: 'aa_taskid',
    projectId: 'aa_projectid',
    startTime: 'aa_starttime',
    endTime: 'aa_endtime',
    duration: 'aa_duration',
    billable: 'aa_billable',
    notes: 'aa_notes',
    createdAt: 'createdon',
  },
  projects: {
    // Existing mappings...
    id: 'aa_projectid',
    name: 'aa_name',
    deptId: 'aa_departmentid',
    clientId: 'aa_clientid',
    ownerId: 'aa_ownerid',
    stage: 'aa_stage',
    priority: 'aa_priority',
    sortOrder: 'aa_sortorder',
    x: 'aa_canvas_x',
    y: 'aa_canvas_y',
    startDate: 'aa_startdate',
    dueDate: 'aa_duedate',
    narrative: 'aa_narrative',
    notes: 'aa_notes_json',
    lastTouch: 'aa_lasttouch',
    workspaceLayout: 'aa_workspace_layout_json',
    // New mappings...
    createdBy: 'aa_createdby',
    createdAt: 'createdon',
    modifiedBy: 'aa_modifiedby',
    lastModified: 'modifiedon',
    visibility: 'aa_visibility',
    sharedWith: 'aa_sharedwith_json',
    archived: 'aa_archived',
    archivedAt: 'aa_archivedat',
    completedAt: 'aa_completedat',
    estimatedHours: 'aa_estimatedhours',
    actualHours: 'aa_actualhours',
    tags: 'aa_tags_json',
    customFields: 'aa_customfields_json',
  },
  tasks: {
    // Existing...
    id: 'aa_taskid',
    projectId: 'aa_projectid',
    title: 'aa_title',
    description: 'aa_description',
    assigneeId: 'aa_assigneeid',
    dueDate: 'aa_duedate',
    effort: 'aa_effort',
    done: 'aa_done',
    subtasks: 'aa_subtasks_json',
    // New...
    createdBy: 'aa_createdby',
    createdAt: 'createdon',
    modifiedBy: 'aa_modifiedby',
    lastModified: 'modifiedon',
    completedAt: 'aa_completedat',
    completedBy: 'aa_completedby',
    priority: 'aa_priority',
    status: 'aa_status',
    blockedBy: 'aa_blockedby_json',
    blocks: 'aa_blocks_json',
    dependencyType: 'aa_dependencytype',
    estimatedHours: 'aa_estimatedhours',
    actualHours: 'aa_actualhours',
    recurrence: 'aa_recurrence_json',
    tags: 'aa_tags_json',
  },
  people: {
    // Existing...
    id: 'aa_personid',
    name: 'aa_name',
    email: 'aa_email',
    role: 'aa_role',
    x: 'aa_canvas_x',
    y: 'aa_canvas_y',
    // New...
    phone: 'aa_phone',
    department: 'aa_department',
    title: 'aa_title',
    location: 'aa_location',
    timezone: 'aa_timezone',
    userId: 'aa_userid',
    skills: 'aa_skills_json',
    availability: 'aa_availability_json',
    avatarUrl: 'aa_avatar_url',
  },
  clients: {
    // Existing...
    id: 'aa_clientid',
    name: 'aa_name',
    contactName: 'aa_contactname',
    email: 'aa_email',
    phone: 'aa_phone',
    notes: 'aa_notes',
    x: 'aa_canvas_x',
    y: 'aa_canvas_y',
    // New...
    createdBy: 'aa_createdby',
    createdAt: 'createdon',
    modifiedBy: 'aa_modifiedby',
    lastModified: 'modifiedon',
    company: 'aa_company',
    address: 'aa_address',
    website: 'aa_website',
    industry: 'aa_industry',
    status: 'aa_status',
    tags: 'aa_tags_json',
    customFields: 'aa_customfields_json',
  },
  communications: {
    // Existing...
    id: 'aa_communicationid',
    clientId: 'aa_clientid',
    personId: 'aa_personid',
    date: 'aa_date',
    type: 'aa_type',
    notes: 'aa_notes',
    // New...
    createdBy: 'aa_createdby',
    createdAt: 'createdon',
    subject: 'aa_subject',
    attachments: 'aa_attachments_json',
    followUpDate: 'aa_followupdate',
    status: 'aa_status',
  },
  departments: {
    id: 'aa_departmentid',
    name: 'aa_name',
  },
}

// ── Helper: Get JSON fields per collection ────────────────────────────────
export const JSON_FIELDS = {
  users: ['preferences', 'backupCodes'],
  workspaces: ['memberIds', 'settings'],
  permissions: [],
  auditLogs: ['changes', 'metadata'],
  comments: ['mentions', 'attachments', 'reactions'],
  notifications: [],
  timeEntries: [],
  projects: ['notes', 'workspaceLayout', 'sharedWith', 'tags', 'customFields'],
  tasks: ['subtasks', 'blockedBy', 'blocks', 'recurrence', 'tags'],
  people: ['skills', 'availability'],
  clients: ['tags', 'customFields'],
  communications: ['attachments'],
  departments: [],
}
