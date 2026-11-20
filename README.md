# Som Llar - Gestió i Control de Justificacions

Aplicatiu web per a la gestió, control i imputació econòmica de justificacions de subvencions i licitacions de l'entitat **Som Llar**.

## Funcionalitats principals

- **Volcat directe d'A3:** importació i lectura intel·ligent del fitxer Excel exportat d'A3 (detecta el full, les columnes en català i castellà i la partida de cada línia).
- **Unificació i consolidació:** agrupació de línies per document A3 i partida; una factura repartida en diverses partides es marca com a *compartida*. `Cost total = Base + IVA` i `Total factura = Cost total − IRPF` (l'«Import total de línia» d'A3 ja porta l'IRPF descomptat, per això no s'utilitza com a cost total).
- **Full i línies que s'importen:** es recomana per defecte la graella de traspàs (`AExportar_Graella`, columna *Traspassat*) davant de l'extracció completa d'A3. Si el fitxer té un full *Negatius*, es pot importar juntament amb el principal (opció marcada per defecte). Les nòmines (comptes 640-642) sense equivalència no s'importen mai, perquè contenen dades personals, i les que hagin desat versions anteriors s'eliminen en la propera importació.
- **Préstecs ICF:** les quotes sense número de factura amb «ICF» a la descripció s'agrupen per pis i concepte (capital + interessos en una sola despesa), com fa la macro de justificacions.
- **Documents desapareguts:** si un document ja importat té el número d'apunt dins del rang del fitxer però ja no hi apareix (esborrat o renumerat a A3), s'avisa al resum i a l'historial, sense modificar-lo.
- **Reimportacions estables:** cada despesa es reconeix pel número de document A3 (o pel número d'apunt quan no n'hi ha), encara que A3 hagi corregit el número de factura. Si un document reimportat ja no té alguna de les despeses anteriors, aquesta s'elimina quan no té imputacions; si en té, es manté marcada com a modificada a l'A3 perquè algú la revisi.
- **Exercicis:** les despeses i les imputacions es guarden per exercici; el catàleg (projectes, partides, equivalències) és compartit. En importar només s'accepten les factures de l'exercici actiu.
- **Mapeig de partides:** equivalències de comptes comptables a partides de despesa directa (`DD_...`).
- **Imputació flexible:** repartiment per % i per import (€) a projectes, quadrat al cèntim. També en bloc sobre diverses factures.
- **Control i alertes:** sobreimputacions (>100%), canvis detectats a l'A3 en noves càrregues i factures pendents.
- **Pressupost per projecte:** el *Pressupost total* de cada projecte (pantalla Projectes) es compara amb l'import imputat. El panell mostra l'execució amb una barra i avisa a partir del 90% i quan se supera. En imputar (una factura o en bloc) s'avisa si la imputació faria arribar o superar el pressupost. Els avisos no bloquegen.
- **Període de justificació:** el camp *Període* del projecte (`dd/mm/aaaa-dd/mm/aaaa`) permet avisar quan una factura té data d'emissió fora del període del projecte, tant en imputar com al panell i als informes. Un projecte sense període vàlid no genera avisos.
- **Informes per projecte:** la pantalla *Informes* mostra, per a un projecte i l'exercici actiu, el total imputat per partida, l'execució del pressupost i el detall de factures (marcant les fora de període), i es pot descarregar en Excel (full *Resum* + full *Factures*).
- **Historial d'auditoria:** tot canvi queda registrat, amb comentaris i notes manuals.
- **Exportació:** Excel amb un full resum i un full per partida, amb una columna de % i import per projecte.
- **Accés restringit:** comptes `@somllar.cat` i `@prohabitatge.org` (més una llista blanca), validat també a les regles de Firestore.

## Tecnologies

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript i Tailwind CSS
- **Dades i autenticació:** Firebase (Firestore + Firebase Auth amb Google i Microsoft)
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
| `lib/periode.ts`, `lib/pressupost.ts`, `lib/informes.ts`, `lib/informe_exporter.ts` | Període i pressupost dels projectes, dades de l'informe i el seu Excel (purs, amb tests) |
| `lib/store.tsx` | Estat global, sincronització i accions |
| `lib/firestore_sync.ts`, `lib/sync_utils.ts` | Format Firestore v3 (shards), diferències camp a camp i migració |
| `lib/exporter.ts` | Generació de l'Excel |
| `firestore.rules` | Regles de seguretat de Firestore |
| `tests/` | Tests unitaris |

## Dades i sincronització (Firestore, esquema v3)

Cada llista es reparteix en un nombre fix de documents (*shards*) i cada element és una clau del mapa `items` del seu shard. Les escriptures són *merges* només dels camps canviats, de manera que dues persones que editen factures diferents (o camps diferents) no es trepitgen, i una càrrega de pàgina llegeix uns 100 documents.

- Si el núvol encara té un format antic (v1 o v2), l'aplicació s'obre **només de consulta** fins que algú completi la migració amb el botó *Revisar i migrar*. Convé fer abans una còpia (exportar l'Excel de cada exercici).
- Si Firestore no respon, l'aplicació també queda només de consulta per no perdre canvis.
- Les regles de Firestore s'han de publicar manualment des de la consola de Firebase (`firestore.rules` és la referència). Han de permetre els mateixos comptes que `ALLOWED_DOMAINS` / `ALLOWED_EMAILS` a `lib/access.ts`.

## Inici de sessió amb Microsoft

L'accés amb comptes de Microsoft 365 (Outlook corporatiu) necessita aquesta configuració, que no és al codi:

1. **Azure (Microsoft Entra ID) > App registrations > New registration**
   - *Supported account types*: **Accounts in this organizational directory only (single tenant)**. És imprescindible: les regles de Firestore accepten els comptes de Microsoft perquè només els del directori de l'entitat poden iniciar sessió amb aquesta aplicació.
   - *Redirect URI* (Web): `https://justificacions.firebaseapp.com/__/auth/handler`.
   - A *Certificates & secrets*, creeu un *client secret* i copieu-ne el valor.
2. **Firebase > Authentication > Sign-in method > Add new provider > Microsoft**: enganxeu l'*Application (client) ID* i el *client secret*, i deseu.
3. **Vercel > Settings > Environment Variables**: `NEXT_PUBLIC_MICROSOFT_TENANT_ID` = el *Directory (tenant) ID* de l'aplicació. Torneu a desplegar.
4. **Firebase > Firestore > Rules**: publiqueu el contingut de `firestore.rules`.

Si un correu ja tenia accés amb Google, en entrar amb Microsoft l'aplicatiu demana entrar amb Google i, un cop dins, vincula tots dos mètodes al mateix compte.

## Proves manuals

Abans de donar per bona una versió amb dades reals, seguiu [`docs/PROVES_MANUALS.md`](docs/PROVES_MANUALS.md).
