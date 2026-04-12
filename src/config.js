// ============================================================================
// M365 / DATAVERSE CONFIGURATION
// Fill these in with your tenant and Dataverse environment details.
// App Registration needs: Dynamics CRM → user_impersonation delegated permission.
// ============================================================================
export const M365_CONFIG = {
  clientId: 'YOUR_APP_REGISTRATION_CLIENT_ID',
  tenantId: 'YOUR_TENANT_ID',
  dataverseUrl: 'https://YOUR_ORG.crm.dynamics.com',
  tables: {
    projects:       'aa_projects',
    tasks:          'aa_tasks',
    people:         'aa_people',
    departments:    'aa_departments',
    clients:        'aa_clients',
    communications: 'aa_communications',
  },
  columnMaps: {
    projects: {
      id: 'aa_projectid', name: 'aa_name', deptId: 'aa_departmentid',
      clientId: 'aa_clientid', ownerId: 'aa_ownerid', stage: 'aa_stage',
      priority: 'aa_priority', sortOrder: 'aa_sortorder', x: 'aa_canvas_x',
      y: 'aa_canvas_y', startDate: 'aa_startdate', dueDate: 'aa_duedate',
      narrative: 'aa_narrative', notes: 'aa_notes_json', lastTouch: 'aa_lasttouch',
      workspaceLayout: 'aa_workspace_layout_json',
    },
    tasks: {
      id: 'aa_taskid', projectId: 'aa_projectid', title: 'aa_title',
      description: 'aa_description', assigneeId: 'aa_assigneeid',
      dueDate: 'aa_duedate', effort: 'aa_effort', done: 'aa_done',
      subtasks: 'aa_subtasks_json',
    },
    people: {
      id: 'aa_personid', name: 'aa_name', email: 'aa_email',
      role: 'aa_role', x: 'aa_canvas_x', y: 'aa_canvas_y',
    },
    departments: { id: 'aa_departmentid', name: 'aa_name' },
    clients: {
      id: 'aa_clientid', name: 'aa_name', contactName: 'aa_contactname',
      email: 'aa_email', phone: 'aa_phone', notes: 'aa_notes',
      x: 'aa_canvas_x', y: 'aa_canvas_y',
    },
    communications: {
      id: 'aa_communicationid', clientId: 'aa_clientid', personId: 'aa_personid',
      date: 'aa_date', type: 'aa_type', notes: 'aa_notes',
    },
  },
  jsonFields: {
    projects: ['notes', 'workspaceLayout'],
    tasks: ['subtasks'],
  },
}

// ============================================================================
// SHARED CONSTANTS
// ============================================================================
export const STORAGE_MODE_KEY = 'active-assistant-storage-mode'
export const MAX_TITLE_LENGTH = 500
export const MAX_TEXT_LENGTH = 10000
export const CLOSE_ANIMATION_MS = 400
export const MAX_ZINDEX = 999999
