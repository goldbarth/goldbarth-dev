---
title: "Morgan Davis existiert nicht - Wissen, das nur im Fehlerfall ankommt"
description: "Der Assistent sollte ein Ticket zuweisen und erfand einen Mitarbeiter. Nicht aus Böswilligkeit: Die gültigen Namen erreichten ihn nur als Teil einer Fehlermeldung, und aus 'Morgan Diaz' wurde beim Weitererzählen 'Morgan Davis'. Über Discovery-by-Failure und warum eine Prompt-Zeile hier ein dreizehntes Tool schlägt."
date: 2026-07-14T11:00:00
readMin: 4
draft: true
---

Beim manuellen Testen des Assistenten in ServiceDeskLite fiel ein Satz, der erst harmlos klang.
Gebeten, ein Ticket zuzuweisen, erklärte das Modell, es habe keine Funktion, um die Mitarbeiterliste abzurufen - sein Zuweisungswerkzeug gebe ihm die Liste der aktiven Agenten nur bei einem Fehlversuch zurück.
Das stimmt. Es gibt kein `list_agents`-Tool.
Dann zählte es die aktiven Agenten auf und nannte "Morgan Davis".
Diesen Agenten gibt es nicht. Im Roster steht Morgan Diaz.

Der zweite Versuch mit dem richtigen Namen klappte.
Aber der erfundene Name ist derselbe Fehlertyp, der an gefährlicherer Stelle schon aufgefallen war: Das Modell behauptet etwas, das es nicht weiß.
Hier war nur der Schaden klein.

## Discovery by Failure

Die Ursache ist ein Muster, das sich leicht einschleicht.
Der Roster erreichte das Modell auf genau einem Weg: Schlägt `assign_ticket` fehl, weil der Name nicht passt, listet die Fehlermeldung die gültigen Agenten auf.
Das Modell lernt die Namen also nur, indem es erst einmal scheitert.

Das hat zwei Folgen.
Die erste ist ein verschwendeter Tool-Aufruf pro Zuweisung, wenn der Nutzer den Namen nicht exakt kennt.
Die zweite ist subtiler: Die Namen stehen im Transkript nur innerhalb einer Fehlermeldung, und was das Modell später daraus wiedergibt, ist seine Paraphrase davon.
Beim Paraphrasieren wurde aus Diaz Davis - ein plausibler Name, flüssig vorgetragen, falsch.

Die REST-Seite hatte das Problem nie: `GET /api/v1/agents` liefert den Roster jedem, der fragt.
Nur der Assistent hatte kein Gegenstück.

## Eine Prompt-Zeile statt eines dreizehnten Tools

Zwei Wege lagen auf dem Tisch.

Ein `list_agents`-Tool wäre konsistent mit dem bestehenden Muster: Katalog-Eintrag, Beschreibungs-Datei, Kind `Retrieval`.
Es skaliert auf einen Roster, der nicht mehr in einen Prompt passt.
Nur hat der heutige Roster fünf Einträge.

Die Alternative: die Namen direkt in den System-Prompt.
Fünf Namen sind eine Zeile, die Tokens sind vernachlässigbar, und das Modell kennt die gültigen Namen, bevor es rät - statt nachdem es gescheitert ist.

Ich habe die Prompt-Zeile genommen.
Ein Tool, dessen einziger Zweck ist, fünf konstante Namen zu liefern, ist Apparat ohne Gegenwert; das Issue selbst schlug den leichteren Weg vor.
Der schwerere steht im ADR als der Pfad, wenn der Roster je aus der Prompt-Zeile herauswächst.

Ein Detail war mir dabei wichtig: Die Namen kommen nicht aus der statischen Seed-Liste, sondern aus derselben Query, gegen die `assign_ticket` validiert.
Prompt und Prüfung lesen dieselbe Quelle und können nicht auseinanderlaufen.
Und ein leerer Roster wird im Prompt gesagt statt weggelassen - sonst füllt das Modell die Lücke wieder selbst.

## Testen, was beim Modell ankommt

Der Test dafür ist angenehm direkt.
Die Evaluation-Suite zeichnet jeden Request auf, den der Agent-Loop an die Modell-API schickt - inklusive des System-Prompts, wie das Modell ihn tatsächlich bekommt.
Die Behauptung "der Roster erreicht das Modell" wird damit prüfbar, ohne ein Modell zu befragen: Alle fünf Namen stehen im Prompt, exakt geschrieben.
Und eine Zeile im Test hält den Anlass fest: "Morgan Davis" darf nirgends vorkommen, damit der erfundene Name keine Quelle hat, aus der er je wieder zitiert werden könnte.

## Was bleibt

Wissen, das ein Modell nur über Fehlermeldungen erreicht, kommt verformt an.
Was es zum Handeln braucht - gültige Namen, erlaubte Werte, der aktuelle Tag - gehört dorthin, wo es vor der ersten Entscheidung steht: in den Prompt oder in die Tool-Beschreibung.
Der Fehlerpfad bleibt als Netz. Als Hauptweg taugt er nicht, denn was er lehrt, kommt als Paraphrase zurück.
