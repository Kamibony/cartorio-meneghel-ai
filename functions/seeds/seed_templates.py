import os
from google.cloud import firestore

TEMPLATE_COMPRA_VENDA_CAIXA = """
PROCURAÇÃO PÚBLICA que fazem: [OUTORGANTE_NOME].
SAIBAM todos quantos este público instrumento de procuração virem que aos [DATA_ATUAL], nesta Serventia, João Pessoa/PB, perante mim Substituta compareceram como OUTORGANTES: [OUTORGANTE_NOME], [NACIONALIDADE], [PROFISSAO], [ESTADO_CIVIL], nascido em [DATA_NASCIMENTO], portador do RG de nº [RG_NUMERO], Órgão Emissor [RG_ORGAO], inscrito no CPF/MF sob o nº [CPF_NUMERO], filiação: [FILIACAO], devidamente reconhecidos conforme os documentos de identificação originais que foram apresentados a este serviço notarial, aos quais ficam arquivados em pasta própria, conforme determinação do inciso VI do art. 286 do CNCGJ/PB, de cujas capacidades reconheço e dou fé. Assim, pelos outorgantes me foi dito que, por este público instrumento e nos melhores termos de direito, nomeiam e constituem sua bastante PROCURADORA: [OUTORGADO_NOME], [NACIONALIDADE], [PROFISSAO], [ESTADO_CIVIL], inscrita no CPF/MF sob o nº [CPF_NUMERO], filiação: [OUTORGADO_FILIACAO], residente e domiciliada na [ENDERECO], a quem concedem poderes para representá-lo(s) junto a CAIXA ECONÔMICA FEDERAL - CEF – Superintendência de Negócios, podendo abrir, movimentar e liquidar contas de depósitos, de qualquer espécie ou modalidade, vender, ceder e dar em alienação fiduciária ou em hipoteca em qualquer grau o imóvel: [IMOVEL_DESCRICAO], transmitir domínio, direito, ação e posse, a responder pela evicção de direito, liquidar dívidas hipotecárias, fiduciárias e tributos fiscais que incidam sobre o dito imóvel, ajustar o preço de venda, da cessão ou valor da hipoteca/alienação, receber, passar recibo e dar quitação total e irrevogável do preço ou valor, assinar opção de compra e venda, assinar e endossar cheques, dar, se necessário, referido imóvel em garantia de alienação fiduciária ou hipotecária do mútuo a ser contraído na Caixa Econômica Federal, combinar cláusulas e condições, assinando os contratos necessários, inclusive de rerratificação, podendo, também, prestar as declarações exigidas pelo decreto nº93.240/86 e enfim, praticar os atos necessários ao fiel desempenho deste mandato, podendo substabelecer, comprometendo-se os outorgantes a dar tudo por bom, firme e valioso.
Certifica que, foi feita a consulta prévia junto a Central de Indisponibilidade de Bens - CNIB, com resultado Negativo. Os dados constantes nesse documento foram utilizados com fins específicos de realização do ato notarial, conforme a legislação vigente, sendo protegidos no que determina a Lei 13.709/2018 (LGPD), vez que os serviços notariais e de registro são exercidos em caráter privado, por delegação do Poder Público e terão o mesmo tratamento dispensado às pessoas jurídicas de direito público. Desta forma, o uso em finalidade diversa, sujeitam os detentores deste documento a responder legalmente por possíveis danos causados às partes e/ou a terceiros. Os dados da procuradora e do objeto da presente foram fornecidos por declaração, ficando os outorgantes responsáveis por sua veracidade, bem como por qualquer incorreção, eximindo esta Serventia de qualquer responsabilidade civil e criminal. E como assim o disse do que dou fé, lavrei este instrumento que, sendo-lhe lido em voz alta, outorga, aceita e assina.
""".strip()

TEMPLATE_VENDA_VEICULO = """
PROCURAÇÃO PÚBLICA que fazem: [OUTORGANTE_NOME].
SAIBAM todos quantos este público instrumento de procuração virem que aos [DATA_ATUAL], nesta Serventia, João Pessoa/PB, perante mim Substituta compareceram como OUTORGANTES: [OUTORGANTE_NOME], [NACIONALIDADE], [PROFISSAO], [ESTADO_CIVIL], nascido em [DATA_NASCIMENTO], portador do RG de nº [RG_NUMERO], Órgão Emissor [RG_ORGAO], inscrito no CPF/MF sob o nº [CPF_NUMERO], filiação: [FILIACAO], devidamente reconhecidos conforme os documentos de identificação originais que foram apresentados a este serviço notarial, aos quais ficam arquivados em pasta própria, conforme determinação do inciso VI do art. 286 do CNCGJ/PB, de cujas capacidades reconheço e dou fé. Assim, pelos outorgantes me foi dito que, por este público instrumento e nos melhores termos de direito, nomeiam e constituem sua bastante PROCURADORA: [OUTORGADO_NOME], [NACIONALIDADE], [PROFISSAO], [ESTADO_CIVIL], inscrita no CPF/MF sob o nº [CPF_NUMERO], filiação: [OUTORGADO_FILIACAO], residente e domiciliada na [ENDERECO], a quem concedem poderes específicos para vender, ceder, transferir ou por qualquer forma alienar o veículo automotor de sua propriedade: [VEICULO_DESCRICAO], podendo para tanto, ajustar preço e condições, receber o valor da venda e dar a respectiva quitação; assinar o Certificado de Registro de Veículo (CRV) e/ou Autorização para Transferência de Propriedade do Veículo (ATPV-e); representar o outorgante perante o DETRAN, CIRETRAN, Secretaria da Fazenda e demais repartições públicas competentes, podendo requerer e acompanhar processos de transferência de propriedade, emplacamento, licenciamento, vistorias, liberação de restrições, assinar termos de responsabilidade, requerer 2ª via de documentos, pagar taxas e impostos, assinar requerimentos, recorrer de multas, e enfim, praticar todos os demais atos necessários ao fiel e cabal cumprimento deste mandato, podendo substabelecer, comprometendo-se os outorgantes a dar tudo por bom, firme e valioso.
Certifica que, foi feita a consulta prévia junto a Central de Indisponibilidade de Bens - CNIB, com resultado Negativo. Os dados constantes nesse documento foram utilizados com fins específicos de realização do ato notarial, conforme a legislação vigente, sendo protegidos no que determina a Lei 13.709/2018 (LGPD), vez que os serviços notariais e de registro são exercidos em caráter privado, por delegação do Poder Público e terão o mesmo tratamento dispensado às pessoas jurídicas de direito público. Desta forma, o uso em finalidade diversa, sujeitam os detentores deste documento a responder legalmente por possíveis danos causados às partes e/ou a terceiros. Os dados da procuradora e do objeto da presente foram fornecidos por declaração, ficando os outorgantes responsáveis por sua veracidade, bem como por qualquer incorreção, eximindo esta Serventia de qualquer responsabilidade civil e criminal. E como assim o disse do que dou fé, lavrei este instrumento que, sendo-lhe lido em voz alta, outorga, aceita e assina.
""".strip()

def seed_templates():
    """Seeds the initial RAG templates into Firestore."""
    print("Connecting to Firestore...")
    
    # Normally handled via ADC in GCP, or by providing explicit credentials.
    # We fall back to a default project if none is provided via env vars.
    try:
        db = firestore.Client()
    except Exception as e:
        print(f"Warning: Could not initialize firestore client automatically. Ensure GOOGLE_APPLICATION_CREDENTIALS is set. Error: {e}")
        return
        
    collection_ref = db.collection('rag_templates')

    templates_to_seed = [
        {
            "id": "TEMPLATE_COMPRA_VENDA_CAIXA",
            "intent_keywords": ["compra e venda", "imóvel", "caixa econômica federal", "cef", "financiamento"],
            "content": TEMPLATE_COMPRA_VENDA_CAIXA,
            "description": "Procuração para compra/venda de imóvel financiado pela Caixa Econômica Federal."
        },
        {
            "id": "TEMPLATE_VENDA_VEICULO",
            "intent_keywords": ["venda", "veículo", "carro", "detran", "transferência"],
            "content": TEMPLATE_VENDA_VEICULO,
            "description": "Procuração para venda de veículo e trâmites no DETRAN."
        }
    ]

    print(f"Seeding {len(templates_to_seed)} templates to the 'rag_templates' collection...")
    for tpl in templates_to_seed:
        doc_ref = collection_ref.document(tpl["id"])
        doc_ref.set({
            "content": tpl["content"],
            "intent_keywords": tpl["intent_keywords"],
            "description": tpl["description"]
        })
        print(f"Successfully seeded: {tpl['id']}")
        
    print("Seeding complete.")

if __name__ == "__main__":
    seed_templates()
