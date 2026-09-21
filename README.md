# Som Llar - Gestió i Control de Justificacions

Aplicatiu web per a la gestió, control i imputació econòmica de justificacions de subvencions i licitacions de l'entitat **Som Llar**.

## Funcionalitats principals

- **Volcat directe d'A3:** Importació i lectura intel·ligent del fitxer Excel exportat d'A3.
- **Unificació i consolidació:** Detecció automàtica de línies de factura i agrupació per document.
- **Mapeig de partides:** Equivalències automàtiques de comptes comptables a partides de despesa directa (`DD_...`).
- **Imputació flexible:** Repartiment percentual (%) i per import (€) a projectes de subvencions i licitacions.
- **Control i alertes:** Vigilància estricta d'imputacions superiors al 100% i control de modificacions en noves càrregues.
- **Exportació oficial:** Generació de fulls de càlcul d'acord amb la matriu de justificacions requerida.
- **Autenticació corporativa:** Accés restringit a usuaris `@somllar.cat`.

## Tecnologies

- **Frontend / Fullstack:** Next.js (React + TypeScript + Tailwind CSS)
- **Desplegament:** Vercel
- **Base de dades i autenticació:** Firebase (Firestore + Firebase Auth)
