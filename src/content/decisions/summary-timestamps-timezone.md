---
title: "12:07 wird zu 10:07 - eine Zeitzone, zwei Pfade"
description: "Die Ticket-Zusammenfassung nannte Uhrzeiten, die den Timestamps direkt daneben widersprachen. Das Modell hat nichts falsch gemacht: Es hat treu die UTC-Zeiten wiederholt, die man ihm gab. Der Chat-Pfad wusste es besser - der Summary-Pfad hatte die Lektion nie bekommen."
date: 2026-07-14T13:00:00
readMin: 3
draft: true
---

Ein Kommentar, um 12:07 geschrieben, taucht in der gestreamten Ticket-Zusammenfassung als 10:07 auf.
Die zwei Stunden sind der CEST-Offset.
Direkt daneben zeigt die Ticket-Detailansicht die richtige lokale Zeit, also widerspricht die Zusammenfassung den Daten, neben denen sie steht.

Der erste Reflex - das Modell halluziniert Uhrzeiten - führt in die falsche Richtung.
Das Modell hat exakt wiedergegeben, was es bekam.
Der Prompt, der das Ticket beschreibt, formatierte jeden Timestamp als UTC.
Aus Modellsicht war 10:07 die Wahrheit.

## Zwei Pfade, eine Lektion, einmal gelernt

Interessant ist, warum der Fehler nur an dieser Stelle auftrat.

Der Chat-Assistent hatte dasselbe Problem schon hinter sich: Ein Modell hat keinen Kalender und keine Uhr.
Deshalb bekommt der Chat-Prompt bei jeder Anfrage das aktuelle Datum samt Wochentag in der konfigurierten Nutzer-Zeitzone injiziert, und die Anweisung, Zeiten in dieser Zone auszudrücken.
Ohne das würde "bis Freitag" gegen das Trainingswissen aufgelöst und Fälligkeiten lägen in der Vergangenheit.

Die Ticket-Zusammenfassung läuft aber nicht durch den Chat.
Sie ist ein eigener, bewusst schlanker Pfad: ein einzelner Modellaufruf ohne Tools, der ein Ticket in vier Abschnitte fasst.
Und dieser Pfad hatte die Zeitzonen-Lektion nie mitbekommen.
Er fütterte UTC und bekam UTC zurück.

Das ist das eigentliche Muster hinter dem Bug: Eine Lektion, die an einem Pfad gelernt wurde, gilt nicht automatisch am zweiten.
Beim Agent-Loop hat das Projekt genau dafür eine Regel - ein Loop für beide Aufrufer, damit eine Schranke nicht an einer Stelle gilt und an der anderen vergessen wird.
Die Zusammenfassung liegt außerhalb dieses Loops, mit gutem Grund, aber der Preis ist sichtbar: Was der Loop erzwingt, muss hier von Hand nachgezogen werden.

## Der Fix

Der Ticket-Prompt konvertiert jetzt jeden Timestamp in die konfigurierte Nutzer-Zeitzone, bevor er zum Modell geht - Erstellt, Fällig, jede Kommentar- und Ereigniszeile.
Eine Kopfzeile nennt die Zone ausdrücklich, damit das Modell weiß, was es liest, und der UTC-Offset bleibt im Format sichtbar, damit Fälligkeiten mit dem Offset des Nutzers ausgedrückt werden - dieselbe Regel, die der Chat-Prompt für dueAt-Werte verlangt.

Der Regressionstest nagelt die Zone fest, statt die der Testmaschine zu erben.
Er füttert den Feldfall nach: ein Kommentar um 10:07 UTC, geprüft wird auf 12:07 im Prompt - und darauf, dass 10:07 nirgends mehr auftaucht.
Ein Sommerdatum ist absichtlich gewählt, damit der CEST-Offset Teil der Behauptung ist.

## Was bleibt

Wenn zwei Pfade zum selben Modell führen, wandert eine Prompt-Lektion nicht von selbst vom einen zum anderen.
Beim Hinzufügen des zweiten Pfads lohnt der Blick, welche Injektionen der erste aus Erfahrung trägt - Datum, Zeitzone, Roster - und welche davon der neue auch braucht.
Das Modell sagt einem das nicht. Es arbeitet klaglos mit dem, was fehlt.
