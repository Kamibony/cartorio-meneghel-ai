import { useState } from 'react';
import { ENV } from '../config/env';

export function useAuditLog() {
  const [isLogging, setIsLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logSuccess, setLogSuccess] = useState(false);

  const logAuditEvent = async (fileName: string, qualityFlag: boolean) => {
    setIsLogging(true);
    setLogError(null);
    setLogSuccess(false);

    try {
      const apiUrl = ENV.apiUrl;
      const endpoint = `${apiUrl}/log_audit_event`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: fileName,
          quality_flag: qualityFlag,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to log audit event');
      }

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
