---
title: "Stark typisierte Domain-IDs"
description: "Warum ServiceDeskLite Guid in einem TicketId Record Struct kapselt - was der Compiler abfängt, was der Mapping-Overhead kostet und wie UUIDv7 es verbessert."
date: "2026-05-04"
readMin: 3
draft: false
---

Jedes Aggregate braucht einen Identifier. Die einfachste Wahl ist `Guid` - ein Typ, kein Aufwand, funktioniert überall. Das Problem wird sichtbar, sobald man zwei Aggregates hat.

Mit rohem `Guid` akzeptiert eine Methode, die eine Ticket-ID erwartet, stillschweigend jeden anderen `Guid` im Scope - eine Audit-Event-ID, eine Comment-ID, eine zukünftige User-ID. Der Compiler sieht `Guid`, die Methode erwartet `Guid`, alles kompiliert. Der Fehler taucht zur Laufzeit auf - meistens als verwirrende 404 oder als stille Daten-Assoziation über die falschen Records. Der Compiler hätte es abfangen können, bevor der Code lief - aber er hatte nichts zum Abfangen.

ServiceDeskLite verwendet ein eigenes `readonly record struct` für jede Aggregate-Identity.

## Der Typ

```csharp
public readonly record struct TicketId(Guid Value)
{
    public static TicketId New() => new(Guid.CreateVersion7());
}
```

Das ist die gesamte Implementierung. `readonly record struct` liefert strukturelle Gleichheit, Immutability, Stack-Allocation und ein sauberes `ToString()` gratis. `TicketId.New()` kapselt die ID-Generierungsstrategie - Aufrufer rufen `Guid.NewGuid()` oder `Guid.CreateVersion7()` nie direkt auf.

Eine `CommentId` dort zu übergeben, wo eine `TicketId` erwartet wird, ist jetzt ein Compile-Fehler. Kein Test-Fehler - ein Compile-Fehler. Der Unterschied ist entscheidend.

## Die UUIDv7-Entscheidung

Die ursprüngliche Implementierung verwendete `Guid.NewGuid()`, das zufällige (Version 4) UUIDs erzeugt. Zufällige UUIDs sind problematisch für B-Tree-Indexes: jedes neue Insert landet an einer zufälligen Position im Index, was mit der Zeit zu Page-Splits und Fragmentierung führt.

`Guid.CreateVersion7()` - verfügbar seit .NET 9 - generiert zeitgeordnete UUIDs. Die höchstwertigen Bits codieren einen Millisekunden-Timestamp, sodass neue IDs immer am Ende des Index angehängt werden, statt an beliebigen Positionen eingefügt zu werden. Für PostgreSQL mit einem UUID Primary Key verbessern zeitgeordnete IDs die Insert-Performance unter Last und machen die Index-Lokalität vorhersehbar.

Die Änderung war eine Zeile in `TicketId.New()`. Keine Consumer haben sich geändert. Das ist der Wert der Kapselung der Erstellungsstrategie.

## Layer Boundaries für ID-Typen

Nicht jeder Layer verwendet `TicketId`. Die HTTP-Boundary und der JSON-Contract verwenden rohes `Guid`:

| Layer          | Type used   | Hinweis                                            |
|----------------|-------------|----------------------------------------------------|
| Domain         | `TicketId`  | Autoritativer Typ                                  |
| Application    | `TicketId`  | Handler und Use-Case-DTOs verwenden den Domain-Typ |
| Infrastructure | `TicketId`  | Per `TicketIdConverter` auf `Guid`-Spalte gemappt  |
| API (HTTP)     | `Guid`      | Route-Constraint `{id:guid}`, am Einstiegspunkt konvertiert |
| Contracts      | `Guid`      | Response-DTOs verwenden `Guid` für sauberen JSON-Output |

Der API Endpoint empfängt ein `Guid` aus der Route und konvertiert es an der Boundary zu `new TicketId(id)`. Innerhalb der Application- und Domain-Layer erscheint nur `TicketId`. `Guid` leckt nie nach innen.

Der Contracts Layer verwendet `Guid` in Response-DTOs, weil `TicketId` als `{ "value": "..." }` serialisiert würde statt als einfacher String. Dort `Guid` zu verwenden bedeutet ein einfaches `Guid`-Feld in JSON - kein Custom Converter auf der Client-Seite nötig.

## Der Preis

Jedes neue Aggregate erfordert einen neuen ID-Typ, einen neuen EF Core Value Converter und einen `ValueGeneratedNever()`-Aufruf in der Entity-Konfiguration. Der Value Converter überbrückt den Typ zur Datenbank-Spalte und zurück:

```csharp
public class TicketIdConverter : ValueConverter<TicketId, Guid>
{
    public TicketIdConverter()
        : base(id => id.Value, value => new TicketId(value)) { }
}
```

Für ein einzelnes Aggregate ist das ein einmaliger Setup-Aufwand. Für fünf Aggregates sind es fünf Converter. Der Converter-Code ist mechanisch und kurz, aber er muss beim Einführen eines neuen Aggregates bedacht werden.

Der Mapping-Schritt an der HTTP-Boundary - `new TicketId(id)` im Endpoint - ist ebenfalls etwas, das bewusst getan werden muss. Es ist eine gute Erinnerung daran, dass die Boundary real ist - aber es ist dennoch Friction.

Ob der Trade-off es wert ist, hängt davon ab, wie viele Aggregates existieren und wie wichtig aggregate-übergreifende ID-Verwechslung in der spezifischen Domain ist. Für eine Codebase mit einem Aggregate ist der Nutzen bescheiden. Für eine Codebase mit zehn amortisiert sich das Abfangen einer ID-Verwechslung zur Compile-Zeit statt zur Laufzeit sofort.
