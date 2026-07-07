---
title: "Swappable Persistence als Port-Beweis"
description: "Warum ServiceDeskLite zwei vollständige Persistence-Implementierungen mitbringt - und warum der eingebaute InMemory Provider von EF Core keine davon ist."
date: "2026-05-04"
readMin: 4
draft: false
---

Clean Architecture macht eine Aussage: Adapter sind austauschbar. Swap die Persistence Layer und nichts oberhalb der Port-Boundary ändert sich. Die Aussage ist leicht in einem README zu schreiben. Der Weg, sie zu verifizieren, ist, den Swap tatsächlich durchzuführen, dieselben Tests gegen beide Implementierungen laufen zu lassen und zu sehen, ob sie bestehen.

ServiceDeskLite hat zwei vollständige Persistence-Implementierungen: eine auf EF Core und PostgreSQL basierend, eine selbst geschriebene gegen ein `ConcurrentDictionary`. Beide implementieren dieselben `ITicketRepository`- und `IUnitOfWork`-Interfaces. Beide laufen gegen dieselbe Integration-Test-Suite. Die aktive Implementierung wird beim Start durch einen Config-Wert ausgewählt - keine Code-Änderung, kein Recompile.

## Warum nicht der InMemory Provider von EF Core

EF Core liefert einen eingebauten `InMemory` Provider. Die offensichtliche Wahl für Tests und Development: keine Dateien, kein Migration-Schritt, schneller Start. Ich habe ihn aus einem Grund ausgeschlossen - er hält keine Transaction-Semantik ein.

Im `InMemory` Provider von EF Core sind Writes sofort sichtbar, ohne `SaveChanges` aufzurufen. Uncommitted Adds sind vom selben Context und von anderen Operationen im selben Prozess lesbar. Für eine Codebase, in der die Unit-of-Work Commit-Boundary eine explizite architektonische Entscheidung ist - wo `SaveChangesAsync` der einzige Punkt ist, an dem pending Writes dauerhaft werden - macht dieses Verhalten die InMemory- und PostgreSQL-Pfade fundamental unterschiedlich. Ein Test, der gegen den EF Core InMemory Provider besteht, testet nicht dieselbe Commit-Semantik, die PostgreSQL durchsetzt.

Wenn die zwei Provider sich unterschiedlich verhalten, ist der Swap nicht real. Es ist eine andere Applikation mit einem anderen Namen.

## Der selbst geschriebene Store

Die InMemory-Implementierung ist bewusst minimal. `InMemoryStore` ist ein Singleton `ConcurrentDictionary`, das committed Tickets hält. `InMemoryUnitOfWork` ist ein scoped Service, der eine `PendingAdds`-Liste hält. Die Commit-Operation wendet pending Adds atomar auf den Store an:

```csharp
public Task SaveChangesAsync(CancellationToken ct = default)
{
    foreach (var ticket in _pendingAdds)
        _store.Upsert(ticket);

    _pendingAdds.Clear();
    return Task.CompletedTask;
}
```

Vor dem Aufruf von `SaveChangesAsync` ist das hinzugefügte Ticket für die Read-Methoden des Repository unsichtbar. Danach ist es sichtbar. Das ist derselbe Contract, den EF Core mit einer echten Database-Transaction durchsetzt. Die Commit-Boundary bedeutet in beiden Implementierungen dasselbe.

## DI Lifetimes sind entscheidend

Die Lifetimes richtig zu setzen war subtiler als die Implementierung selbst:

| Type                       | Lifetime  | Grund                                           |
|----------------------------|-----------|-------------------------------------------------|
| `InMemoryStore`            | Singleton | Gemeinsamer In-Process State - überlebt Requests |
| `InMemoryUnitOfWork`       | Scoped    | Per-Request Pending-Add Buffer                  |
| `InMemoryTicketRepository` | Scoped    | Liest aus Singleton Store, referenziert scoped UoW |

Wäre `InMemoryStore` scoped, würden Daten zwischen Requests verschwinden. Wäre `InMemoryUnitOfWork` ein Singleton, würden pending Adds eines Requests in einen anderen überlaufen. Die Lifetimes codieren dieselben Annahmen wie eine Database-Transaction: gemeinsamer dauerhafter State (Singleton), per-Request transienter Buffer (Scoped).

## Fail-Fast Configuration

Der Composition Root liest `Persistence:Provider` und registriert entweder den PostgreSQL- oder den InMemory-Adapter. Jeder andere Wert als `"Postgres"` oder `"InMemory"` wirft beim Start eine `InvalidOperationException`:

```csharp
_ => throw new InvalidOperationException(
    $"Unknown persistence provider: '{provider}'. Valid values: 'Postgres', 'InMemory'.")
```

Kein stilles Fallback. Ein falsch konfiguriertes Deployment schlägt sofort mit einer klaren Meldung fehl, statt in einem unbeabsichtigten State zu starten und später mit einem verwirrenden Fehler zu scheitern.

## Was der Swap beweist

Die End-to-End-Test-Suite führt beide Provider per `[ProviderMatrix]` Attribute aus. Tests, die die Commit-Boundary abdecken - uncommitted Writes sind nicht lesbar, committed Writes sind es - laufen gegen beide Implementierungen und bestehen gegen beide.

Der Swap beweist, dass die Port-Boundary real ist. Nicht in Dokumentation behauptet - in laufenden Tests demonstriert. Das ist der Unterschied zwischen einer Architecture, die hält, und einer, die es nur behauptet.
