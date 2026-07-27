# Používateľská príručka - Systém na overovanie notárskych zápisníc (Cartório)

Táto príručka je určená pre notárskych úradníkov a asistentov na uľahčenie každodennej práce so systémom na validáciu návrhov zápisníc (Minuta). Cieľom je zabezpečiť rýchlosť, minimalizovať preklepy a zaručiť absolútnu právnu istotu pri spisovaní verejných listín.

## 1. Začíname / Nahranie dokumentov
Prvým krokom k overeniu návrhu je poskytnutie "zdroja pravdy" (pôvodné dokumenty) a samotného textu, ktorý je potrebné overiť.

* **Zdrojové dokumenty (Hlavný profil / Master Profile):** Nahrajte doklady totožnosti, rodné/sobášne listy, úmrtné listy, splnomocnenia alebo výpisy z katastra nehnuteľností. Systém automaticky spracuje, zlúči a získa z nich všetky relevantné úradné informácie.
* **Návrh zápisnice (Draft Deed / Minuta):** Nahrajte textový súbor (Word/PDF) alebo priamo vložte text návrhu zmluvy, splnomocnenia či zápisnice, ktorý ste pripravili.
* **Akcia:** Spustite spracovanie. Systém vykoná krížovú kontrolu štruktúrovaných údajov z Hlavného profilu voči textu návrhu.

## 2. Čítanie kontrolného panela (Validation Dashboard)
Po dokončení analýzy systém zobrazí interaktívny kontrolný panel (Dashboard). Všetky zistené problémy alebo chýbajúce údaje sú rozdelené do troch hlavných kategórií pre jednoduchšiu revíziu:

* **Chýbajúce polia (Missing fields):** Systém identifikoval povinné informácie obsiahnuté v zdrojových dokumentoch (napr. majetkový režim, miesto narodenia, údaje o rodičoch), ktoré boli v texte návrhu zabudnuté alebo vynechané.
* **Nezrovnalosti v hodnotách (Value discrepancies):** Vyskytujú sa vtedy, keď sa údaj zadaný v návrhu líši od oficiálneho dokumentu. Sem patria preklepy v rodných číslach, prehodené čísla listov vlastníctva, nesprávny pravopis mena alebo nezhody v rodinnom stave.
* **Nespárované subjekty (Unmatched entities):** Upozornenie, ktoré sa vygeneruje, ak je osoba alebo nehnuteľnosť uvedená v návrhu, ale v Hlavnom profile nie je nahraný žiadny zodpovedajúci podporný dokument (alebo naopak). Tým sa zabráni tomu, aby sa do zápisnice dostali "fiktívne" osoby bez overenej totožnosti.

## 3. Praktické riešenia a akcie (Actionable Resolutions)
Systém funguje ako analytický inšpektor, avšak právne rozhodnutia zostávajú vždy vo vašich rukách. Pre každú položku na paneli:

* **Kontrola kariet (Cards):** Každé upozornenie jasne zobrazuje „Očakávaný údaj“ (Expected - podľa oficiálneho dokumentu) verzus „Nájdený údaj“ (Found - to, čo je v texte).
* **Krížová kontrola (Vizuálna revízia):** Prepnite na kartu *Vizuálna revízia* (Visual Review), aby ste okamžite lokalizovali chybu. Rozhranie zvýrazní presnú časť pôvodného textu návrhu.
* **Aplikovanie rozhodnutí:** Vyhodnoťte upozornenie. Opravu môžete schváliť (systém automaticky opraví text alebo vloží chýbajúci údaj), alebo ak ide o zámernú právnu formuláciu, môžete upozornenie ignorovať/zamietnuť.

## 4. Kontrola opravenej zápisnice (Minuta Corrigida)
Po overení a spracovaní všetkých upozornení systémom:

* Prejdite na kartu **Opravená zápisnica (Minuta Corrigida / Corrected Draft)**.
* Systém vám predloží ucelený text, v ktorom sú už všetky údaje presne opravené a chýbajúce polia plynulo a kontextovo doplnené.
* **Bezpečný export:** Skontrolujte výsledné znenie a kliknite na „Kopírovať text“ (Copy Text). Takto skontrolovanú a právne bezpečnú verziu vložte do svojho interného notárskeho systému alebo textového editora na konečnú tlač a zber podpisov.

## 5. Bezpečnosť a ľudský faktor (Human-in-the-Loop)
Systém bol navrhnutý tak, aby za vás nikdy nerobil rizikové rozhodnutia. Ak počas spracovania alebo extrakcie dôjde k neriešiteľným konfliktom, proces sa zastaví a systém požiada o váš zásah.

* **Závažné konflikty (Hard Conflicts):** Ak sa dva dodané zdrojové dokumenty rozchádzajú v nemennom alebo kritickom údaji (napr. občiansky preukaz uvádza iný dátum narodenia ako výpis z matriky), systém zablokuje možnosť pokračovať a bude vyžadovať vaše manuálne riešenie.
* **Upozornenia na manuálny zásah (Manual Intervention Warnings):** Keď umelá inteligencia identifikuje nezvyčajné zložité situácie, ktoré presahujú štandardný rámec overovania, vygeneruje sa výrazné upozornenie „Vyžaduje sa ľudská kontrola“ (Requires Human Review).
* **Vaša úloha:** Kedykoľvek dôjde k takémuto blokovaniu, musíte manuálne zasiahnuť na paneli, na základe hierarchie dokumentov (napr. novší sobášny list má prednosť pred starým OP) rozhodnúť, ktorá informácia má prednosť, a svoju voľbu zaznamenať. Až po tomto ľudskom overení systém umožní ďalšie spracovanie návrhu zápisnice.