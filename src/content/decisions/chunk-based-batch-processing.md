---
title: "Chunk-basierte Batch-Verarbeitung"
description: "Warum Ingestor große Import-Dateien in 500-Zeilen-Chunks verarbeitet statt auf einmal - begrenzter Blast Radius, Partial-Success-Semantik und die Trade-offs, die damit kamen."
date: "2026-05-02"
readMin: 4
draft: false
---

Eine Delivery-Advice-Datei kann groß sein. Zehntausend Zeilen sind nicht unrealistisch. Zehntausend Zeilen in einer einzigen Database-Transaction zu verarbeiten hat ein spezifisches Failure-Profil: Wenn Zeile 9.847 fehlschlägt, geht alles verloren. Die Transaction rollt zurück, null Items werden importiert, und der Job muss von vorne beginnen.

Für eine Import-Pipeline ist das der falsche Trade-off. Chunk-basierte Verarbeitung tauscht Atomarität gegen einen begrenzten Blast Radius.

## Wie es funktioniert

Der `LineChunker` teilt die geparste Datei vor der Verarbeitung in fest dimensionierte Chunks auf:

```
10.000 Zeilen ÷ 500 pro Chunk = 20 Chunks
```

Jeder Chunk wird unabhängig verarbeitet:

```csharp
foreach (var chunk in chunks)
{
    try
    {
        var items = MapToDeliveryItems(chunk);
        await _context.DeliveryItems.AddRangeAsync(items, ct);
        await _context.SaveChangesAsync(ct);
        job.IncrementProcessed(items.Count);
    }
    catch (Exception ex)
    {
        job.IncrementFailed(chunk.Count);
        _logger.LogError(ex, "Chunk {N} failed", chunkIndex);
        // continue - do not rethrow
    }
}
```

Die entscheidende Zeile ist `// continue`. Ein fehlgeschlagener Chunk wird geloggt und gezählt, bricht aber die Pipeline nicht ab. Chunks 1–15 bleiben committed, auch wenn Chunk 16 fehlschlägt.

Der Job trackt drei Counter unabhängig: `TotalLines`, `ProcessedLines`, `FailedLines`. Wenn die Pipeline fertig ist, wird der finale State danach bestimmt, ob Zeilen fehlgeschlagen sind:

```csharp
job.TransitionTo(job.FailedLines > 0 ? JobStatus.PartiallySucceeded : JobStatus.Succeeded);
```

## Warum 500

Die Chunk-Größe ist konfigurierbar, aber 500 ist der Default. Benchmarks, die ich spät in der Entwicklung durchgeführt habe, zeigten, dass Chunk-Größen zwischen 200 und 1.000 für typischen Delivery-Advice-Content ähnlichen Throughput haben - der dominante Kostenfaktor ist der Round-Trip zu PostgreSQL pro Chunk, nicht die Chunk-Zusammenstellung. Unter 100 summiert sich der Overhead vieler kleiner Transactions. Über 2.000 wird der Memory-Druck durch das Laden eines großen Batches in den EF Change Tracker spürbar.

500 ist eine runde Zahl in der Mitte einer flachen Performance-Kurve. Wenn Profiling einen echten Bottleneck hier aufdecken würde, würde ich ihn tunen. In der Praxis dauert eine 10.000-Zeilen-Datei auf einer lokalen Postgres-Instanz so oder so etwa zwei Sekunden.

## PartiallySucceeded - Die Komplikation

`PartiallySucceeded` wurde hinzugefügt, um den Fall zu modellieren, in dem einige Zeilen erfolgreich sind und andere fehlschlagen. Es schien unkompliziert, bis ich Requeue bedacht habe.

Wenn ein Job `PartiallySucceeded` ist und der User ihn requeuet, was passiert dann? Das aktuelle Design verarbeitet die gesamte Datei von Grund auf neu. Die 9.500 Zeilen, die bereits erfolgreich waren, versuchen erneut zu inserieren. Das erfordert, dass die `DeliveryItem`-Erstellung idempotent ist - ein `DeliveryItem` zu inserieren, das bereits existiert, darf nicht fehlschlagen.

Die Lösung ist ein Upsert beim Reprocess, gekeyed auf `(job_id, article_number, supplier_ref)`. Das hält Requeue einfach auf Kosten etwas komplexerer Insert-Logik.

Die Alternative - tracken, welche Chunks erfolgreich waren, und nur fehlgeschlagene neu verarbeiten - ist effizienter, aber deutlich komplexer. Chunk-Level State Tracking, resumable Processing, angepasste Idempotency-Logik. Für den aktuellen Scale ist der einfachere Ansatz die richtige Entscheidung.

## Der Trade-off in klaren Worten

Chunk-Verarbeitung bringt:
- **Begrenzter Blast Radius** - ein Fehler betrifft maximal die Zeilen eines Chunks
- **Inkrementeller Fortschritt** - große Dateien machen sichtbaren Fortschritt statt stillzustehen
- **Partial-Success-Semantik** - einige committete Zeilen sind für die meisten Import-Szenarien besser als keine

Sie kostet:
- **Nicht-atomarer Import** - ein Job im `PartiallySucceeded`-State hat einige Zeilen in der Datenbank und andere nicht
- **Requeue-Komplexität** - Reprocessing muss auf Zeilen-Ebene idempotent sein, nicht nur auf Job-Ebene
- **Late-Stage Design-Änderungen** - `PartiallySucceeded` erzwang simultane Änderungen an State Machine, Requeue-Handler und Dead-Letter-Schema

Ob der Trade-off richtig ist, hängt davon ab, ob Partial Success in der Domain bedeutsam ist. Für Delivery Advice, wo ein Operator wissen will, welche Items angekommen sind, sind 9.500 von 10.000 erfolgreich importierten Zeilen deutlich besser als 0 von 10.000. Für einen Payment-Batch würde man eine ganz andere Semantik wollen.
