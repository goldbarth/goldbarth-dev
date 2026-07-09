---
title: "State Machine mit expliziten Transitions"
description: "Wie eine explizite Domain State Machine mit neun States und einer aufgezählten Transition-Tabelle stille State-Korruption in einer lang laufenden Pipeline verhindert."
date: "2026-05-02"
readMin: 4
draft: false
---

Ein Import-Job lebt eine Weile. Er wird erstellt, von einem Worker aufgenommen, geparst, validiert, Chunk für Chunk verarbeitet und landet schließlich in einem von mehreren Terminal States. Unterwegs können Dinge auf unterschiedliche Weise schiefgehen - Validation kann fehlschlagen, Processing kann fehlschlagen, der Worker kann abstürzen und den Job gestrandet hinterlassen.

Der einfachste Ansatz ist ein `Status`-Enum und ein paar `if`-Checks an den Stellen, wo der Status wechselt. Das trägt eine Weile. Es hört auf zu tragen, sobald ein neuer Status dazukommt, ein Bug `Succeeded` direkt aus `Received` setzt, ohne Processing zu durchlaufen, oder ein Requeue-Pfad `Validating` überspringt. Der State ist dann implizit und über die Handler verteilt.

## Neun States, aufgezählte Transitions

Ingestor modelliert den Job-Lifecycle mit neun expliziten States:

```
Received → Parsing → Validating → Processing → Succeeded
                                              → PartiallySucceeded
                   → ValidationFailed (terminal)
                                    → ProcessingFailed (terminal)
                                    → DeadLettered (terminal)
```

Der Domain Layer codiert alle erlaubten Transitions in einem `HashSet<(JobStatus From, JobStatus To)>`. Jeder Versuch, zu einer nicht aufgelisteten Transition zu wechseln, wirft sofort eine `DomainException` - keine stille Korruption, kein implizites Fallback.

```csharp
private static readonly HashSet<(JobStatus, JobStatus)> AllowedTransitions = new()
{
    (Received,    Parsing),
    (Parsing,     Validating),
    (Parsing,     ValidationFailed),
    (Validating,  Processing),
    (Validating,  ValidationFailed),
    (Processing,  Succeeded),
    (Processing,  PartiallySucceeded),
    (Processing,  ProcessingFailed),
    (Processing,  DeadLettered),
    (ProcessingFailed, Parsing),   // requeue path
    (DeadLettered,     Parsing),   // manual requeue
    // ...
};
```

Die Transition-Methode validiert, setzt dann den Status und hängt ein `AuditEvent` an:

```csharp
public void TransitionTo(JobStatus next, AuditEventTrigger trigger, string? context = null)
{
    if (!AllowedTransitions.Contains((Status, next)))
        throw new DomainException($"Invalid transition: {Status} → {next}");

    Status = next;
    AuditEvents.Add(AuditEvent.Create(Id, Status, next, trigger, context));
}
```

Jede Statusänderung wird aufgezeichnet. Die vollständige History eines Jobs ist immer aus `AuditEvents` rekonstruierbar.

## Warum Terminal States entscheidend sind

Drei Terminal States, nicht einer. `ValidationFailed`, `ProcessingFailed` und `DeadLettered` sind alle permanent, aber sie bedeuten operativ unterschiedliche Dinge:

- `ValidationFailed` - schlechter Input, ein Retry hilft nicht. Menschliche Intervention erforderlich.
- `ProcessingFailed` - Infrastructure-Problem, für automatischen Retry berechtigt.
- `DeadLettered` - Retries erschöpft. Verschoben zu `dead_letter_entries` mit einem JSON-Snapshot des Job-States zum Zeitpunkt des Scheiterns. Erfordert manuellen Requeue.

Unterschiedliche States machen die Dead-Letter-Management-UI unkompliziert. Das Dashboard filtert nach State, nicht nach Retry-Anzahl oder Fehlermeldung. Ein Job im `DeadLettered`-State ist eindeutig tot; ein Job im `ProcessingFailed`-State ist eindeutig retryable.

## Das PartiallySucceeded-Problem

Der `PartiallySucceeded`-State wurde spät hinzugefügt und verursachte die meiste Friction. Batch-Jobs verarbeiten in 500-Zeilen-Chunks; ein Chunk-Fehler auf halbem Weg rollt die bereits committed Chunks nicht zurück. Der Job kann nicht `Succeeded` sein (einige Zeilen sind fehlgeschlagen) und kann nicht `ProcessingFailed` sein (die meisten Zeilen waren erfolgreich).

Das erforderte neue Transitions:

```
Processing → PartiallySucceeded
```

Und neue Fragen: Ist ein partially succeeded Job retryable? Wenn er requeued wird, verarbeiten wir nur die fehlgeschlagenen Chunks neu? (Nein - das aktuelle Design verarbeitet alles neu und verlässt sich auf `DeliveryItem`-Idempotency.) Kann ein partially succeeded Job dead-lettered werden? (Ja, wenn er oft genug fehlschlägt.)

Beim nächsten Mal modelliere ich Terminal- und Near-Terminal-States von Anfang an explizit. Sie später hinzuzufügen zwang mich dazu, die Transition-Tabelle, das Dead-Letter-Schema, die Requeue-Logik und die UI-Filter gleichzeitig zu überarbeiten.

## Was das bringt

Zwei Dinge sind durch die explizite State Machine deutlich einfacher geworden.

Die Recovery-Logik ergab sich von selbst. Als ich die Stale-Lock-Recovery schrieb, also das Zurückfordern von Outbox-Einträgen abgestürzter Workers, konnte ich in der Transition-Tabelle nachsehen, welche Job-States für einen Reclaim in Frage kommen. Ich musste es nicht neu herleiten.

Das Testen wurde mechanisch. Jede Transition ist eine einzelne Assertion. Happy Path, Sad Path und die ungültigen Transitions sind alle nur Tabellen-Lookups. Die Domain-Tests lesen sich wie eine Spezifikation.

Der Preis ist Ausführlichkeit. Neun States und ~23 Transitions sind viel zum Aufzählen. Für eine einfachere Pipeline mit drei States wäre das Overkill. Für ein System, in dem Korrektheit und Nachvollziehbarkeit mehr zählen als Kürze, ist es jede Zeile wert.
