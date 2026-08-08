import firebase_admin
from firebase_admin import auth

# Initialize standard default app
# In tests/sandbox it may fail with credentials issues so we handle it gracefully,
# but the script will be available for user to run in their real environment if needed.
try:
    firebase_admin.initialize_app()
except Exception as e:
    print(f"Initialization exception: {e}")

try:
    user = auth.get_user_by_email("equilibrium.probioticos@gmail.com")
    print(f"Found user: {user.uid}")

    current_claims = user.custom_claims or {}
    current_claims['role'] = 'super_admin'

    auth.set_custom_user_claims(user.uid, current_claims)
    print("Successfully added super_admin claim.")
except Exception as e:
    print(f"Execution exception: {e}")
