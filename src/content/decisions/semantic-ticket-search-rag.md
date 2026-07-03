---
title: "Semantische Ticket-Suche — RAG als Werkzeug des Modells"
description: "Der Intake-Assistent legt Tickets an, ohne die bestehenden zu kennen — fünfmal derselbe Druckerausfall, fünf Tickets. Die Lösung ist Retrieval. Die interessanten Fragen sind, wo die Vektoren wohnen und wer entscheidet, wann gesucht wird."
date: 2026-07-03T21:30:00
readMin: 5
draft: false
---

Der Intake-Assistent aus ServiceDeskLite hatte eine Lücke, die man erst im Gebrauch bemerkt: Er kennt die Tickets nicht, die es schon gibt. Meldet ein zweiter Kollege denselben Druckerausfall, entsteht ein zweites Ticket — das Modell hat keine Möglichkeit, es besser zu wissen. Die Lösung ist naheliegend: vor dem Anlegen suchen. Nur reicht Stichwortsuche dafür nicht. „Drucker reagiert nicht" und „Printout schlägt fehl" teilen kein einziges Wort und beschreiben dasselbe Problem. Gesucht werden muss nach Bedeutung — Embeddings, Vektorvergleich, Retrieval-Augmented Generation.

Das Kürzel klingt nach mehr Apparat, als die Entscheidung hergibt. Interessant sind vier Fragen: Woher kommen die Embeddings? Wo wohnen die Vektoren? Wann wird embedded? Und — die am wenigsten offensichtliche — wer entscheidet eigentlich, wann gesucht wird?

## Ein zweiter Provider, widerwillig

Die erste Antwort ist eine Enttäuschung mit Ansage: Anthropic hat keine Embeddings-API. Wer mit Claude baut und Vektoren braucht, braucht einen zweiten Anbieter — Anthropic selbst verweist auf Voyage AI. Das ist ein zweiter API-Key, eine zweite Fehlerquelle, ein zweites Quota. Der Client dafür ist bewusst klein gehalten: ein typisierter HttpClient, ein Request-Record, ein Response-Record — kein SDK-Wrapper um einen Endpoint, den das Projekt an genau zwei Stellen aufruft.

Weil der zweite Key optional bleiben soll, gilt für ihn eine andere Regel als für den Anthropic-Key. Der Assistent ist Kernfeature, sein Key wird beim Start erzwungen. Die semantische Suche ist eine Verbesserung — ihr Key hat einen Placeholder-Default, und ohne echten Key deaktiviert sich das Feature sauber, statt den Boot zu verhindern.

## Vektoren wohnen im bestehenden Postgres

Die zweite Frage hat eine Antwort, die vor allem aus einem Nein besteht: keine Vektor-Datenbank. Qdrant, Weaviate, Pinecone — für ein paar hundert Tickets ist jede davon Betriebsaufwand ohne Gegenwert. pgvector macht aus dem PostgreSQL, das ohnehin läuft, einen ausreichenden Vektorspeicher: eine Extension, ein Spaltentyp, Cosine-Distance als Operator.

Die Vektoren liegen dabei nicht am Ticket. Ein Embedding ist abgeleiteter Infrastruktur-Zustand — es gehört so wenig ins Aggregate wie ein Datenbankindex. Also eine eigene Tabelle, Foreign Key mit Cascade-Delete, gemappt ausschließlich in der Infrastructure-Schicht. Die Domain kompiliert weiterhin, ohne zu wissen, dass es Vektoren gibt — dieselbe Linie, die schon das LLM draußen gehalten hat.

Auch auf einen Vektor-Index (HNSW, IVFFlat) verzichtet die Tabelle. Bei dieser Datenmenge ist ein exakter sequenzieller Scan schneller als jede Index-Diskussion — und er liefert exakte statt approximative Ergebnisse. Der Index wäre Tuning-Oberfläche für ein Problem, das nicht existiert.

## Der Schreibpfad bleibt offline

Wann wird embedded? Die verlockende Antwort — beim Anlegen, synchron — hätte einen Preis, der erst später auffällt: Der Ticket-Schreibpfad bekäme eine Netzwerk-Abhängigkeit. Ein Ticket anzulegen funktioniert heute ohne einen einzigen externen Call; das LLM sitzt am Rand, nicht im Command-Handler. Ein Embedding-Aufruf mitten im Write würde das aufgeben — und die Frage aufwerfen, was mit dem Ticket passiert, wenn Voyage gerade nicht antwortet.

Stattdessen: ein Poll-basierter Background-Worker. Er sucht Tickets, deren Embedding fehlt oder veraltet ist — Veralterung erkennt ein Content-Hash über Titel und Beschreibung —, embedded sie in Batches und schreibt die Vektoren zurück. Das eine Verfahren deckt alles ab: neue Tickets, editierte Tickets, Seed-Daten, Backfill nach einem Modellwechsel. Kein Event-Handler, kein Hook im Create-Pfad, kein Sonderfall für den Erstimport.

Der Preis ist Eventual Consistency: Ein frisch angelegtes Ticket ist für einige Sekunden nicht findbar. Für eine Duplikatprüfung ist das der richtige Trade-off — das Duplikat, das es zu erkennen gilt, existiert typischerweise seit Stunden, nicht seit Millisekunden.

## RAG als Werkzeug, nicht als Pipeline

Die vierte Frage ist die architektonisch interessanteste. Das klassische RAG-Muster verdrahtet Retrieval fest vor den Modellaufruf: erst suchen, dann die Treffer in den Prompt, dann generieren. Hier läuft es andersherum — die Suche ist ein Tool namens `find_similar_tickets`, gleichberechtigt neben `create_ticket` und `update_ticket`, und das Modell entscheidet selbst, wann es sucht.

Das passt zur Aufgabe: Nicht jede Nachricht braucht Retrieval. Eine Rückfrage zur Uhrzeit, eine Prioritätskorrektur — festverdrahtetes Suchen würde bei jedem Turn Embedding-Kosten erzeugen, deren Ergebnis das Modell ignorieren müsste. Der System-Prompt gibt die Regel vor: vor dem Anlegen auf Duplikate prüfen, bei einem klaren Treffer den Nutzer fragen statt still ein zweites Ticket zu erzeugen. Die Treffer kommen als Tool-Ergebnis zurück — Ticket-Id, Titel, Status, Ähnlichkeit — und das Modell begründet damit sichtbar, was es tut.

Ein Detail hat sich beim ersten Live-Test von selbst ergeben: Die Suche funktioniert quer über Sprachen. Eine deutsche Problembeschreibung findet englische Tickets — die Bedeutung liegt im Vektorraum nah beieinander, auch wenn kein Wort übereinstimmt. Genau der Fall, an dem Stichwortsuche gescheitert wäre.

Und wenn die Suche nicht verfügbar ist — InMemory-Provider, fehlender Key? Dann sagt das Tool das dem Modell ehrlich: „nicht verfügbar in diesem Deployment", statt eine leere Trefferliste zurückzugeben. Der Unterschied ist nicht kosmetisch. Eine leere Liste heißt „es gibt keine Duplikate" — eine Aussage, die das Modell dem Nutzer weitergeben würde, obwohl niemand nachgesehen hat.

## Was bewusst fehlt

Kein Chunking — Tickets sind kurz, ein Vektor pro Ticket genügt. Keine Hybrid-Suche aus Volltext und Vektor, kein Re-Ranking — beides Werkzeuge für Recall-Probleme, die bei diesem Korpus nicht messbar sind. Kein Embedding der Kommentare. Jede dieser Erweiterungen ließe sich hinter derselben Suchschnittstelle ergänzen, ohne dass das Tool oder das Modell etwas davon merken.

## Wann überdenken

Drei Auslöser stehen im ADR. Jenseits von grob hunderttausend Tickets kippt der sequenzielle Scan — dann HNSW-Index, und der Worker braucht Keyset-Paging statt „alles laden". Wenn Nutzer anfangen, nach exakten Begriffen zu suchen — Fehlercodes, Hostnamen —, wird die Hybrid-Suche interessant, weil Embeddings genau dort schwächeln, wo Zeichenketten exakt sein müssen. Und sollte Anthropic doch eine Embeddings-API bekommen, verschwindet der zweite Provider hinter dem Interface, hinter dem er von Anfang an stand.

Bis dahin gilt die Linie des Projekts auch hier: so viel Apparat wie nötig, dokumentiert, warum es nicht mehr ist. RAG macht den Assistenten nicht klüger — aber es gibt ihm etwas, das ihm bisher fehlte: ein Gedächtnis für das, was schon gemeldet wurde.
