---
title: "Architecture, vom Compiler durchgesetzt"
description: "Warum ServiceDeskLite Clean Architecture Dependency-Regeln durch Project-References statt Naming Conventions durchsetzt - und was das kostet."
date: "2026-05-04"
readMin: 4
draft: false
---

Clean Architecture ist im Kern eine Regel darüber, wer wen kennen darf. Der innere Kern der Anwendung weiß nichts von Datenbanken und nichts von HTTP. Die Frage ist, wer diese Regel eigentlich durchsetzt.

Eine Möglichkeit ist die Konvention: Domain-Typen referenzieren keine Infrastructure-Typen, weil man sich darauf geeinigt hat. Die Struktur lebt dann in der Dokumentation und im Code Review. Das ist eine tragfähige Antwort, und sie verlangt fortlaufend Aufmerksamkeit von allen Beteiligten.

Die andere Möglichkeit ist, die Regel dorthin zu legen, wo sie niemand mehr im Kopf halten muss. In ServiceDeskLite setzen Project-References die Dependency-Regeln durch. Ob eine Abhängigkeit erlaubt ist, entscheidet der Build.

## Der Durchsetzungsmechanismus

Sechs Projekte, jedes mit einer expliziten `<ProjectReference>`-Liste. `Domain.csproj` hat keine Referenz auf `Infrastructure.csproj`. Es kann `DbContext`, `IServiceCollection` oder irgendetwas aus ASP.NET Core nicht sehen. Eine Referenz hinzuzufügen ist eine bewusste, sichtbare Aktion - eine Zeile in einer `.csproj`-Datei, sichtbar im Diff, keine versehentliche `using`-Anweisung.

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

Repository- und Unit-of-Work-Interfaces leben in `Application`, nicht in `Infrastructure`. `ITicketRepository` und `IUnitOfWork` sind Application-Layer-Typen - die konkreten EF Core-Implementierungen und die selbst geschriebenen InMemory-Implementierungen sind Adapter, die diese Interfaces implementieren. Den Persistence Stack zu tauschen erfordert, andere Adapter im Composition Root zu registrieren - nichts weiter. Die Handler müssen es nie wissen.

Die HTTP-Boundary wird ähnlich durchgesetzt. API-Endpoints leben im `Api`-Projekt. `Application` hat keine Referenz auf `Api`. Ein Handler kann versehentlich kein `IResult` zurückgeben, keinen `HttpContext` referenzieren, nichts aus `Microsoft.AspNetCore` importieren. Das Domain Model bleibt sauber, weil der Project-Graph es strukturell gar nicht anders zulässt. Es hängt nicht daran, dass jemand daran denkt.

## Der Preis

Multi-Projekt-Zeremoniell. Ein typisches Feature berührt `Domain` (Entity- oder Invarianten-Änderung), `Application` (Handler, Command, Query), einen oder beide Infrastructure-Adapter (Repository-Methode), `Contracts` (Request/Response DTO) und `Api` (Endpoint). Fünf Projekte für ein Feature. In einem flachen CRUD-Projekt ist das eine Datei.

Der Mapping-Overhead ist real. Domain-Typen lecken nicht in Contracts, also gibt es an jeder Boundary eine explizite Konvertierung. Ein `Ticket`-Entity wird über einen Mapping-Schritt im `Api`-Layer zu einem `TicketResponse` DTO in `Contracts`. Wenn das Entity ein neues Feld bekommt, muss das Mapping aktualisiert werden. Es ist mechanisch, es ist repetitiv, und es muss jedes Mal gemacht werden.

## Warum der Trade-off hier Sinn ergibt

Das Projekt existiert, um zu zeigen, dass diese Architecture unter realem Druck hält. Ein neuer Adapter kann hinzugefügt werden, ein Feld kann dem Domain Model hinzugefügt werden, ein Persistence-Provider kann getauscht werden - und die Dependency-Regeln bleiben intakt. Das zu zeigen erfordert, die Regeln mechanisch durchzusetzen und dann genau das zu tun.

EF Core und InMemory implementieren beide dasselbe `ITicketRepository`-Interface. Beide laufen gegen dieselbe Test-Suite. Das ist ohne echte Port-Boundaries nicht möglich. Die Compiler-Durchsetzung ist das, was Port-Boundaries real macht statt nur angestrebt.

Für ein Produktions-Team unter Lieferdruck muss das Zeremoniell jeden Sprint seinen Aufwand rechtfertigen. Für ein Referenzprojekt, das zeigen soll, wie strikte Architecture aussieht, ist es der Punkt.
