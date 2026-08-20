import os
import logging
from firebase_admin import firestore

logger = logging.getLogger(__name__)

class RAGService:
    def __init__(self):
        try:
            self.db = firestore.client()
        except Exception as e:
            logger.error(f"Warning: RAGService could not initialize firestore client. Error: {e}")
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
        Retrieves the most relevant template based on the Escrevente's intent
        using semantic vector search against the 'rag_templates' collection.
        """
        if not self.db:
            return None
            
        from core.generator import vectorize_text
        from google.cloud.firestore_v1.vector import Vector
        from google.cloud.firestore_v1.base_vector_query import DistanceMeasure

        intent_vector = vectorize_text(intent)
        if not intent_vector:
            logger.error(f"Could not vectorize intent: '{intent}'")
            raise ValueError(f"Failed to generate vector embedding for intent: '{intent}'")

        templates_ref = self.db.collection("rag_templates")
        
        try:
            vector_query = templates_ref.find_nearest(
                vector_field="embedding",
                query_vector=Vector(intent_vector),
                distance_measure=DistanceMeasure.COSINE,
                limit=1,
            )
            
            results = vector_query.get()
            
            for doc in results:
                data = doc.to_dict()
                content = data.get('content')
                if content:
                    return content

            logger.info(f"No matching templates found for intent: '{intent}'")
            return None
        except Exception as e:
            logger.error(f"Critical error performing vector search for templates: {e}", exc_info=True)
            raise e
