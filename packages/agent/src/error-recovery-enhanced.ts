/**
 * @soryos/agent
 * Error Recovery Enhanced - Extrait et adapté de Vibra Code
 * 
 * Fonctionnalités:
 * - Classification avancée des erreurs
 * - Récupération automatique pour erreurs connues
 * - Gestion des timeouts
 * - Gestion des sandboxes terminées
 * - Suggestions de récupération
 * - Messages utilisateur clairs
 */

import { GlobalEventBus } from '@soryos/bus';

export interface ClassifiedError {
  type: ErrorType;
  code: ErrorCode;
  message: string;
  userMessage: string;
  isRetryable: boolean;
  recoverySuggestions: string[];
  originalError: Error;
  timestamp: number;
  context?: Record<string, any>;
}

export type ErrorType = 
  | 'timeout'
  | 'sandbox_terminated'
  | 'sandbox_not_found'
  | 'sandbox_unavailable'
  | 'permission_denied'
  | 'network_error'
  | 'api_error'
  | 'validation_error'
  | 'execution_error'
  | 'unknown_error'
  | 'billing_error'
  | 'credits_insufficient'
  | 'tokens_exhausted';

export type ErrorCode = 
  | 'FUNCTION_INVOCATION_TIMEOUT'
  | 'SANDBOX_TERMINATED'
  | 'SANDBOX_NOT_FOUND'
  | 'SANDBOX_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'NETWORK_ERROR'
  | 'API_ERROR'
  | 'VALIDATION_ERROR'
  | 'EXECUTION_FAILED'
  | 'UNKNOWN_ERROR'
  | 'INSUFFICIENT_CREDITS'
  | 'NO_TOKENS_REMAINING';

export interface ErrorRecoveryConfig {
  maxRetries: number;
  retryDelayMs: number;
  retryableErrorTypes: ErrorType[];
  sandboxRecoveryEnabled: boolean;
  autoResumeEnabled: boolean;
}

export interface RecoveryAction {
  type: 'retry' | 'resume' | 'restart' | 'abort' | 'notify_user';
  delayMs?: number;
  message?: string;
  action?: () => Promise<void>;
}

export interface ErrorContext {
  sessionId: string;
  action: string;
  retryable: boolean;
  toolName?: string;
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  [key: string]: any;
}

export class ErrorRecoveryManager {
  private config: ErrorRecoveryConfig;
  private errorHistory: Map<string, ClassifiedError[]> = new Map();
  private retryCounts: Map<string, number> = new Map();

  constructor(
    private sessionStore: any,
    config: Partial<ErrorRecoveryConfig> = {}
  ) {
    this.config = {
      maxRetries: 3,
      retryDelayMs: 1000,
      retryableErrorTypes: [
        'timeout',
        'sandbox_terminated',
        'sandbox_unavailable',
        'network_error',
        'api_error'
      ],
      sandboxRecoveryEnabled: true,
      autoResumeEnabled: true,
      ...config
    };
  }

  /**
   * Classifier une erreur
   */
  classifyError(error: Error, context: ErrorContext = {}): ClassifiedError {
    const errorMessage = error.message.toLowerCase();
    const errorStack = error.stack?.toLowerCase() || '';
    const fullMessage = `${errorMessage} ${errorStack}`.toLowerCase();

    // 1. Vérifier les timeouts
    if (this.isTimeoutError(error, fullMessage)) {
      return this.createTimeoutError(error, context);
    }

    // 2. Vérifier les erreurs de sandbox
    if (this.isSandboxError(error, fullMessage)) {
      return this.classifySandboxError(error, fullMessage, context);
    }

    // 3. Vérifier les erreurs de permission
    if (this.isPermissionError(error, fullMessage)) {
      return this.createPermissionError(error, context);
    }

    // 4. Vérifier les erreurs de billing
    if (this.isBillingError(error, fullMessage)) {
      return this.classifyBillingError(error, fullMessage, context);
    }

    // 5. Vérifier les erreurs réseau
    if (this.isNetworkError(error, fullMessage)) {
      return this.createNetworkError(error, context);
    }

    // 6. Vérifier les erreurs API
    if (this.isApiError(error, fullMessage)) {
      return this.createApiError(error, context);
    }

    // 7. Vérifier les erreurs de validation
    if (this.isValidationError(error, fullMessage)) {
      return this.createValidationError(error, context);
    }

    // 8. Vérifier les erreurs d'exécution
    if (this.isExecutionError(error, fullMessage, context)) {
      return this.createExecutionError(error, context);
    }

    // 9. Erreur inconnue
    return this.createUnknownError(error, context);
  }

  /**
   * Vérifier si c'est une erreur de timeout
   */
  private isTimeoutError(error: Error, fullMessage: string): boolean {
    const timeoutPatterns = [
      'FUNCTION_INVOCATION_TIMEOUT',
      'timeout',
      'timed out',
      'ETIMEDOUT',
      'deadline exceeded',
      'request timeout',
      'operation timed out'
    ];
    
    return timeoutPatterns.some(pattern => fullMessage.includes(pattern));
  }

  /**
   * Créer une erreur de timeout
   */
  private createTimeoutError(error: Error, context: ErrorContext): ClassifiedError {
    const sessionId = context.sessionId || 'unknown';
    const action = context.action || 'unknown';
    
    return {
      type: 'timeout',
      code: 'FUNCTION_INVOCATION_TIMEOUT',
      message: `Timeout error: ${error.message}`,
      userMessage: this.getTimeoutUserMessage(action),
      isRetryable: true,
      recoverySuggestions: [
        'Send a new message to resume where we left off',
        'Try breaking your request into smaller steps',
        'Type "continue" to pick up from here',
        'Your progress has been saved'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Obtenir le message utilisateur pour timeout
   */
  private getTimeoutUserMessage(action: string): string {
    const messages: Record<string, string> = {
      'agent.run': 'The AI took too long to respond. This can happen with complex tasks.',
      'tool.execute': 'The tool execution timed out. Try a simpler operation.',
      'sandbox.connect': 'The sandbox connection timed out. Trying to reconnect...',
      'command.execute': 'The command execution timed out. The process might still be running.'
    };
    
    return messages[action] || 'The operation took too long to complete.';
  }

  /**
   * Vérifier si c'est une erreur de sandbox
   */
  private isSandboxError(error: Error, fullMessage: string): boolean {
    const sandboxPatterns = [
      'sandbox',
      'terminated',
      '[unknown]',
      'SandboxError',
      'unavailable',
      'sandbox not found',
      'no sandbox',
      'connection refused'
    ];
    
    return sandboxPatterns.some(pattern => fullMessage.includes(pattern));
  }

  /**
   * Classifier une erreur de sandbox
   */
  private classifySandboxError(error: Error, fullMessage: string, context: ErrorContext): ClassifiedError {
    if (fullMessage.includes('terminated') || fullMessage.includes('SandboxError')) {
      return this.createSandboxTerminatedError(error, context);
    } else if (fullMessage.includes('not found') || fullMessage.includes('no sandbox')) {
      return this.createSandboxNotFoundError(error, context);
    } else if (fullMessage.includes('unavailable') || fullMessage.includes('connection refused')) {
      return this.createSandboxUnavailableError(error, context);
    }
    
    return this.createSandboxTerminatedError(error, context);
  }

  /**
   * Créer une erreur de sandbox terminée
   */
  private createSandboxTerminatedError(error: Error, context: ErrorContext): ClassifiedError {
    const sessionId = context.sessionId || 'unknown';
    
    return {
      type: 'sandbox_terminated',
      code: 'SANDBOX_TERMINATED',
      message: `Sandbox terminated: ${error.message}`,
      userMessage: 'The development environment was temporarily unavailable. This can happen due to server maintenance or high demand.',
      isRetryable: true,
      recoverySuggestions: [
        'Send a new message and I\'ll pick up where we left off',
        'Your code and progress have been saved',
        'Type "continue" to resume',
        'If this keeps happening, try starting a new session'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Créer une erreur de sandbox non trouvée
   */
  private createSandboxNotFoundError(error: Error, context: ErrorContext): ClassifiedError {
    return {
      type: 'sandbox_not_found',
      code: 'SANDBOX_NOT_FOUND',
      message: `Sandbox not found: ${error.message}`,
      userMessage: 'The development environment was not found. It may have been deleted or expired.',
      isRetryable: false,
      recoverySuggestions: [
        'Start a new session to create a fresh environment',
        'Check if your session has expired'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Créer une erreur de sandbox indisponible
   */
  private createSandboxUnavailableError(error: Error, context: ErrorContext): ClassifiedError {
    return {
      type: 'sandbox_unavailable',
      code: 'SANDBOX_UNAVAILABLE',
      message: `Sandbox unavailable: ${error.message}`,
      userMessage: 'The development environment is currently unavailable. Please try again in a few moments.',
      isRetryable: true,
      recoverySuggestions: [
        'Wait a few moments and try again',
        'Check your internet connection',
        'Verify that the sandbox service is running'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Vérifier si c'est une erreur de permission
   */
  private isPermissionError(error: Error, fullMessage: string): boolean {
    const permissionPatterns = [
      'permission denied',
      'access denied',
      'not authorized',
      'unauthorized',
      'forbidden',
      'PERMISSION_DENIED'
    ];
    
    return permissionPatterns.some(pattern => fullMessage.includes(pattern));
  }

  /**
   * Créer une erreur de permission
   */
  private createPermissionError(error: Error, context: ErrorContext): ClassifiedError {
    const toolName = context.toolName || 'unknown';
    const action = context.action || 'unknown';
    
    return {
      type: 'permission_denied',
      code: 'PERMISSION_DENIED',
      message: `Permission denied for ${action}: ${error.message}`,
      userMessage: `I don't have permission to perform this action. Please check your permissions or try a different approach.`,
      isRetryable: false,
      recoverySuggestions: [
        `Verify that you have permission to use tool: ${toolName}`,
        'Check your current mode (build, edit, read-only)',
        'Contact your administrator for access'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Vérifier si c'est une erreur de billing
   */
  private isBillingError(error: Error, fullMessage: string): boolean {
    const billingPatterns = [
      'insufficient credits',
      'no tokens remaining',
      'billing',
      'credits',
      'tokens',
      'quota exceeded',
      'rate limit'
    ];
    
    return billingPatterns.some(pattern => fullMessage.includes(pattern));
  }

  /**
   * Classifier une erreur de billing
   */
  private classifyBillingError(error: Error, fullMessage: string, context: ErrorContext): ClassifiedError {
    if (fullMessage.includes('insufficient credits') || fullMessage.includes('credits')) {
      return this.createInsufficientCreditsError(error, context);
    } else if (fullMessage.includes('no tokens') || fullMessage.includes('tokens exhausted')) {
      return this.createNoTokensError(error, context);
    }
    
    return this.createBillingError(error, context);
  }

  /**
   * Créer une erreur de crédits insuffisants
   */
  private createInsufficientCreditsError(error: Error, context: ErrorContext): ClassifiedError {
    return {
      type: 'credits_insufficient',
      code: 'INSUFFICIENT_CREDITS',
      message: `Insufficient credits: ${error.message}`,
      userMessage: 'You have insufficient credits to continue. Please upgrade your plan.',
      isRetryable: false,
      recoverySuggestions: [
        'Upgrade your plan to get more credits',
        'Check your current credit balance',
        'Consider switching to a different billing mode'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Créer une erreur de tokens épuisés
   */
  private createNoTokensError(error: Error, context: ErrorContext): ClassifiedError {
    return {
      type: 'tokens_exhausted',
      code: 'NO_TOKENS_REMAINING',
      message: `No tokens remaining: ${error.message}`,
      userMessage: 'You have used all your messages for this billing period. Please upgrade to continue.',
      isRetryable: false,
      recoverySuggestions: [
        'Upgrade to unlock unlimited messages',
        'Wait for the next billing period',
        'Check your current usage'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Créer une erreur de billing générique
   */
  private createBillingError(error: Error, context: ErrorContext): ClassifiedError {
    return {
      type: 'billing_error',
      code: 'API_ERROR',
      message: `Billing error: ${error.message}`,
      userMessage: 'There was a billing error. Please check your account status.',
      isRetryable: false,
      recoverySuggestions: [
        'Verify your payment method',
        'Check your account status',
        'Contact support for assistance'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Vérifier si c'est une erreur réseau
   */
  private isNetworkError(error: Error, fullMessage: string): boolean {
    const networkPatterns = [
      'network',
      'connection',
      'ECONNREFUSED',
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      'fetch failed',
      'request failed'
    ];
    
    return networkPatterns.some(pattern => fullMessage.includes(pattern));
  }

  /**
   * Créer une erreur réseau
   */
  private createNetworkError(error: Error, context: ErrorContext): ClassifiedError {
    return {
      type: 'network_error',
      code: 'NETWORK_ERROR',
      message: `Network error: ${error.message}`,
      userMessage: 'There was a network error. Please check your internet connection.',
      isRetryable: true,
      recoverySuggestions: [
        'Check your internet connection',
        'Try again in a few moments',
        'Verify that the service is available'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Vérifier si c'est une erreur API
   */
  private isApiError(error: Error, fullMessage: string): boolean {
    const apiPatterns = [
      'api',
      '500',
      '400',
      '401',
      '403',
      '404',
      '429',
      'server error',
      'bad request'
    ];
    
    return apiPatterns.some(pattern => fullMessage.includes(pattern));
  }

  /**
   * Créer une erreur API
   */
  private createApiError(error: Error, context: ErrorContext): ClassifiedError {
    return {
      type: 'api_error',
      code: 'API_ERROR',
      message: `API error: ${error.message}`,
      userMessage: 'There was an API error. Please try again.',
      isRetryable: true,
      recoverySuggestions: [
        'Try again in a few moments',
        'Check if the API service is running',
        'Verify your API credentials'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Vérifier si c'est une erreur de validation
   */
  private isValidationError(error: Error, fullMessage: string): boolean {
    const validationPatterns = [
      'validation',
      'invalid',
      'required',
      'missing',
      'schema',
      'type error'
    ];
    
    return validationPatterns.some(pattern => fullMessage.includes(pattern));
  }

  /**
   * Créer une erreur de validation
   */
  private createValidationError(error: Error, context: ErrorContext): ClassifiedError {
    return {
      type: 'validation_error',
      code: 'VALIDATION_ERROR',
      message: `Validation error: ${error.message}`,
      userMessage: 'There was a validation error. Please check your input.',
      isRetryable: false,
      recoverySuggestions: [
        'Verify that all required parameters are provided',
        'Check that parameter values are valid',
        'Review the error message for specific details'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Vérifier si c'est une erreur d'exécution
   */
  private isExecutionError(error: Error, fullMessage: string, context: ErrorContext): boolean {
    const executionPatterns = [
      'execution',
      'failed',
      'error',
      'exception',
      'crash'
    ];
    
    // Vérifier aussi le exit code dans le contexte
    if (context.exitCode !== undefined && context.exitCode !== 0) {
      return true;
    }
    
    return executionPatterns.some(pattern => fullMessage.includes(pattern));
  }

  /**
   * Créer une erreur d'exécution
   */
  private createExecutionError(error: Error, context: ErrorContext): ClassifiedError {
    const toolName = context.toolName || 'unknown';
    const command = context.command || 'unknown';
    const exitCode = context.exitCode;
    
    let userMessage = 'There was an execution error.';
    let recoverySuggestions: string[] = [];
    
    if (exitCode !== undefined) {
      userMessage = `The command exited with code ${exitCode}.`;
      recoverySuggestions = [
        'Check the command output for details',
        'Verify that the command is correct',
        'Try running the command manually'
      ];
    }
    
    if (toolName !== 'unknown') {
      userMessage = `The tool "${toolName}" failed to execute.`;
      recoverySuggestions.unshift(`Verify the parameters for tool "${toolName}"`);
    }
    
    if (command !== 'unknown') {
      recoverySuggestions.unshift(`Check the command: ${command}`);
    }
    
    return {
      type: 'execution_error',
      code: 'EXECUTION_FAILED',
      message: `Execution error: ${error.message}`,
      userMessage,
      isRetryable: true,
      recoverySuggestions,
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Créer une erreur inconnue
   */
  private createUnknownError(error: Error, context: ErrorContext): ClassifiedError {
    return {
      type: 'unknown_error',
      code: 'UNKNOWN_ERROR',
      message: `Unknown error: ${error.message}`,
      userMessage: 'An unexpected error occurred. Please try again.',
      isRetryable: true,
      recoverySuggestions: [
        'Try again with the same request',
        'Check the error details for more information',
        'Contact support if the problem persists'
      ],
      originalError: error,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Traiter une erreur
   */
  async handleError(
    error: Error,
    context: ErrorContext
  ): Promise<ClassifiedError> {
    // Classifier l'erreur
    const classification = this.classifyError(error, context);
    
    // Enregistrer dans l'historique
    this.recordError(context.sessionId || 'unknown', classification);
    
    // Émettre l'événement d'erreur classée
    GlobalEventBus.emit('agent.error.classified', {
      sessionId: context.sessionId,
      classification,
      context
    });
    
    // Tenter une récupération automatique si possible
    if (classification.isRetryable && this.config.autoResumeEnabled) {
      await this.attemptAutoRecovery(classification, context);
    }
    
    return classification;
  }

  /**
   * Enregistrer une erreur dans l'historique
   */
  private recordError(sessionId: string, error: ClassifiedError): void {
    if (!this.errorHistory.has(sessionId)) {
      this.errorHistory.set(sessionId, []);
    }
    
    const errors = this.errorHistory.get(sessionId)!;
    errors.push(error);
    
    // Limiter l'historique
    if (errors.length > 100) {
      errors.shift();
    }
  }

  /**
   * Obtenir l'historique des erreurs pour une session
   */
  getErrorHistory(sessionId: string): ClassifiedError[] {
    return this.errorHistory.get(sessionId) || [];
  }

  /**
   * Tenter une récupération automatique
   */
  private async attemptAutoRecovery(
    classification: ClassifiedError,
    context: ErrorContext
  ): Promise<void> {
    const sessionId = context.sessionId || 'unknown';
    const retryCount = this.retryCounts.get(sessionId) || 0;
    
    // Vérifier le nombre max de retries
    if (retryCount >= this.config.maxRetries) {
      console.log(`[ErrorRecovery] Max retries (${this.config.maxRetries}) reached for session ${sessionId}`);
      return;
    }
    
    // Incrémenter le compteur de retries
    this.retryCounts.set(sessionId, retryCount + 1);
    
    // Déterminer l'action de récupération
    const recoveryAction = this.getRecoveryAction(classification, context);
    
    if (!recoveryAction) {
      console.log(`[ErrorRecovery] No recovery action available for error type: ${classification.type}`);
      return;
    }
    
    console.log(`[ErrorRecovery] Attempting recovery action: ${recoveryAction.type} for session ${sessionId}`);
    
    try {
      // Attendre avant la tentative
      if (recoveryAction.delayMs) {
        await new Promise(resolve => setTimeout(resolve, recoveryAction.delayMs));
      }
      
      // Exécuter l'action de récupération
      if (recoveryAction.action) {
        await recoveryAction.action();
      }
      
      // Émettre l'événement de récupération
      GlobalEventBus.emit('agent.recovery.attempted', {
        sessionId,
        errorType: classification.type,
        action: recoveryAction.type,
        success: true
      });
      
      // Réinitialiser le compteur de retries en cas de succès
      this.retryCounts.delete(sessionId);
      
    } catch (recoveryError) {
      console.error(`[ErrorRecovery] Recovery action failed:`, recoveryError);
      
      GlobalEventBus.emit('agent.recovery.failed', {
        sessionId,
        errorType: classification.type,
        action: recoveryAction.type,
        error: recoveryError
      });
    }
  }

  /**
   * Obtenir l'action de récupération
   */
  private getRecoveryAction(
    classification: ClassifiedError,
    context: ErrorContext
  ): RecoveryAction | null {
    switch (classification.type) {
      case 'timeout':
        return {
          type: 'retry',
          delayMs: this.config.retryDelayMs,
          message: 'Retrying after timeout...'
        };
      
      case 'sandbox_terminated':
        if (this.config.sandboxRecoveryEnabled) {
          return {
            type: 'resume',
            delayMs: 2000,
            message: 'Resuming sandbox connection...',
            action: async () => {
              // À implémenter: reconnexion à la sandbox
              GlobalEventBus.emit('sandbox.resume', {
                sessionId: context.sessionId
              });
            }
          };
        }
        return null;
      
      case 'sandbox_unavailable':
        return {
          type: 'retry',
          delayMs: 5000,
          message: 'Retrying sandbox connection...'
        };
      
      case 'network_error':
        return {
          type: 'retry',
          delayMs: 3000,
          message: 'Retrying after network error...'
        };
      
      case 'api_error':
        return {
          type: 'retry',
          delayMs: 2000,
          message: 'Retrying after API error...'
        };
      
      case 'execution_error':
        // Pour les erreurs d'exécution, vérifier si on peut relancer
        if (context.toolName && context.command) {
          return {
            type: 'retry',
            delayMs: 1000,
            message: `Retrying tool execution: ${context.toolName}...`
          };
        }
        return null;
      
      default:
        return null;
    }
  }

  /**
   * Réinitialiser le compteur de retries pour une session
   */
  resetRetryCount(sessionId: string): void {
    this.retryCounts.delete(sessionId);
  }

  /**
   * Effacer l'historique des erreurs pour une session
   */
  clearErrorHistory(sessionId: string): void {
    this.errorHistory.delete(sessionId);
    this.retryCounts.delete(sessionId);
  }

  /**
   * Obtenir le nombre de retries pour une session
   */
  getRetryCount(sessionId: string): number {
    return this.retryCounts.get(sessionId) || 0;
  }
}

/**
 * Créer un ErrorRecoveryManager avec une configuration par défaut
 */
export function getErrorRecoveryManager(
  sessionStore: any,
  config: Partial<ErrorRecoveryConfig> = {}
): ErrorRecoveryManager {
  return new ErrorRecoveryManager(sessionStore, config);
}

/**
 * Classifier une erreur (fonction utilitaire)
 */
export function classifyError(
  error: Error,
  context: ErrorContext = {}
): ClassifiedError {
  const manager = new ErrorRecoveryManager(null);
  return manager.classifyError(error, context);
}
