'use client';

/**
 * @soryos/database
 * Real-time Database Implementation using Firebase Firestore.
 * 
 * "NO REAL ACTION = NO SUCCESS"
 * Mutations are strictly non-blocking and use the contextual error emitter 
 * to surface rich security rules diagnostics for agentive error-fixing loops.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
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
  onSnapshot,
  Firestore,
  serverTimestamp,
  type Unsubscribe,
  Timestamp,
  getDocs
} from "firebase/firestore";
import type { SessionData, ChatMessage } from "@soryos/schema";
import { errorEmitter } from "./error-emitter";
import { FirestorePermissionError, type SecurityRuleContext } from "./errors";

// Configuration for Firebase Studio Preview
const firebaseConfig = {
  apiKey: "AIzaSyDummyKeyForStudioPreview",
  authDomain: "studio-4152530013-8e372.firebaseapp.com",
  projectId: "studio-4152530013-8e372",
  storageBucket: "studio-4152530013-8e372.firebasestorage.app",
  messagingSenderId: "4152530013",
  appId: "1:4152530013:web:dummyappid"
};

export class RealTimeDatabase {
  private db: Firestore;
  private app: FirebaseApp;

  constructor() {
    this.app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    this.db = getFirestore(this.app);
  }

  /**
   * Sessions Operations
   */
  async createSession(session: SessionData): Promise<void> {
    const docRef = doc(this.db, "sessions", session.id);
    const data = {
      ...session,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    };
    
    // Non-blocking mutation: NO await here. Chain the .catch() block.
    setDoc(docRef, data, { merge: true })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'create',
          requestResourceData: data,
        } satisfies SecurityRuleContext);
        
        errorEmitter.emit('permission-error', permissionError);
      });
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const docRef = doc(this.db, "sessions", sessionId);
    try {
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      
      const data = snap.data();
      return {
        ...data,
        id: snap.id,
      } as SessionData;
    } catch (e) {
      return null;
    }
  }

  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<void> {
    const docRef = doc(this.db, "sessions", sessionId);
    const data = {
      ...updates,
      updatedAt: serverTimestamp()
    };
    
    // Non-blocking mutation
    updateDoc(docRef, data)
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: data,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  }

  async deleteSession(sessionId: string): Promise<void> {
    const docRef = doc(this.db, "sessions", sessionId);
    
    // Non-blocking mutation
    deleteDoc(docRef)
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  }

  async listSessions(userId: string): Promise<SessionData[]> {
    const q = query(
      collection(this.db, "sessions"),
      where("userId", "==", userId),
      orderBy("updatedAt", "desc")
    );
    try {
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id } as SessionData));
    } catch (e) {
      return [];
    }
  }

  /**
   * Messages Operations
   */
  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const messagesRef = collection(this.db, "sessions", sessionId, "messages");
    const messageId = message.id || doc(messagesRef).id;
    const docRef = doc(messagesRef, messageId);
    const data = {
      ...message,
      id: messageId,
      createdAt: serverTimestamp()
    };
    
    // Non-blocking mutation
    setDoc(docRef, data)
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'create',
          requestResourceData: data,
        } satisfies SecurityRuleContext);
        
        errorEmitter.emit('permission-error', permissionError);
      });
  }

  subscribeToMessages(sessionId: string, callback: (messages: ChatMessage[]) => void): Unsubscribe {
    const q = query(
      collection(this.db, "sessions", sessionId, "messages"),
      orderBy("createdAt", "asc")
    );
    
    return onSnapshot(q, 
      (snap) => {
        const messages = snap.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            created_at: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.created_at
          } as ChatMessage;
        });
        callback(messages);
      },
      async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: `sessions/${sessionId}/messages`,
          operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      }
    );
  }

  subscribeToSession(sessionId: string, callback: (session: SessionData | null) => void): Unsubscribe {
    const docRef = doc(this.db, "sessions", sessionId);
    
    return onSnapshot(docRef, 
      (snap) => {
        if (snap.exists()) {
          callback({ ...snap.data(), id: snap.id } as SessionData);
        } else {
          callback(null);
        }
      },
      async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'get',
          requestResourceData: null,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      }
    );
  }
}

export const database = new RealTimeDatabase();