# Proves manuals abans de donar per bona una versió

Els tests automàtics cobreixen la lògica (parser, imputacions, exportador, sincronització). Això no ho cobreixen: el navegador, l'inici de sessió i Firestore reals. Feu-ho amb **una còpia de les dades** o en un entorn de proves, i marqueu cada punt.

## Ja verificat (21/10/2026, en local, mode proves i dades inventades)

Provat a mà a l'aplicació en marxa, sense Firestore: importació d'A3 (full i columnes detectats, factura d'un altre any no importada, reimportació sense duplicats, canvi de total a l'A3 amb recàlcul i avís), imputació (50/50 de 10,01 €, 33,33/33,33/33,34 i abonament quadrats al cèntim, en bloc i factura a factura, avís d'A3 netejat), canvi d'exercici (filtre conservat, dades separades), exportació (xlsx vàlid), equivalències (reassigna només la factura afectada) i historial.

Pressupost, període i informes (secció 7b), provat també en local amb tres projectes inventats: avisos de pressupost i de període en imputar (individual i en bloc), columna i avisos del panell, pantalla d'informes, filtre i descàrrega de l'Excel.

**Encara cal fer vosaltres**, perquè necessiten Firebase i comptes reals: la secció 1 (accés amb Google), la 2 (migració), la 5 (dos usuaris) i la comprovació de l'Excel exportat obert amb Excel.

## 0. Preparació (una sola vegada)

- [ ] **Còpia de seguretat:** exporteu l'Excel de cada exercici amb dades (botó *Exportar Excel*) abans de migrar res.
- [ ] **Regles de Firestore:** compareu `firestore.rules` amb les publicades a Firebase Console → Firestore Database → Rules i publiqueu-les si cal.
- [ ] **Dominis autoritzats:** el domini de Vercel és a Firebase Console → Authentication → Settings → Authorized domains.
- [ ] **Vercel:** el projecte està connectat al repositori actual (`Qualitat-SomLlar/Justificacions`) i l'últim desplegament de `main` ha acabat bé.
- [ ] **Llista blanca:** a `lib/auth.tsx` i `firestore.rules` només hi ha els comptes que han de tenir accés.

## 1. Accés

- [ ] Iniciar sessió amb un compte `@somllar.cat` funciona.
- [ ] Un compte d'un altre domini (p. ex. un Gmail qualsevol) és rebutjat amb un missatge clar.
- [ ] Tancar sessió i tornar a entrar manté les dades.
- [ ] Al desplegament de producció **no** apareix el botó de *Mode proves*.

## 2. Migració (només si el núvol té format antic)

- [ ] Apareix l'avís groc *Les dades del núvol encara tenen el format antic* i l'aplicació és només de consulta.
- [ ] *Revisar i migrar* mostra, per cada llista, quants elements hi ha al núvol, al navegador i quin s'utilitzarà.
- [ ] Després de migrar, l'avís desapareix i els recomptes de factures coincideixen amb els d'abans.
- [ ] Una segona persona (altre navegador) veu les mateixes dades sense haver de migrar.

## 3. Importació d'A3

- [ ] Pujar l'Excel d'A3 detecta el full correcte i mostra les columnes trobades.
- [ ] El resum indica factures noves, existents i modificades, i comptes sense correspondència.
- [ ] Un fitxer amb factures d'un altre any: **no** les importa i ho diu clarament.
- [ ] Tornar a pujar el mateix fitxer no duplica res (0 factures noves).
- [ ] Si una factura canvia de total a l'A3, queda marcada com a modificada i els imports imputats es recalculen amb els mateixos %.

## 4. Imputació

- [ ] Imputar una factura 50/50 a dos projectes: els imports sumen exactament el total (proveu un total amb cèntims senars, com 10,01 €).
- [ ] No es pot guardar amb més del 100%.
- [ ] Un abonament (total negatiu) es reparteix mantenint el signe.
- [ ] Imputació en bloc de diverses factures: cada factura queda quadrada al cèntim.
- [ ] En imputar una factura marcada com a modificada a l'A3, l'avís desapareix.
- [ ] Reiniciar i eliminar en bloc demanen confirmació i queden a l'historial.

## 5. Dos usuaris alhora

- [ ] La persona A imputa una factura; la B la veu aparèixer sense recarregar.
- [ ] A i B editen **factures diferents** alhora: es conserven els dos canvis.
- [ ] Sense connexió: es pot continuar treballant amb les dades en memòria i els canvis arriben en recuperar la connexió.

## 6. Exercicis

- [ ] Canviar d'exercici mostra una capa de càrrega i, en acabar, les dades del nou exercici; els filtres de la pantalla es conserven.
- [ ] Les imputacions d'un exercici no apareixen a l'altre.

## 7. Exportació

- [ ] L'Excel té el full *Resum Panel* i un full per partida.
- [ ] Els totals del resum coincideixen amb el panell de l'aplicació (total factura, cobert, disponible).
- [ ] Cada projecte amb imputacions té la seva columna (també els tancats); els projectes esborrats del catàleg surten com a `(DESCONEGUT)`.

## 7b. Pressupost, període i informes

- [ ] A *Projectes*, un projecte amb *Pressupost total* i període `dd/mm/aaaa-dd/mm/aaaa` el mostra al panell amb la barra d'execució; sense pressupost surt «Sense pressupost».
- [ ] En imputar una factura a un projecte que arribaria al 90% o superaria el pressupost, el diàleg avisa (i deixa guardar igualment).
- [ ] En imputar una factura amb data fora del període del projecte, el diàleg ho avisa; en canviar de projecte l'avís s'actualitza.
- [ ] A la imputació en bloc els avisos tenen en compte totes les factures seleccionades i que les seves imputacions anteriors es substitueixen.
- [ ] El panell mostra l'avís de pressupost superat/proper al límit i el d'imputacions fora de període, i els enllaços porten a *Informes*.
- [ ] *Informes* mostra, per a un projecte, el total per partida, l'execució i el detall, amb les factures fora de període marcades i el filtre «Només fora de període».
- [ ] L'Excel de l'informe s'obre bé amb Excel i el full *Resum* coincideix amb la pantalla.
- [ ] Comproveu que la data que es compara és la que voleu: es fa servir la **data d'emissió** de la factura, no la de pagament.

## 8. Catàleg i historial

- [ ] Crear, modificar, donar de baixa i reactivar una partida; les imputacions antigues no canvien.
- [ ] Assignar un compte a una partida actualitza només les factures encara sense correspondència (o amb la partida anterior de l'equivalència).
- [ ] Cada acció anterior apareix a l'*Historial de Canvis* amb el seu usuari.
