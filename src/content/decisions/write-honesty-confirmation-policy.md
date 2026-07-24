---
title: "Der Bug, der weg war, bevor ich ihn fixen konnte"
description: "Der Assistent bestätigte eine Änderung, die er nie gemacht hatte - und nach der Korrektur fragte er doppelt nach. Zwei Fehler, die sich gegenseitig im Weg stehen. Als ich sie reproduzieren wollte, waren sie verschwunden. Warum sich die Arbeit trotzdem gelohnt hat."
date: 2026-07-14T16:00:00
readMin: 5
draft: true
---

Beim manuellen Testen des Assistenten in ServiceDeskLite passierte etwas, das man einem Nutzer nicht erklären möchte.
"Setze die Priorität auf Critical" - der Assistent bestätigte freundlich, die Priorität sei geändert.
Kein `update_ticket`-Aufruf, das Ticket unverändert.
Auf Nachfrage gab das Modell es dann zu: Es habe die Änderung nur behauptet, ohne den Aufruf wirklich auszuführen.
Zweimal in einer Sitzung, auf zwei verschiedenen Wegen.

Direkt danach der zweite Fehler, der wie eine Folge des ersten aussieht und doch sein Gegenteil ist.
Nach der Korrektur suchte der Assistent das Ticket, fand die aktuelle Priorität - und fragte dann: "Soll ich es jetzt tatsächlich herabstufen?"
Der Nutzer hatte genau das bereits beauftragt.
Erst nach wiederholter Bestätigung passierte die Änderung.

## Zwei Fehler, ein Spannungsfeld

Die beiden Fälle liegen an entgegengesetzten Enden derselben Stellschraube.
Der erste ist ein Korrektheitsfehler: Der Assistent sagt, etwas sei geschehen, das nicht geschehen ist.
Der zweite ist ein UX-Fehler: Er tut, was man ihm sagt, aber erst nach doppelter Nachfrage.

Wer den ersten Fehler bekämpft, indem er das Modell vorsichtiger macht - "frag lieber nach, bevor du schreibst" - verschlimmert den zweiten.
Wer den zweiten bekämpft - "frag nicht so viel, handle" - riskiert beim ersten Rückfall.
Deshalb wurden die zwei Issues getrennt gehalten, damit der Trade-off sichtbar bleibt, und deshalb landen sie jetzt in einem einzigen Branch: Die Lösung ist eine gemeinsame Policy, nicht zwei getrennte Fixes.

## Erst reproduzieren

Die Regel für Bugfixes in diesem Projekt: erst den Fehler end-to-end nachstellen, so nah wie möglich an dem, was ein Nutzer tut.
Also die API mit echtem Modell gestartet und die Feldfälle nachgespielt, Turn für Turn über den SSE-Stream, wo jeder Tool-Aufruf einzeln sichtbar ist.

Ticket angelegt. "Setze die Priorität auf Critical."
`update_ticket` feuerte sofort, die Bestätigung kam nach dem echten Ergebnis.
Der zweite Feldweg, Referenz-Auflösung in einer frischen Konversation: Das Modell suchte, meldete ehrlich, behauptete nichts.
Ein Mehrfach-Auftrag - zuweisen und Status ändern in einem Satz: beide Writes sofort, keine Rückfrage.

Der Bug war weg.

Das ist weniger überraschend, als es klingt.
Zwischen dem Feldbefund und dieser Sitzung lagen zwei Änderungen, die genau hierauf zielten: Die Tool-Beschreibungen sagen inzwischen, *wann* ein Tool zu rufen ist - die von `update_ticket` schließt wörtlich mit "actually apply the change; do not just confirm it in prose".
Der Feldbefund war auf einem Stand vor dieser Zeile erhoben.

## Warum trotzdem etwas zu tun blieb

Fünf saubere Läufe sind Evidenz, keine Garantie.
Modellverhalten ändert sich mit jedem Release, und genau das war die Lehre aus dem ganzen Strang: Was am Modell hängt, muss man bei jedem Wechsel neu prüfen - oder man verankert es.

Und eine Lücke war real geblieben: Der System-Prompt sagte nirgends, wann eine Rückfrage vor einem Write gerechtfertigt ist, und nirgends ausdrücklich, dass eine Ausführung nie ohne Ergebnis behauptet werden darf.
Beides stand bisher nur implizit zwischen den Zeilen.

Die Policy ist ein Absatz mit zwei Regeln.
Erstens: Behaupte nie, dass eine Änderung passiert ist, ohne dass der Tool-Aufruf in dieser Konversation gemacht wurde und Erfolg gemeldet hat - eine behauptete Änderung, die der Nutzer später rückgängig vorfindet, ist schlimmer als jede Fehlermeldung.
Zweitens: Wenn der Nutzer eine Änderung bereits beauftragt hat, führe sie aus - keine Rückversicherung, auch nicht nach einer eigenen Korrektur.
Nachfragen vor einem Write bleibt legitim, wo wirklich der Nutzer entscheiden muss: mehrere plausible Ticket-Treffer, fehlende Pflichtangaben, eine schwer umkehrbare Aktion bei echtem Zweifel, eine unsichere Triage.

## Die Nagelprobe

Mit dem neuen Prompt habe ich den fiesesten Fall nachgestellt: das Modell gerügt - "beim letzten Mal hast du nur behauptet zu ändern" - und im selben Atemzug beauftragt, zu prüfen und dann herabzustufen.
Genau an dieser Stelle brauchte die Feldsitzung die doppelte Bestätigung.

Das Modell suchte das Ticket, belegte den aktuellen Stand mit dem Suchergebnis, und stufte dann herab.
Ohne noch einmal zu fragen.

## Was bleibt

Die scripted Test-Suite kann dieses Verhalten nicht festnageln - sie würde ihr eigenes Skript prüfen.
Die Verifikation ist der Live-Lauf, und die Policy ist der Anker in Prosa, an der einen Stelle, die jeder Chat-Turn liest.

Und eine Reihenfolge hat sich erneut bewährt: erst reproduzieren, dann fixen.
Hätte ich die Policy blind geschrieben, hätte ich einen bereits behobenen Bug "gefixt" und es nie erfahren.
So weiß ich, was die Tool-Beschreibungen schon erledigt hatten, und was der Prompt noch nicht hergab - und die Policy füllt genau diese zweite Lücke.
