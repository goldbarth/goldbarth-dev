---
title: "Drei Chips, drei Wahrheiten - und ein Mapping, das sie wieder eint"
description: "Status und Priorität wurden auf drei Seiten dreimal unterschiedlich gerendert: eigene CSS-Klassen, eigene Label-Funktionen, eigene Farbzuordnungen. Beim Zusammenziehen zeigte sich, was drei Kopien so anrichten - und welcher Test die vierte Kopie verhindert."
date: 2026-07-13T22:30:00
readMin: 5
draft: true
---

In ServiceDeskLite tragen Tickets einen Status und eine Priorität, und beide erscheinen überall: in der Queue-Tabelle, auf dem Kanban-Board, im Ticket-Detail.
Jede dieser drei Seiten hatte ihre eigene Chip-Implementierung.
Eigene CSS-Klassen (`tickets-chip--`, `board-priority--`, `ticket-detail-badge--`), eigene `FormatStatus`-Funktion, eigene Farbzuordnung.
Dreimal fast derselbe Code, geschrieben zu drei Zeitpunkten.

Der Anlass zum Aufräumen war ein Feature: Chips sollten ein Icon bekommen, damit ein Agent unter Last eine Spalte scannt statt liest - und damit das Signal auch ohne Farbunterscheidung funktioniert.
Ein Icon pro Status, ein Icon pro Priorität, einmal gewählt, überall gleich.
Mit drei Implementierungen hätte das bedeutet, dieselbe Zuordnung dreimal einzupflegen.
Also erst konsolidieren, dann erweitern.

## Was drei Kopien anrichten

Beim Zusammenziehen fielen die Abweichungen auf, die niemand geplant hatte.

Das Board färbte die mittlere Priorität mit den Tokens des Status „New" ein - farblich zufällig ähnlich, semantisch ein anderes Signal.
Es funktionierte nur, weil beide blau sind.

Der Status-Dialog zeigte `InProgress` als ein Wort, während alle anderen Stellen „In Progress" schrieben - jede Seite hatte ihre eigene `FormatStatus`-Funktion, und eine Stelle hatte gar keine und rief `ToString()` auf.

Keine dieser Abweichungen war je als Bug gemeldet worden.
Das ist der eigentliche Punkt: Drift zwischen Kopien erzeugt selten Fehler, die jemand meldet.
Sie erzeugt ein Interface, das an jeder Ecke minimal anders spricht.

## Ein Mapping, eine Komponente

Die Lösung hat zwei Teile, und die Trennung ist bewusst.

`TicketSignals` ist das Mapping: Label, Icon und CSS-Modifier je Enum-Wert, statische Klasse, kein Markup.
Seiten, die nur den Text brauchen - Filter-Dropdowns, Historie-Einträge, Drag-and-drop-Hinweise - rufen `TicketSignals.Label` und bekommen dieselbe Schreibweise wie der Chip.

`TicketChip` ist die Darstellung: eine Blazor-Komponente, die aus dem Mapping einen Pill mit Icon, Farbe und Text baut.
Die Icons sind bei den Prioritäten Richtungszeichen - Pfeil runter, Gleichheitsstrich, Pfeil hoch - und nur Critical bekommt das Ausrufezeichen.
Richtung lässt sich in einer Spalte schneller sortieren als vier verschiedene Symbole.

Ein Detail hat sich dabei ausgezahlt, das beim Token-System (#202) noch abstrakt wirkte: Der CSS-Modifier im Mapping heißt exakt so wie die Design-Tokens (`status-new` → `--sdl-status-new-fg/bg/border`).
Das Chip-Stylesheet ist damit eine mechanische Projektion des Token-Satzes - zehn Blöcke, die alle gleich aussehen und nichts entscheiden.

## Der Test gegen die vierte Kopie

Konsolidierung hält nur, bis jemand den nächsten Enum-Wert ergänzt.
Ein neuer Status kompiliert problemlos, auch wenn niemand ihm ein Icon oder Tokens gegeben hat - der `_`-Arm im Switch fängt ihn, und nur die UI zeigt einen blassen Chip mit Fallback-Symbol.
Genau die Sorte Lücke, die kein Compiler und kein Reviewer zuverlässig sieht.

Dagegen stehen jetzt Tests, die über alle Enum-Werte laufen: Jeder Status und jede Priorität muss ein Label, ein Icon und einen Modifier liefern, und zu jedem Modifier muss das Token-Trio im generierten Root-CSS existieren.
Der letzte Teil verbindet zwei Welten, die sonst nur zur Laufzeit zusammentreffen: das C#-Mapping und das Stylesheet.
Ein vierter Test sichert, dass keine zwei Prioritäten dasselbe Icon tragen - ein geteiltes Symbol würde das Scannen wieder kaputtmachen, wegen dem das Feature überhaupt gebaut wurde.

Was ich mitnehme: Der richtige Zeitpunkt für so eine Konsolidierung ist genau der Moment, in dem ein Feature alle Kopien gleichzeitig anfassen müsste.
Vorher fehlt der Anlass, nachher gibt es vier Kopien.
