import os
from firebase_admin import firestore

class RAGService:
    def __init__(self):
        try:
            self.db = firestore.client()
        except Exception as e:
            print(f"Warning: RAGService could not initialize firestore client. Error: {e}")
            self.db = None
            
    def get_template_by_id(self, template_id: str) -> str:
        """Fetch a specific template by its ID."""
        if not self.db:
            raise ValueError(f"Template {template_id} not found in database. Database not initialized.")
            
        doc_ref = self.db.collection('rag_templates').document(template_id)
        doc = doc_ref.get()
        
        if doc.exists:
            data = doc.to_dict()
            content = data.get('content')
            if content is None:
                raise ValueError(f"Template {template_id} has no 'content' field.")
            return content

        raise ValueError(f"Template {template_id} not found in database.")

    def retrieve_template(self, intent: str) -> str:
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
