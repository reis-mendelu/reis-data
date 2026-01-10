# REIS SQL Explorer 📊

Výuková SQL pískoviště pro studenty MENDELU, běžící kompletně v prohlížeči.

## 🚀 Jak to funguje
Tato aplikace je statická webová stránka, která využívá **SQLite (sql.js)** zkompilované do WebAssembly. To znamená:
- Žádný serverový backend pro SQL dotazy.
- Vše běží lokálně v prohlížeči studenta (bezpečné, statické, škálovatelné).
- Žádná šance na poškození dat – po restartu stránky je databáze opět čistá.

## 🛠️ Administrace pro učitele

### 📚 Úprava cvičení
Seznam úloh je definován v souboru `exercises.json`. Pro přidání nebo úpravu úlohy stačí změnit tento soubor v repozitáři.

Struktura úlohy:
- `id`: Unikátní číslo úlohy.
- `difficulty`: Obtížnost (`primary`, `warning`, `info`, `secondary`, `error`, `neutral`).
- `question`: Zadání pro studenta.
- `expectedSql`: Vzorový SQL dotaz (pro automatické ověření výsledku).

### 💾 Aktualizace databáze
Pokud chcete aktualizovat data (např. po novém crawlu), stačí nahrát čerstvý soubor `success-rates.db` do kořenového adresáře tohoto repozitáře.

## 🌐 Hosting
Aplikace se automaticky nasazuje na GitHub Pages při každém commitu do větve `main`.
URL: https://ElijaahInverted.github.io/reis-data/
