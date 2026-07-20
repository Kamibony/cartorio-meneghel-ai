def _init_firebase():
    """Lazily initialize Firebase admin."""
    import firebase_admin
    from firebase_admin import initialize_app
    if not firebase_admin._apps:
        try:
            initialize_app()
        except ValueError:
            pass
