---
title: "Result Pattern statt Exceptions"
description: "Warum Ingestor einen Result<T>-Typ statt Exceptions an Application-Boundaries verwendet — was er explizit macht, was er kostet und wo Exceptions noch hingehören."
date: "2026-05-02"
readMin: 3
draft: false
---

Exceptions sind ein Control-Flow-Mechanismus, den C# für Fehler verwendet. Sie sind auch in Method-Signaturen unsichtbar. Eine Methode, die `ImportJob` zurückgibt, könnte `ValidationException`, `NotFoundException`, `ConflictException` werfen oder gar nichts — man kann es der Signatur nicht ansehen. Man erfährt es zur Laufzeit, beim Lesen der Implementierung oder beim Anschauen der Tests, falls sie existieren.

Für eine Pipeline, wo jeder Handler auf mehrere unterschiedliche Arten fehlschlagen kann, fühlte sich das wie der falsche Trade-off an.

## Was Result\<T\> macht

`Result<T>` macht Fehler im Return-Typ explizit:

```csharp
public sealed class Result<T>
{
    public bool IsSuccess { get; }
    public T? Value { get; }
    public ApplicationError? Error { get; }

    public static Result<T> Success(T value) => ...;
    public static Result<T> Conflict(string code, string message) => ...;
    public static Result<T> NotFound(string code, string message) => ...;
    public static Result<T> Validation(string code, string message) => ...;
}
```

Ein Handler, der einen Job zurückgeben oder mit einem Conflict fehlschlagen kann, hat die Signatur:

```csharp
Task<Result<ImportJobResponse>> Handle(CreateImportJobCommand command, CancellationToken ct);
```

Der Aufrufer kann den Failure-Fall nicht ignorieren, ohne es bewusst zu tun. Kein unsichtbarer Exception-Pfad.

`ApplicationError` trägt ein `ErrorType`-Enum — `Validation | Conflict | NotFound | Unexpected` — das der API Layer direkt auf HTTP-Status-Codes mappt. Das Mapping ist an einer Stelle zentralisiert, nicht über Exception-Filter verteilt.

```csharp
return result.Error.Type switch
{
    ErrorType.Validation  => Results.UnprocessableEntity(problem),
    ErrorType.Conflict    => Results.Conflict(problem),
    ErrorType.NotFound    => Results.NotFound(problem),
    _                     => Results.Problem(problem)
};
```

## Was es kostet

Das Pattern ist bewusst einfach — kein `Bind`, kein `Map`, kein monadisches Chaining. Das bedeutet, dass Handler eine gewisse repetitive Struktur haben:

```csharp
var jobResult = await _repository.FindAsync(id, ct);
if (!jobResult.IsSuccess) return jobResult;

var validationResult = Validate(jobResult.Value);
if (!validationResult.IsSuccess) return validationResult;
```

Mehr Zeilen als eine Fluent-Chain. Lesbarer für jeden, der noch keine funktionalen Result-Typen verwendet hat. Ich habe mich hier für Lesbarkeit entschieden.

Der andere Preis: `Result<T>` ist für erwartete Failure-Modes — die Error-Cases, die Teil des normalen Betriebs sind. Nicht für alles. Datenbankverbindungsfehler, unbehandelte Exceptions, Bugs — die werfen immer noch. Der Unterschied ist entscheidend: `Result` für Business-Logic-Fehler, Exceptions für Infrastructure-Fehler und Programmierfehler.

## Wo Exceptions noch leben

Der Infrastructure Layer wirft. `NpgsqlException` bei Verbindungsfehlern, `TimeoutException` bei Query-Timeouts — diese propagieren als Exceptions und werden vom Retry-Orchestrator des Workers gefangen. Der `IExceptionClassifier`-Service klassifiziert sie dann als `Transient` oder `Permanent`, was bestimmt, ob retried oder dead-lettered wird.

Das ist die richtige Aufteilung. Infrastructure-Fehler sind tatsächlich exceptional — unerwartet, nicht Teil des Business-Logic-Contracts. Der Application Layer muss sie nicht behandeln; die Worker-Orchestrierung tut es. Sie in `Result<T>` einzumischen würde jeden Handler mit Infrastructure-Awareness verschmutzen.

## Der Nettoeffekt

Handler lesen sich wie eine Spezifikation dessen, was schiefgehen kann:

```csharp
// Returns: the created job, or Conflict if duplicate, or Validation if bad input
Task<Result<ImportJobResponse>> Handle(CreateImportJobCommand command, CancellationToken ct);
```

Der API Layer macht eine Sache: Error-Typen auf HTTP-Codes mappen. Keine Exception-Filter, kein `catch (SpecificException)` in Controllern, keine Überraschungen durch Exception-Hierarchy-Mismatches.

Ob es das wert ist, hängt vom Team-Kontext ab. Für ein Solo-Portfolio-Projekt ist die Explizitheit ihre eigene Belohnung — sie hat mich gezwungen, jeden Failure-Mode durchzudenken, bevor ich die Implementierung schrieb.
