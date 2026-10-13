/**
 * @soryos/database
 * Real-time Database Implementation using Firebase Firestore.
 */

import { initializeApp, getApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit, 
  onSnapshot,
  Firestore,
  DocumentData,
  collectionGroup
} from "firebase/firestore";
import { StoredSession, StoredMessage, Session, Message, SessionStatus, DatabaseEventType, DatabaseEvent, Subscription } from "./types";

// Note: Config will be provided by the app layer through the environment
// but for the package we assume standard Firebase initialization.

export class FirestoreRealTimeDatabase {
  private db: Firestore;

  constructor() {
    // This assumes Firebase has been initialized in the host app (apps/web)
    this.db = getFirestore();
  }

  // ==========================================================================
  // Session Operations
  // ==========================================================================

  async createSession(sessionData: Omit<Session, '_id' | '_creationTime' | 'id'>): Promise<StoredSession> {
    const id = sessionData.sessionId || doc(collection(this.db, "sessions")).id;
    const now = Date.now();
    const session: StoredSession = {
      ...sessionData,
      id,
      _id: id as any,
      _creationTime: now,
      status: sessionData.status || 'IN_PROGRESS',
      totalCostUSD: sessionData.totalCostUSD || 0,
      messageCount: sessionData.messageCount || 0,
    } as StoredSession;

    await setDoc(doc(this.db, "sessions", id), session);
    return session;
  }

  async getSession(id: string): Promise<StoredSession | null> {
    const docRef = doc(this.db, "sessions", id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? (docSnap.data() as StoredSession) : null;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<StoredSession> {
    const docRef = doc(this.db, "sessions", id);
    await updateDoc(docRef, { ...updates, updatedAt: Date.now() });
    const updated = await this.getSession(id);
    if (!updated) throw new Error("Failed to retrieve updated session");
    return updated;
  }

  async deleteSession(id: string): Promise<void> {
    await deleteDoc(doc(this.db, "sessions", id));
  }

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  async addMessage(messageData: Omit<Message, '_id' | '_creationTime' | 'id'>): Promise<StoredMessage> {
    const sessionId = messageData.sessionId as unknown as string;
    const messagesRef = collection(this.db, "sessions", sessionId, "messages");
    const id = doc(messagesRef).id;
    const now = Date.now();
    
    const message: StoredMessage = {
      ...messageData,
      id,
      _id: id as any,
      _creationTime: now,
      createdAt: now,
    } as StoredMessage;

    await setDoc(doc(messagesRef, id), message);
    return message;
  }

  async listMessages(sessionId: string, options?: { limit?: number; order?: 'asc' | 'desc' }): Promise<StoredMessage[]> {
    const messagesRef = collection(this.db, "sessions", sessionId, "messages");
    const q = query(
      messagesRef, 
      orderBy("createdAt", options?.order || "asc"),
      firestoreLimit(options?.limit || 1000)
    );
    
    // In this package, we use regular getDocs for listMessages to avoid open listeners in library calls
    // Real-time is handled via subscribeToMessages
    const { getDocs } = await import("firebase/firestore");
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as StoredMessage);
  }

  // ==========================================================================
  // Subscriptions
  // ==========================================================================

  subscribeToSession(sessionId: string, callback: (session: StoredSession | null) => void): Subscription {
    const unsubscribe = onSnapshot(doc(this.db, "sessions", sessionId), (doc) => {
      callback(doc.exists() ? (doc.data() as StoredSession) : null);
    });
    return { unsubscribe, isActive: true };
  }

  subscribeToMessages(sessionId: string, callback: (messages: StoredMessage[]) => void): Subscription {
    const messagesRef = collection(this.db, "sessions", sessionId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => doc.data() as StoredMessage);
      callback(messages);
    });
    
    return { unsubscribe, isActive: true };
  }
}

let databaseInstance: FirestoreRealTimeDatabase | null = null;

export function getRealTimeDatabase() {
  if (!databaseInstance) {
    databaseInstance = new FirestoreRealTimeDatabase();
  }
  return databaseInstance;
}
