---
title: "Grounding nach Bedeutung, nicht nach Wörtern"
description: "Der Check, der eine erfundene Antwort abfangen soll, schlug auch bei den richtigen Alarm. Er zählte gemeinsame Wörter, und eine gute Umschreibung teilt mit ihrer Quelle kein einziges. Wie aus Wortzählen ein Bedeutungsvergleich wurde - und warum das erst jetzt drängte."
date: 2026-07-13T22:30:00
readMin: 6
draft: true
---

Der Assistent in ServiceDeskLite prüft seine how-to-Antworten gegen die Wissensbasis, bevor er sie abschickt.
Der Check zählt, wie viel von der Antwort die abgerufenen Passagen decken, und markiert, was ungedeckt bleibt.
Das Verfahren war ein Wortvergleich: Ein Satz gilt als gedeckt, wenn genug seiner inhaltstragenden Wörter auch in den Quellen vorkommen.
Deterministisch, kostenlos, gegen Fixtures testbar - für einen ersten Wurf genau richtig.
Und lexikalisch, was genau dort danebengeht, wo es zählt.

Der Fall, an dem es kippt, ist der Normalfall.
Die Quelle sagt: „open the admin console and choose Reset Password."
Die Antwort sagt: „Ask an administrator to trigger a credential renewal."
Dieselbe Anweisung, kein gemeinsames Wort.
Der Wortvergleich sieht keine Überlappung und gibt der korrekten Umschreibung eine glatte Null.

## Was der Wortzähler wirklich maß

Issue #188 hat es an der Passage aus den Grounding-Tests durchgemessen.
Eine wörtliche Wiederholung: gedeckt.
Eine Halluzination: ungedeckt - richtig erkannt.
Eine korrekte Umschreibung: ungedeckt.
Eine korrekte Antwort auf Deutsch gegen eine englische Passage: ungedeckt.
Das Hedging, das der Prompt ausdrücklich verlangt, wenn die Quellen dünn sind: ungedeckt.

Der Check fängt die erfundene Antwort.
Er fällt aber auch über eine treue Umschreibung, eine korrekte Übersetzung und genau das Verhalten, das der Prompt an anderer Stelle einfordert.
Die Übersetzung trifft es besonders: Der Prompt sagt dem Modell, es solle in der Sprache des Nutzers antworten.
Fragt jemand auf Deutsch gegen eine englische Wissensbasis, bekommt jede Antwort eine Null, weil kein Wort übereinstimmt.

## Warum das plötzlich drängte

Lange richtete der Fehler nichts an.
Nichts erzwang den Check, nichts zeigte den Score an, also waren die Fehlalarme unsichtbar - ein latenter Defekt, kein aktiver.

Zwei Änderungen haben das gedreht.
Der Check wird jetzt erzwungen, sobald eine Antwort auf abgerufenen Passagen fußt.
Ein Detektor, der korrekte Antworten durchfallen lässt, schickt seine Fehlalarme damit bei jeder gegroundeten Antwort ans Modell.
Und den Score irgendwo anzuzeigen - dem Nutzer, einem Dashboard, hinter einem Schwellwert - würde aus denselben Fehlalarmen Rauschen machen, das man zu ignorieren lernt.
Ein Schwellwert rettet nichts: Die korrekte Umschreibung liegt bei 0.00, nicht bei 0.55. Zwischen ihr und einer Halluzination lässt sich keine Linie ziehen.

## Bedeutung statt Wörter

Die Embeddings, die die semantische Suche ohnehin nutzt, lösen genau das.
Der neue Evaluator embeddet jeden behauptenden Satz der Antwort zusammen mit den abgerufenen Passagen und misst pro Satz, wie nah seine ähnlichste Passage im Vektorraum liegt.
Ein Satz gilt als gedeckt, wenn diese Nähe eine Schwelle überschreitet.
Der Score bleibt, was er war - der Anteil gedeckter Sätze -, und die Verdikt-Bänder ändern sich nicht.
Nur wie ein einzelner Satz als gedeckt zählt, wandert vom Wortvergleich zur Vektornähe.

Das ist die ganze Änderung, und sie reicht.
Die Umschreibung liegt nah an der Passage, die sie wiedergibt. Die deutsche Antwort auch.
Die Halluzination liegt weit weg.
Der Wortvergleich hatte die Nähe nicht sehen können, weil er nur Zeichenketten kannte.

Sätze und Passagen gehen in einem Embedding-Call zusammen raus, beide als „document".
Voyage würde Query und Document unterschiedlich behandeln, was zwei Calls bedeutete. Für einen symmetrischen Vergleich zwischen Satz und Passage genügt derselbe Typ, und ein Call hält die Kosten bei einem pro Antwort.

## Der Rückfall, wenn keine Embeddings da sind

Der Wortvergleich verschwindet nicht. Er bleibt als Fallback.
Ohne Voyage-Key, oder wenn ein Embedding-Call scheitert, fällt der Check auf die lexikalische Prüfung zurück, statt gar kein Urteil zu liefern.
Das ist wichtig, weil der Check jetzt erzwungen wird: Ein Check, der still nichts erzeugen kann, ist wieder kein Check.

In der Praxis läuft Grounding nur nach einem Retrieval, und Retrieval braucht Voyage schon.
Wenn es also etwas zu prüfen gibt, sind die Embeddings da.
Der Fallback ist das Netz für den transienten Ausfall und der Pfad für die InMemory-Variante, nicht der Normalfall.

## Was ich dafür aufgebe

Der semantische Pfad ist nicht mehr deterministisch.
Zweimal dieselbe Antwort kann auseinandergehen, wenn die Embeddings auseinandergehen.
Das war in ADR 0031 ein ausdrückliches Ziel - reproduzierbar, ohne Call testbar - und ich gebe es an dieser Stelle bewusst auf.

Die Logik bleibt trotzdem prüfbar.
Die Tests fahren den Bedeutungspfad mit einem gefälschten Embedder: Der Umschreibung und der deutschen Antwort gibt er die Richtung der Passage, der Halluzination eine andere, und der Cosinus tut dann, was echte Embeddings täten.
Die Schwelle, die Liste der ungedeckten Sätze und alle drei Rückfall-Auslöser sind so deterministisch festgenagelt.
Der lexikalische Pfad bleibt weiter fixture-getestet ohne jeden Call.

## Was offen bleibt

Ein zweites Problem aus #188 ist nicht gelöst.
Begrüßungen, Rückfragen und Ticket-Bestätigungen sind keine Aussagen über die Quellen, werden aber mitgezählt, sobald sie inhaltstragende Wörter enthalten.
Das beißt heute nicht, weil `check_grounding` nur den Entwurf bekommt, den das Modell selbst einreicht, und darin stehen solche Sätze selten.
Es würde beißen, sobald etwas die fertige Antwort benotet.
Aussage von Nicht-Aussage zu trennen ist ein eigenes Stück Arbeit und wartet, bis es gebraucht wird.

Was sich mit dieser Änderung verschiebt: Den Score anzuzeigen war bisher zu Recht blockiert, solange der Detektor an korrekten Antworten scheiterte.
Für den semantischen Pfad ist dieser Einwand weg.
Ob der Score irgendwo sichtbar wird, ist eine Produktfrage und hier nicht entschieden - aber der Grund, ihn zu verstecken, ist es.
