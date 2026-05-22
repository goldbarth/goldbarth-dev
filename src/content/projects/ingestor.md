---
title: "Ingestor"
description: "Eine .NET 10 Import-Pipeline, gebaut um Reliability: Outbox Pattern, strikte Domain State Machine, idempotente Verarbeitung und eine config-switchable Dispatch-Strategie — jede Design-Entscheidung auf Korrektheit und Nachvollziehbarkeit ausgerichtet."
date: "2026-05-02"
readMin: 6
draft: false
---

## Was es ist

Ingestor ist eine production-grade Import-Pipeline für die fiktive Fleetholm-Logistics-Domain. Sie nimmt Delivery-Advice-Dateien entgegen — CSV oder JSON —, validiert sie, verarbeitet sie in konfigurierbaren Chunks und protokolliert jeden Vorgang mit einem vollständigen Audit-Trail. Drei unabhängig deploybare Services: eine API für Uploads und Status-Queries, ein Background Worker für die Verarbeitung und ein Blazor Server Dashboard für den Betrieb. Gebaut auf .NET 10 mit PostgreSQL, optional erweitert mit RabbitMQ.

## Problem / Motivation

Ich wollte ein Projekt, das mich zwingt, distributed systems Probleme in realistischem Maßstab durchzudenken — keine Lehrbuch-Beispiele, sondern etwas mit echten Failure-Modes: concurrent Workers, die um Jobs konkurrieren, Dateien, die zu groß sind, um sie atomar zu verarbeiten, Infrastructure-Fehler, die einen Retry verdienen, versus solche, die sofort fehlschlagen sollten, und die Frage, wie man an einen Message Broker publiziert, ohne eine Race Condition mit der eigenen Datenbank zu erzeugen.

Jedes Production-System, über das ich gelesen habe, fügt irgendwann einen Outbox, eine State Machine und irgendeine Form von Idempotency hinzu. Ich wollte diese Dinge von Grund auf bauen und verstehen, *warum* jedes Pattern existiert — nicht nur, wie man es kopiert.

## Architecture / Wichtige Entscheidungen

Der Kern ist ein database-backed Outbox. Jobs und ihre Dispatch-Signale werden in derselben Transaction committed — keine distributed Transactions, kein „Ist die Message tatsächlich angekommen?"-Zweifel. Workers pollen mit `FOR UPDATE SKIP LOCKED`, um Jobs ohne Thundering-Herd-Problem zu beanspruchen. Der Trade-off: mehr Datenbank-Last als ein dedizierter Broker, dafür ein deutlich einfacheres Betriebsbild.

State wird durch eine explizite Domain State Machine mit neun benannten States verwaltet. Jede erlaubte Transition ist in einem `HashSet` aufgezählt; alles außerhalb wirft sofort eine `DomainException`. Keine stille State-Korruption, keine impliziten Fallback-Pfade.

Idempotency Keys werden als `SHA256(fileBytes + supplierCode)` berechnet — deterministisch, sicher für Client-Retries, durch einen Unique Index erzwungen. Doppelte Einreichungen geben HTTP 200 mit dem bestehenden Job zurück — ohne Rückfragen.

Error Handling verwendet einen `Result<T>`-Typ statt Exceptions über die Application Boundary. Jedes Ergebnis ist explizit. Infrastructure Exceptions werden als `Transient` oder `Permanent` klassifiziert: transiente Fehler retrien mit exponentiellem Backoff, permanente werden sofort dead-lettered.

Batch Processing teilt große Dateien in 500-Zeilen-Chunks auf, jeder atomar committed. Schlägt Chunk 16 von 20 fehl, bleiben Chunks 1–15 committed und der Job transitioniert zu `PartiallySucceeded`, statt alles zurückzurollen. Operativ nützlicher als All-or-Nothing bei großen Importen.

RabbitMQ Dispatch — wenn konfiguriert — publiziert erst *nach* dem Database-Commit, über eine Post-Commit-Callback-Registry. Das eliminiert die klassische Race Condition, bei der ein Consumer eine Message verarbeitet, bevor die produzierende Transaction für die Datenbank sichtbar ist.

→ [Outbox vs. Message Broker](/decisions/outbox-vs-message-broker)  
→ [State Machine mit expliziten Transitions](/decisions/state-machine-explicit-transitions)  
→ [Idempotency Key Strategy](/decisions/idempotency-key-strategy)  
→ [Result Pattern statt Exceptions](/decisions/result-pattern-over-exceptions)  
→ [Chunk-basierte Batch-Verarbeitung](/decisions/chunk-based-batch-processing)

## Herausforderungen

Das härteste Problem war eines, das die Test-Suite nicht finden konnte.

Der `RabbitMqJobDispatcher` rief `BasicPublishAsync` ursprünglich innerhalb von `DispatchAsync` auf — eager, bevor die Database-Transaction committed hatte. Der Handler rief sie in dieser Reihenfolge auf:

```csharp
await jobRepository.AddAsync(job, payload, ct);
await jobDispatcher.DispatchAsync(job, ct);   // publishes immediately
await unitOfWork.SaveChangesAsync(ct);         // job written after message already sent
```

In Unit-Tests: grün. In Integration-Tests: grün. Das Race-Window — zwischen dem Eintreffen der Message in der Queue und dem Abschluss des Database-Commits — ist unter normalen Bedingungen Mikrosekunden breit. Jeder Test bestand.

Die Benchmarks haben es aufgedeckt. Unter Last, mit dem RabbitMQ Worker im selben Prozess, konsumierte der Worker die Message, bevor `SaveChangesAsync` abgeschlossen war. `GetByIdAsync` gab `null` zurück. Die Message wurde genackt, zum Dead-Letter-Exchange geroutet, und der Job steckte permanent in `Received` fest. Reproduzierbar, aber nur bei Benchmark-Throughput.

Die Ursache war kein Call-Site-Ordering-Bug — es war ein Design-Level-Defekt. Die `IJobDispatcher`-Abstraktion sagte nichts darüber, *wann* Dispatch relativ zum Database-Commit wirkt. `DatabaseJobDispatcher` war lazy (schreibt in den EF Change Tracker, committed mit dem Job). `RabbitMqJobDispatcher` war eager (feuert sofort). Zwei Implementierungen, dasselbe Interface, entgegengesetzte Timing-Semantik. Die Handler-Aufrufe umzuordnen hätte das Symptom behoben, aber `DatabaseJobDispatcher` gebrochen, dessen `OutboxEntry`-Write atomar mit dem Job committed werden muss.

Der Fix war ein `IAfterSaveCallbackRegistry` — ein internes Infrastructure-Interface, das `EfUnitOfWork` neben `IUnitOfWork` implementiert. `RabbitMqJobDispatcher` registriert das Publish als Callback; es feuert nach dem Abschluss von `SaveChangesAsync`, niemals davor. Der Handler brauchte keine Änderungen.

Die Lektion war nicht über RabbitMQ. Sie handelte davon, was Tests finden können und was nicht. Alle Unit- und Integration-Tests waren auf Korrektheit unter normalen Bedingungen ausgelegt. Keiner davon hat die Timing-Beziehung zwischen Dispatch und Commit bei echter Concurrency geprüft. Die Benchmarks waren nicht geschrieben, um Bugs zu finden — aber sie haben es getan.

Der partial Batch-Failure-Fall war der andere bedeutende Reibungspunkt. Das Outbox- und das Idempotency-System wurden unabhängig voneinander entworfen; Requeue idempotent *über partially succeeded Jobs hinweg* zu machen, erforderte, beide zu überarbeiten. Der `PartiallySucceeded`-State brauchte am Ende eigene Transition-Regeln in der State Machine — und ein eigenes Dead-Letter-Snapshot-Format.

## Takeaways

Die Patterns hier — Outbox, State Machine, Result-Typ, Idempotency — sind einzeln gut bekannt. Der Wert des Projekts lag darin zu verstehen, wie sie interagieren. Die State Machine hat die Outbox-Recovery-Logik offensichtlich gemacht. Der Result-Typ hat die Error-Klassifizierung sauber gehalten. Der Idempotency Key hat das Chunk-Retry-Problem handhabbar gemacht.

Würde ich es nochmal bauen, würde ich den `PartiallySucceeded`-State früher entwerfen. Ihn als Nachgedanken zu behandeln hat Welleneffekte durch die State Machine, die Retry-Logik und das Dead-Letter-Schema erzeugt. Und ich würde die Benchmark-Suite vor dem Production-Code schreiben; die `BenchmarkDotNet`-Benchmarks, die ich spät hinzugefügt habe, haben eine Chunk-Size-Sensitivität offenbart, die ich sonst nicht gefunden hätte.
