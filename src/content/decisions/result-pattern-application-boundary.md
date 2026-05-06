---
title: "Result Pattern an der Application Boundary"
description: "Wie ServiceDeskLite einen expliziten Result-Typ verwendet, um Handler-Ergebnisse sichtbar zu machen — und wo DomainExceptions noch hingehören."
date: "2026-05-04"
readMin: 4
draft: false
---

Das Standard-Error-Handling-Modell in C# sind Exceptions. Eine Methode gibt bei Erfolg einen Wert zurück und wirft bei Misserfolg. Das Problem ist, dass „Misserfolg" viel abdeckt. Ein nicht gefundenes Ticket ist Misserfolg. Ein fehlendes Titel-Feld ist Misserfolg. Eine ungültige Status-Transition ist Misserfolg. Eine abgebrochene Datenbankverbindung auch.

Diese vier Fälle verlangen vier unterschiedliche HTTP-Status-Codes. Sie repräsentieren fundamental unterschiedliche Arten von Problemen. Aber von der Call-Site aus sehen sie alle gleich aus — eine geworfene Exception, die der Aufrufer entweder spezifisch fängt oder propagieren lässt.

ServiceDeskLite verwendet stattdessen einen `Result<T>`-Typ. Jeder Handler gibt `Result` zurück (für Void-Operationen) oder `Result<T>` (wenn es einen Wert gibt). Erfolg und Misserfolg sind beide im Return-Typ explizit.

## Was der Typ enthält

```csharp
// void operation
Result result = await handler.HandleAsync(command, ct);

// value operation
Result<TicketResponse> result = await handler.HandleAsync(query, ct);
```

Ein Failure-Result trägt einen `ApplicationError` mit drei Feldern: einen maschinenlesbaren `code` (z.B. `"create_ticket.title.required"`), eine menschenlesbare `message` und ein `ErrorType`-Enum, das das HTTP-Status-Mapping steuert:

| ErrorType         | HTTP-Status |
|-------------------|-------------|
| `Validation`      | 400         |
| `DomainViolation` | 400         |
| `NotFound`        | 404         |
| `Conflict`        | 409         |
| `Unexpected`      | 500         |

Der API Layer hat einen Mapper — `ResultToProblemDetailsMapper` — der den `ErrorType` liest und die korrekte `ProblemDetails`-Response erzeugt. Keine Exception-Filter-Chain, kein `catch (SpecificException)` über Endpoints verteilt. Eine Stelle, ein Switch, fertig.

## Die DomainException-Boundary

Der Domain Layer verwendet weiterhin Exceptions, um Invarianten durchzusetzen — das ist seine Aufgabe. Ein Ticket im `Closed`-State, das einen `Reopen`-Command erhält, wirft sofort eine `DomainException`, bevor Persistence berührt wird.

Der Application Handler fängt sie genau einmal:

```csharp
try
{
    ticket.Reopen();
}
catch (DomainException ex)
{
    return Result.DomainViolation(DomainExceptionMapper.Map(ex));
}
```

Nach diesem Catch erreicht keine Domain-Exception den HTTP Layer. Der Handler konvertiert sie in ein `Result.DomainViolation`, das die API auf HTTP 400 mappt. Die Domain kann ihre Regeln aggressiv mit Exceptions durchsetzen; die Application Boundary konvertiert diese Exceptions in strukturierte Ergebnisse, bevor sie sie verlassen.

## Was nie gefangen wird

`OperationCanceledException` wird von Handlers explizit nicht gefangen. Request-Abbruch ist kein Business-Fehler — es ist Infrastructure. Wenn der Client mitten im Request die Verbindung trennt, propagiert die Exception zum Exception-Handler der API, der sie separat von Application-Errors klassifiziert.

Das ist eine bewusste Lücke in der Error-Handling-Oberfläche des Handlers. `OperationCanceledException` in einem Handler zu fangen würde Client-Disconnects still verschlucken, sie als Application-Errors maskieren und irreführende Log-Einträge schreiben. Die Regel ist einfach: Handler fangen `DomainException`, sonst nichts.

## Der Preis

Jeder Error-Fall braucht ein explizites Return. Keine implizite Propagation — wenn ein Validation-Check fehlschlägt, muss der Handler an dieser Stelle `Result.Validation(...)` zurückgeben. Für Handler mit mehreren Validation-Steps wird die Struktur repetitiv:

```csharp
var validationResult = Validate(command);
if (!validationResult.IsSuccess) return validationResult;

var ticket = await _repository.FindAsync(id, ct);
if (ticket is null) return Result.NotFound("ticket.not_found", "Ticket not found.");
```

Mehr Zeilen als eine Version, die wirft und Middleware fangen lässt. Aber die Failure-Oberfläche ist bei jedem Schritt sichtbar. Den Handler zu lesen sagt einem genau, was schiefgehen kann und wo.

## Was das in Tests bringt

Handler-Tests brauchen kein try/catch. Sie rufen `HandleAsync` auf und assertieren auf dem Result:

```csharp
var result = await handler.HandleAsync(command, ct);

Assert.False(result.IsSuccess);
Assert.Equal(ErrorType.Validation, result.Error.Type);
Assert.Equal("create_ticket.title.required", result.Error.Code);
```

Kein `Assert.Throws`, keine Exception-Inspektion, kein implizites Test-Verhalten durch ungefangene Exceptions. Der Test liest sich wie eine Spezifikation dessen, was der Handler unter jeder Bedingung zurückgibt.
