import os
from firebase_functions import options

# Python's firebase_functions SDK does not support 'cors' in set_global_options.
# Therefore, we define a global CORS configuration and apply it to all HTTP functions.
global_cors = options.CorsOptions(cors_origins="*", cors_methods=["get", "post", "options"])

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Ensure no standalone GEMINI_API_KEY is used, forcing the SDK to rely on
# Google Cloud Application Default Credentials (ADC) for Vertex AI.
if "GEMINI_API_KEY" in os.environ:
    del os.environ["GEMINI_API_KEY"]
