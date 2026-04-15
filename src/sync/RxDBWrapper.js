// ============================================================================
// RXDB WRAPPER — Makes RxDB compatible with existing DB interface
// ============================================================================

import { getRxDB, getDeviceId } from './RxDBSetup.js';

export const RxDBWrapper = {
  
  generateId: () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return 'rx-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  },
  
  getAll: async (collectionName) => {
    const db = getRxDB();
    if (!db) throw new Error('RxDB not initialized');
    
    const docs = await db[collectionName].find().exec();
    return docs.map(doc => doc.toJSON());
  },
  
  put: async (collectionName, data) => {
    const db = getRxDB();
    if (!db) throw new Error('RxDB not initialized');
    
    const collection = db[collectionName];
    
    // Check if document exists
    const existing = await collection.findOne(data.id).exec();
    
    if (existing) {
      // Update existing document
      await existing.incrementalPatch({
        ...data,
        lastModified: new Date().toISOString(),
        deviceId: getDeviceId(),
        syncStatus: 'pending'
      });
      return existing.toJSON();
    } else {
      // Insert new document
      const doc = await collection.insert({
        ...data,
        lastModified: new Date().toISOString(),
        deviceId: getDeviceId(),
        syncStatus: 'pending'
      });
      return doc.toJSON();
    }
  },
  
  delete: async (collectionName, id) => {
    const db = getRxDB();
    if (!db) throw new Error('RxDB not initialized');
    
    const doc = await db[collectionName].findOne(id).exec();
    if (doc) {
      await doc.remove();
    }
  },
  
  // Get unsynced documents for delta sync
  getUnsyncedDocs: async (collectionName) => {
    const db = getRxDB();
    if (!db) throw new Error('RxDB not initialized');
    
    const docs = await db[collectionName]
      .find({ selector: { syncStatus: 'pending' } })
      .exec();
    
    return docs.map(doc => doc.toJSON());
  },
  
  // Mark documents as synced
  markSynced: async (collectionName, ids) => {
    const db = getRxDB();
    if (!db) throw new Error('RxDB not initialized');
    
    const collection = db[collectionName];
    
    await Promise.all(
      ids.map(async (id) => {
        const doc = await collection.findOne(id).exec();
        if (doc) {
          await doc.incrementalPatch({ syncStatus: 'synced' });
        }
      })
    );
  },
  
  isRxDB: true
};
