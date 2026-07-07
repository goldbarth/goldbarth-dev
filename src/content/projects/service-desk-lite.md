---
title: "ServiceDeskLite"
description: "Eine .NET 10 Clean Architecture Referenz — strikte Layer-Boundaries, compiler-enforced, zwei austauschbare Persistence-Adapter, ein AI-Intake-Assistent mit Tool Calling, Streaming und RAG als Edge-Adapter und jede Entscheidung als ADR dokumentiert."
date: "2026-05-04"
readMin: 7
draft: false
---

## Was es ist

ServiceDeskLite ist ein Ticket-Workflow-Backend, gebaut auf .NET 10. Tickets durchlaufen eine Kanban-ähnliche State Machine — open, in progress, resolved, closed — mit expliziten Transition-Regeln, die auf Domain-Ebene durchgesetzt werden. Drei unabhängig testbare Layer: eine Domain, die nichts über HTTP oder Datenbanken weiß, ein Application Layer, der Use Cases orchestriert, und zwei austauschbare Persistence-Adapter hinter denselben Repository-Interfaces. Ein Blazor Server Frontend konsumiert die API über HTTP.

Seit v1.1.0 gehört ein AI-Intake-Assistent dazu: Nutzer beschreiben ihr Problem in Freitext, ein Claude-Modell legt per Tool Calling das Ticket an — live gestreamt über SSE, ausgeführt ausschließlich durch die bestehenden Command-Handler. Inzwischen reicht sein Werkzeugkasten weiter: Tickets suchen, aktualisieren, im Workflow weiterschalten und an Agenten aus einem gepflegten Roster zuweisen — und vor dem Anlegen per semantischer Suche auf Duplikate prüfen (Retrieval über Voyage-Embeddings und pgvector, RAG im selben Agentic Loop).

Das Ziel ist keine Feature-Breite. Das Ziel ist strukturelle Klarheit — jede Layer-Boundary sichtbar und compiler-enforced, jede Entscheidung dokumentiert, jeder Trade-off begründet.

Vollständige Dokumentation und alle 25 ADRs: [goldbarth.github.io/ServiceDeskLite](https://goldbarth.github.io/ServiceDeskLite/)

## Problem / Motivation

Ich habe Codebases gesehen, wo Clean Architecture der erklärte Ansatz war, die Dependency-Regeln aber nur in Diagrammen und Code Reviews existierten. Irgendetwas ist immer durchgesickert. Infrastructure-Typen, die in Domain-Methoden auftauchen. HTTP-Belange, die sich in Use Cases einschleichen. Nicht durch Unachtsamkeit — sondern weil Naming Conventions und Reviewer-Aufmerksamkeit schwache Enforcement-Mechanismen sind. Der Compiler erzwingt nichts.

Ich wollte etwas bauen, wo die Dependency-Richtung durch Project-References erzwungen wird, nicht durch Vertrauen. Wo die Antwort auf „Kann der Domain Layer die Datenbank sehen?" lautet: „Er hat keine Reference auf das Projekt" — nicht: „Er sollte es nicht, und wir prüfen das im Code Review."

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

Die Domain kennt nichts außer sich selbst. Der Application Layer kennt die Domain und definiert Port-Interfaces für Persistence. Infrastructure implementiert diese Ports. Die API verdrahtet alles über Minimal API Endpoints, die Handler direkt aus DI injizieren — kein Mediator, kein Dispatch Layer.

Zwei Persistence-Implementierungen leben hinter denselben `ITicketRepository`- und `IUnitOfWork`-Ports: eine EF Core-gestützte PostgreSQL-Implementierung, ein selbst geschriebener `ConcurrentDictionary` Store. Beide halten dieselbe Unit-of-Work Commit-Boundary ein. Wechseln ist ein Config-Wert. Der Swap beweist, dass die Port-Boundaries halten — nicht in Prosa, in laufenden Tests.

Jeder Handler gibt `Result<T>` zurück — wirft nie für erwartete Fehler. Der API Layer mappt Error-Typen an einer Stelle auf HTTP-Statuscodes. RFC 9457 `ProblemDetails` ist der Error-Contract über die gesamte API-Oberfläche.

Der AI-Assistent ist die jüngste Belastungsprobe für diese Boundaries: Ein LLM ist ein externer, nicht-deterministischer Dienst, dessen Tool-Calls Domain-Zustand verändern wollen. Er lebt als Edge-Adapter im API-Projekt — Streaming und SSE-Framing sind Presentation-Concerns — und erreicht die Domain nur über dieselben Command-Handler wie die REST-Endpoints. Tool-Inputs werden wie untrusted Input behandelt: geparst und geprüft, bevor sie einen Handler sehen; abgelehnte Inputs gehen als Fehler-`tool_result` zurück, sodass das Modell sich in einer begrenzten Schleife selbst korrigiert. Domain und Application kompilieren ohne jede Anthropic-Referenz.

Dieselbe Linie setzt die semantische Ticket-Suche fort: Embeddings sind abgeleiteter Infrastruktur-Zustand und leben in einer eigenen pgvector-Tabelle statt am Aggregate; ein Poll-basierter Background-Worker embedded asynchron (Content-Hash für Staleness), sodass der Ticket-Schreibpfad keine Netzwerk-Abhängigkeit bekommt. Das Retrieval selbst ist ein Tool des Modells — es entscheidet, wann gesucht wird, und der Duplikat-Check funktioniert cross-lingual. Ohne Voyage-Key oder auf dem InMemory-Provider meldet das Tool die Suche ehrlich als nicht verfügbar, statt leere Treffer vorzutäuschen.

→ [Architecture, vom Compiler durchgesetzt](/decisions/clean-architecture-enforced-by-compiler)  
→ [Result Pattern an der Application Boundary](/decisions/result-pattern-application-boundary)  
→ [RFC 9457 als einheitlicher Error-Contract](/decisions/rfc9457-problem-details)  
→ [Minimal API ohne MediatR](/decisions/minimal-api-without-mediatr)  
→ [Swappable Persistence als Port-Beweis](/decisions/swappable-persistence-port-proof)  
→ [Stark typisierte Domain-IDs](/decisions/strongly-typed-domain-ids)  
→ [AI-Assistant als Edge-Adapter](/decisions/ai-assistant-edge-adapter)  
→ [Semantische Ticket-Suche — RAG als Werkzeug des Modells](/decisions/semantic-ticket-search-rag)  

## Herausforderungen

Der InMemory Persistence Adapter war der härteste Test der Architecture.

EF Core liefert einen eigenen `InMemory` Provider mit. Die offensichtliche Wahl für Tests und Development — keine Dateien, kein Migration-Schritt. Ich habe ihn früh ausgeschlossen: Er hält keine Transaction-Semantik ein. Writes sind sofort sichtbar, ohne `SaveChanges` aufzurufen. Hätte ich ihn verwendet, würden die InMemory- und PostgreSQL-Pfade unter demselben Application-Code unterschiedlich funktionieren, und die zentrale Aussage der Architecture — dass Adapter über der Port-Boundary austauschbar sind — wäre nicht testbar.

Die Alternative war eine selbst geschriebene Implementierung: ein Singleton `ConcurrentDictionary` Store mit einem scoped `IUnitOfWork`, der Adds in einer `PendingAdds`-Liste puffert und sie erst beim `SaveChangesAsync` auf den Store anwendet. Mehr Code, aber die Commit-Boundary ist real. Unit-of-Work Isolation-Tests, die gegen InMemory bestehen, sind aussagekräftig — weil der InMemory Provider uncommitted Writes absichtlich vor concurrent Reads verbirgt.

Der andere anhaltende Reibungspunkt war das `Contracts`-Projekt. Versionierte Request- und Response-DTOs leben dort, geteilt zwischen der API und dem Blazor Web-Client. Diese Boundary hält das Web-Projekt sauber — es referenziert `Application`, `Domain` oder `Infrastructure` nie direkt. Aber es bedeutet, dass jede Feld-Ergänzung ein weiteres Projekt berührt, und der Mapping Layer zwischen Domain- und Contract-Typen fügt laufenden Overhead hinzu. Für ein Referenz-Projekt ist der Trade-off es wert. Für ein Team, das schnell Features entwickelt, braucht es eine härtere Rechtfertigung.

## Takeaways

Die Architecture rechtfertigt ihren Aufwand sofort im Testing. Handler laufen unter `xUnit` — kein Web-Host, kein Middleware, keine Datenbank. Handler injizieren, `HandleAsync` aufrufen, Ergebnis prüfen. Der Result-Typ macht Assertions sauber — keine try/catch-Blöcke, keine Exception-Inspektion. Die Integration-Suite führt beide Persistence-Provider durch dieselben Test-Cases, per `[ProviderMatrix]` Attribute.

Der Persistence-Swap war die klarste Validierung. `PERSISTENCE__PROVIDER=InMemory` in Development, `Postgres` in CI. Derselbe Handler-Code, dieselben Test-Cases, beide grün. Das ist Architecture, die funktioniert. Nicht beschrieben als funktionierend — demonstriert.

Würde ich es nochmal bauen, würde ich das `Contracts`-Projekt früher einführen und härter darüber nachdenken, was Version-Stabilität für ein Referenz-Projekt bedeutet. Das Versioning-Zeremoniell (`V1` Namespace, explizites Mapping) ist korrekte Praxis, aber es erzeugt Rauschen, wenn die API-Oberfläche sich nicht tatsächlich weiterentwickelt. Für einen zweiten Milestone, der Breaking API Changes einführt, wird es sich vollständig rechtfertigen.
