/**
 * @soryos/database/convex
 * Convex Database Entry Point
 * 
 * Exports all Convex functions and schema for SoryOS-Cloud
 */

// Re-export schema
export * from './schema';

// Re-export sessions API
export * from './sessions';

// Re-export messages API
export * from './messages';

// Re-export users API
export * from './users';

// Additional exports
export {
  // Helper functions
  retryMutation,
  updateSessionStatus,
  addMessage,
  getSessionMessages,
  getSessionData,
  getBillingStatus,
} from './sessions';

export {
  addMessage as addMessageToSession,
  getSessionMessages as getMessagesForSession,
  getSessionData as getSessionById,
} from './messages';

export {
  getBillingStatus as getUserBillingStatus,
} from './users';
