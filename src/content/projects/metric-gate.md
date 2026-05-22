---
title: "MetricGate"
description: "Tenant-aware Quota- und Rate-Limiting-Backend für SaaS-APIs. Drei .NET 10 Microservices mit Redis, Redpanda und Keycloak — aktuell in Entwicklung."
date: "2026-05-22"
draft: false
---

> In Entwicklung — diese Seite wächst mit dem Projekt. Milestone 3 von 6 ist aktiv.

## Was es ist

MetricGate ist ein tenant-aware Quota- und Rate-Limiting-Backend für SaaS-APIs. Drei unabhängig deploybare .NET 10 Services setzen Planlimits in Echtzeit durch, persistieren Nutzungsereignisse für Billing und Audit und unterstützen mehrstufige Tenant-Hierarchien (Root, Reseller, Customer).

Drei Services, drei PostgreSQL-Datenbanken, ein Redis, ein Redpanda-Cluster (Kafka API), ein Keycloak-Realm — orchestriert lokal via Docker Compose.

```
                ┌──────────────────────────┐
                │    API Consumer (ext.)   │
                └────────────┬─────────────┘
                             │ API Key
                             ▼
                ┌──────────────────────────┐
                │   Enforcement Service    │  ◄── Redis (Counters, Plan Cache, Sessions)
                │   - Hot-path Check API   │
                │   - Token Bucket / Win.  │
                └─────┬──────────────┬─────┘
                      │              │
              HTTP    │              │  Kafka: usage.events
          (Cache Miss)│              │
                      ▼              ▼
                ┌──────────────┐   ┌──────────────────────────┐
                │    Plans     │   │     Usage Service        │
                │   Service    │   │   - Event Persistence    │
                │              │   │   - Aggregation Worker   │
                └─────┬────────┘   │   - Reports API (Admin)  │
                      │            └──────────────────────────┘
                      │
        Kafka: plans.changes (Broadcast)
                      │
                      └─► Enforcement (Cache Invalidation)
                      └─► Usage       (Denormalized Lookups)
```

## Problem / Motivation

Rate Limiting und Quota Enforcement klingen nach gelösten Problemen — bis man anfängt, die Grenzfälle durchzudenken: Was passiert, wenn ein Reseller die Limits seiner Sub-Tenants erhöht und alle ihre gecachten Plan-Resolutions ungültig werden? Wie schreibt man einen Redis-Counter atomar, ohne eine Race Condition unter Last zu erzeugen? Wie garantiert man, dass eine Nutzungsevent-Message den Consumer erst erreicht, nachdem die Database-Transaction committed ist?

Die Kombination aus Tenant-Hierarchie, Cache-Invalidierungskaskaden, Kafka-Delivery-Semantik und OIDC-basierter Resource-Authorization erzeugt genug Komplexität, dass jedes Pattern eine echte Rechtfertigung braucht. Das ist der Punkt des Projekts.

## Architecture / Wichtige Entscheidungen

Jeder Service folgt intern Clean Architecture (Domain, Application, Infrastructure, API). Die Domain-Logik in jedem Service — Hierarchie-Invarianten im Plans Service, Counter-Semantik im Enforcement Service, Aggregationsregeln im Usage Service — rechtfertigt den Layering-Overhead gegenüber einem Slice-basierten Ansatz.

Synchrone Kommunikation nur auf dem Cache-Miss-Pfad (Enforcement → Plans). Alles andere fließt asynchron via Kafka.

**Caching-Strategie:**

| Cache             | Zweck                                       | Invalidierung                                     |
|-------------------|---------------------------------------------|---------------------------------------------------|
| Plan Resolution   | API Key → Tenant + effektiver Plan + Limits | TTL + Pub/Sub auf `plans.changes`                 |
| Quota Counter     | Fixed-Window `INCR` pro Tenant pro Periode  | TTL aligned to Window Expiry                      |
| Rate-Limit Bucket | Token-Bucket-State pro Tenant               | Atomic Mutation via Lua Script                    |
| Tenant Hierarchy  | Resolved Parent Chains                      | Tag-basierte Kaskade auf `TenantHierarchyChanged` |

Der nicht-triviale Fall ist die Hierarchie-Kaskade: ein einzelnes `TenantHierarchyChanged`-Event invalidiert Plan-Resolutions, Hierarchy-Caches und Authorization-Decisions über einen gesamten Sub-Tree. Tag-basierte Eviction via Redis Sets.

**Authentication:**

| Caller                | Mechanismus                                       |
|-----------------------|---------------------------------------------------|
| Externer API Consumer | API Key im Header                                 |
| Tenant Admin          | OIDC (Keycloak) → JWT mit Refresh                 |
| Service-to-Service    | Internes JWT (Enforcement → Plans auf Cache Miss) |

**In-House Mediator:** Ein eigener Mediator (~30 LOC, keine externe Library) ersetzt MediatR. Kein Overhead, kein Magic.

Alle Architekturentscheidungen sind als ADRs dokumentiert: [`docs/adrs/`](https://github.com/goldbarth/MetricGate/tree/main/docs/adrs).

→ [SELECT FOR UPDATE bei konkurrenten Tree-Mutationen](/decisions/select-for-update-tree-mutations)  
→ [Integrationstests mit Testcontainers](/decisions/integration-tests-testcontainers)

## Entwicklungsstand

### M1: Plans Foundation — abgeschlossen

Solution-Struktur, Plans-Schema, Tenant-Hierarchie (Adjacency List mit begrenzter Tiefe), Plan-Definitionen und -Zuweisungen, API Key Management, OIDC-Integration mit Keycloak, Policy-based und Resource-based Authorization.

18 Issues geschlossen.

### M2: Plans Lifecycle & Events — abgeschlossen

API Key Rotation mit Grace Period, Tenant Move mit Hierarchie-Validierung, Outbox Pattern für zuverlässiges Kafka Publishing, `plans.changes`-Broadcast.

8 Issues geschlossen.

### M3: Enforcement & Caching — aktiv

Check API (Hot-Path: *ist dieser API Key für diesen Call erlaubt?*), Redis Plan Cache mit TTL, Pub/Sub-basierte Cache-Invalidierung auf `plans.changes`, tag-basierte Eviction bei Hierarchie-Änderungen.

2 Issues geschlossen, 7 offen.

### M4: Counters & Rate Limits — ausstehend

Fixed-Window-Counter für monatliche Quotas, Token Bucket via Redis Lua Script für kurzfristige Rate Limits, Usage Event Publishing.

### M5: Usage Service — ausstehend

Kafka Consumer, Event Persistence mit Idempotency-Dedup-Window, Aggregation Worker, Reports API.

### M6: Hardening & Documentation — ausstehend

Trace Propagation, Failure Tests, Edge Cases, Runbook, README finalisieren.
