# Manual do Usuário - Sistema de Validação de Minutas (Cartório)

Este manual foi desenvolvido para orientar escreventes, notários e assistentes de cartório no uso diário do sistema de validação de minutas. O objetivo é garantir agilidade e total segurança jurídica na lavratura de atos, prevenindo erros de digitação e omissões documentais.

## 1. Iniciando o Processo e Upload
O primeiro passo para auditar uma minuta é fornecer ao sistema os documentos originais (a base da verdade) e o texto que precisa ser validado.

* **Perfil Mestre (Documentos de Origem):** Faça o upload dos documentos das partes (RG, CPF, CNH, Certidões de Casamento/Óbito, Procurações) e do objeto (Matrículas de Imóveis, CRLV). O sistema extrairá e unificará automaticamente todas as informações oficiais aplicáveis ao ato.
* **Minuta (Draft Deed):** Faça o upload do arquivo de texto (Word/PDF) ou cole diretamente o texto do rascunho da escritura, procuração ou ata notarial que você redigiu.
* **Ação:** Inicie o processamento. O sistema cruzará os dados estruturados do Perfil Mestre diretamente com o texto corrido da minuta.

## 2. Lendo o Painel de Validação
Após a análise, o sistema exibirá um Dashboard interativo. Todos os problemas ou ausências encontrados são categorizados para facilitar a sua revisão:

* **Campos Ausentes (Missing fields):** O sistema identificou informações obrigatórias nos documentos de origem (ex: regime de bens, filiação, naturalidade) que foram esquecidas ou omitidas no texto da minuta.
* **Discrepâncias de Valores (Value discrepancies):** Ocorrem quando o dado digitado na minuta diverge do documento oficial. Isso inclui preenchimentos errados de CPF, números de matrícula invertidos, erros de grafia no nome ou divergências de estado civil.
* **Entidades Não Correspondentes (Unmatched entities):** Alerta gerado quando uma pessoa ou imóvel é citado na minuta, mas não há um documento correspondente enviado no Perfil Mestre (ou vice-versa). Isso evita que indivíduos "fantasmas" ou sem qualificação comprovada entrem no ato.

## 3. Ações e Resoluções Práticas
O painel atua como um inspetor analítico, mas as decisões jurídicas permanecem sempre com você. Para cada item listado no dashboard:

* **Inspeção de Cards:** Cada alerta apresenta claramente o "Dado Esperado" (o que diz o documento oficial) contra o "Dado Encontrado" (o que está escrito no texto).
* **Validação Cruzada:** Utilize a aba de *Revisão Visual* para localizar instantaneamente o erro. A interface destacará o trecho exato no texto original da minuta.
* **Aplicando Decisões:** Avalie o card. Você pode aprovar a correção (instruindo o sistema a consertar o texto ou inserir o dado faltante) ou, caso seja uma escolha intencional de redação jurídica, dispensar/ignorar o alerta.

## 4. Revisando a Minuta Corrigida
Após sanear e validar as indicações feitas pelo sistema no painel:

* Navegue até a aba **Minuta Corrigida (Draft Corrigido)**.
* O sistema apresentará o texto consolidado, perfeitamente ajustado com os dados reais corrigidos e com os campos faltantes injetados contextualmente de forma fluida.
* **Exportação Segura:** Inspecione a leitura final e clique em "Copiar Texto". Cole a versão auditada e juridicamente segura em seu sistema notarial interno (Sigo, etc.) ou processador de texto para a impressão final e assinatura das partes.

## 5. Segurança e Revisão Humana (Human-in-the-Loop)
O sistema foi concebido para nunca tomar decisões de risco em seu lugar. Durante o processamento ou extração, se houver conflitos incontornáveis, o sistema parará e pedirá sua ajuda.

* **Conflitos Graves (Hard Conflicts):** Se dois documentos de origem enviados divergirem sobre um dado imutável ou crítico (ex: um RG informa uma data de nascimento e o CPF indica outra), o sistema bloqueará a etapa de "Sem Conflito" e exigirá sua resolução manual.
* **Avisos de Intervenção Manual:** Quando a IA identificar complexidades atípicas que fujam do padrão comum de validação, um alerta destacado de *"Revisão Humana Necessária"* (Requires Human Review) será gerado.
* **Sua Ação:** Sempre que este bloqueio ocorrer, você deverá intervir manualmente no painel, selecionar qual informação prevalece com base na hierarquia dos documentos (ex: a Certidão de Casamento mais recente se sobrepõe ao RG antigo) e registrar a sua escolha. Somente após essa validação humana o sistema liberará o andamento da minuta.