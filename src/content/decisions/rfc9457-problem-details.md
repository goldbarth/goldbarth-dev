---
title: "RFC 9457 als einheitlicher Error-Contract"
description: "Warum ServiceDeskLite ProblemDetails mit benutzerdefinierten Extension-Feldern als einziges Error-Format verwendet - und wie der Contract geteilt wird, ohne das Web an die API zu koppeln."
date: "2026-05-04"
readMin: 3
draft: false
---

Eine API, die für unterschiedliche Status-Codes unterschiedliche Error-Strukturen zurückgibt, zwingt jeden Client, separate Parsing-Logik pro Error-Fall zu pflegen. Eine 400 sieht so aus, eine 404 anders, eine unbehandelte Exception nochmal anders. Clients akkumulieren Branching-Logik, und jede Inkonsistenz im serverseitigen Format wird zu einem clientseitigen Bug.

ServiceDeskLite verpflichtet sich auf ein Error-Format über die gesamte API-Oberfläche: RFC 9457 `application/problem+json`, erweitert um vier zusätzliche Felder.

## Die Struktur

Jede Error-Response - ob sie von einem Handler-Result oder einer unbehandelten Exception stammt - hat dieselbe Struktur:

```json
{
  "status": 400,
  "title": "Validation failed",
  "instance": "/api/v1/tickets",
  "code": "create_ticket.title.required",
  "errorType": "validation",
  "traceId": "00-a1b2c3d4e5f6...-01"
}
```

`status`, `title` und `instance` sind Standard-RFC-9457-Felder. Die vier Ergänzungen sind `code`, `errorType`, `traceId` und ein optionales `meta` für strukturierten Field-Level-Context (verwendet beim Zurückgeben von Validation-Errors mit per-Field-Meldungen).

`code` ist der maschinenlesbare Diskriminator - ein stabiler, parsierbarer String, der dem Client genau sagt, was fehlgeschlagen ist, ohne dass er das menschenlesbare `title` parsen muss. `traceId` verknüpft die Response direkt mit einem strukturierten Log-Eintrag auf dem Server. `detail` ist in Production bewusst `null`, um interne Informationen nicht zu leaken.

## Einheitlich, nicht aufgeteilt

Sowohl Handler-Errors als auch unbehandelte Exceptions fließen durch dieselbe Factory. `ResultToProblemDetailsMapper` behandelt den Result-Pfad - er liest den `ErrorType` aus dem `ApplicationError` des Handlers und delegiert an `ApiProblemDetailsFactory`. `ApiExceptionHandler` behandelt den Exception-Pfad - er klassifiziert die Exception und delegiert an dieselbe Factory.

Es gibt kein sekundäres Error-Format irgendwo in der API-Oberfläche. Ein Client, der eine Error-Response parsen kann, kann alle parsen.

## Contract teilen ohne Kopplung

Der Blazor Web-Client muss Error-Responses parsen. Der offensichtliche Ansatz - das `Api`-Projekt aus `Web` referenzieren - würde die Architecture brechen: `Web` würde eine Dependency auf `Api` bekommen, ASP.NET Core-Belange einziehen und die Layer-Boundary zwischen ihnen zum Einsturz bringen.

Stattdessen werden die Extension-Feldnamen (`code`, `errorType`, `traceId`, `meta`) als Konstanten im `Contracts`-Projekt definiert, in einer `ProblemDetailsContract`-Klasse. Sowohl `Api` als auch `Web` referenzieren `Contracts`. Der Web-Client deserialisiert die Error-Response mithilfe dieser Konstanten und muss nie etwas darüber wissen, wie die API die Response intern aufbaut.

## Was der Standard bringt

ASP.NET Core versteht `application/problem+json` out of the box. OpenAPI-Tooling generiert korrekte Schema-Referenzen dafür. Test-Assertion-Libraries haben eingebaute Unterstützung dafür. Den Standard zu verwenden bedeutet weniger Glue-Code überall - das Format ist bereits in das Ecosystem integriert.

Das `traceId`-Feld ist die operativ nützlichste Erweiterung. Wenn ein User einen Fehler meldet, mappt die Trace-ID in der Response direkt auf einen Serilog-Log-Eintrag. Kein Raten, keine Timestamp-Korrelation, kein Durchsuchen von Logs nach dem richtigen Request.

## Der Preis

Eine neue Error-Kategorie hinzuzufügen ist eine Drei-Dateien-Änderung: `ErrorType` in `Application`, der HTTP-Mapping-Switch in `ResultToProblemDetailsMapper` und derselbe Switch in `ApiExceptionHandler`. Für das aktuelle Set von fünf Error-Typen ist das geringer Wartungsaufwand. Wenn das Set groß wird, wird die Mapping-Tabelle zu einem Koordinationspunkt.

Das `code`-Feld verlangt auch Disziplin. Es ist der stabile, clientseitig sichtbare Diskriminator - einen Code-Wert zu ändern ist ein Breaking Change für jeden Client, der darauf brancht. Die Naming Convention (`handler_name.field.reason`) hält Codes vorhersehbar und selbsterklärend, aber die Convention in einem größeren Team durchzusetzen bräuchte eine Linting-Regel, nicht nur einen README-Abschnitt.
