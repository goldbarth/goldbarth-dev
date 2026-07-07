---
title: "SELECT FOR UPDATE bei konkurrenten Tree-Mutationen"
description: "Warum MetricGate Row-Level Locks statt Applikations-Locks verwendet, um konkurrierende Reparent-Operationen im Mandantenbaum zu serialisieren."
date: "2026-05-22T11:15:00"
readMin: 4
draft: false
---

Eine Move-Operation im Mandantenbaum ist keine atomare Aktion - sie ist eine Sequenz: Tenant laden, Elternkette prüfen, Tiefe und Zyklen validieren, dann den neuen Parent schreiben. Zwischen dem Lesen und dem Schreiben liegt ein Fenster.

Zwei gleichzeitige Requests, die denselben Tenant verschieben, können dieses Fenster so durchlaufen:

```
Thread A: lädt Reseller-X, Tiefe = 2 ✓
Thread B: lädt Reseller-X, Tiefe = 2 ✓
Thread A: validiert neue Position, Constraints ok
Thread B: validiert neue Position, Constraints ok
Thread A: schreibt neuen Parent → committed
Thread B: schreibt neuen Parent → committed (auf veralteter Basis)
```

Thread B hat seinen Validierungsstand auf einem Snapshot gemacht, der nach Thread As Commit nicht mehr gilt. Das Ergebnis ist eine Hierarchie, die Constraints verletzt, die beide Threads einzeln als erfüllt betrachtet haben.

Die Constraints sind nicht trivial: Tiefenprüfung und Zyklenerkennung laufen über eine `WITH RECURSIVE`-CTE gegen den aktuellen Datenbankzustand. Beide Threads haben denselben Zustand gelesen - aber einer von beiden arbeitet nach dem Commit des anderen auf einer falschen Basis.

## Warum kein Applikations-Lock

Der naheliegende Gedanke: ein `SemaphoreSlim` oder `ConcurrentDictionary<TenantId, SemaphoreSlim>` auf Instanzebene. Das Problem ist der Scope. Jeder HTTP-Request bekommt einen eigenen DI-Scope; ein Singleton-Lock würde funktionieren - aber nur für eine einzige Prozessinstanz. Zwei API-Pods teilen keinen Speicher.

Ein verteilter Lock (Redis, etcd) würde das Problem lösen, aber er tauscht eine Race Condition gegen eine externe Abhängigkeit im kritischen Pfad: Was passiert, wenn Redis kurz nicht erreichbar ist? Für eine Low-Traffic-Operation wie einen Tenant-Move ist das ein unverhältnismäßiger Trade-off.

Die Datenbank hat Row-Level Locks bereits eingebaut.

## SELECT FOR UPDATE

`FindAndLockForUpdateAsync` beginnt eine Transaktion und liest den Tenant mit einem expliziten Lock:

```csharp
public async Task<Tenant?> FindAndLockForUpdateAsync(TenantId id, CancellationToken ct = default)
{
    await db.Database.BeginTransactionAsync(ct);

    return await db.Tenants
        .FromSqlInterpolated($"""
            SELECT * FROM "Tenants" WHERE "Id" = {id.Value} FOR UPDATE
            """)
        .FirstOrDefaultAsync(ct);
}
```

`FOR UPDATE` teilt PostgreSQL mit: dieser Row wird modifiziert. PostgreSQL setzt einen exklusiven Row-Lock auf die betroffene Zeile. Ein zweiter Request, der denselben Tenant mit `FOR UPDATE` liest, blockiert - nicht mit einem Fehler, sondern mit einem Wait - bis die erste Transaktion committed oder zurückrollt.

Das ist der Unterschied zu einem Applikations-Lock: der Lock liegt in derselben Transaktion wie der spätere Write. Er kann nicht ablaufen, ohne dass die Transaktion endet, und er gilt für alle Verbindungen zur Datenbank, unabhängig von Prozess oder Host.

## Der Lifecycle im Service

`TenantMoveService` zeigt, wie Lock-Erwerb, Validierung und Commit zusammenspielen:

```csharp
public async Task MoveAsync(Guid tenantId, MoveTenantRequest request, CancellationToken ct = default)
{
    var id = new TenantId(tenantId);
    var newParentId = new TenantId(request.NewParentId);

    var tenant = await repository.FindAndLockForUpdateAsync(id, ct)
        ?? throw new NotFoundException("Tenant", tenantId.ToString());

    var newParent = await repository.FindAsync(newParentId, ct)
        ?? throw new NotFoundException("Tenant", request.NewParentId.ToString());

    await hierarchyService.ValidateParentAssignmentAsync(
        id, tenant.Type,
        newParentId, newParent.Type,
        ct);

    tenant.ChangeParent(newParentId);

    await repository.CommitMoveAsync(ct);
}
```

Lock-Erwerb passiert als erstes - bevor Validierung, bevor der neue Parent geladen wird. Das ist entscheidend. Würde die Validierung vor dem Lock laufen, würde sie auf einem Snapshot laufen, der bis zum eigentlichen Write veralten kann.

`CommitMoveAsync` schreibt und committed in einem Schritt:

```csharp
public async Task CommitMoveAsync(CancellationToken ct = default)
{
    await db.SaveChangesAsync(ct);
    await db.Database.CommitTransactionAsync(ct);
}
```

Mit dem Commit wird der Row-Lock freigegeben. Ein blockierender zweiter Request sieht jetzt den committed Zustand - seine anschließende Validierung läuft gegen die neue Hierarchie.

## Das Repository-Interface als Protokoll

`ITenantRepository` definiert die beiden Methoden als bewusstes Paar:

```csharp
Task<Tenant?> FindAndLockForUpdateAsync(TenantId id, CancellationToken ct = default);
Task CommitMoveAsync(CancellationToken ct = default);
```

Das ist eine Abstraktion mit implizitem Zustand: wer `FindAndLockForUpdateAsync` aufruft, hat eine offene Transaktion und muss `CommitMoveAsync` aufrufen. Ein Caller, der das vergisst, hält den Lock bis zum Connection-Timeout.

Das ist ein bewusster Trade-off gegen Einfachheit. Die Alternative - eine `MoveAsync(TenantId, TenantId)`-Methode im Repository, die den gesamten Lock-Validate-Commit-Zyklus intern kapselt - würde die Validierungslogik aus dem Application Layer ins Repository ziehen. Das würde gegen die Clean Architecture-Grenze verstoßen: Repository kennt keine Domain Rules.

## Trade-offs

`FOR UPDATE` blockiert, bis die erste Transaktion endet. Für Move-Operationen - selten, user-initiiert, kurze Transaktionen - ist das akzeptabel. Für hochfrequente Writes auf denselben Rows wäre es ein Bottleneck.

Deadlocks sind möglich, wenn zwei Transaktionen gegenseitig aufeinander warten - Transaction A hält Lock auf Row 1 und wartet auf Row 2; Transaction B hält Lock auf Row 2 und wartet auf Row 1. PostgreSQL erkennt Deadlocks und terminiert eine der Transaktionen mit einem Fehler. Die aktuelle Implementierung fängt das nicht explizit ab; ein Deadlock würde als unhandled Exception an den Caller durchschlagen.

Das Risiko ist gering: MetricGate sperrt nur die Row des zu verschiebenden Tenants, nicht die des Ziel-Parents. Zwei Moves können nur dann deadlocken, wenn sie gegenseitig die Zielposition des anderen verschieben - ein konstruierter Sonderfall, kein normaler Betriebsfall.

## Was ich ändern würde

Der Lock deckt nur den Tenant, der verschoben wird. Ein subtileres Race Condition bleibt: der neue Parent könnte zwischen dem `FindAsync` und dem `CommitMoveAsync` selbst verschoben werden. Das würde die Tiefenprüfung auf einem veralteten Snapshot laufen lassen.

Die saubere Lösung wäre, den neuen Parent ebenfalls mit `FOR UPDATE` zu lesen - oder einen Advisory Lock auf die gesamte Hierarchy-Mutation zu setzen. Für die aktuelle Anforderungslage (ein Tenant-Baum, niedrige Konkurrenz) ist das Overengineering. Wenn MetricGate mehrere gleichzeitige Tree-Reshapes unter Last zeigt, wäre das der erste Ort, den ich anfassen würde.