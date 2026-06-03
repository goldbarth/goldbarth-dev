---
title: "KI-gestützte Entwicklung: gemessene Aufwandsrechnung"
description: "MetricGate wurde solo, nebenbei und mit Claude Code als primärer Implementierungshilfe gebaut. Warum ich Kalenderschätzungen aus den Planungsdocs gestrichen habe, wie ich den Aufwand über Commit-Zeitstempel messe — und was die Geschwindigkeit kostet."
date: "2026-06-03T11:50:00"
readMin: 6
draft: false
---

Ein KI-gestützter Zeitplan sieht neben konventionellen Solo-Schätzungen unplausibel schnell aus. Ohne Erklärung lädt das zu zwei falschen Lesarten ein: entweder das Projekt ist trivial, oder die Zahlen sind aufgeblasen. Keins von beidem stimmt. Diese Notiz macht die Rechnung nachprüfbar — und benennt, was die Geschwindigkeit kostet.

## Kontext

MetricGate wurde solo gebaut, in Teilzeit, mit Claude Code als primärer Implementierungshilfe. Die Entwicklung lief verschachtelt mit Bewerbungen, Firmenrecherche und Kursarbeit — Kalenderzeit sagt also nichts über den Aufwand aus.

Die Scope- und Issue-Docs trugen ursprünglich Kalenderschätzungen: "12 Wochen", Wochenbereiche pro Phase ("Woche 1–3"). Die stellten sich als bedeutungslos heraus. Eine geplante "Zwei-Wochen-Phase" landete regelmäßig in einer einzigen fokussierten Session. Statt die Schätzungen still zu löschen und eine Glaubwürdigkeitslücke zu hinterlassen ("wie lange hat das *wirklich* gedauert?"), dokumentiert diese Notiz den echten Aufwand, wie er gemessen wurde, und den Trade-off, den die Beschleunigung mit sich bringt.

## Die Entscheidung

1. **Kalenderschätzungen aus den Planungsdocs streichen.** Wall-Clock-Wochen mischen Leerlauf (Jobsuche, Kurse) mit dichten Arbeitsbursts und tragen kein Signal. Entfernt aus `scope-v1-en.md`, `scope-v1-de.md`, `metricgate-issues.md`.

2. **Aufwand über Commit-Zeitstempel-Delta rechnen, nicht über Kalender.** Das einzige Ground-Truth-Signal ist die Git-History. Fokuszeit pro Arbeitstag ≈ Spanne vom ersten zum letzten Commit. Das ist ein *Proxy* (Pausen inklusive) und wird auch so ausgewiesen — keine erfundene Präzision.

3. **Die Baseline ohne KI explizit nennen**, damit die Beschleunigung sichtbar statt versteckt ist.

4. **Den Trade-off benennen.** Die Notiz ist keine Siegesrunde — die Geschwindigkeit hat einen echten Preis in praktischer Tiefe.

## Gemessener Aufwand

10 Arbeits-Sessions, Kalenderspanne 2026-05-05 → 2026-06-02 (~4 Wochen, Teilzeit):

| Datum      | Commits | Spanne (erster → letzter) | ~Fokus              |
|------------|---------|---------------------------|---------------------|
| 2026-05-05 | 4       | 15:45 → 17:57             | 2,2 h               |
| 2026-05-06 | 1       | einzelner Commit          | ~0,3 h              |
| 2026-05-07 | 7       | 09:52 → 12:05             | 2,2 h               |
| 2026-05-21 | 16      | 10:25 → 19:36             | ~7 h (inkl. Pausen) |
| 2026-05-22 | 9       | 10:53 → 16:50             | 6,0 h               |
| 2026-05-26 | 8       | 14:27 → 19:55             | 5,5 h               |
| 2026-05-27 | 7       | 11:13 → 12:56             | 1,7 h               |
| 2026-05-29 | 8       | 12:59 → 14:49             | 1,8 h               |
| 2026-06-01 | 10      | 12:26 → 17:33             | 5,1 h               |
| 2026-06-02 | 13      | 10:56 → 17:06             | ~6 h (inkl. Pausen) |

83 Commits gesamt. Roh-Summe der Spannen ≈ 40 h; Fokus-Gesamtwert **≈ 38 h** (die langen Tage am 21.05. und 02.06. enthalten Pausen).

**Dazu kommen Upfront-Planung außerhalb der Commit-Deltas: ≈ 2–3 Tage.** Vor dem ersten Commit wurde Scope bewertet und die ~60 Issues geschrieben und sequenziert (`scope-v1-*.md`, `metricgate-issues.md`). Das ist Design- und Dekompositionsarbeit ohne Commit-Zeitstempel-Spur — für ein vollständiges Bild: **≈ 38 h Implementierung + ~2–3 Tage Planung**. Beim Planungsschritt ist der Abstand zur Without-AI-Baseline *am kleinsten* — Scoping und Issue-Schreiben sind Urteilsarbeit, die der Assistent deutlich weniger beschleunigt als Wiring-Level-Implementierung.

## Vergleich

|                                                     | Schätzung    | Basis                                                                                                                                                                                                    |
|-----------------------------------------------------|--------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Ohne KI — Mid-Level Dev (~2 Jahre), ohne Assistent  | ~350–550 h   | ~60 Issues zu Mid-Level-Solo-Tempo **plus Lern-Overhead**: die verteilten Systeme-Patterns hier (Outbox, Idempotency, Tag-Invalidierungs-Kaskaden, Recursive-CTE-Hierarchie, Trace-Context über Kafka) sind welche, die ein Dev nach ~2 Jahren typischerweise erst *recherchiert*, nicht kalt anwendet |
| Ohne KI — kompetenter Generalist, ohne Assistent    | ~250–400 h   | gleiche Issue-Anzahl zu konventionellem Solo-Tempo (~4–6 h/Issue), Patterns bereits bekannt                                                                                                              |
| Mit KI-Unterstützung (gemessen)                     | ~38 h Fokus  | Commit-Zeitstempel-Delta über 10 Sessions                                                                                                                                                                |
| **Beschleunigung**                                  | **~9–14×**   | reine Build-Zeit — **und** Wissens-Zugang: Teil des Abstands ist, dass der Assistent idiomatische Patterns an der Bedarfsstelle zugänglich machte, nicht nur Tastenanschläge beschleunigte (siehe Trade-offs) |

Die Gegenlesart: ohne den Assistenten wäre das wahrscheinlichere Ergebnis nicht "gleiches Resultat, mehr Stunden", sondern "schwächeres erstes Ergebnis" — Stunden-Zahl und Qualitäts-Ceiling bewegen sich zusammen.

## Beobachtetes Muster

Die Arbeit passiert in **dichten Bursts an einzelnen Tagen**, nicht über Kalenderwochen verteilt. Ganze "Zwei-Wochen-Phasen" aus dem Originalplan kollabierten in eine ~6-h-Session (z. B. der komplette Enforcement-Service plus Caching-Layer, 9 Issues, am 22.05.). Die Lücken zwischen den Burst-Tagen sind Verfügbarkeitslücken (Jobsuche, Kursarbeit), keine Entwicklungszeit.

## Der Trade-off

**Die Beschleunigung ist reine Build-Zeit, nicht Lernzeit.** Das ist der zentrale Vorbehalt.

- **Kosten — weniger Low-Level-Wiederholung.** Wiring-Implementierungen schnell generieren zu lassen heißt weniger Reps der tastatur-nahen technischen Tiefe — das Muskelgedächtnis, das beim Tippen von Boilerplate, beim Kampf mit dem Compiler und beim Debuggen eigener Fehler entsteht. Diese praktische Tiefe ist dünner, als sie nach 300 h manueller Arbeit wäre.

- **Kompensation — der Aufwand verschiebt sich nach oben.** Die Zeit, die *nicht* ins Tippen geht, fließt ins Verstehen und Validieren von **Design-Patterns und High-Level-Architektur**: generierten Code kritisch lesen, die ADRs (001–009) schreiben, die System-Design-Entscheidungen besitzen (Service-Grenzen, Cache-Invalidierung unter Kaskade, Counter-Strategie, Idempotenz) statt der tastatur-nahen. Die Review- und Architekturlast ist *höher* pro Code-Einheit, nicht niedriger.

- **Wissens-Zugang, nicht nur Tipp-Geschwindigkeit.** Ein Teil des gemessenen Vorsprungs ist nicht "gleiche Arbeit, schneller" sondern "Arbeit, die weniger Vorwissen erforderte". Der Assistent machte idiomatische Patterns (Outbox, Idempotency, Invalidierungs-Kaskaden) an der Bedarfsstelle zugänglich — ohne sie erst selbst entdecken zu müssen. Das ist echter Hebel, ändert aber, was der Vorsprung *bedeutet*: er spiegelt teils komprimierte *Lern*-Zeit, nicht nur komprimierte Tastenanschläge. Pattern-*Erkennung* — einen generierten Ansatz evaluieren, beurteilen ob er passt, und ihn korrekt integrieren — ist eine echte und nicht-triviale Fähigkeit, und sie wird hier bewusst nicht mit Pattern-*Beherrschung* (gleiches unaided reproduzieren) gleichgesetzt. Diese Notiz behandelt den Abstand zwischen beiden als laufende, benannte Investition — ADR-Disziplin, kritisches Review, ungepromptetes Üben — statt als gelöstes Problem.

- **Netto.** KI komprimiert das *Tippen*, nicht das *Denken*. Der Engineering-Wert wandert von Low-Level-Implementierung hin zu Architektur, Review und Entscheidungsfindung. Das zu managende Risiko ist, generierten Code ohne Verständnis zu akzeptieren; die Mitigation ist die ADR-Disziplin und das kritische Review, das die gesparte Zeit finanziert.

## Konsequenzen

- Planungsdocs tragen **keine Kalenderschätzungen** mehr; der Aufwand wird per Commit-Delta im README-Abschnitt "Effort accounting" geführt, der hierher verlinkt.
- Künftiger Aufwand wird in **fokussierten Sessions** geplant, nicht in Wochen ("ein Enforcement-großer Brocken ≈ eine ~6-h-Session").
- Der Trade-off ist bewusst akzeptiert: gezielte, fortlaufende Investition in Architektur-Verständnis (ADRs, Design-Pattern-Studium, Code-Review) kompensiert die dünnere Low-Level-Wiederholung.
- Diese Notiz ist **Prozess-Dokumentation**, kein Architektur-ADR, und liegt bewusst außerhalb von `docs/adrs/`, um die nummerierte Serie pur-architektonisch zu halten.
