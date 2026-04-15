// ============================================================================
// M365 REPLICATION — Custom replication for Microsoft 365 Dataverse
// Uses RxDB's replication protocol
// ============================================================================

import { replicateRxCollection } from 'rxdb/plugins/replication';
import { DataverseDB } from '../db/m365.js';

const RATE_LIMIT_MS = 100; // Max 10 requests/second
let _lastRequestTime = 0;

async function rateLimitedRequest(fn) {
  const now = Date.now();
  const timeSinceLastRequest = now - _lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastRequest));
  }
  
  _lastRequestTime = Date.now();
  return fn();
}

// Conflict resolution: Last-Write-Wins
function resolveConflict(local, remote) {
  const localTime = new Date(local.lastModified).getTime();
  const remoteTime = new Date(remote.lastModified).getTime();
  
  if (Math.abs(localTime - remoteTime) < 1000) {
    return local.deviceId > remote.deviceId ? local : remote;
  }
  
  return localTime > remoteTime ? local : remote;
}

export function startM365Replication(rxCollection, collectionName) {
  
  const replicationState = replicateRxCollection({
    collection: rxCollection,
    replicationIdentifier: `m365-${collectionName}`,
    live: true,
    retryTime: 5000,
    autoStart: true,
    
    // Pull handler: Get changes from M365
    pull: {
      async handler(lastCheckpoint) {
        try {
          const remoteRecords = await rateLimitedRequest(() => 
            DataverseDB.getAll(collectionName)
          );
          
          const documents = remoteRecords.map(doc => ({
            ...doc,
            _deleted: false
          }));
          
          return {
            documents,
            checkpoint: {
              lastModified: new Date().toISOString()
            }
          };
        } catch (error) {
          console.warn(`Pull replication failed for ${collectionName}:`, error.message);
          throw error;
        }
      },
      batchSize: 50
    },
    
    // Push handler: Send changes to M365
    push: {
      async handler(docs) {
        const results = [];
        
        for (const doc of docs) {
          try {
            if (doc._deleted) {
              await rateLimitedRequest(() =>
                DataverseDB.delete(collectionName, doc.id)
              );
              results.push(doc);
            } else {
              let remoteDoc = null;
              try {
                remoteDoc = await rateLimitedRequest(() =>
                  DataverseDB.getById(collectionName, doc.id)
                );
              } catch (err) {
                // Doesn't exist
              }
              
              if (remoteDoc) {
                const winner = resolveConflict(doc, remoteDoc);
                
                if (winner.id === doc.id) {
                  await rateLimitedRequest(() =>
                    DataverseDB.update(collectionName, doc.id, doc)
                  );
                  results.push(doc);
                }
              } else {
                await rateLimitedRequest(() =>
                  DataverseDB.create(collectionName, doc)
                );
                results.push(doc);
              }
            }
          } catch (error) {
            console.warn(`Push failed for ${collectionName} doc ${doc.id}:`, error.message);
          }
        }
        
        return results;
      },
      batchSize: 20
    }
  });
  
  // Error handling
  replicationState.error$.subscribe(err => {
    console.error(`Replication error for ${collectionName}:`, err);
  });
  
  return replicationState;
}

export function startAllReplications(rxDatabase, onStatusChange) {
  const collections = ['projects', 'tasks', 'people', 'clients', 'departments', 'communications'];
  const replicationStates = {};
  
  collections.forEach(collectionName => {
    const state = startM365Replication(rxDatabase[collectionName], collectionName);
    replicationStates[collectionName] = state;
    
    // Monitor sync status
    state.active$.subscribe(active => {
      onStatusChange?.({
        collection: collectionName,
        syncing: active
      });
    });
    
    state.received$.subscribe(received => {
      if (received.documents.length > 0) {
        onStatusChange?.({
          collection: collectionName,
          pulled: received.documents.length
        });
      }
    });
    
    state.sent$.subscribe(sent => {
      if (sent.documents.length > 0) {
        onStatusChange?.({
          collection: collectionName,
          pushed: sent.documents.length
        });
      }
    });
  });
  
  return {
    states: replicationStates,
    cancelAll: () => {
      Object.values(replicationStates).forEach(state => state.cancel());
    }
  };
}
