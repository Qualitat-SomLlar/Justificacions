# Som Llar - Gestió i Control de Justificacions

Aplicatiu web per a la gestió, control i imputació econòmica de justificacions de subvencions i licitacions de l'entitat **Som Llar**.

## Funcionalitats principals

- **Volcat directe d'A3:** importació i lectura intel·ligent del fitxer Excel exportat d'A3 (detecta el full, les columnes en català i castellà i la partida de cada línia).
- **Unificació i consolidació:** agrupació de línies per document A3 i partida; una factura repartida en diverses partides es marca com a *compartida*. `Total factura = Cost total − IRPF`.
- **Exercicis:** les despeses i les imputacions es guarden per exercici; el catàleg (projectes, partides, equivalències) és compartit. En importar només s'accepten les factures de l'exercici actiu.
- **Mapeig de partides:** equivalències de comptes comptables a partides de despesa directa (`DD_...`).
- **Imputació flexible:** repartiment per % i per import (€) a projectes, quadrat al cèntim. També en bloc sobre diverses factures.
- **Control i alertes:** sobreimputacions (>100%), canvis detectats a l'A3 en noves càrregues i factures pendents.
- **Historial d'auditoria:** tot canvi queda registrat, amb comentaris i notes manuals.
- **Exportació:** Excel amb un full resum i un full per partida, amb una columna de % i import per projecte.
- **Accés restringit:** comptes `@somllar.cat` i `@prohabitatge.org` (més una llista blanca), validat també a les regles de Firestore.

## Tecnologies

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript i Tailwind CSS
- **Dades i autenticació:** Firebase (Firestore + Firebase Auth amb Google)
- **Desplegament:** Vercel
- **Tests:** Vitest · **CI:** GitHub Actions

## Desenvolupament

```bash
npm install
cp .env.example .env.local   # variables de Firebase
npm run dev                  # http://localhost:3000
npm test                     # tests unitaris (Vitest)
npx tsc --noEmit             # comprovació de tipus
npm run build                # compilació de producció
```

> **Windows / OneDrive:** si el projecte és en una ruta amb accents (`Raúl`, `Associació`), Vitest es penja en local. Els tests funcionen en una ruta sense accents i al CI. El més còmode és treballar fora d'OneDrive, per exemple a `C:\dev\justificacions`.

El **mode proves** (accés sense Google) només està disponible amb `npm run dev` o amb `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true`. En aquest mode les dades només es guarden al navegador i mai es toca Firestore.

## Estructura

| Carpeta / fitxer | Contingut |
|---|---|
| `app/` | Pantalles: panell, despeses, matriu, projectes, partides, equivalències i historial |
| `components/` | Modals d'importació, imputació, accions massives i migració, i la barra de navegació |
| `lib/parser.ts` | Lectura de l'Excel d'A3 |
| `lib/imputacions.ts` | Càlcul del repartiment d'imputacions (pur, amb tests) |
| `lib/store.tsx` | Estat global, sincronització i accions |
| `lib/firestore_sync.ts`, `lib/sync_utils.ts` | Format Firestore v3 (shards), diferències camp a camp i migració |
| `lib/exporter.ts` | Generació de l'Excel |
| `firestore.rules` | Regles de seguretat de Firestore |
| `tests/` | Tests unitaris |

## Dades i sincronització (Firestore, esquema v3)

Cada llista es reparteix en un nombre fix de documents (*shards*) i cada element és una clau del mapa `items` del seu shard. Les escriptures són *merges* només dels camps canviats, de manera que dues persones que editen factures diferents (o camps diferents) no es trepitgen, i una càrrega de pàgina llegeix uns 100 documents.

- Si el núvol encara té un format antic (v1 o v2), l'aplicació s'obre **només de consulta** fins que algú completi la migració amb el botó *Revisar i migrar*. Convé fer abans una còpia (exportar l'Excel de cada exercici).
- Si Firestore no respon, l'aplicació també queda només de consulta per no perdre canvis.
- Les regles de Firestore s'han de publicar manualment des de la consola de Firebase (`firestore.rules` és la referència). Han de permetre els mateixos comptes que `ALLOWED_DOMAINS` / `ALLOWED_EMAILS` a `lib/auth.tsx`.

## Proves manuals

Abans de donar per bona una versió amb dades reals, seguiu [`docs/PROVES_MANUALS.md`](docs/PROVES_MANUALS.md).
