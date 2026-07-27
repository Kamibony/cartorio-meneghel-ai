# Manual Técnico e Administrativo - Sistema de Validação de Minutas

Este documento é destinado a desenvolvedores, mantenedores de sistema e equipe técnica responsáveis pela operação, manutenção e infraestrutura do Sistema de Validação de Minutas de Cartório.

## 1. Visão Geral da Arquitetura do Sistema
O sistema utiliza uma arquitetura baseada em três pilares principais para garantir extração de dados com qualidade, validação robusta e formatação segura de documentos legais:

* **Camada de Extração de Dados (Vertex AI):** Utiliza o Google Gemini via Vertex AI. Uma arquitetura "Map-Reduce" atômica é usada para processar múltiplos documentos. Inicialmente, o LLM processa documentos individualmente (Map) extraindo entidades principais estruturadas. Em seguida, os dados estruturados são mesclados deterministicamente. Para evitar alucinações, são utilizadas configurações restritas (ex: `temperature=0.0`) e regras rigorosas no `system_instruction`.
* **Motor de Diffing Determinístico / Validador:** Em vez de depender do LLM para tomada de decisão final (LLM-as-a-Judge), o sistema extrai entidades estruturadas da minuta e usa um motor Python determinístico (`validator.py` e `audit_draft`) baseado em diffing de interseção entre chaves (`attributes`). A comparação lida rigorosamente com metadados e aplica normalização (`DataNormalizer`) para ignorar diferenças irrelevantes antes das checagens de igualdade.
* **Correção Generativa (Diff-Audited LLM Injector):** Um LLM focado em formatar a "Minuta Corrigida" tem a função de injetar naturalmente dados faltantes no texto jurídico sem perder contexto. O front-end usa o pacote `diff-match-patch` com tokenização customizada de nível de palavra (Word-Level) para exibir um "Track Changes" (Revisão Visual) compreensível sem fragmentar caracteres numéricos (CPF, RG, datas).

## 2. Configuração e Ambiente
O sistema é um Monorepo (React/Vite/TS para front-end, Firebase Functions/Python para back-end) integrado nativamente com os serviços do Google Cloud Platform (GCP).

* **Credenciais e Autenticação (IMPORTANTE):** O projeto depende ESTRITAMENTE do Google Cloud Application Default Credentials (ADC/Contas de Serviço) para autenticação do Vertex AI (`genai.Client(vertexai=True)`). Arquivos `.env` com chaves de API explícitas (ex: `GEMINI_API_KEY`) **NÃO DEVEM** ser usados ou "commitados" no repositório, pois contornam o ADC e causam falhas em produção.
* **Implantação no Firebase:** As Firebase Functions (`python 3.12+`) devem ser implantadas usando a CLI do Firebase (`firebase deploy --only functions`).
* **Timeouts e Limites:** Devido ao processamento pesado de chamadas LLM, certifique-se de usar tempos limites altos no decorador de função, por exemplo, `timeout_sec=540` (`@https_fn.on_request`). Configurações de CORS (`options.CorsOptions`) são aplicadas globalmente aos decoradores `@https_fn.on_request`.

## 3. Lógica de Validação e Correspondência Difusa (Fuzzy Matching)
O módulo de validação cruza dados do Perfil Mestre ("Ground Truth") com dados extraídos da Minuta.

* **Normalização (`DataNormalizer`):** Antes de toda comparação, o back-end aplica formatação: `normalize_cpf_cnpj` (remove tudo exceto números), `normalize_digits` para RGs, `normalize_date` e `normalize_string` (remove acentos, padroniza sufixos de gênero de estado civil, retira espaços).
* **Fuzzy Matching (`difflib`):** Quando identificadores principais (como CPF ou RG) falham ou estão ausentes, a validação de Entidades no `audit_draft` utiliza matching de strings aproximado (substring/fuzzy) no campo `nome`. O sistema também utiliza `difflib.SequenceMatcher` (threshold >= 0.7) para buscar correspondência aproximada do número de `matricula` das entidades do tipo `IMOVEL`. Caso exista exatamente um imóvel no GT e na Minuta, um pareamento estrutural de fallback ocorre, marcando erros como `VALUE_MISMATCH` ao invés de `UNMATCHED_ENTITY`.
* **Pruning da CIN:** Caso o usuário possua a nova Carteira de Identidade Nacional, o sistema poda (`prunes`) a validação dos campos esperados do `rg` e `orgao_emissor_rg` se verificar que o valor numérico puro do CPF bate com o numérico do RG.

## 4. Logs de Auditoria e Monitoramento
A aplicação implementa um padrão rígido de registro de auditoria, principalmente para interações humanas de resolução (HitL - Human-in-the-Loop).

* **Firestore `audit_logs`:** Todas as aprovações, edições ou rejeições de conflitos do painel são enviadas e armazenadas em uma coleção dedicada do Firestore (`audit_logs`) via endpoint, monitorada pelo hook front-end `useAuditLog.ts`.
* **Google Cloud Logging:** Todas as exceções geradas no back-end (ex: no `extractor.py` ou `validator.py`) devem ser monitoradas no Google Cloud Logging nativo do Firebase Functions, filtrando por severidade e prestando atenção a erros `502 Bad Gateway` (indica timeouts se `timeout_sec` estiver inadequado).

## 5. Solução de Problemas e Fallbacks

* **Hard Conflicts e Interrupções:** Se na etapa de extração houver uma colisão em dados imutáveis (ex: data de nascimento conflitante em documentos diferentes), o sistema colocará a entidade no objeto `_conflicts` invés do fluxo regular e acionará o painel Front-end para forçar a Intervenção Humana. Nenhuma formatação automática será feita até que o usuário responda.
* **Erros de "Entidade Não Encontrada" (`UNMATCHED_ENTITY`):** Ocorre se os algoritmos de identificação exata (CPF/Matrícula) ou de Fuzzy Matching (Nome via `difflib`) falharem. Se houver falso positivo devido a erro grotesco de digitação da Minuta, analise a saída extraída pelo LLM em comparação com os dados unificados no back-end para ajustar o threshold (limite de tolerância de similaridade). Verifique também se a tipologia (`entity_type`) extraída (ex: `PESSOA_FISICA`) bate com o esperado, pois interseções diferenciam tipos.
* **Dados Faltantes em Testes:** Ao simular testes unitários e inserir objetos falsos, obedeça ao esquema dinâmico (onde os pares chave/valor reais residem sob o array de objetos `attributes`), ao invés de chaves rasas no dicionário principal da entidade.