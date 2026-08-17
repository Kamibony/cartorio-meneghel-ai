import os
from google.cloud import firestore

class RAGService:
    def __init__(self):
        try:
            self.db = firestore.Client()
        except Exception as e:
            print(f"Warning: RAGService could not initialize firestore client. Error: {e}")
            self.db = None
            
    def get_template_by_id(self, template_id: str) -> dict:
        """Fetch a specific template by its ID."""
        if not self.db:
            return None
            
        doc_ref = self.db.collection('rag_templates').document(template_id)
        doc = doc_ref.get()
        
        if doc.exists:
            return doc.to_dict()
        return None

    def retrieve_template(self, intent: str) -> dict:
        """
        Retrieves the most relevant template based on the Escrevente's intent.
        For now, this uses a simple keyword matching approach (basic classification routing).
        In the future, this can be upgraded to semantic vector search.
        """
        if not self.db:
            return None
            
        intent_lower = intent.lower()
        
        # Simple heuristic routing based on intent keywords
        if any(keyword in intent_lower for keyword in ["veículo", "carro", "detran"]):
            return self.get_template_by_id("TEMPLATE_VENDA_VEICULO")
            
        if any(keyword in intent_lower for keyword in ["imóvel", "caixa", "cef", "financiamento"]):
            return self.get_template_by_id("TEMPLATE_COMPRA_VENDA_CAIXA")
            
        # Default fallback or return None if no match
        print(f"Could not classify intent: '{intent}'")
        return None
