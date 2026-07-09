---
title: "Outbox vs. Message Broker"
description: "Warum Ingestor mit einem database-backed Outbox statt RabbitMQ startet - und was das umschaltbare Dispatcher-Pattern später ermöglicht."
date: "2026-05-02"
readMin: 4
draft: false
---

Die Frage, die den gesamten Dispatch Layer prägt: Wenn ein Job erstellt wird, wie erfährt der Worker davon?

Die offensichtliche Antwort ist ein Message Broker. Message publizieren, Worker subscribt, fertig. Aber diese Antwort kommt mit einer versteckten Annahme: Der Database-Write und das Broker-Publish passieren in zwei getrennten Operationen. Wenn die Database committed und das Broker-Publish fehlschlägt - oder schlimmer, der Prozess zwischen den beiden abstürzt - ist das Signal verloren. Der Job existiert in der Datenbank im `Received`-Status, aber nichts wird ihn je aufnehmen.

## Das Problem mit "Publish Then Commit"

Ein naheliegender Ausweg: optimistisch an den Broker publizieren, und wenn der Broker fehlschlägt, die Database-Transaction zurückrollen. Das hilft nur, solange der Rollback selbst garantiert ist, und das ist er nicht. Wenn das Broker-Publish erfolgreich ist, aber der Database-Commit fehlschlägt, empfängt der Worker eine Message für einen Job, der nicht existiert. Man hat jetzt Phantom-Arbeit publiziert.

Das Dual-Write-Problem hat keine saubere Lösung, ohne entweder Eventual Consistency zu akzeptieren oder einen Koordinationsmechanismus hinzuzufügen. Für eine Pipeline, in der jeder Job genau einmal verarbeitet werden muss, ist beides nicht akzeptabel.

## Warum der Outbox

Das Outbox Pattern umgeht Dual-Write, indem es das Dispatch-Signal zum Teil der Database-Transaction selbst macht. Wenn ein Job erstellt wird, wird ein `OutboxEntry` in derselben Transaction eingefügt. Wenn die Transaction committed, existieren sowohl der Job als auch sein Dispatch-Signal atomar. Wenn sie zurückrollt, keines von beiden.

```
BEGIN;
  INSERT INTO import_jobs (...);
  INSERT INTO outbox_entries (job_id, status = 'Pending', ...);
COMMIT;
```

Der Worker pollt dann `outbox_entries` mit `FOR UPDATE SKIP LOCKED`:

```sql
SELECT * FROM outbox_entries
WHERE status = 'Pending' AND scheduled_for <= NOW()
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

`SKIP LOCKED` ist das entscheidende Detail. Wenn ein anderer Worker einen Eintrag bereits beansprucht hat, überspringt diese Query ihn statt zu blockieren. Mehrere Worker-Instanzen können gleichzeitig pollen, ohne Thundering-Herd-Problem und ohne Distributed Lock.

## Die Trade-offs

Der Outbox kostet etwas. Polling fügt Database-Last hinzu - jede Worker-Instanz führt einen Query nach Plan aus, auch wenn nichts zu verarbeiten ist. Für Ingestors Workload (Delivery-Advice-Imports, keine sub-millisekunden Event-Streams) ist das in Ordnung. Für ein System, das tausende Events pro Sekunde verarbeitet, nicht.

Das Latency-Profil ist auch anders. Ein Broker liefert nahezu sofort. Ein Outbox-Poll-Intervall führt eine Verzögerung ein - Ingestor pollt alle zwei Sekunden. Für eine Import-Pipeline ist eine zwei-sekündige Pickup-Verzögerung unsichtbar. Für ein nutzerseitiges Benachrichtigungssystem wäre sie spürbar.

## Umschaltbar machen

Statt die Outbox-Strategie fest zu kodieren, führt Ingestor eine `IJobDispatcher`-Abstraktion ein:

```csharp
public interface IJobDispatcher
{
    Task DispatchAsync(JobId jobId, CancellationToken ct);
}
```

Zwei Implementierungen: `OutboxJobDispatcher` (schreibt in die Outbox-Tabelle) und `RabbitMqJobDispatcher` (publiziert an einen Exchange). Die aktive Strategie wird über Konfiguration ausgewählt:

```json
"Dispatch": { "Strategy": "Database" }
```

Zu `RabbitMQ` zu wechseln erfordert keine Code-Änderungen, nur einen Config-Wert und den laufenden Broker.

Der RabbitMQ Dispatcher fügt eine zusätzliche Komplikation hinzu: *vor* dem Database-Commit zu publizieren erzeugt dieselbe Race Condition, die wir vermeiden wollten. Die Lösung ist ein Post-Commit-Callback - der Dispatcher registriert eine Publish-Aktion, die nach dem Abschluss von `SaveChangesAsync()` feuert, nicht davor. Die Message kann nicht konsumiert werden, bevor der Job in der Datenbank sichtbar ist.

## Was ich ändern würde

Der Outbox funktioniert gut als Ausgangspunkt. Würde ich für höheren Throughput bauen, würde ich wahrscheinlich einen dedizierten Outbox-Relay-Prozess hinzufügen - etwas, das die Datenbank tailed und Einträge an einen Broker weiterleitet, statt Workers direkt pollen zu lassen. Aber für ein Portfolio-Projekt, das das Pattern demonstriert, ist direktes Polling einfacher und transparenter.

Die `IJobDispatcher`-Abstraktion war den Aufwand wert. „Das System funktioniert ohne einen Broker - füge einen hinzu, wenn du Skalierung brauchst" erklären zu können ist eine bessere Geschichte als „benötigt RabbitMQ, um überhaupt zu laufen."
