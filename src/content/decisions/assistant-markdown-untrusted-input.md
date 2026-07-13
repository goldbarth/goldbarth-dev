---
title: "Markdown rendern heißt: fremden Text ausführen lassen"
description: "Der Assistent antwortet in Markdown, der Chat zeigt die rohe Syntax. Der Fix sieht nach einer Zeile aus - Parser rein, HTML raus. Aber in dieser Antwort steckt Text, den ein beliebiger Ticket-Ersteller geschrieben hat. Ab da ist es kein Rendering-Feature mehr, sondern eine Angriffsfläche."
date: 2026-07-13T21:00:00
readMin: 6
draft: true
---

Der AI-Assistent in ServiceDeskLite antwortet in Markdown.
Der Chat zeigte davon die rohe Syntax: `**fett**` stand wörtlich in der Bubble, Aufzählungen kamen als Bindestriche, Überschriften als Rauten.
Blazor rendert gebundenen Text HTML-escaped, und einen Markdown-Renderer gab es im Web-Projekt schlicht nicht.

Der Fix sieht nach einer Zeile aus.
Markdig einbinden, `Markdown.ToHtml()` rufen, das Ergebnis per `MarkupString` in die Bubble geben. Fertig.
Genau diese Zeile ist die Stelle, an der ich den sicheren Pfad verlasse.
`MarkupString` schaltet das Escaping ab, das Blazor sonst automatisch macht.
Ab da bin ich selbst dafür verantwortlich, was in dem String steht.

## Wessen Text da eigentlich rendert

Auf den ersten Blick rendert da die Antwort des Modells, und dem Modell vertraue ich halbwegs.
Der zweite Blick ist der wichtige: Das Modell zitiert.
Es bestätigt ein angelegtes Ticket samt Titel, fasst Beschreibungen zusammen, gibt Kommentare wieder.
Titel, Beschreibung und Kommentare schreibt, wer auch immer das Ticket angelegt hat.

Ein Ticket mit dem Titel `<img src=x onerror=alert(1)> Drucker kaputt` wird angelegt, der Assistent bestätigt es höflich, und die Bestätigung trägt den Titel im Wortlaut.
Ohne Gegenmaßnahme rendert der Chat das `<img>`-Tag, und der `onerror`-Handler läuft - bei jedem, der die Konversation ansieht.
Das ist Stored XSS über den Umweg einer freundlichen Bestätigung.
Erreichbar für jeden, der ein Ticket anlegen darf, also für alle.

Die Konsequenz für den Entwurf: Der Input ist feindlich, immer.
Nicht weil das Modell böse wäre, sondern weil es fremden Text durchreicht.

## Zwei Löcher, zwei Verschlüsse

Das erste Loch ist rohes HTML im Markdown.
Markdig hat dafür `DisableHtml()`: Der Parser behandelt HTML-Tags als Literaltext und escapt sie im Output.
Aus `<script>` wird `&lt;script&gt;`, sichtbar statt ausführbar.
Ein Test mit genau dem feindlichen Ticket-Titel von oben pinnt das fest.

Das zweite Loch sind URLs.
`[hier klicken](javascript:alert(1))` ist syntaktisch harmloses Markdown und kommt an `DisableHtml` vorbei, denn es ist ja kein HTML.
Der Renderer escapt zwar die Attributwerte, aber Escaping macht ein `javascript:`-href nicht harmlos - das Scheme selbst ist die Payload.
Also läuft vor dem Rendern ein Durchgang über den Syntaxbaum: Jede Link- und Bild-URL muss ihr Scheme gegen eine Allow-List beweisen, http, https, mailto oder relativ.
Alles andere wird geleert.

Die Allow-List ist bewusst ein exakter Match auf den Teil vor dem ersten Doppelpunkt.
Verschleierungen wie `java\tscript:` scheitern dadurch von selbst - „java\tscript" ist nun mal nicht „javascript", und ich muss keiner Liste bekannter Tricks hinterherpflegen.
Ein Doppelpunkt, der erst nach `/`, `?` oder `#` auftaucht, gehört zum Pfad einer relativen URL und bleibt erlaubt, sonst würde `/tickets?q=a:b` fälschlich blockiert.

## Der Beinahe-Fehler steckte im eigenen Issue

Im Issue-Text - meinem eigenen - stand als Hinweis, Markdig mit `UseAdvancedExtensions` zu konfigurieren, plus Sanitizer.
Beim Nachlesen, was dieses Bundle alles aktiviert, fiel `GenericAttributes` auf: eine Extension, mit der Markdown-Text beliebige HTML-Attribute an Elemente hängen kann.
`{onmouseover=...}` im richtigen Kontext, und das Loch, das `DisableHtml` gerade geschlossen hat, ist auf anderem Weg wieder offen.

Die Pipeline listet ihre Extensions deshalb einzeln auf: Emphasis-Extras, Pipe-Tables, Autolinks, Task-Lists.
Vier Zeilen statt einer, und jede davon ist eine Entscheidung statt eines Sammelpakets.
Die Lehre daraus nehme ich mit: Bei allem, was zwischen fremdem Input und `MarkupString` sitzt, will ich Feature-Bundles erst aufgeklappt sehen, bevor ich sie aktiviere.

## Was die Tests festhalten

Die Konvertierung lebt in einer eigenen Klasse, nicht in der Razor-Page - auch damit sie ohne UI-Test-Framework prüfbar ist.
Die Suite deckt beide Löcher und die Gegenprobe ab: Der feindliche Ticket-Titel bleibt escaped, `javascript:`- und `data:`-URLs verlieren ihr href, auch in Groß-Klein-Mischung und als Autolink.
Und die Gegenprobe: https-Links, relative Pfade und mailto überleben unverändert, samt dem Doppelpunkt-im-Query-Fall.

Die Gegenprobe ist mir dabei so wichtig wie die Angriffe.
Ein Sanitizer, der zu viel wegnimmt, fällt in keinem Security-Test auf - er fällt dem Nutzer auf, dessen Link stillschweigend tot ist.
