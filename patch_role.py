import os
import firebase_admin
from firebase_admin import credentials, firestore, auth
from google.auth.credentials import AnonymousCredentials

def patch():
    if os.environ.get('FIRESTORE_EMULATOR_HOST'):
        class MockCredential(credentials.Base):
            def get_credential(self):
                return AnonymousCredentials()
        firebase_admin.initialize_app(MockCredential(), options={'projectId': 'demo-project'})
    else:
        firebase_admin.initialize_app()

    db = firestore.client()
    users = list(db.collection('users').where('email', '==', 'equilibrium.probioticos@gmail.com').get())
    for u in users:
        print(f"Patching user {u.id}...")
        db.collection('users').document(u.id).update({'role': 'super_admin'})
        try:
            auth.set_custom_user_claims(u.id, {'role': 'super_admin', 'cartorio_id': u.to_dict().get('cartorio_id')})
        except Exception as e:
            print(f"Could not set custom claim: {e}")

if __name__ == '__main__':
    patch()
