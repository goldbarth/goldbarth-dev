---
title: "Das übersprungene Tool - eine Beschreibung, die das Wann verschweigt"
description: "Der Assistent bestätigt eine Änderung, die er nie gemacht hat. Das Modell hat das passende Tool schlicht nicht gerufen - und niemandem fällt es auf. Die Ursache liegt in einer Zeile Beschreibung, die sagt, was ein Tool tut, aber nicht, wann man es ruft."
date: 2026-07-13T20:00:00
readMin: 6
draft: true
---

Der Assistent in ServiceDeskLite kann Tickets anlegen, umschreiben, zuweisen, im Wissensspeicher suchen - zwölf Tools insgesamt.
Nur ruft er sie nicht selbst aus freiem Willen.
Auf jedem Turn entscheidet das Modell, ob es antwortet oder ein Tool nutzt.
Das kann die Testsuite nicht für mich garantieren: dass das Modell überhaupt zum richtigen Werkzeug greift.
Dass ein einmal gerufenes Tool korrekt und abgesichert läuft, dafür sorgt der Code. Ob es gerufen wird, entscheidet das Modell.

Bemerkt habe ich das Problem erst, als es schon eins war.
Der Testsatz war harmlos: „Setze die Priorität auf Critical".
Der Assistent antwortete freundlich, die Priorität sei jetzt Critical - und hatte `update_ticket` nie gerufen.
Am Ticket änderte sich nichts. In der Antwort stand, es habe sich geändert.
Zweimal in einer Sitzung reproduziert.

## Warum das gefährlicher ist, als es klingt

Der Wechsel im Hintergrund war ein Modellwechsel: von Opus 4.8 auf Sonnet 5, mit abgeschaltetem Thinking.
Anthropic dokumentiert für diese Konfiguration, dass das Modell etwas zurückhaltender zu einem Tool greift, um das es nicht ausdrücklich gebeten wurde.
Für sich genommen klingt das nach einer Fußnote.
Der Punkt ist, dass der Fehler nichts anrichtet, das man sieht.

Es lohnt, zwei Arten von Tool-Aufruf zu trennen.
Der eine ist imperativ: Die Nachricht benennt die Handlung. „Der Drucker ist tot" führt zu `create_ticket`, „setz die Priorität hoch" zu `update_ticket`.
Der andere ist diskretionär: Das Modell muss von selbst darauf kommen, dass ein Zwischenschritt sinnvoll ist. Vor dem Anlegen auf Duplikate prüfen. Vor der Antwort im Wissensspeicher nachsehen. Prüfen, ob eine Aussage von den Quellen gedeckt ist, bevor man sie behauptet.

Ein übersprungener diskretionärer Aufruf ist unsichtbar.
Der Assistent antwortet trotzdem, flüssig und selbstsicher.
Er antwortet nur aus dem Trainingswissen statt aus dem Wissensspeicher, oder legt ein Duplikat an, das er nie geprüft hat.
Nichts wirft einen Fehler. Nichts sieht falsch aus.
Die Antwort ist bloß weniger verlässlich, als sie wirkt.

Meine erste Annahme war, dass nur diese diskretionäre Gruppe gefährdet ist.
Der Priority-Fall hat sie widerlegt.
Ein glasklar imperativer Write wurde übersprungen - genau die Gruppe, von der ich dachte, sie sei sicher.

## Warum der naheliegende Test nichts beweist

ServiceDeskLite hat eine Evaluation-Suite, die den gesamten Agent-Loop end to end fährt: echter Endpoint, echter Tool-Dispatch, echte Command-Handler, echter Audit-Trail.
Das Einzige, was sie fälscht, ist der Transport unter dem Anthropic-Client - damit die Tests deterministisch und kostenlos bleiben.

Genau diese Fälschung ist die Grenze.
Die Suite scriptet die Tool-Aufrufe.
Ein Test, der behauptet „das Modell ruft `check_grounding` nach `search_knowledge_base`", würde diese Reihenfolge selbst vorschreiben und dann prüfen, ob sein eigenes Skript gelaufen ist.
Er beweist, dass die Harness stimmt. Er kann nicht beweisen, dass das Modell gut ist.
Das ist eine bewusst gezogene Linie der Harness, kein Versehen.

Die ehrliche Frage - wie oft ruft das Modell das richtige Tool, wenn es soll? - lässt sich mit dieser Suite also gar nicht beantworten.

## Zwei Wege, und die Reihenfolge ist die eigentliche Entscheidung

Auf dem Tisch lagen zwei Züge.

Der erste ist messen.
Ein Szenario-Set gegen das echte Modell laufen lassen und zählen, wie oft jedes Tool feuert, wenn es soll - geprüft gegen den Audit-Log, nicht gegen die Selbstauskunft des Modells.
Es ist der Zug, der die Frage tatsächlich beantwortet.
Es kostet auch echtes Geld pro Lauf, taugt nicht für CI, und braucht ein eigenes Opt-in-Zuhause.

Der zweite ist mildern.
Anthropic berichtet von einem messbaren Lift, wenn die Beschreibung eines Tools die Bedingung nennt, die es auslösen soll („Call this when the user asks about current prices"), statt nur die Mechanik.
Das ist modellunabhängig - es hilft Opus so gut wie Sonnet.
Es kostet nichts außer der Zeit, gute Sätze zu schreiben.

Naheliegend wäre erst messen, dann fixen. Diese Reihenfolge ist die falsche, und daran hängt die ganze Übung.
Jetzt zu messen heißt, einen Zustand zu vermessen, den ich am selben Nachmittag ohnehin ändere.
Die Milderung ist kostenlos - also zuerst.
Danach ist die Messung entweder überflüssig, weil das Problem faktisch weg ist, oder sie läuft gegen eine bereits verbesserte Grundlage.
Erst das macht den einmaligen API-Aufwand die Sache wert und die Zahl am Ende vertrauenswürdig.

Ein schwaches positives Signal gab es sogar schon.
In einem früheren Smoke-Test hatte das Modell `find_similar_tickets` und `route_ticket` von selbst gerufen, ungefragt.
Ein Lauf ist keine Messung.
Aber es ist auch kein Nullbefund, und es hat davon abgehalten, eine teure Messapparatur zu bauen, bevor der kostenlose Fix probiert war.

## Der Fix, und die Sperre daneben

Die Milderung war Handarbeit an Sätzen.
Alle zwölf Beschreibungen gelesen und sortiert: Wer nennt schon ein Wann, wer beschreibt nur Mechanik?
Sieben nannten bereits eine Bedingung.
Darunter `find_similar_tickets` und `route_ticket` - dieselben zwei, die im Smoke-Test von selbst gefeuert hatten. Ihre Beschreibungen trugen den Hinweis schon, was zum beobachteten Verhalten passt.
Fünf beschrieben nur, was sie tun: `update_ticket`, `assign_ticket`, `change_ticket_status`, `add_comment`, `remember`.
Diese fünf, samt dem `update_ticket` aus dem Feld, haben je eine Wann-Klausel bekommen.
`update_ticket` etwa ist von „Update any existing ticket, e.g. to correct the due date, priority, title or description" gewandert zu einer Fassung, die ergänzt: „Call this whenever the user asks to change a field on a ticket that already exists [...] and actually apply the change; do not just confirm it in prose."
Die letzte Klausel zielt direkt auf den Fehler, den ich gesehen hatte.

Eine Milderung, die nur in Prosa lebt, verrottet.
In einem halben Jahr kommt ein dreizehntes Tool dazu, seine Beschreibung listet Parameter und kein Wann, und die Regression läuft unbemerkt zurück.

Also steht neben dem Fix eine Sperre: ein deterministischer Guard-Test.
Er liest dieselbe Liste an Tool-Definitionen, die der Agent tatsächlich hochschickt, und prüft, dass jede einzelne einen Wann-Hinweis trägt - ein zeitlich-konditionales Wort wie *when*, *before*, *after*, *whenever*.
Und er prüft, dass alle zwölf Tools durch diese Kontrolle laufen, damit kein neues Tool sich still vorbeimogelt.

Zwei Dinge, die sich leicht vermischen, will ich hier auseinanderhalten.
Die Milderung - die Prosa in den Beschreibungen - ist Prompt-Tuning. Sie macht das Modell besser. Sie verbietet nichts.
Der Guard-Test ist eine Guardrail zur Build-Zeit. Er lässt eine schlechte Beschreibung den Build brechen. Er ändert kein Verhalten, er verhindert eine Regression.

Die Wort-Prüfung ist bewusst ein Boden, kein Gütemaß.
Eine Beschreibung kann das Wort „when" enthalten und trotzdem schwach führen.
Aber eine Beschreibung ganz ohne zeitlich-konditionales Wort beschreibt fast immer reine Mechanik, und genau das fängt der Guard ab.
Er behauptet nicht, Führungsqualität zu messen. Er behauptet, dass Führung überhaupt versucht wurde - für jedes Tool, dauerhaft.
Diese Hälfte braucht kein Modell und kein Geld. Sie läuft in CI bei jedem Commit.

## Was offen bleibt

Der Guard schließt die ursprüngliche Frage nicht.
Die Messung am echten Modell - wie oft jedes Tool wirklich feuert, wenn es soll, über die diskretionäre und die imperative Gruppe hinweg, geprüft gegen den Audit-Log - ist verschoben, nicht erledigt.

Sie steht jetzt aber besser da.
Sie misst die verbesserten Beschreibungen, also ist jedes verbliebene Überspringen echtes Signal statt Rauschen, das die kostenlose Milderung ohnehin entfernt hätte.
Genau das ist der Gewinn davon, den billigen Fix zuerst zu machen.

Eine Beobachtung nehme ich mit, über dieses eine Tool hinaus.
In einem agentischen System lassen sich die Fehler am schlechtesten fangen, bei denen das Modell nichts sichtbar Falsches tut.
Ein übersprungener Aufruf erzeugt eine selbstsichere, flüssige, falsche Antwort.
Und die einzige Instanz, die widerspricht, ist der Audit-Log - nicht das, was das Modell über sich selbst erzählt.
