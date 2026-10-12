/**
 * @soryos/database
 * Session Management with Real-time Updates
 * 
 * Inspired by Vibra Code's session management
 * Provides session CRUD operations with real-time capabilities
 */

import { Session, SessionStatus, SessionQueryOptions, QueryOptions } from './types';
import { getRealTimeDatabase } from './realtime';

// ============================================================================
// Session Manager
// ============================================================================

export class SessionManager {
  private database = getRealTimeDatabase();

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Create a new session
   */
  async createSession(data: Omit<Session, '_id' | '_creationTime' | 'id'>): Promise<Session> {
    const session = await this.database.createSession(data);
    return session;
  }

  /**
   * Get a session by ID
   */
  async getSession(id: string): Promise<Session | null> {
    return this.database.getSession(id);
  }

  /**
   * Get a session by sessionId (E2B sandbox ID)
   */
  async getSessionBySessionId(sessionId: string): Promise<Session | null> {
    const sessions = await this.database.listSessions();
    return sessions.find(s => s.sessionId === sessionId) || null;
  }

  /**
   * Update a session
   */
  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    const session = await this.database.updateSession(id, updates);
    return session;
  }

  /**
   * Update session status
   */
  async updateSessionStatus(
    id: string,
    status: SessionStatus,
    statusMessage?: string
  ): Promise<Session> {
    return this.database.updateSession(id, { status, statusMessage });
  }

  /**
   * Delete a session
   */
  async deleteSession(id: string): Promise<void> {
    await this.database.deleteSession(id);
  }

  /**
   * List sessions with options
   */
  async listSessions(options?: SessionQueryOptions): Promise<Session[]> {
    return this.database.listSessions({
      createdBy: options?.createdBy,
      limit: options?.limit
    });
  }

  // ==========================================================================
  // Status Flow Management
  // ==========================================================================

  /**
   * Progress session through standard status flow
   */
  async progressSession(
    sessionId: string,
    nextStatus: SessionStatus,
    statusMessage?: string
  ): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Validate status transition
    const validTransitions: Record<SessionStatus, SessionStatus[]> = {
      'IN_PROGRESS': ['CLONING_REPO', 'SETTING_UP_SANDBOX', 'INSTALLING_DEPENDENCIES', 'ERROR'],
      'CLONING_REPO': ['INSTALLING_DEPENDENCIES', 'ERROR'],
      'INSTALLING_DEPENDENCIES': ['STARTING_DEV_SERVER', 'ERROR'],
      'STARTING_DEV_SERVER': ['CREATING_TUNNEL', 'ERROR'],
      'CREATING_TUNNEL': ['RUNNING', 'ERROR'],
      'RUNNING': ['CUSTOM', 'PAUSED', 'TERMINATED', 'CREATING_GITHUB_REPO', 'ERROR'],
      'CUSTOM': ['RUNNING', 'PAUSED', 'TERMINATED', 'ERROR'],
      'PAUSED': ['RUNNING', 'TERMINATED'],
      'CREATING_GITHUB_REPO': ['INITIALIZING_GIT', 'ERROR'],
      'INITIALIZING_GIT': ['ADDING_FILES', 'ERROR'],
      'ADDING_FILES': ['COMMITTING_CHANGES', 'ERROR'],
      'COMMITTING_CHANGES': ['PUSHING_TO_GITHUB', 'ERROR'],
      'PUSHING_TO_GITHUB': ['PUSH_COMPLETE', 'PUSH_FAILED', 'ERROR'],
      'PUSH_COMPLETE': ['RUNNING', 'AUTO_PUSHING'],
      'PUSH_FAILED': ['RUNNING', 'CREATING_GITHUB_REPO'],
      'AUTO_PUSHING': ['PUSHING_TO_GITHUB', 'RUNNING'],
      'USING_EXISTING_REPO': ['RUNNING', 'CUSTOM'],
      'SETTING_UP_SANDBOX': ['INSTALLING_DEPENDENCIES', 'STARTING_DEV_SERVER', 'ERROR'],
      'ERROR': ['IN_PROGRESS', 'RUNNING'],
      'TERMINATED': []
    };

    const currentStatus = session.status;
    const allowedNextStatuses = validTransitions[currentStatus] || [];
    
    if (!allowedNextStatuses.includes(nextStatus)) {
      console.warn(`Invalid status transition: ${currentStatus} -> ${nextStatus}`);
      // Allow forced transitions for recovery
      if (nextStatus === 'ERROR' || nextStatus === 'TERMINATED') {
        return this.updateSessionStatus(sessionId, nextStatus, statusMessage);
      }
      throw new Error(`Cannot transition from ${currentStatus} to ${nextStatus}`);
    }

    return this.updateSessionStatus(sessionId, nextStatus, statusMessage);
  }

  /**
   * Set session to running state
   */
  async setSessionRunning(
    sessionId: string,
    tunnelUrl?: string,
    sandboxId?: string
  ): Promise<Session> {
    return this.updateSession(sessionId, {
      status: 'RUNNING',
      tunnelUrl,
      sessionId: sandboxId || sessionId
    });
  }

  /**
   * Set session to custom state (AI working)
   */
  async setSessionCustom(
    sessionId: string,
    statusMessage?: string
  ): Promise<Session> {
    return this.updateSessionStatus(sessionId, 'CUSTOM', statusMessage || 'Working on task');
  }

  /**
   * Stop agent for session
   */
  async stopAgent(sessionId: string): Promise<Session> {
    return this.updateSession(sessionId, {
      agentStopped: true,
      status: 'RUNNING'
    });
  }

  /**
   * Resume stopped agent
   */
  async resumeAgent(sessionId: string): Promise<Session> {
    return this.updateSession(sessionId, {
      agentStopped: false
    });
  }

  // ==========================================================================
  // Session Metadata
  // ==========================================================================

  /**
   * Update session name
   */
  async updateSessionName(sessionId: string, name: string): Promise<Session> {
    return this.updateSession(sessionId, { name });
  }

  /**
   * Update session tunnel URL
   */
  async updateSessionTunnelUrl(sessionId: string, tunnelUrl: string): Promise<Session> {
    return this.updateSession(sessionId, { tunnelUrl });
  }

  /**
   * Update session environment variables
   */
  async updateSessionEnvs(
    sessionId: string,
    envs: Record<string, string>
  ): Promise<Session> {
    return this.updateSession(sessionId, { envs });
  }

  /**
   * Add environment variable to session
   */
  async addSessionEnv(
    sessionId: string,
    key: string,
    value: string
  ): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return this.updateSession(sessionId, {
      envs: { ...(session.envs || {}), [key]: value }
    });
  }

  // ==========================================================================
  // GitHub Integration
  // ==========================================================================

  /**
   * Set GitHub repository for session
   */
  async setGitHubRepository(
    sessionId: string,
    repository: string,
    repositoryUrl?: string
  ): Promise<Session> {
    return this.updateSession(sessionId, {
      githubRepository: repository,
      githubRepositoryUrl: repositoryUrl
    });
  }

  /**
   * Update GitHub push status
   */
  async updateGitHubPushStatus(
    sessionId: string,
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
  ): Promise<Session> {
    return this.updateSession(sessionId, {
      githubPushStatus: status,
      githubPushDate: status === 'completed' || status === 'failed' ? Date.now() : undefined
    });
  }

  // ==========================================================================
  // Cost Tracking
  // ==========================================================================

  /**
   * Add cost to session
   */
  async addSessionCost(sessionId: string, amountUSD: number): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return this.updateSession(sessionId, {
      totalCostUSD: (session.totalCostUSD || 0) + amountUSD,
      lastCostUpdate: Date.now()
    });
  }

  /**
   * Increment message count
   */
  async incrementMessageCount(sessionId: string): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return this.updateSession(sessionId, {
      messageCount: (session.messageCount || 0) + 1
    });
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get session count for user
   */
  async getSessionCount(userId: string): Promise<number> {
    const sessions = await this.listSessions({ createdBy: userId });
    return sessions.length;
  }

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userId: string): Promise<Session[]> {
    const sessions = await this.listSessions({ createdBy: userId });
    const activeStatuses: SessionStatus[] = [
      'IN_PROGRESS',
      'CLONING_REPO',
      'INSTALLING_DEPENDENCIES',
      'STARTING_DEV_SERVER',
      'CREATING_TUNNEL',
      'RUNNING',
      'CUSTOM'
    ];
    return sessions.filter(s => activeStatuses.includes(s.status));
  }

  /**
   * Cleanup old sessions
   */
  async cleanupOldSessions(maxAgeMs: number = 86400000): Promise<number> {
    // 86400000ms = 24 hours
    const cutoff = Date.now() - maxAgeMs;
    const sessions = await this.listSessions();
    const oldSessions = sessions.filter(s => (s._creationTime ?? 0) < cutoff);
    
    for (const session of oldSessions) {
      await this.deleteSession(session.id);
    }
    
    return oldSessions.length;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager();
  }
  return sessionManagerInstance;
}

export function createSessionManager(): SessionManager {
  return new SessionManager();
}
