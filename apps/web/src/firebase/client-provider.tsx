/**
 * @fileOverview Client-side Firebase Provider.
 */

'use client';

import React, { useMemo } from "react";
import { FirebaseProvider } from "./provider";
import { initializeFirebase } from "./index";

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const services = useMemo(() => initializeFirebase(), []);

  return (
    <FirebaseProvider
      firebaseApp={services.firebaseApp}
      firestore={services.firestore}
      auth={services.auth}
    >
      {children}
    </FirebaseProvider>
  );
}
