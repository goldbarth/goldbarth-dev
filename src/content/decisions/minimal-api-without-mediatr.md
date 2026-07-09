---
title: "Minimal API ohne MediatR"
description: "Warum ServiceDeskLite Handler direkt in Endpoints injiziert statt über einen Mediator zu dispatchen - und wann diese Entscheidung überdacht werden sollte."
date: "2026-05-04"
readMin: 3
draft: false
---

Wenn ein Request ankommt, muss irgendetwas den Code aufrufen, der die Arbeit erledigt. Man kann diesen Aufruf direkt hinschreiben. Oder man legt eine Vermittlungsschicht dazwischen, die selbst herausfindet, welcher Code zuständig ist. In .NET heißt diese Schicht meistens MediatR.

Für ServiceDeskLite habe ich den direkten Weg gewählt: Minimal API, und kein Mediator. Die Frage, mit der ich angefangen habe, war nicht, ob MediatR gut ist, sondern was mir fehlt, wenn ich es weglasse.

## Was MediatR hinzufügen würde

MediatRs Kernwert ist `IPipelineBehavior<,>`. Cross-cutting Concerns, also jeden Handler-Aufruf loggen, Validation vor jedem Command ausführen, Authentication durchsetzen, lassen sich einmal als Behaviour ausdrücken und auf jeden Handler-Aufruf anwenden, ohne die Call-Site zu berühren.

Ohne MediatR leben diese Concerns auf Middleware-Ebene oder werden pro Handler behandelt. Für ServiceDeskLites aktuelle Oberfläche, vier Ticket-Endpoints und ein Aggregate, gibt es keine Cross-cutting Handler-Concerns, die eine Pipeline brauchen. Logging übernimmt Serilog auf Middleware-Ebene. Validation liegt pro Handler. Authentication ist nicht im Scope.

Solange nichts existiert, das in die Pipeline gehört, bringt MediatR mir hier nichts ein. Der Registration Layer, die `ISender`-Abstraktion, das Assembly-Scanning: alles Aufwand ohne aktuellen Gegenwert.

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

Die Call-Site ist explizit. Man liest einen Endpoint und weiß genau, welchen Handler er aufruft. Es gibt keine Layer von convention-basiertem Dispatch, durch die man sich durcharbeiten muss.

## Die CQRS-Frage

ServiceDeskLite trennt Commands und Queries als unterschiedliche Typen mit unterschiedlichen Handlers: `CreateTicketHandler`, `GetTicketByIdHandler`, `UpdateTicketStatusHandler`, `GetTicketsHandler`. Das ist leichtgewichtiges CQRS, also separate Read- und Write-Models auf Application-Layer-Ebene, mit expliziten Handler-Typen pro Use Case.

Es ist nicht die schwergewichtigere Variante mit MediatR-Request-Pipeline, separater Read-Datenbank und Event-Projektion. Die Read/Write-Boundary ist hier auch ohne diese Infrastructure sichtbar. Leichtgewichtiges CQRS mit direkter Handler-Injektion liegt auf derselben Trade-off-Kurve wie „vollständiges CQRS mit MediatR", nur an einem anderen Punkt. Ich halte die beiden gern auseinander.

## Wann überdenken

Es gibt zwei konkrete Auslöser. Erstens ein Cross-cutting Concern, der gleichmäßig auf jeden Handler-Aufruf angewendet werden muss: Authentication-Enforcement, Retry-Logik, Distributed-Tracing-Spans. An diesem Punkt verdient `IPipelineBehavior<,>` seine Existenz und MediatR wird die richtige Antwort. Zweitens eine Endpoint-Oberfläche, die so weit wächst, dass jeder Endpoint mehrere Handler orchestriert und die Parameter-Liste unhandlich wird. Dann rechtfertigt der zusätzliche Aufbau eines Controllers oder Dispatchers sich von selbst.

Keines davon ist bisher passiert. Der Neubewertungspunkt ist explizit benannt und nicht auf unbestimmte Zeit verschoben, das ADR für diese Entscheidung listet die Auslöser auf. Wenn die Komplexität kommt, ist der Migrationspfad klar: Endpoints rufen `ISender.Send(command)` statt `handler.HandleAsync(command, ct)` auf. Die Handler selbst ändern sich nicht.
