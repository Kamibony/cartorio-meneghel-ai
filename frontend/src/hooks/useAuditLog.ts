import { useState } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../utils/firebase';
import type { AuditLog } from '../types/firestore';

export function useAuditLog() {
  const [isLogging, setIsLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logSuccess, setLogSuccess] = useState(false);

  const logAuditEvent = async (
    minutaId: string,
    fieldChanged: string,
    oldValue: any,
    newValue: any,
    cartorioId: string
  ) => {
    setIsLogging(true);
    setLogError(null);
    setLogSuccess(false);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User must be authenticated to log an audit event');
      }

      const auditLogData: AuditLog = {
        cartorio_id: cartorioId,
        minuta_id: minutaId,
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email || 'Unknown User',
        fieldChanged,
        oldValue,
        newValue,
        timestamp: Timestamp.now(),
      };

      // Append to the cartorio's audit_logs subcollection
      const auditLogsRef = collection(db, 'cartorios', cartorioId, 'audit_logs');
      await addDoc(auditLogsRef, auditLogData);

      setLogSuccess(true);
    } catch (err: any) {
      console.error('Audit log error:', err);
      setLogError(err.message || 'An unknown error occurred');
    } finally {
      setIsLogging(false);
    }
  };

  return {
    logAuditEvent,
    isLogging,
    logError,
    logSuccess,
  };
}
