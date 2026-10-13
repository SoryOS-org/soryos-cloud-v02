
/**
 * @fileOverview Contextual Firestore permission errors.
 */

export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write' | 'read';
  requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
  public context: SecurityRuleContext;
  constructor(context: SecurityRuleContext) {
    super(`Firestore permission denied: ${context.operation} at ${context.path}`);
    this.name = 'FirestorePermissionError';
    this.context = context;
  }
}
