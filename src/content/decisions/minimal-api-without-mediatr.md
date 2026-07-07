---
title: "Minimal API ohne MediatR"
description: "Warum ServiceDeskLite Handler direkt in Endpoints injiziert statt über einen Mediator zu dispatchen - und wann diese Entscheidung überdacht werden sollte."
date: "2026-05-04"
readMin: 3
draft: false
---

Zwei Fragen prägen den API Host in den meisten .NET-Projekten: welches Routing-Modell und ob eine Mediator-Library verwendet werden soll. ServiceDeskLite beantwortet beide bewusst: Minimal API, und kein Mediator.

Beides ist in vielen Architekturen nicht die Standardwahl. MediatR im Besonderen ist zu einer Art Konvention geworden - früh hinzugefügt, überall verwendet, unabhängig davon, ob die Pipeline, die es ermöglicht, tatsächlich benötigt wird. Die Frage, mit der ich angefangen habe: Was fehlt, wenn ich es nicht hinzufüge?

## Was MediatR hinzufügen würde

MediatRs Kernwert ist `IPipelineBehavior<,>`. Cross-cutting Concerns - jeden Handler-Aufruf loggen, Validation vor jedem Command ausführen, Authentication durchsetzen - können einmal als Behaviour ausgedrückt und auf jeden Handler-Aufruf angewendet werden, ohne die Call-Site zu berühren.

Ohne MediatR leben diese Concerns auf Middleware-Ebene oder werden per Handler behandelt. Für ServiceDeskLites aktuelle Oberfläche - vier Ticket-Endpoints, ein Aggregate - gibt es keine Cross-cutting Handler-Concerns, die eine Pipeline brauchen. Logging wird von Serilog auf Middleware-Ebene behandelt. Validation ist per Handler. Authentication ist nicht im Scope.

MediatR hinzuzufügen, bevor es etwas gibt, das in die Pipeline kommt, ist Infrastructure-Schuld, kein Kapital. Der Registration Layer, die `ISender`-Abstraktion, das Assembly-Scanning - alles davon ist Overhead für null aktuellen Nutzen.

## Wie Handler stattdessen verdrahtet werden

Endpoints werden als statische Methoden auf einer `RouteGroupBuilder`-Extension-Klasse definiert. Handler-Typen werden direkt als Endpoint-Parameter durch das DI-aware Parameter-Binding des Frameworks injiziert:

```csharp
group.MapPost("/", async (
    CreateTicketRequest request,
    CreateTicketHandler handler,
    CancellationToken ct) =>
{
    var command = request.ToCommand();
    var result = await handler.HandleAsync(command, ct);
    return result.ToHttpResult();
});
```

`CreateTicketHandler` ist als scoped Service in DI registriert. Der Endpoint ruft ihn direkt auf. Kein `ISender.Send(command)`, kein Mediator-Lookup, keine Dispatch-Indirektion.

Die Call-Site ist explizit: Man kann einen Endpoint lesen und weiß genau, welchen Handler er aufruft. Es gibt keine Layer von convention-basiertem Dispatch, durch die man sich durcharbeiten muss.

## Die CQRS-Frage

ServiceDeskLite trennt Commands und Queries als unterschiedliche Typen mit unterschiedlichen Handlers - `CreateTicketHandler`, `GetTicketByIdHandler`, `UpdateTicketStatusHandler`, `GetTicketsHandler`. Das ist leichtgewichtiges CQRS: separate Read- und Write-Models auf Application-Layer-Ebene, mit expliziten Handler-Typen pro Use Case.

Es ist nicht die schwergewichtigere CQRS-Variante - keine MediatR-Request-Pipeline, keine separate Read-Datenbank, keine Event-Projektion. Die Read/Write-Boundary ist ohne die Infrastructure sichtbar. Leichtgewichtiges CQRS mit direkter Handler-Injektion ist ein anderer Punkt auf der Trade-off-Kurve als „vollständiges CQRS mit MediatR", und es lohnt sich, beides auseinanderzuhalten.

## Wann überdenken

Es gibt zwei konkrete Auslöser. Erstens: ein Cross-cutting Concern, der gleichmäßig auf jeden Handler-Aufruf angewendet werden muss - Authentication-Enforcement, Retry-Logik, Distributed-Tracing-Spans. An diesem Punkt verdient `IPipelineBehavior<,>` seine Existenz und MediatR wird die richtige Antwort. Zweitens: die Endpoint-Oberfläche wächst so weit, dass jeder Endpoint mehrere Handler orchestriert, was die Parameter-Liste unhandlich macht. An diesem Punkt beginnen Controller oder ein Dispatcher, das Zeremoniell zu rechtfertigen.

Keines davon ist bisher passiert. Der Neubewertungspunkt ist explizit benannt, nicht auf unbestimmte Zeit verschoben - das ADR für diese Entscheidung listet die Auslöser auf. Wenn die Komplexität kommt, ist der Migrationspfad klar: Endpoints rufen `ISender.Send(command)` statt `handler.HandleAsync(command, ct)` auf. Die Handler selbst ändern sich nicht.
