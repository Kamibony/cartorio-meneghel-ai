def _init_firebase():
    """Lazily initialize Firebase admin."""
    import firebase_admin
    from firebase_admin import initialize_app, credentials
    import os
    import google.auth.credentials

    if not firebase_admin._apps:
        try:
            if os.environ.get("FUNCTIONS_EMULATOR") == "true" or os.environ.get("FIRESTORE_EMULATOR_HOST") or os.environ.get("FIREBASE_AUTH_EMULATOR_HOST"):
                class MockCredential(credentials.Base):
                    def get_credential(self):
                        return google.auth.credentials.AnonymousCredentials()

                initialize_app(MockCredential(), options={'projectId': 'demo-project'})
            else:
                initialize_app()
        except ValueError:
            pass
