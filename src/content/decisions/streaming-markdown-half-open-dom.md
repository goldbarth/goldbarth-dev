---
title: "Markdown im Stream - rendern, wenn der Satz zu Ende ist"
description: "Assistententext kommt über SSE in kleinen Häppchen. Wer bei jedem Delta das Markdown neu parst, rendert Dokumente, die mitten im Element aufhören - ein Codeblock ohne schließenden Fence, ein Fettdruck, der auf sein Gegenstück wartet. Die Lösung war, den Ehrgeiz aufzugeben, beides gleichzeitig zu wollen."
date: 2026-07-13T21:30:00
readMin: 4
draft: true
---

Die Antworten des ServiceDeskLite-Assistenten kommen als Server-Sent Events, Text-Delta für Text-Delta.
Für Klartext ist das unkompliziert: String anhängen, neu zeichnen, fertig.
Mit Markdown-Rendering wird aus jedem Delta ein Problem.
Ein Dokument, das mitten im Codeblock abbricht, ist für den Parser trotzdem ein Dokument - er macht daraus eben HTML, in dem gerade der halbe Rest der Nachricht als Code formatiert ist.
Beim nächsten Delta klappt es wieder um.
Das DOM flackert zwischen Interpretationen desselben halben Satzes.

Das Issue hatte dafür zwei zulässige Wege notiert: einen Renderer nehmen, der abgeschnittenen Input tolerant behandelt, oder während des Streams Klartext zeigen und erst die fertige Nachricht rendern.

## Warum die einfache Variante gewonnen hat

Ich habe die zweite Variante genommen.
Die Live-Bubble - die eine, in die gerade Text hineinläuft - rendert als Klartext.
Sobald die Nachricht abgeschlossen ist, rendert dieselbe Bubble als Markdown.
Kein partielles Dokument erreicht je den Parser, also erreicht auch kein halboffenes Element das DOM.

Der Reiz der Lösung liegt darin, was sie nicht braucht.
„Abgeschlossen" ist kein neues Flag und kein Event, sondern ergibt sich aus Zustand, den die Seite ohnehin hat: Eine Bubble ist fertig, wenn sie nicht mehr der letzte Eintrag ist - dann hat ein Tool-Aufruf sie unterbrochen und der nächste Text eröffnet eine neue - oder wenn der Stream vorbei ist.
Das konvertierte HTML wird pro Nachricht einmal berechnet und dann gecacht, denn ab dem Moment ändert sich der Text nicht mehr.

Der Preis ist sichtbar, aber klein: Während des Streamens steht für ein, zwei Sekunden `**wichtig**` statt **wichtig** in der Bubble.
Beim Abschluss springt die Formatierung einmal um, von roh zu gerendert.
Das ist ein einzelner, erklärbarer Übergang - kein Flackern bei jedem Delta.

## Zwei Stolpersteine am Rand

Ein Test sichert den Fall, den das Design eigentlich ausschließt: Markdown, das mitten im Code-Fence endet, muss trotzdem konvertieren.
Der Stream kann nämlich auf einem Fehler enden, und dann ist die „fertige" Nachricht eben doch ein Fragment.
Der Parser soll daraus etwas Anzeigbares machen, nicht werfen.

Der zweite Stolperstein war CSS, an zwei Stellen.
Die Bubble stand auf `white-space: pre-wrap`, was für Klartext die Zeilenumbrüche erhält - gerendertes HTML bringt aber seine eigenen Block-Abstände mit, und beides zusammen verdoppelt jede Lücke.
Und Blazors scoped CSS markiert nur Elemente aus der Razor-Datei mit seinem Scope-Attribut; was per `MarkupString` ins DOM kommt, trägt es nicht.
Die Markdown-Styles hängen deshalb per `::deep` unter der Bubble, die das Attribut noch hat.
Beides Kleinigkeiten, beides die Sorte, die man erst im Browser sieht und nicht im Test.
