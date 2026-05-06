---
title: "Architecture, vom Compiler durchgesetzt"
description: "Warum ServiceDeskLite Clean Architecture Dependency-Regeln durch Project-References statt Naming Conventions durchsetzt — und was das kostet."
date: "2026-05-04"
readMin: 4
draft: false
---

Die verbreitetste Version von Clean Architecture, die mir begegnet ist, verwendet Naming Conventions und Code Reviews, um die Dependency-Regeln durchzusetzen. Domain-Typen referenzieren keine Infrastructure-Typen — per Konvention. Der Application Layer importiert keine HTTP-Concerns — per Absprache. Die Struktur lebt in der Dokumentation und im Gedächtnis des Reviewers.

Das ist eine schwache Garantie. Der Compiler setzt nichts durch. Ein Entwickler unter Zeitdruck fügt eine Referenz ein, die Tests bleiben grün, und die Boundary ist weg. Drei Monate später hat die Codebase irgendwo im Domain einen `HttpContext`.

ServiceDeskLite geht anders vor. Die Dependency-Regeln werden durch Project-References durchgesetzt — der Compiler ist der Türsteher, nicht der Reviewer.

## Der Durchsetzungsmechanismus

Sechs Projekte, jedes mit einer expliziten `<ProjectReference>`-Liste. `Domain.csproj` hat keine Referenz auf `Infrastructure.csproj`. Es kann `DbContext`, `IServiceCollection` oder irgendetwas aus ASP.NET Core nicht sehen. Eine Referenz hinzuzufügen ist eine bewusste, sichtbare Aktion — eine Zeile in einer `.csproj`-Datei, sichtbar im Diff, keine versehentliche `using`-Anweisung.

Der Dependency-Graph sieht so aus:

```
Api → Application → Domain
Api → Infrastructure → Application
Api → Infrastructure.InMemory → Application
Web → Contracts
Api → Contracts
```

`Infrastructure` kennt `Application` (es implementiert dessen Ports). `Application` kennt `Domain`. `Domain` kennt nichts außerhalb von sich selbst. Die Richtung zeigt an jedem Layer strikt nach innen. Wer das verletzt, bekommt einen Build-Fehler.

## Was das in der Praxis durchsetzt

Repository- und Unit-of-Work-Interfaces leben in `Application`, nicht in `Infrastructure`. `ITicketRepository` und `IUnitOfWork` sind Application-Layer-Typen — die konkreten EF Core-Implementierungen und die selbst geschriebenen InMemory-Implementierungen sind Adapter, die diese Interfaces implementieren. Den Persistence Stack zu tauschen erfordert, andere Adapter im Composition Root zu registrieren — nichts weiter. Die Handler müssen es nie wissen.

Die HTTP-Boundary wird ähnlich durchgesetzt. API-Endpoints leben im `Api`-Projekt. `Application` hat keine Referenz auf `Api`. Ein Handler kann versehentlich kein `IResult` zurückgeben, keinen `HttpContext` referenzieren, nichts aus `Microsoft.AspNetCore` importieren. Das Domain Model ist sauber, nicht weil Entwickler daran denken, es sauber zu halten, sondern weil der Project-Graph es strukturell unmöglich macht, es zu verschmutzen.

## Der Preis

Multi-Projekt-Zeremoniell. Ein typisches Feature berührt `Domain` (Entity- oder Invarianten-Änderung), `Application` (Handler, Command, Query), einen oder beide Infrastructure-Adapter (Repository-Methode), `Contracts` (Request/Response DTO) und `Api` (Endpoint). Fünf Projekte für ein Feature. In einem flachen CRUD-Projekt ist das eine Datei.

Der Mapping-Overhead ist real. Domain-Typen lecken nicht in Contracts, also gibt es an jeder Boundary eine explizite Konvertierung. Ein `Ticket`-Entity wird über einen Mapping-Schritt im `Api`-Layer zu einem `TicketResponse` DTO in `Contracts`. Wenn das Entity ein neues Feld bekommt, muss das Mapping aktualisiert werden. Es ist mechanisch, es ist repetitiv, und es muss jedes Mal gemacht werden.

## Warum der Trade-off hier Sinn ergibt

Das Projekt existiert, um zu zeigen, dass diese Architecture unter realem Druck hält. Ein neuer Adapter kann hinzugefügt werden, ein Feld kann dem Domain Model hinzugefügt werden, ein Persistence-Provider kann getauscht werden — und die Dependency-Regeln bleiben intakt. Das zu zeigen erfordert, die Regeln mechanisch durchzusetzen und dann genau das zu tun.

EF Core und InMemory implementieren beide dasselbe `ITicketRepository`-Interface. Beide laufen gegen dieselbe Test-Suite. Das ist ohne echte Port-Boundaries nicht möglich. Die Compiler-Durchsetzung ist das, was Port-Boundaries real macht statt nur angestrebt.

Für ein Produktions-Team unter Lieferdruck muss das Zeremoniell jeden Sprint seinen Aufwand rechtfertigen. Für ein Referenzprojekt, das zeigen soll, wie strikte Architecture aussieht, ist es der Punkt.
