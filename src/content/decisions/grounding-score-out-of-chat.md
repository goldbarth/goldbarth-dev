---
title: "Der Prompt sagt verschweigen, die UI zeigt es an"
description: "Das Modell wird angewiesen, seinen internen Grounding-Check nie zu erwähnen. Derselbe Check erscheint im Chat als farbiger Prozent-Chip. Einer von beiden hat Unrecht - und die Antwort darauf ist keine Bugfrage, sondern eine Produktentscheidung: Was soll ein Nutzer mit „Grounding 45 %“ anfangen?"
date: 2026-07-13T22:00:00
readMin: 4
draft: true
---

Im System-Prompt des ServiceDeskLite-Assistenten steht über den Grounding-Check ein klarer Satz: Der Check ist intern, erwähne ihn nie, nenne dem Nutzer nicht den Score.
Im Chat darunter rendert die Web-UI denselben Score als Chip - grün, gelb oder rot, mit Prozentzahl.
Das Modell soll also über eine Zahl schweigen, die das Interface gleichzeitig auf den Bildschirm malt.

Der Widerspruch selbst ist unstrittig, aber er verrät nicht, welche Seite ihn auflösen muss.
Ist der Score intern, muss der Chip weg.
Ist er öffentlich, ist die Prompt-Zeile veraltet - und jemand muss erklären, was ein Service-Desk-Nutzer mit der Zahl tun soll.
Das ist der Grund, warum daraus ein eigenes Issue wurde statt eines Zwei-Minuten-Fixes: Es ist eine Produktentscheidung in Bug-Verkleidung.

## Die Frage, die entschieden hat

Geholfen hat eine einfache Frage: Was kann die Person vor dem Bildschirm mit der Information anfangen?

Bei den Quellen-Zitaten ist die Antwort konkret.
Ein Zitat trägt Titel, Abschnitt und Snippet - der Nutzer kann die Quelle öffnen, nachlesen, sich ein eigenes Bild machen.
Die Information enthält eine Handlung.

Bei „Grounding 45 %" fällt die Antwort anders aus.
Der Nutzer hat die Passagen nicht gelesen, gegen die geprüft wurde.
Er kann nicht beurteilen, ob das Modell halluziniert oder bloß paraphrasiert hat.
Dazu kommt eine unbequeme Vorgeschichte: Kurz zuvor hatte sich gezeigt, dass der Score lexikalische Überlappung maß statt Bedeutung - korrekte Paraphrasen fielen durch, und von außen konnte das niemand erkennen.
Eine Zahl, deren Fehler unsichtbar sind, taugt schlecht als Vertrauenssignal für Laien.

Also: Der Score ist intern, der Chip geht.

## Konsequent heißt: auch der Aufruf verschwindet

Beim Umsetzen zeigte sich, dass der Score-Chip nur die halbe Sichtbarkeit war.
Der Chat rendert für jeden Tool-Aufruf ein „Calling …"-Chip, auch für `check_grounding`.
Nur den Score zu entfernen hätte weiter einen Check angezeigt, den der Prompt als intern deklariert - bloß ohne Ergebnis, was eher mehr Fragen aufwirft als vorher.
Der Chat unterdrückt jetzt beides, den Aufruf und das Resultat.

Verschwunden ist der Score damit nicht.
Das AI-Insights-Dashboard aggregiert Grounding-Metriken weiter, und dort passt die Zahl hin: Wer das Dashboard liest, betreibt das System und kann mit Verteilungen und Ausreißern arbeiten.
Dieselbe Information, anderes Publikum, andere Berechtigung.

Die Prompt-Zeile blieb unangetastet, und der Kommentar im Code sagt jetzt dazu, warum die UI hier schweigt.
Einen Test gibt es für diese Änderung nicht - sie entfernt Rendering, und der Guard dagegen wäre ein Test, der Abwesenheit von UI prüft, was mir die Wartung nicht wert ist.

Mitgenommen habe ich eine Regel für die nächste ähnliche Stelle: Wenn Prompt und Interface sich widersprechen, lohnt es sich, zuerst zu klären, wem die Information eigentlich dient.
Die technische Auflösung ist danach meist die kleinere Hälfte der Arbeit.
