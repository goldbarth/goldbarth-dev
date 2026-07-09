---
title: "Redis Lua & atomare Ops"
description: "Warum MetricGate Token-Bucket-Updates als Lua-Script ausführt statt als einfachen GET-SET-Zyklus - was ohne Lua schiefgeht, wie atomare Ausführung das löst und was Lua kostet."
date: "2026-05-28T12:00:00"
readMin: 3
draft: false
---

Ein Rate-Limiter ohne Atomarität ist kein Rate-Limiter. Er ist eine Schätzung.

## Das Problem ohne Lua

Token Bucket naiv:

```
1. GET bucket:tenant-123        → 10 Tokens
2. (anderer Request kommt rein)
3. SET bucket:tenant-123 9
```

Beide Requests lesen 10, beide schreiben 9 zurück - ein Token wurde doppelt verbraucht, aber nur einmal abgezogen. Das ist eine Race Condition, die unter Last garantiert auftritt. Mehrere Worker, mehrere Pods, mehrere gleichzeitige Requests: Das naive GET-SET-Muster ist nicht threadsafe über Prozessgrenzen hinweg.

Das ist kein theoretisches Problem. Ein Rate-Limiter, der unter Last nachgibt, hat genau dann keinen Wert, wenn er gebraucht wird.

## Warum Lua

Redis führt ein Lua-Script **atomar** aus - kein anderer Client kann dazwischenkommen, solange das Script läuft. Nicht zwischen zwei Redis-Calls innerhalb des Scripts. Nicht zwischen Lesen und Schreiben.

MetricGate macht das für den Token Bucket: lesen, Zeit seit letztem Refill berechnen, Tokens auffüllen, prüfen ob genug da, abziehen - alles in einem Script, in einem Schritt.

```lua
local tokens = tonumber(redis.call('GET', key)) or capacity
local now = tonumber(ARGV[1])
local last = tonumber(redis.call('GET', key..':ts')) or now
local refill = math.floor((now - last) * rate)
tokens = math.min(capacity, tokens + refill)
if tokens < 1 then return 0 end
redis.call('SET', key, tokens - 1)
redis.call('SET', key..':ts', now)
return 1
```

Kein MULTI/EXEC, kein Distributed Lock, kein Optimistic Retry. Das Script liest und schreibt in einer einzigen Operation aus Sicht jedes anderen Redis-Clients.

Die Alternative wäre ein Redis Transaction mit WATCH - optimistisches Locking, das bei Konflikten retried. Unter hoher Last bedeutet das viele abgebrochene Transactions und wiederholte Versuche. Lua ist deterministischer: das Script läuft durch, wer auch immer zuerst dran ist. Kein Retry-Loop, keine Backoff-Logik im Aufrufer.

## Die Trade-offs

Lua-Atomarität ist kein Free Lunch:

- **Redis blockiert während des Scripts** - andere Clients müssen warten, bis das Script fertig ist. Für ein kurzes Token-Bucket-Script sind das Mikrosekunden. Für ein langes, schlecht optimiertes Script treibt das die Latenz für alle Clients.
- **Kein Rollback innerhalb des Scripts** - wenn `SET key tokens-1` erfolgreich ist und `SET key:ts now` fehlschlägt, ist der State inkonsistent. Lua hat kein transaktionales Rollback. Das Script muss so gebaut sein, dass Fehler möglichst vor den Schreiboperationen auftreten - oder der inkonsistente State muss tolerierbar sein.
- **Debugging ist mühsam** - Redis hat keinen Lua-Debugger für Production. Fehler kommen als knappe Strings zurück, keine Stacktraces, keine Zeilennummern.
- **Script Caching erfordert Planung** - `EVAL` sendet das Script bei jedem Call. `EVALSHA` verwendet einen gecachten SHA1-Hash, ist schneller, setzt aber voraus, dass das Script vorab mit `SCRIPT LOAD` registriert wurde - und reagiert auf Cache-Eviction.

Was nicht kostet: die Komplexität ist einmalig und im Script eingeschlossen. Alle Aufrufer sehen eine einfache Schnittstelle - Key, Kapazität, Rate, Timestamp übergeben, 0 oder 1 zurückbekommen.

## Was ich ändern würde

Das Script setzt derzeit keine TTL auf die Bucket-Keys. Wenn ein Tenant dauerhaft inaktiv wird, bleiben `bucket:tenant-123` und `bucket:tenant-123:ts` in Redis, bis sie manuell gelöscht werden oder Redis selbst den Speicher bereinigt. Ich würde am Ende des Scripts ein `PEXPIRE` hinzufügen - gesetzt auf das Refill-Fenster plus einen Buffer - damit inaktive Buckets sich selbst aufräumen.

`EVALSHA` statt `EVAL` wäre die naheliegende Production-Optimierung: Script einmal laden, SHA1-Hash cachen, bei jedem Rate-Limit-Call nur den Hash senden. Für ein Portfolio-Projekt ist `EVAL` bewusst transparenter - das Script ist direkt im Call sichtbar, ohne einen separaten Lade-Schritt verfolgen zu müssen. In einer produktionsreifen Umgebung würde ich den Tausch machen.
