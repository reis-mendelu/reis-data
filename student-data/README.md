# Data pro projekty

Dvě datové sady z reIS pro semestrální projekty (web, Java, databáze). Každá je ve dvou
podobách se stejným obsahem: `.json` (pole objektů) a `.csv` (hlavička + řádky).

Přímé odkazy (bez klíče a bez registrace, CORS povolené):

- `https://cdn.jsdelivr.net/gh/reis-mendelu/reis-data@main/student-data/success-rates.json`
- `https://cdn.jsdelivr.net/gh/reis-mendelu/reis-data@main/student-data/erasmus.json`

Stránka s nápady a ukázkami: https://reisapp.cz/navody/data-pro-projekty

## success-rates (17 459 řádků)

Jeden řádek = jeden předmět v jednom semestru, z řádku „Všechny termíny“ ve statistikách IS.

| Sloupec | Význam |
| --- | --- |
| `code` | kód předmětu, např. `EBC-PJ` |
| `nameCs`, `nameEn` | název předmětu |
| `facultyId` | číslo fakulty v IS (PEF = 220) |
| `semester`, `year` | semestr (např. `ZS 2025/2026 - PEF`) a rok jeho začátku |
| `kind` | `exam` (zkouška) nebo `credit` (zápočet) |
| `a` … `fn` | počet známek A, B, C, D, E, F, FN |
| `pass`, `fail` | kolik studentů uspělo a neuspělo |

Záměrně tu nejsou vyučující ani garanti.

## erasmus (1 717 řádků)

Jeden řádek = jedna zpráva studenta o pobytu, jen čísla. Jména, e-maily a volné odpovědi
tu nejsou.

| Sloupec | Význam |
| --- | --- |
| `countryId` | číslo země v IS |
| `hostUniversity`, `hostCountry` | hostitelská univerzita a země |
| `stayFrom`, `stayMonths` | začátek pobytu (`RRRR-MM-DD`) a délka v měsících |
| `accommodationPerDay`, `foodPerDay`, `transportCost`, `totalCostCZK` | náklady, jak je student uvedl |
| `grantCoveragePercent` | kolik procent nákladů pokryl grant |
| `recognized` | `true`/`false`, zda se pobyt uznal; `null` když chybí |
| `rating` | celkové hodnocení 1–5 |

Čísla jsou přesně to, co student napsal. Jednotky nejsou sjednocené (u ubytování se občas
objeví cena za měsíc místo za den), prázdné nebo nečíselné hodnoty jsou `null`. Počítejte s tím.

## Zdroj a použití

Statistiky úspěšnosti jsou agregovaná čísla ze stránek IS MENDELU. Zprávy z Erasmu jsou od studentů,
kteří je odevzdali na MENDELU. Data jsou bez záruky. Když je použijete, uveďte „data z reIS“.

Soubory vznikají skriptem `node scripts/buildStudentData.mjs` z ostatních dat v tomto repu.
