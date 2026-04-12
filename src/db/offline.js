// ============================================================================
// OFFLINE PROVIDER — IndexedDB
// ============================================================================
const DB_NAME = 'ActiveSpatialCRM_v8'
const DB_VERSION = 8
let dbInstance = null

export function openDatabase() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance)
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      const stores = ['projects', 'tasks', 'people', 'departments', 'clients', 'communications']
      stores.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }) })
    }
    request.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance) }
    request.onerror = (e) => reject(e)
  })
}

function createTx(storeName, mode = 'readonly') {
  return dbInstance.transaction(storeName, mode).objectStore(storeName)
}

export const OfflineDB = {
  getAll:     (store) => new Promise(res => { const r = createTx(store).getAll(); r.onsuccess = () => res(r.result || []) }),
  put:        (store, val) => new Promise(res => { const r = createTx(store, 'readwrite').put(val); r.onsuccess = () => res(val) }),
  delete:     (store, id) => new Promise(res => { const r = createTx(store, 'readwrite').delete(id); r.onsuccess = () => res() }),
  generateId: () => `id-${Date.now()}-${Math.random().toString(16).slice(2)}`,
}

export async function seedDatabase() {
  const projects = await OfflineDB.getAll('projects')
  if (projects.length > 0) return

  const dept1   = { id: OfflineDB.generateId(), name: 'Engineering' }
  const person1 = { id: OfflineDB.generateId(), name: 'Alex Carter', email: 'alex@example.com', role: 'Lead Developer', x: 20, y: 30 }
  const client1 = { id: OfflineDB.generateId(), name: 'Acme Corp', contactName: 'Sarah Jenkins', email: 'sarah@acme.com', phone: '555-0192', notes: 'Key enterprise account.', x: 40, y: 15 }

  const p1 = {
    id: OfflineDB.generateId(), name: 'Alpha Redesign', deptId: dept1.id, clientId: client1.id,
    ownerId: person1.id, stage: 'Active', priority: 'High', x: 15, y: 20, sortOrder: 0,
    startDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 12096e5).toISOString().split('T')[0],
    narrative: 'Finalizing secure login enhancements across all modules.',
    notes: [{ id: OfflineDB.generateId(), text: 'Client approved the initial wireframes.', date: new Date().toISOString() }],
    lastTouch: new Date().toISOString(),
    workspaceLayout: {
      narrative: { x: 50, y: 100, w: 400, h: 300 }, tasks: { x: 480, y: 100, w: 450, h: 500 },
      notes: { x: 50, y: 420, w: 400, h: 300 }, details: { x: 950, y: 100, w: 300, h: 350 }
    }
  }

  const t1 = {
    id: OfflineDB.generateId(), projectId: p1.id, title: 'Refactor MSAL auth flow',
    description: 'Need to update the token caching mechanism.',
    assigneeId: person1.id, dueDate: new Date(Date.now() + 86400e5).toISOString().split('T')[0],
    effort: 5, done: false, subtasks: [{ id: OfflineDB.generateId(), title: 'Update dependencies', done: true }]
  }

  const comm1 = {
    id: OfflineDB.generateId(), clientId: client1.id, date: new Date().toISOString(),
    type: 'Meeting', notes: 'Discussed project scope for Alpha Redesign. Client approved budget.'
  }

  await OfflineDB.put('departments', dept1)
  await OfflineDB.put('people', person1)
  await OfflineDB.put('clients', client1)
  await OfflineDB.put('communications', comm1)
  await OfflineDB.put('projects', p1)
  await OfflineDB.put('tasks', t1)
}
