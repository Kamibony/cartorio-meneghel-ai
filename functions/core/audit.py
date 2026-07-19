import logging
from typing import Dict, Any
from firebase_admin import firestore
import datetime

logger = logging.getLogger(__name__)

class AuditLogger:
    def __init__(self):
        self._db = None

    @property
    def db(self):
        if self._db is None:
            try:
                self._db = firestore.client()
            except Exception as e:
                logger.error(f"Failed to initialize Firestore client for AuditLogger: {e}")
        return self._db

    def log_audit_event(self, event_data: Dict[str, Any]):
        """
        Writes an audit event to the 'audit_logs' collection in Firestore synchronously.
        (Called 'async' conceptually from the frontend's perspective as it doesn't block the main validation flow)
        """
        if not self.db:
            logger.error("Firestore client is not initialized. Skipping audit log.")
            return

        try:
            event_data_with_timestamp = {
                **event_data,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            # Firestore will autogenerate the document ID
            self.db.collection("audit_logs").add(event_data_with_timestamp)
            logger.info("Successfully wrote audit event to Firestore.")
        except Exception as e:
            logger.error(f"Failed to write audit event to Firestore: {e}")

# Global instance for easier import
audit_logger = AuditLogger()

def log_audit_event_async(event_data: Dict[str, Any]):
    audit_logger.log_audit_event(event_data)
