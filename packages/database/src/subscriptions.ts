/**
 * @soryos/database
 * Real-time Subscription Manager
 * 
 * Inspired by Vibra Code's Convex subscription system
 * Provides real-time updates for sessions and messages
 */

import { 
  Session,
  Message,
  StoredSession,
  StoredMessage,
  Subscription, 
  SubscriptionOptions,
  DatabaseEvent,
  DatabaseEventType 
} from './types';
import { getRealTimeDatabase, RealTimeDatabase } from './realtime';

// ============================================================================
// Subscription Manager
// ============================================================================

export class SubscriptionManager {
  private database: RealTimeDatabase;
  private activeSubscriptions = new Map<string, Subscription>();

  constructor(database?: RealTimeDatabase) {
    this.database = database || getRealTimeDatabase();
  }

  // ==========================================================================
  // Session Subscriptions
  // ==========================================================================

  /**
   * Subscribe to session updates
   */
  subscribeToSession(
    sessionId: string,
    callback: (session: StoredSession | null) => void,
    options?: SubscriptionOptions
  ): Subscription {
    const subscription = this.database.subscribeToSession(sessionId, (session) => {
      if (options?.includeMessages && session) {
        // If messages are requested, fetch and include them
        this.database.listMessages(sessionId).then(messages => {
          callback({ ...session, messages } as any);
        }).catch(() => callback(session));
      } else {
        callback(session);
      }
    });

    this.activeSubscriptions.set(`session:${sessionId}`, subscription);
    return subscription;
  }

  /**
   * Subscribe to session status changes only
   */
  subscribeToSessionStatus(
    sessionId: string,
    callback: (status: Session['status']) => void
  ): Subscription {
    return this.database.subscribeToSession(sessionId, (session) => {
      callback(session?.status || 'IN_PROGRESS');
    });
  }

  // ==========================================================================
  // Message Subscriptions
  // ==========================================================================

  /**
   * Subscribe to all messages in a session
   */
  subscribeToMessages(
    sessionId: string,
    callback: (messages: StoredMessage[]) => void,
    options?: SubscriptionOptions
  ): Subscription {
    const subscription = this.database.subscribeToMessages(sessionId, (messages) => {
      if (options?.messageLimit) {
        callback(messages.slice(-options.messageLimit));
      } else {
        callback(messages);
      }
    });

    this.activeSubscriptions.set(`messages:${sessionId}`, subscription);
    return subscription;
  }

  /**
   * Subscribe to new messages only (streaming)
   */
  subscribeToNewMessages(
    sessionId: string,
    callback: (message: StoredMessage) => void
  ): Subscription {
    let lastMessageId: string | null = null;
    
    const messageSubscription = this.database.subscribeToMessages(sessionId, (messages) => {
      if (messages.length > 0) {
        const newMessages = messages.filter(m => {
          if (!lastMessageId) return true;
          return m._id > lastMessageId || m.id > lastMessageId;
        });
        
        newMessages.forEach(msg => {
          lastMessageId = msg._id || msg.id;
          callback(msg);
        });
      }
    });

    this.activeSubscriptions.set(`new-messages:${sessionId}`, messageSubscription);
    return messageSubscription;
  }

  /**
   * Subscribe to message deltas (streaming updates)
   */
  subscribeToMessageDeltas(
    sessionId: string,
    callback: (delta: { messageId: string; content: string; isComplete: boolean }) => void
  ): Subscription {
    // Track streaming messages
    const streamingMessages = new Map<string, { content: string; isComplete: boolean }>();
    
    const messageSubscription = this.database.subscribeToMessages(sessionId, (messages) => {
      messages.forEach(msg => {
        if (msg.content && !streamingMessages.has(msg._id || msg.id)) {
          // New message
          streamingMessages.set(msg._id || msg.id, { content: msg.content, isComplete: true });
          callback({ messageId: msg._id || msg.id, content: msg.content, isComplete: true });
        }
      });
    });

    this.activeSubscriptions.set(`deltas:${sessionId}`, messageSubscription);
    return messageSubscription;
  }

  // ==========================================================================
  // Combined Subscriptions
  // ==========================================================================

  /**
   * Subscribe to both session and messages
   */
  subscribeToSessionAndMessages(
    sessionId: string,
    callback: { 
      onSession?: (session: StoredSession | null) => void;
      onMessages?: (messages: StoredMessage[]) => void;
      onNewMessage?: (message: StoredMessage) => void;
    }
  ): { sessionSub: Subscription; messagesSub: Subscription; newMessageSub?: Subscription } {
    const noop = { unsubscribe: () => {}, isActive: false };

    const sessionSub = callback.onSession
      ? this.subscribeToSession(sessionId, callback.onSession)
      : noop;
    const messagesSub = callback.onMessages
      ? this.subscribeToMessages(sessionId, callback.onMessages)
      : noop;
    let newMessageSub: Subscription | undefined;
    
    if (callback.onNewMessage) {
      newMessageSub = this.subscribeToNewMessages(sessionId, callback.onNewMessage);
    }

    return { sessionSub, messagesSub, newMessageSub };
  }

  // ==========================================================================
  // User Subscriptions
  // ==========================================================================

  /**
   * Subscribe to all sessions for a user
   */
  subscribeToUserSessions(
    userId: string,
    callback: (sessions: StoredSession[]) => void,
    options?: SubscriptionOptions
  ): Subscription {
    // Initial fetch
    this.database.listSessions({ createdBy: userId, limit: options?.limit }).then(sessions => {
      callback(sessions);
    });

    // Subscribe to session events
    const sessionSub = this.database.onEvent('session.created', (event) => {
      if (event.data?.createdBy === userId) {
        this.database.listSessions({ createdBy: userId, limit: options?.limit }).then(sessions => {
          callback(sessions);
        });
      }
    });

    const sessionUpdateSub = this.database.onEvent('session.updated', (event) => {
      if (event.data?.createdBy === userId) {
        this.database.listSessions({ createdBy: userId, limit: options?.limit }).then(sessions => {
          callback(sessions);
        });
      }
    });

    this.activeSubscriptions.set(`user-sessions:${userId}`, sessionSub);
    
    return {
      unsubscribe: () => {
        sessionSub.unsubscribe();
        sessionUpdateSub.unsubscribe();
        this.activeSubscriptions.delete(`user-sessions:${userId}`);
      },
      isActive: true
    };
  }

  // ==========================================================================
  // Event Subscriptions
  // ==========================================================================

  /**
   * Subscribe to specific database events
   */
  subscribeToEvent(
    eventType: DatabaseEventType,
    callback: (event: DatabaseEvent) => void
  ): Subscription {
    return this.database.onEvent(eventType, callback);
  }

  /**
   * Subscribe to all database events
   */
  subscribeToAllEvents(
    callback: (event: DatabaseEvent) => void
  ): Subscription {
    return this.database.subscribeToEvents(callback);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Unsubscribe from all active subscriptions
   */
  unsubscribeAll(): void {
    this.activeSubscriptions.forEach(sub => sub.unsubscribe());
    this.activeSubscriptions.clear();
  }

  /**
   * Unsubscribe from subscriptions for a specific session
   */
  unsubscribeFromSession(sessionId: string): void {
    const keysToRemove: string[] = [];
    this.activeSubscriptions.forEach((sub, key) => {
      if (key.includes(sessionId)) {
        sub.unsubscribe();
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(key => this.activeSubscriptions.delete(key));
  }

  /**
   * Get active subscriptions count
   */
  getActiveCount(): number {
    return this.activeSubscriptions.size;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let subscriptionManagerInstance: SubscriptionManager | null = null;

export function getSubscriptionManager(): SubscriptionManager {
  if (!subscriptionManagerInstance) {
    subscriptionManagerInstance = new SubscriptionManager();
  }
  return subscriptionManagerInstance;
}

export function createSubscriptionManager(database?: RealTimeDatabase): SubscriptionManager {
  return new SubscriptionManager(database);
}
