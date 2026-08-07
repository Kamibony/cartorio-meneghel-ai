from firebase_functions import options

# Python's firebase_functions SDK does not support 'cors' in set_global_options.
# Therefore, we define a global CORS configuration and apply it to all HTTP functions.
global_cors = options.CorsOptions(cors_origins="*", cors_methods=["get", "post", "options"])
