import firebase_admin
from firebase_admin import firestore, credentials
import logging
import os

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def normalize_users():
    """
    Normalizes the user documents in Firestore to match the code's strict enums
    for role ('super_admin', 'cartorio_admin', 'escrevente') and
    status ('active', 'revoked').
    """
    try:
        # Check if running in emulator
        if os.environ.get("FIRESTORE_EMULATOR_HOST"):
             # For emulator, credentials aren't checked tightly
             cred = credentials.AnonymousCredentials()
             firebase_admin.initialize_app(credential=cred, options={'projectId': 'demo-project'})
             logger.info("Initialized with AnonymousCredentials for emulator.")
        else:
             # Default init for production (relies on GOOGLE_APPLICATION_CREDENTIALS)
             firebase_admin.initialize_app()
             logger.info("Initialized with Application Default Credentials.")
    except ValueError as e:
        # App might already be initialized in some environments
        if "The default Firebase app already exists" not in str(e):
             raise
        logger.info("Firebase app already initialized.")

    db = firestore.client()
    users_ref = db.collection('users')

    # We use stream() because we want to examine and potentially update every user.
    # For very large collections this should be batched, but it's fine for small to medium scale.
    users = users_ref.stream()

    updated_count = 0
    total_count = 0

    for doc in users:
        total_count += 1
        data = doc.to_dict()
        user_id = doc.id

        updates = {}

        # 1. Normalize Role
        raw_role = data.get('role', '')
        if raw_role:
             # Fix 'Super Admin' -> 'super_admin'
             if raw_role.lower() == 'super admin':
                 updates['role'] = 'super_admin'
             # Fix 'Admin' -> 'cartorio_admin'
             elif raw_role.lower() == 'admin':
                 updates['role'] = 'cartorio_admin'
             # Otherwise leave it alone (assume it's correct or handled elsewhere)

        # 2. Normalize Status
        raw_status = data.get('status', '')
        if raw_status:
             # Fix 'Ativo' -> 'active'
             if raw_status.lower() == 'ativo':
                 updates['status'] = 'active'
             # Fix 'Revogado' -> 'revoked'
             elif raw_status.lower() == 'revogado':
                 updates['status'] = 'revoked'
        else:
             # If status is missing, default to active
             updates['status'] = 'active'

        if updates:
            logger.info(f"Normalizing user {user_id}: {updates}")
            doc.reference.update(updates)
            updated_count += 1

    logger.info(f"Normalization complete. Checked {total_count} users, updated {updated_count}.")

if __name__ == '__main__':
    normalize_users()
