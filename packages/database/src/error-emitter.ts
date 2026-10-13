
/**
 * @fileOverview Global error emitter for Firestore permission errors.
 */

import { EventEmitter } from 'events';

export const errorEmitter = new EventEmitter();
