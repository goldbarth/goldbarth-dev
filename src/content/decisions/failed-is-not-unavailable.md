---
title: "Zwei Nullen, die nicht dasselbe heißen"
description: "Die Wissensbasis-Suche meldete einen kaputten Datenbankzugriff als Erfolg. Für jeden, der das Ergebnis liest, sah ein Ausfall aus wie eine saubere Suche. Der Fix ist eine Zeile - die Lehre ist, dass 'nicht verfügbar' und 'kaputt' verschiedene Antworten brauchen."
date: 2026-07-14T09:00:00
readMin: 4
draft: true
---

Der Assistent in ServiceDeskLite kann die interne Wissensbasis durchsuchen, um how-to-Antworten zu belegen.
Das Tool dahinter fing eine Ausnahme ab - einen kaputten Postgres-Zugriff, einen Fehler beim Embedding-Provider - und gab das Ergebnis als Erfolg zurück.
`IsError: false`, freundliche Nachricht ans Modell: "die Wissensbasis konnte nicht erreicht werden, antworte aus dem Allgemeinwissen."
Klingt vernünftig. Ist es nicht.

Das Problem ist, dass zwei verschiedene Zustände in dieselbe Antwort fielen.

Der eine ist Absicht: Läuft die App ohne Voyage-Key, gibt es keine semantische Suche. Das Tool sagt dann ehrlich "nicht verfügbar in dieser Umgebung" und zitiert nichts. Kein Fehler, sondern eine gewollte Degradation. Der Nutzer bekommt eine Antwort aus dem Allgemeinwissen, und alle wissen, warum.

Der andere ist ein Ausfall: Die Suche *sollte* laufen, aber die Datenbank oder der Provider ist umgefallen. Das ist kein gewollter Zustand, das ist etwas, das jemand reparieren muss.

Beide endeten als `IsError: false` mit fast demselben Satz.

## Wer die Lüge glaubt

Ein Tool-Ergebnis liest nicht nur das Modell. Es lesen auch das Dashboard und die Retry-Policy.

Das Dashboard zählt Tool-Aufrufe und ihre Fehlerrate. Ein als Erfolg getarnter Ausfall senkt die Fehlerrate, also sieht die Metrik gesünder aus, als das System ist. Genau dann, wenn etwas kaputt ist, zeigt der Graph Ruhe.

Die Retry-Policy bekommt nie einen Fehler zu Gesicht, den sie einordnen könnte. Ein transienter Ausfall, der sich mit einem zweiten Versuch erledigt hätte, wird stattdessen als endgültiges "kein Ergebnis" durchgereicht.

Und das Modell kann "die Docs decken das nicht ab" nicht von "ich konnte gerade nicht nachsehen" trennen, weil beide als derselbe Satz ankommen.

## Der Fix, und warum er klein ist

Ein Schwester-Tool im selben Projekt, die Ähnlichkeitssuche über Tickets, behandelt genau denselben Fall korrekt: Ausnahme abfangen, `IsError: true` zurückgeben, transiente Fehler weiterwerfen, damit die Retry-Policy sie sieht.
Die Wissensbasis-Suche wich davon ab. Die Inkonsistenz war der Defekt.

Der Fix ist, den Fang-Zweig auf `IsError: true` zu setzen und die "nicht verfügbar"-Antwort davon getrennt zu lassen.
Eine Zeile Verhalten, plus ein Test, der beide Zweige festhält: Ein technischer Fehler ist ein Fehler mit einer anderen Nachricht als "nicht verfügbar", und ein transienter Fehler fliegt weiter.

Aufgefallen ist das übrigens nicht im Betrieb.
Der manuelle Testlauf, der die Sache ins Rollen brachte, lief auf dem InMemory-Provider, und der nimmt immer den ehrlichen "nicht verfügbar"-Pfad und betritt den Fang-Zweig nie.
Der Bug wartet auf den ersten echten Postgres- oder Voyage-Ausfall, um still einen Erfolg zu melden. Bis dahin steht er nur als Widerspruch zum Schwester-Tool da - und das reicht als Grund.

## Was bleibt

Ein Fehler und eine gewollte Degradation sehen von außen gleich aus: keine Ergebnisse.
Sie sind es nicht. Das eine muss jemand reparieren, das andere ist so gedacht.
Wenn beide dieselbe Antwort zurückgeben, verliert jeder Leser - Mensch, Metrik, Retry - die Information, die zählt: ob überhaupt etwas kaputt ist.
