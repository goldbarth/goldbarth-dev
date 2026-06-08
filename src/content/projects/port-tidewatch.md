---
title: "port-tidewatch"
description: "Ingestion-Service für Pegelstand-Telemetrie von Häfen mit threshold-basiertem Sturmflut-Alerting — orientiert an Hamburgs WADI-Warnsystem. Simulator, RabbitMQ-Consumer mit Dead-Letter-Handling und ein read-only Angular Dashboard. Bewusst klein gehalten: eine Domain, ein Ingestion-Pfad, end-to-end reliable und observable."
date: "2026-06-08T19:09:00"
readMin: 4
draft: false
---

## Was es ist

port-tidewatch ist ein fokussierter Ingestion-Service für Pegelstand-Telemetrie von Häfen mit automatischem Sturmflut-Alerting. Das System ist an Hamburgs WADI-Warnsystem angelehnt und schlägt Alarm, wenn der erwartete Scheitelwert einer Sturmflut **4,50 m über NHN** (bzw. 2,40 m über MThw) übersteigt.

Der Datenfluss ist bewusst geradlinig: **Simulator → Ingestion-Service → Dashboard**. Ein Simulator emittiert Pegel-Readings für mehrere Messstellen über RabbitMQ. Der Ingestion-Service konsumiert sie, evaluiert jedes Reading gegen den Threshold, hält per-Gauge State und leitet Alarmzustände ab. Poison Messages werden in eine Dead-Letter-Queue geroutet, statt die Pipeline zu blockieren. Ein read-only Angular Dashboard zeigt aktuelle Pegel, den Alarmstatus pro Messstelle (normal / warning) und historische Trends.

## Problem / Motivation

Ich wollte eine Ingestion-Pipeline, die ich end-to-end reliable und observable bekomme — ohne mich in Breite zu verlieren. Statt eines generalisierten Systems habe ich den Scope hart eingegrenzt: eine Domain, ein Ingestion-Pfad, keine Write-Operationen aus dem UI. Die interessanten Probleme liegen hier nicht in der Feature-Menge, sondern darin, eine Message-getriebene Pipeline so zu bauen, dass Failure-Modes — Poison Messages, Consumer-Restarts, partielle Verfügbarkeit — sauber gehandhabt werden und im Tracing sichtbar bleiben.

## Architecture / Wichtige Entscheidungen

Die Threshold-Evaluation passiert **im Ingestion-Service selbst**, nicht downstream im Dashboard. Das Dashboard bleibt damit reiner Read-Path über den abgeleiteten State; die Alarm-Logik hat einen einzigen, testbaren Ort.

Transport ist RabbitMQ mit Dead-Letter-Exchange. Messages, die das Processing nicht bestehen, werden isoliert statt die Queue zu blockieren — die Pipeline bleibt verfügbar, fehlerhafte Readings landen nachvollziehbar im DLQ.

Per-Gauge State wird im Service gehalten, sodass der Alarmzustand pro Messstelle unabhängig fortgeschrieben wird. Der Surge-Evaluator-Algorithmus bestimmt die Alarmstufen aus den eingehenden Readings.

Vier ADRs dokumentieren die zentralen Entscheidungen: Ort der Threshold-Evaluation (service-side), Struktur des Dashboard-State, Wahl der Container-Plattform und der Surge-Evaluator-Algorithmus. Der Anspruch: das Reasoning ist sichtbar, auch dort, wo die Implementierung noch nicht fertig ist.

Für das Deployment fällt die Wahl bewusst auf **Kubernetes + Argo CD (GitOps)** statt nur Azure Container Apps — wegen des declarative Infrastructure-as-Code-Workflows und der Sichtbarkeit, die er verschafft. Azure Container Apps bleibt als Baseline-Target.

## Roadmap

Das Projekt ist in fünf Milestones strukturiert, jeder als kohärenter Zwischenzustand gedacht — das Repo bleibt über alle Phasen funktionsfähig.

| Phase | Ziel | Status |
|-------|------|--------|
| M1 | Repo-Struktur, Data Contracts, Threshold-Config | **Fertig** |
| M2 | RabbitMQ-Integration, Consumer-Logik, per-Gauge State | **In Arbeit** |
| M3 | OpenTelemetry Tracing, Integration-Tests via Testcontainers | Geplant |
| M4 | Angular Dashboard (read-only: Pegel, Status, Trends) | Geplant |
| M5 | Deployment: Azure Container Apps → Kubernetes + Argo CD | Geplant |

## Stand

Work in progress. Foundation und Data Contracts stehen, die Ingestion-Phase läuft. Observability, Dashboard und Deployment folgen — bewusst in dieser Reihenfolge, damit jede Phase auf einer beobachtbaren, getesteten Basis aufsetzt.
