# Technická a administrátorská príručka - Systém na overovanie notárskych zápisníc

Tento dokument je určený pre vývojárov, správcov systému a technický personál zodpovedný za prevádzku, údržbu a infraštruktúru systému na validáciu návrhov notárskych zápisníc (Minuta).

## 1. Prehľad architektúry systému
Systém využíva architektúru založenú na troch hlavných pilieroch na zabezpečenie vysokej kvality extrakcie dát, robustnej validácie a bezpečného formátovania právnych dokumentov:

* **Vrstva na extrakciu dát (Vertex AI):** Využíva Google Gemini prostredníctvom Vertex AI. Na spracovanie viacerých dokumentov sa používa atomická "Map-Reduce" architektúra. LLM najprv spracuje dokumenty individuálne (Map) a extrahuje štruktúrované hlavné entity. Následne sú štruktúrované dáta deterministicky zlúčené. Aby sa predišlo halucináciám, využívajú sa prísne konfigurácie (napr. `temperature=0.0`) a striktné pravidlá v parametri `system_instruction`.
* **Deterministický Diffing Engine / Validátor:** Namiesto spoliehania sa na LLM pri konečnom rozhodovaní (LLM-as-a-Judge), systém extrahuje štruktúrované entity z návrhu a používa deterministický Python engine (`validator.py` a `audit_draft`) založený na prienikovom porovnávaní (intersection diffing) kľúčov (`attributes`). Porovnávanie prísne spravuje metadáta a aplikuje normalizáciu (`DataNormalizer`), čím ignoruje nepodstatné rozdiely pred samotnou kontrolou zhody.
* **Generatívna korekcia (Diff-Audited LLM Injector):** LLM zamerané na formátovanie "Opravenej zápisnice" (Minuta Corrigida) má za úlohu prirodzene vložiť chýbajúce údaje do právneho textu bez straty kontextu. Frontend používa balík `diff-match-patch` s vlastnou tokenizáciou na úrovni slov (Word-Level), aby zobrazil pochopiteľné "Sledovanie zmien" (Visual Review) bez toho, aby fragmentoval číselné údaje (CPF, RG, dátumy).

## 2. Nastavenie prostredia a konfigurácia
Systém je štruktúrovaný ako Monorepo (React/Vite/TS pre frontend, Firebase Functions/Python pre backend) natívne integrovaný so službami Google Cloud Platform (GCP).

* **Poverenia a autentifikácia (DÔLEŽITÉ):** Projekt striktne závisí od Google Cloud Application Default Credentials (ADC / Service Accounts) pre autentifikáciu Vertex AI (`genai.Client(vertexai=True)`). Súbory `.env` s explicitnými API kľúčmi (napr. `GEMINI_API_KEY`) sa **NESMÚ** používať ani vkladať (commit) do repozitára, pretože obchádzajú ADC a spôsobujú zlyhania v produkčnom prostredí.
* **Nasadenie vo Firebase:** Firebase Functions (`python 3.12+`) by sa mali nasadzovať pomocou Firebase CLI (`firebase deploy --only functions`).
* **Timeouts a obmedzenia:** Kvôli náročnému spracovaniu požiadaviek LLM sa uistite, že v dekorátoroch funkcií používate vysoké limity vypršania časového limitu (timeout), napr. `timeout_sec=540` (`@https_fn.on_request`). Nastavenia CORS (`options.CorsOptions`) sa aplikujú globálne na všetky dekorátory `@https_fn.on_request`.

## 3. Logika validácie a nepresného zhody (Fuzzy Matching)
Validačný modul porovnáva údaje z Hlavného profilu ("Ground Truth") s údajmi extrahovanými z návrhu.

* **Normalizácia (`DataNormalizer`):** Pred akýmkoľvek porovnávaním backend aplikuje formátovanie: `normalize_cpf_cnpj` (odstráni všetko okrem čísel), `normalize_digits` pre čísla občianskych preukazov (RG), `normalize_date` a `normalize_string` (odstráni diakritiku, štandardizuje rodové prípony rodinného stavu, odstráni medzery).
* **Fuzzy Matching (`difflib`):** Keď hlavné identifikátory (ako CPF alebo RG) zlyhajú alebo chýbajú, validácia entít v `audit_draft` využíva približné zhody reťazcov (substring/fuzzy) v poli `nome`. Systém taktiež využíva `difflib.SequenceMatcher` (hranica >= 0.7) na hľadanie približnej zhody pre číslo `matricula` u entít typu `IMOVEL` (Nehnuteľnosť). V prípade, že existuje presne jedna nehnuteľnosť v "Ground Truth" aj v návrhu, uplatní sa štrukturálne záložné párovanie, čím sa chyby označia ako `VALUE_MISMATCH` (Nezrovnalosť v hodnotách) namiesto `UNMATCHED_ENTITY` (Nespárovaná entita).
* **Orezanie CIN (Brazílsky občiansky preukaz):** Ak je prítomný nový Národný preukaz totožnosti (CIN), systém vynechá (prunes) očakávané polia `rg` a `orgao_emissor_rg` počas prienikového porovnávania, ak je zistené, že čistá číselná hodnota CPF zodpovedá číselnej hodnote RG.

## 4. Auditné logy a monitorovanie
Aplikácia implementuje striktný štandard pre záznamy o audite, najmä pri ľudských interakciách riešenia (HitL - Human-in-the-Loop).

* **Firestore `audit_logs`:** Všetky schválenia, úpravy alebo zamietnutia konfliktov v paneli sa odosielajú a ukladajú do vyhradenej kolekcie vo Firestore (`audit_logs`) prostredníctvom endpointu, ktorý je monitorovaný frontendovým hookom `useAuditLog.ts`.
* **Google Cloud Logging:** Všetky výnimky generované na backende (napr. v `extractor.py` alebo `validator.py`) musia byť monitorované v natívnom Google Cloud Loggingu pre Firebase Functions, pričom by sa mali filtrovať podľa závažnosti. Osobitnú pozornosť venujte chybám typu `502 Bad Gateway` (indikuje vypršanie časového limitu, ak je `timeout_sec` nedostatočný).

## 5. Riešenie problémov a záložné plány (Fallbacks)

* **Závažné konflikty a prerušenia (Hard Conflicts):** Ak vo fáze extrakcie dôjde ku kolízii v nemenných dátach (napr. rozdielny dátum narodenia v rôznych dokumentoch), systém umiestni entitu do objektu `_conflicts` namiesto štandardného toku a spustí frontendový panel pre vynútenie ľudského zásahu. Nebude vykonané žiadne automatické formátovanie, kým používateľ nezareaguje.
* **Chyby "Entita nenájdená" (`UNMATCHED_ENTITY`):** Vyskytuje sa, ak zlyhajú algoritmy presnej identifikácie (CPF/Matricula) alebo Fuzzy Matching (Meno cez `difflib`). V prípade falošne pozitívneho výsledku v dôsledku hrubej chyby pri písaní v návrhu zanalyzujte výstup LLM a porovnajte ho so zlúčenými údajmi v backende, aby ste upravili hranicu tolerancie zhody (threshold). Skontrolujte tiež, či extrahovaný typ entity (`entity_type`, napr. `PESSOA_FISICA`) zodpovedá očakávanému typu, nakoľko prienikové porovnávanie rozlišuje jednotlivé typy.
* **Chýbajúce údaje v testoch:** Pri simulovaní jednotkových testov (unit tests) a vkladaní falošných objektov dodržiavajte dynamickú schému, pri ktorej musia byť reálne páry kľúč/hodnota umiestnené v poli objektov `attributes`, a nie ako ploché kľúče priamo v hlavnom slovníku entity.