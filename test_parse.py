import os
import sys

sys.path.append(os.path.join(os.getcwd(), 'functions'))
os.chdir('functions')
from core.generator import parse_clause_with_llm, vectorize_text

print("Imports successful.")
