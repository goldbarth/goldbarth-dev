---
title: "MetricGate V2: das Frontend, und warum es nicht React wird"
description: "Der V2-Scope steht. Ein Admin-Frontend plus Demo-Widget für den Hot Path — Angular statt React, BFF statt Token im Browser, und ein vertikaler Slice statt Feature-Liste."
date: "2026-06-04T10:00:00"
readMin: 4
draft: false
---

V1 ist fertig, das Backend entscheidet in Echtzeit über API-Calls. V2 ist das Frontend dazu. Bevor ich anfange, habe ich den Scope evaluiert — und dabei zwei Annahmen umgeworfen, die seit dem ersten Planungsdokument standen.

Der vollständige Scope liegt im Repo: [scope-v2-de.md](https://github.com/goldbarth/MetricGate/blob/main/docs/scope-v2-de.md). Hier geht es um das Warum.

## Was V2 ist

Zwei Dinge, konzeptionell getrennt. Erstens ein **Admin-Frontend**, mit dem Tenant-Administratoren ihre Hierarchie und ihre Plans verwalten — Subtree-Navigation, Plan-Zuweisung mit Ceiling-Prüfung, Overbooking-Warnungen. Zweitens ein **Demo-Widget**, das den Enforcement-Hot-Path sichtbar macht: `POST /check` gegen einen vorgeseedeten Demo-Key, Allow/Deny mit Begründung, Counter-Stand, und eine **Live-Timeline über mehrere Requests**, die Token-Bucket- und Fixed-Window-Verhalten zeigt.

Der Wert liegt nicht im CRUD. Der Wert liegt darin, die **Domain-Regeln korrekt abzubilden** — besonders die nicht-blockierende Overbooking-Warnung aus ADR-002 und die Subtree-Authorization. Wenn das Frontend eine erfolgreiche Anfrage mit Warnung wie einen Fehler behandelt, hat es die Domain nicht verstanden.

## Erster Umwurf: React → Angular

Im V1-Post und in den frühen Docs stand überall **React-Admin-Frontend**. Das war eine Annahme, kein Argument. Bei der Scope-Evaluierung habe ich sie geprüft und fallen lassen.

Der Grund ist dieselbe Logik wie bei V1 — **die Architektur folgt der Domain, nicht der Bequemlichkeit**. Das Admin-Slice ist deklarativ und parameter-getrieben: lade den Subtree für diesen Tenant, lade die Plans für diese Ebene. Angular 21 mit Signal-first und `httpResource` (seit 21 stable) bildet genau das ab, ohne dass ich State-Management drumherum bauen muss. Zoneless dazu. **RxJS bleibt reserviert** für den einen Ort, wo es hingehört: den temporalen Stream der Demo-Timeline.

Das ist keine Geschmacksentscheidung gegen React. Es ist die Beobachtung, dass die Reaktivitätstrennung — declarative Daten vs. temporaler Stream — in Angular 21 sauberer fällt als in dem, was ich vorher angenommen hatte.

## Zweiter Umwurf: kein Token im Browser

Das Admin-Panel trägt **Reseller-Rechte**. Ein Token, das im Browser landet, ist ein Token, das per XSS exfiltriert werden kann. Für diese Privilegienstufe ist das nicht akzeptabel.

Also: **Backend-for-Frontend**. Ein eigener ASP.NET-Core-Prozess (Duende.BFF) hält die OIDC-Tokens server-seitig. Der Browser bekommt nur ein httpOnly-Secure-Session-Cookie. CSRF über Antiforgery, das Angulars `HttpClient` automatisch mitführt. Service-to-Service weiter über internes JWT — vom BFF zu Plans, Usage, Enforcement.

Das heißt auch: **kein direkter Frontend→Service-Call**, alles über den BFF. Kein SSR, reine SPA, statisch vom BFF ausgeliefert. Der BFF wird ein zusätzlicher Service im selben Docker-Compose wie V1 — **kein Cloud-Deploy**, das bleibt wie in V1 lokal.

## Wo der Schnitt liegt

Dieselbe Disziplin wie V1: **lieber tief als breit**. V2.1 ist ein **vertikaler Slice** — Hierarchie und Plans, aber mit vollständigem Auth, Data-Fetching, State, Error-Handling und UI. Ein Pfad, der von Login bis Plan-Zuweisung wirklich durchläuft, inklusive der hässlichen Fälle: Backend down, 401/403/409/422, RFC-9457-Fehler sauber in UI-Meldungen gemappt.

Was **bewusst auf V2.2 verschoben** ist: API-Key-Management (Erstellung mit Plaintext-Anzeige, Rotation mit Grace-Period, Revocation) und die Usage-Reports-Ansicht. Beides echte Features, beides nicht nötig, um den Slice zu beweisen. Eine Feature-Liste abzuarbeiten beweist Breite. Ein Slice end-to-end durchzuziehen beweist, dass die Architektur trägt.

## Was offen bleibt

Zwei ADRs sind reserviert, nicht geschrieben — weil ich sie erst beim Bauen mit echtem Kontext entscheide, nicht jetzt aus der Theorie:

- **ADR-010** — Frontend-Auth über BFF (Duende, Same-Origin, CSRF).
- **ADR-011** — State und Data-Fetching (Signals/`httpResource` vs. RxJS).

Das ist dasselbe Muster wie bei der Service-to-Service-Auth in V1: die Entscheidung dort treffen, wo der Kontext am dichtesten ist. Das Aufschreiben ist der Test, ob die Entscheidung tatsächlich besessen wurde — nicht nur durchgewunken.

Phase 1 ist die BFF-Foundation. Das kommt als nächstes.
