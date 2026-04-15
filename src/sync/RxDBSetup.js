import { createRxDatabase } from 'rxdb/plugins/core';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

// ── Schemas ──────────────────────────────────────────────────────────────────

const projectSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string', maxLength: 500 },
    deptId: { type: 'string', maxLength: 100 },
    clientId: { type: 'string', maxLength: 100 },
    ownerId: { type: 'string', maxLength: 100 },
    stage: { type: 'string' },
    priority: { type: 'string' },
    sortOrder: { type: 'number' },
    x: { type: 'number' },
    y: { type: 'number' },
    startDate: { type: 'string' },
    dueDate: { type: 'string' },
    narrative: { type: 'string', maxLength: 10000 },
    notes: { type: 'array', items: { type: 'object' } },
    lastTouch: { type: 'string' },
    workspaceLayout: { type: 'object' },
    
    // Sync metadata
    lastModified: { type: 'string' },
    deviceId: { type: 'string', maxLength: 100 },
    syncStatus: { type: 'string' }
  },
  required: ['id', 'name'],
  encrypted: ['narrative'] // Field-level encryption
};

const taskSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    projectId: { type: 'string', maxLength: 100 },
    title: { type: 'string', maxLength: 500 },
    description: { type: 'string', maxLength: 10000 },
    assigneeId: { type: 'string', maxLength: 100 },
    dueDate: { type: 'string' },
    effort: { type: 'number' },
    done: { type: 'boolean' },
    subtasks: { type: 'array', items: { type: 'object' } },
    lastModified: { type: 'string' },
    deviceId: { type: 'string', maxLength: 100 },
    syncStatus: { type: 'string' }
  },
  required: ['id', 'title'],
  encrypted: ['description']
};

const personSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string', maxLength: 500 },
    email: { type: 'string', maxLength: 500 },
    role: { type: 'string', maxLength: 500 },
    x: { type: 'number' },
    y: { type: 'number' },
    lastModified: { type: 'string' },
    deviceId: { type: 'string', maxLength: 100 },
    syncStatus: { type: 'string' }
  },
  required: ['id', 'name'],
  encrypted: ['email']
};

const clientSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string', maxLength: 500 },
    contactName: { type: 'string', maxLength: 500 },
    email: { type: 'string', maxLength: 500 },
    phone: { type: 'string', maxLength: 500 },
    notes: { type: 'string', maxLength: 10000 },
    x: { type: 'number' },
    y: { type: 'number' },
    lastModified: { type: 'string' },
    deviceId: { type: 'string', maxLength: 100 },
    syncStatus: { type: 'string' }
  },
  required: ['id', 'name'],
  encrypted: ['email', 'phone', 'notes']
};

const departmentSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string', maxLength: 500 },
    lastModified: { type: 'string' },
    deviceId: { type: 'string', maxLength: 100 },
    syncStatus: { type: 'string' }
  },
  required: ['id', 'name']
};

const communicationSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    clientId: { type: 'string', maxLength: 100 },
    personId: { type: 'string', maxLength: 100 },
    date: { type: 'string' },
    type: { type: 'string', maxLength: 100 },
    notes: { type: 'string', maxLength: 10000 },
    lastModified: { type: 'string' },
    deviceId: { type: 'string', maxLength: 100 },
    syncStatus: { type: 'string' }
  },
  required: ['id', 'date'],
  encrypted: ['notes']
};

// ── Database Initialization ──────────────────────────────────────────────────

let _db = null;
let _deviceId = null;

export async function initRxDB(password) {
  if (_db) return _db;
  
  // Generate or retrieve device ID
  let storedDeviceId = localStorage.getItem('aa-device-id');
  if (!storedDeviceId) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    storedDeviceId = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('aa-device-id', storedDeviceId);
  }
  _deviceId = storedDeviceId;
  
  // Create storage with encryption and validation
  const encryptedStorage = wrappedKeyEncryptionCryptoJsStorage({
    storage: getRxStorageDexie()
  });
  
  const validatedStorage = wrappedValidateAjvStorage({
    storage: encryptedStorage
  });
  
  // Create database with password
  _db = await createRxDatabase({
    name: 'activeassistant',
    storage: validatedStorage,
    password: password, // Encrypts entire database
    multiInstance: true, // Cross-tab support
    eventReduce: true, // Performance optimization
  });
  
  // Add collections
  await _db.addCollections({
    projects: { schema: projectSchema },
    tasks: { schema: taskSchema },
    people: { schema: personSchema },
    clients: { schema: clientSchema },
    departments: { schema: departmentSchema },
    communications: { schema: communicationSchema }
  });
  
  // Add pre-save hooks to auto-populate sync metadata
  const collections = ['projects', 'tasks', 'people', 'clients', 'departments', 'communications'];
  
  collections.forEach(collectionName => {
    _db[collectionName].preSave((docData) => {
      docData.lastModified = new Date().toISOString();
      docData.deviceId = _deviceId;
      if (!docData.syncStatus) {
        docData.syncStatus = 'pending';
      }
    }, false);
  });
  
  return _db;
}

export function getRxDB() {
  return _db;
}

export function getDeviceId() {
  return _deviceId;
}

export async function closeRxDB() {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
}
