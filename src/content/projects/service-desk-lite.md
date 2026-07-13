---
title: "ServiceDeskLite"
description: "Eine .NET 10 Clean Architecture Referenz - strikte Layer-Boundaries, compiler-enforced, zwei austauschbare Persistence-Adapter, ein AI-Agent mit Tool Calling, RAG, Sandbox und autonomem Ticket-Worker als Edge-Adapter, und jede Entscheidung als ADR dokumentiert."
date: "2026-05-04"
updated: "2026-07-13"
readMin: 8
draft: false
---

## Was es ist

ServiceDeskLite ist ein Ticket-Workflow-Backend, gebaut auf .NET 10. Tickets durchlaufen eine Kanban-ähnliche State Machine - open, in progress, resolved, closed - mit expliziten Transition-Regeln, die auf Domain-Ebene durchgesetzt werden. Drei unabhängig testbare Layer: eine Domain, die nichts über HTTP oder Datenbanken weiß, ein Application Layer, der Use Cases orchestriert, und zwei austauschbare Persistence-Adapter hinter denselben Repository-Interfaces. Ein Blazor Server Frontend konsumiert die API über HTTP.

Seit v1.1.0 gehört ein AI-Assistent dazu, und aus dem Intake-Helfer ist inzwischen ein Agent geworden. Nutzer beschreiben ihr Problem in Freitext, ein Claude-Modell entscheidet per Tool Calling, was zu tun ist, und jeder Tool-Aufruf läuft durch dieselben Command-Handler wie die REST-API. Zwölf Tools stehen ihm offen: Tickets anlegen, suchen, aktualisieren, im Workflow weiterschalten, an Agenten aus einem Roster zuweisen, automatisch triagieren, kommentieren, die Knowledge Base durchsuchen, den eigenen Antwortentwurf gegen die zitierten Quellen prüfen, sich Dinge merken und wieder erinnern. Alles live über SSE gestreamt.

Seit v1.6.0 wartet der Agent nicht mehr darauf, angesprochen zu werden. Ein Background-Worker sieht offene Tickets in Intervallen durch, fragt fehlende Informationen nach, parkt das Ticket solange, schlägt Lösungen auf Basis der Knowledge Base vor und legt jede folgenreiche Entscheidung einem Menschen vor. Es ist kein zweiter Agent: der Tool-Calling-Loop wurde aus dem Chat-Endpoint herausgezogen, Worker und Assistent teilen sich Loop, Tools, Guards und Handler.

Mit v1.8.0 wurden die Sicherheitseigenschaften des Agenten von Prompt-Zeilen zu Mechanismen. Der Grounding-Check ist keine Bitte mehr, der das Modell folgen kann oder nicht: Sobald Knowledge-Base-Passagen abgerufen wurden, erzwingt der Loop die Prüfung per `tool_choice`, bevor das erste Token streamt. Und der Check bewertet Bedeutung statt Wortüberlappung - eine korrekte Paraphrase oder eine deutsche Antwort auf eine englische Quelle fällt nicht mehr durch die eigene Verifikation. Dazu eine Write-Honesty-Policy: Das Modell bestätigt keine Änderung mehr, die es nicht per Tool-Aufruf gemacht hat.

Aktuell bekommt das Blazor-Frontend ein Redesign: ein Token-System als Single Source für Farben, Abstände und Radien - guarded durch Tests, die Stylesheets auf Literale scannen -, Light- und Dark-Scheme aus einem Emitter, Status- und Prioritäts-Chips mit Icon statt Farbe allein, und ein Chat, der Markdown rendert, nachdem es sanitized wurde.

Die Oberfläche ist über die Releases breit geworden. Konstant geblieben ist, was darunter liegt: jede Layer-Boundary sichtbar und compiler-enforced, jede Entscheidung als ADR dokumentiert, jeder Trade-off begründet. Jedes neue Feature musste durch dieselben Grenzen, der Agent zuerst.

Vollständige Dokumentation und alle 40 ADRs: [goldbarth.github.io/ServiceDeskLite](https://goldbarth.github.io/ServiceDeskLite/)

## Problem / Motivation

Clean Architecture beschreibt eine Regel: Abhängigkeiten zeigen nach innen. Was die Regel nicht mitliefert, ist der Mechanismus, der sie durchsetzt. Diagramme und Code Reviews sind eine Möglichkeit, und sie können das tragen. Mich hat interessiert, wie es aussieht, wenn stattdessen der Build die Regel übernimmt.

Also habe ich etwas gebaut, wo die Dependency-Richtung durch Project-References erzwungen wird. Wo die Antwort auf „Kann der Domain Layer die Datenbank sehen?" lautet: „Er hat keine Reference auf das Projekt."

ServiceDeskLite ist dieses Experiment. Klein genug, um es vollständig im Kopf zu behalten, strikt genug strukturiert, dass die Architecture in den `.csproj`-Dateien lesbar ist.

## Architecture / Wichtige Entscheidungen

Sechs Projekte. Strikter Dependency-Flow nach innen.

```
┌─────────────────────────────────────┐
│              Web (Blazor)           │
├─────────────────────────────────────┤
│           API (Minimal API)         │
├───────────────────┬─────────────────┤
│  Infrastructure   │  Infra.InMemory │
├───────────────────┴─────────────────┤
│           Application               │
├─────────────────────────────────────┤
│              Domain                 │
└─────────────────────────────────────┘
```

Die Domain kennt nichts außer sich selbst. Der Application Layer kennt die Domain und definiert Port-Interfaces für Persistence. Infrastructure implementiert diese Ports. Die API verdrahtet alles über Minimal API Endpoints, die Handler direkt aus DI injizieren - kein Mediator, kein Dispatch Layer.

Zwei Persistence-Implementierungen leben hinter denselben `ITicketRepository`- und `IUnitOfWork`-Ports: eine EF Core-gestützte PostgreSQL-Implementierung, ein selbst geschriebener `ConcurrentDictionary` Store. Beide halten dieselbe Unit-of-Work Commit-Boundary ein. Wechseln ist ein Config-Wert. Der Swap zeigt in laufenden Tests, dass die Port-Boundaries halten.

Jeder Handler gibt `Result<T>` zurück - wirft nie für erwartete Fehler. Der API Layer mappt Error-Typen an einer Stelle auf HTTP-Statuscodes. RFC 9457 `ProblemDetails` ist der Error-Contract über die gesamte API-Oberfläche.

Der AI-Assistent ist die jüngste Belastungsprobe für diese Boundaries: Ein LLM ist ein externer, nicht-deterministischer Dienst, dessen Tool-Calls Domain-Zustand verändern wollen. Er lebt als Edge-Adapter im API-Projekt - Streaming und SSE-Framing sind Presentation-Concerns - und erreicht die Domain nur über dieselben Command-Handler wie die REST-Endpoints. Tool-Inputs werden wie untrusted Input behandelt: geparst und geprüft, bevor sie einen Handler sehen; abgelehnte Inputs gehen als Fehler-`tool_result` zurück, sodass das Modell sich in einer begrenzten Schleife selbst korrigiert. Domain und Application kompilieren ohne jede Anthropic-Referenz.

Dieselbe Linie setzt die semantische Ticket-Suche fort: Embeddings sind abgeleiteter Infrastruktur-Zustand und leben in einer eigenen pgvector-Tabelle statt am Aggregate; ein Poll-basierter Background-Worker embedded asynchron (Content-Hash für Staleness), sodass der Ticket-Schreibpfad keine Netzwerk-Abhängigkeit bekommt. Das Retrieval selbst ist ein Tool des Modells - es entscheidet, wann gesucht wird, und der Duplikat-Check funktioniert cross-lingual. Ohne Voyage-Key oder auf dem InMemory-Provider meldet das Tool die Suche als nicht verfügbar, statt leere Treffer vorzutäuschen.

Aus dieser einen Suche ist ein Retrieval-System geworden. Die Ticket-Suche fusioniert semantische und Keyword-Treffer per Reciprocal Rank Fusion, weil Embeddings Paraphrasen finden und Substring-Suche Fehlercodes und Hostnamen. Eine zweite Korpus-Pipeline indiziert die Knowledge Base als Section-Chunks, und Antworten darauf streamen ihre Quellen als eigene `citation`-Events mit. Bevor eine so gebaute Antwort den Nutzer erreicht, prüft `check_grounding` den Entwurf gegen genau die Passagen, die in diesem Turn abgerufen wurden - erzwungen vom Loop, nicht erbeten vom Prompt: Hat das Modell nach einem Retrieval nicht selbst geprüft, schaltet `tool_choice` den Check zwangsweise dazwischen. Bewertet wird semantisch, per Embedding-Ähnlichkeit statt Wortzählung. Ist die Deckung schwach, sucht das Modell erneut, relativiert oder lässt die Behauptung weg.

Der Agent ist eingezäunt. Jeder Tool-Aufruf passiert eine Guard-Pipeline an der einen Stelle, an der aus Modellabsicht Ausführung wird: unbekannte Tool-Namen werden abgelehnt, Argumentgrößen gedeckelt, Schreibzugriffe pro Turn budgetiert, Tool-Calls und Modell-Roundtrips pro Owner rate-limited. Die Guards trennen `Check` von `Commit`, damit kein Rate-Limit-Token für einen Schreibzugriff verbraucht wird, den ein späterer Guard ohnehin ablehnt. Eine Ablehnung ist kein Absturz, sondern kommt als gewöhnliches `is_error`-Tool-Ergebnis zurück, und das Modell erklärt dem Nutzer, was es nicht getan hat. Für den autonomen Worker verengt ein zusätzlicher Review-Guard diese Menge weiter: lesen darf er immer, kommentieren auch, triagieren und parken ebenfalls - alles andere landet bei einem Menschen.

Was der Assistent tut, ist messbar. Ein Prometheus-Endpoint und OpenTelemetry-Traces liefern Tool-Latenzen, Fehlerraten, Token-Verbrauch und Retrieval-Confidence, gespeist aus einem einzigen Decorator über der Metrics-Sink, damit Dashboard und Prometheus nicht auseinanderlaufen können. Eine Kennzahl, die das System nicht messen kann, wird als unbekannt ausgewiesen und nicht als Null: ein System, das niemand benutzt hat, hat keine 0 % Automatisierung erreicht.

→ [Architecture, vom Compiler durchgesetzt](/decisions/clean-architecture-enforced-by-compiler)  
→ [Result Pattern an der Application Boundary](/decisions/result-pattern-application-boundary)  
→ [RFC 9457 als einheitlicher Error-Contract](/decisions/rfc9457-problem-details)  
→ [Minimal API ohne MediatR](/decisions/minimal-api-without-mediatr)  
→ [Swappable Persistence als Port-Beweis](/decisions/swappable-persistence-port-proof)  
→ [Stark typisierte Domain-IDs](/decisions/strongly-typed-domain-ids)  
→ [AI-Assistant als Edge-Adapter](/decisions/ai-assistant-edge-adapter)  
→ [Semantische Ticket-Suche - RAG als Werkzeug des Modells](/decisions/semantic-ticket-search-rag)  

## Testergebnisse, Probleme und Lösungen

→ [Das übersprungene Tool - eine Beschreibung, die das Wann verschweigt](/decisions/when-to-call-tool-descriptions)  
→ [Markdown rendern heißt: fremden Text ausführen lassen](/decisions/assistant-markdown-untrusted-input)  
→ [Markdown im Stream - rendern, wenn der Satz zu Ende ist](/decisions/streaming-markdown-half-open-dom)  
→ [Der Prompt sagt verschweigen, die UI zeigt es an](/decisions/grounding-score-out-of-chat)  
→ [Drei Chips, drei Wahrheiten - und ein Mapping, das sie wieder eint](/decisions/ticket-signals-one-mapping)

## Herausforderungen

Der InMemory Persistence Adapter war der härteste Test der Architecture.

EF Core liefert einen eigenen `InMemory` Provider mit. Die offensichtliche Wahl für Tests und Development - keine Dateien, kein Migration-Schritt. Ich habe ihn früh ausgeschlossen: Er hält keine Transaction-Semantik ein. Writes sind sofort sichtbar, ohne `SaveChanges` aufzurufen. Hätte ich ihn verwendet, würden die InMemory- und PostgreSQL-Pfade unter demselben Application-Code unterschiedlich funktionieren, und die zentrale Aussage der Architecture - dass Adapter über der Port-Boundary austauschbar sind - wäre nicht testbar.

Die Alternative war eine selbst geschriebene Implementierung: ein Singleton `ConcurrentDictionary` Store mit einem scoped `IUnitOfWork`, der Adds in einer `PendingAdds`-Liste puffert und sie erst beim `SaveChangesAsync` auf den Store anwendet. Mehr Code, aber die Commit-Boundary ist real. Unit-of-Work Isolation-Tests, die gegen InMemory bestehen, sind aussagekräftig - weil der InMemory Provider uncommitted Writes absichtlich vor concurrent Reads verbirgt.

Der andere anhaltende Reibungspunkt war das `Contracts`-Projekt. Versionierte Request- und Response-DTOs leben dort, geteilt zwischen der API und dem Blazor Web-Client. Diese Boundary hält das Web-Projekt sauber - es referenziert `Application`, `Domain` oder `Infrastructure` nie direkt. Aber es bedeutet, dass jede Feld-Ergänzung ein weiteres Projekt berührt, und der Mapping Layer zwischen Domain- und Contract-Typen fügt laufenden Overhead hinzu. Für ein Referenz-Projekt ist der Trade-off es wert. Für ein Team, das schnell Features entwickelt, braucht es eine härtere Rechtfertigung.

## Takeaways

Die Architecture rechtfertigt ihren Aufwand sofort im Testing. Handler laufen unter `xUnit` - kein Web-Host, kein Middleware, keine Datenbank. Handler injizieren, `HandleAsync` aufrufen, Ergebnis prüfen. Der Result-Typ macht Assertions sauber - keine try/catch-Blöcke, keine Exception-Inspektion. Die Integration-Suite führt beide Persistence-Provider durch dieselben Test-Cases, per `[ProviderMatrix]` Attribute.

Der Persistence-Swap war die klarste Validierung. `PERSISTENCE__PROVIDER=InMemory` in Development, `Postgres` in CI. Derselbe Handler-Code, dieselben Test-Cases, beide grün. Damit ist die Aussage der Architecture überprüft und nicht nur aufgeschrieben.

Würde ich es nochmal bauen, würde ich das `Contracts`-Projekt früher einführen und härter darüber nachdenken, was Version-Stabilität für ein Referenz-Projekt bedeutet. Das Versioning-Zeremoniell (`V1` Namespace, explizites Mapping) ist korrekte Praxis, aber es erzeugt Rauschen, wenn die API-Oberfläche sich nicht tatsächlich weiterentwickelt. Für einen zweiten Milestone, der Breaking API Changes einführt, wird es sich vollständig rechtfertigen.
