---
title: "Der Grounding-Check - von der Bitte zum Mechanismus"
description: "Der Assistent prüft seine Antwort gegen die Quellen, die er gelesen hat - aber nur, wenn er daran denkt. 'Wenn er daran denkt' ist keine Sicherheitseigenschaft. Wie aus einer Prompt-Zeile eine erzwungene Regel wurde, ohne das Streaming aufzugeben."
date: 2026-07-13T21:30:00
readMin: 6
draft: true
---

Der Assistent in ServiceDeskLite kann eine how-to-Antwort gegen die Wissensbasis prüfen, bevor er sie abschickt.
Er zieht die Passagen, die er abgerufen hat, formuliert einen Entwurf und lässt einen Check zählen, wie viel davon die Quellen wirklich decken.
Findet der Check ungedeckte Sätze, hedged das Modell oder sucht neu, statt sie als belegt hinzustellen.
Das war schon gebaut.
Die Lücke lag woanders: Der Check lief nur, wenn das Modell daran dachte, ihn aufzurufen.

Im System-Prompt stand die Bitte:

> Before you send an answer that relies on those knowledge-base passages, verify it with the check_grounding tool.

Mehr als diese Zeile gab es nicht.
`AgentLoop` verlangte den Aufruf nicht, kein Guard forderte ihn, `tool_choice` war nie eingeschränkt.
Überging das Modell die Zeile, streamte die Antwort ungeprüft heraus - und sah genauso aus wie eine geprüfte.

## Die einzige Regel, die eine Bitte war

Jede andere Schranke im Assistenten ist ein Mechanismus.
Die Guard-Pipeline weist Tool-Aufrufe ab. Die Command-Handler validieren. Die State-Machine lehnt unerlaubte Übergänge ab. Ein Review-Guard hält den autonomen Worker vor einem folgenreichen Write an.
Der Grounding-Check war die eine Stelle, die als höfliche Bitte formuliert war.

In einem früheren ADR steht der Maßstab, an dem das scheitert: „A rule the model can talk itself out of is not a rule."
Eine Regel, aus der sich das Modell herausreden kann, ist keine.

Zwei Dinge machten die Lücke unangenehmer, als sie klingt.

Ob das Modell den Aufruf macht, ist Modellverhalten, und Modellverhalten ändert sich mit jedem Release.
Eine Korrektheitseigenschaft daran zu hängen heißt, sie bei jedem Modellwechsel neu prüfen zu müssen.

Und der Ausfall ist still.
Andere Schranken fallen laut: Ein abgewiesener Tool-Aufruf gibt ein `is_error`-Ergebnis zurück, das das Modell liest, und eine Metrik, die ein Operator sieht.
Ein Check, der nie läuft, erzeugt gar nichts.

## Den Aufruf erzwingen, nicht erbitten

Die Anthropic-API hat dafür ein Feld: `tool_choice`.
Steht es auf `auto`, wählt das Modell selbst. Zeigt es auf ein bestimmtes Tool, muss das Modell genau dieses aufrufen.

Der Loop rechnet jetzt vor jedem Turn eine Bedingung aus: Liegen abgerufene Passagen vor, und ist noch kein Check gelaufen?
Wenn ja, verengt der nächste Request `tool_choice` auf `check_grounding`.
In diesem Turn kann das Modell keine Textantwort streamen.
Es schreibt seinen Entwurf in das `answer`-Argument des Tools, der Check läuft, und das Urteil kommt als Tool-Ergebnis zurück - bevor das erste Token beim Nutzer ankommt.
Danach steht `tool_choice` wieder auf `auto`, und das Modell formuliert die Antwort, diesmal mit dem Urteil in der Hand.

Das ist der Punkt, an dem die Streaming-Frage sonst kippt.
Wer den fertigen, schon gestreamten Text nachträglich benotet, kann nur noch warnen.
Eine Warnung an einer Antwort, die bereits auf dem Schirm steht, an einen Nutzer, der die Quellen nicht gelesen hat, ist die falsche Ausgabe.
Weil der Entwurf im Tool-Argument steckt und nicht im Stream, kommt das Urteil rechtzeitig, ohne dass irgendetwas doppelt gesendet oder zurückgehalten wird.

Die Prompt-Zeile bleibt übrigens stehen.
Prüft das Modell von selbst, ist die Bedingung erfüllt und der Zwang greift nicht - das spart den zusätzlichen Turn.
Die Erzwingung ist der Auffang für den Turn, den das Modell sonst übersprungen hätte.

## Einmal, nicht lückenlos

Der Zwang feuert genau einmal pro Lauf: im ersten Turn, nachdem Passagen aufgetaucht sind.
Danach ist das Modell wieder frei, auch wenn es später noch einmal sucht.
Das garantiert mindestens einen Grounding-Check nach einem Retrieval - die Eigenschaft, die gefehlt hat.

Was es nicht garantiert: dass jede über eine lange Kette abgerufene Passage vor der finalen Antwort geprüft wurde.
Die strengere Variante - erzwingen, sobald neue, ungeprüfte Passagen dazukommen - braucht ein Delta-Tracking über die Quellen.
Die habe ich zurückgestellt, bis ein realer Lauf zeigt, dass sie nötig ist.
Force-once deckt den Fall ab, um den es ging, und ist eine Zeile Bedingung statt eines Zustandsautomaten.

## Warum das Urteil niemand zu sehen bekommt

Es gibt einen Vorbehalt, der die ganze Sache begrenzt, und er gehört offen genannt.
Der Detektor hinter `check_grounding` ist lexikalisch: Er zählt, wie viele Wörter des Entwurfs in den Quellen vorkommen.
Eine korrekte Umschreibung, eine korrekte Übersetzung und genau das Hedging, das der Prompt verlangt, wenn die Quellen dünn sind - sie alle bekommen einen niedrigen Score.

Den Check zu erzwingen ist trotzdem eine Verbesserung, weil das Urteil an das Modell geht.
Das Modell erkennt seine eigene Umschreibung wieder und antwortet, wenn es passt, ohnehin.
Denselben Score einem Menschen oder einem Schwellwert vorzusetzen wäre etwas anderes: Aus den Fehlalarmen würde Rauschen, das man zu ignorieren lernt.
Deshalb erzwingt diese Änderung den Aufruf, und nur das.
Das Urteil an eine Oberfläche oder ein Dashboard zu geben wartet auf einen semantischen Detektor - dieselben Voyage-Embeddings, die im System schon stecken, gegen jeden behauptenden Satz gerechnet statt Wörter gezählt.

## Was verworfen wurde

Zwei Alternativen lagen daneben.

Nach der Antwort benoten, deterministisch und kostenlos, mit dem Evaluator direkt.
Das scheitert am Timing: Der Text ist schon draußen, es bleibt nur die Warnung.

Die Antwort puffern, bis sie benotet ist.
Das hält eine ungegroundete Antwort zurück, gibt aber das Live-Streaming auf, das bewusst so gebaut wurde.

Der erzwungene Aufruf trifft die Mitte: Er hält das Streaming und stellt das Urteil trotzdem vor den ersten sichtbaren Token.

## Was bleibt

Der Check ist jetzt eine Eigenschaft des Loops, keine Zeile, auf deren Befolgung man hofft.
Eine Antwort aus der Wissensbasis erreicht den Nutzer nicht mehr, ohne dass vorher ein Urteil über ihre Deckung gerechnet wurde.
Und weil beide Agenten - der interaktive und der autonome Worker - denselben Loop teilen, gilt das auch dort, wo niemand zusieht.
Genau deshalb sitzt die Regel im Loop und nicht im Prompt: Eine Schranke, die an einer Stelle gilt, lässt sich an der anderen nicht vergessen.
