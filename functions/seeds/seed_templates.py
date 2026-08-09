import os
from google.auth.credentials import AnonymousCredentials
import firebase_admin
from firebase_admin import credentials, firestore

def get_db():
    if not firebase_admin._apps:
        # Use emulator if configured
        if os.environ.get('FIRESTORE_EMULATOR_HOST'):
            from google.auth.credentials import AnonymousCredentials
            # Mock credentials for the emulator
            class MockCredential(credentials.Base):
                def get_credential(self):
                    return AnonymousCredentials()

            firebase_admin.initialize_app(MockCredential(), options={'projectId': 'demo-project'})
        else:
            firebase_admin.initialize_app()
    return firestore.client()

def seed_templates():
    db = get_db()
    cartorio_id = os.environ.get("CARTORIO_ID", "default_cartorio")

    templates_ref = db.collection('templates')

    templates = [
        {"name": "Compra e Venda.docx", "status": "active", "cartorio_id": cartorio_id},
        {"name": "Doação.docx", "status": "active", "cartorio_id": cartorio_id},
        {"name": "Inventário.docx", "status": "active", "cartorio_id": cartorio_id},
        {"name": "Procuração.docx", "status": "active", "cartorio_id": cartorio_id},
    ]

    for tmpl in templates:
        print(f"Seeding {tmpl['name']} for {cartorio_id}...")
        templates_ref.add(tmpl)

if __name__ == '__main__':
    seed_templates()
