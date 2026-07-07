---
title: "MetricGate V1"
description: "Was beim Bauen eines Quota- und Rate-Limiting-Backends hängen geblieben ist - und was nicht."
date: "2026-06-03T12:00:00"
readMin: 3
draft: false
---

MetricGate V1 ist fertig. Ein Backend, das in Echtzeit entscheidet, ob ein API-Call erlaubt ist - mit Tenant-Hierarchien, Cache-Invalidierungskaskaden, Event-Driven-Persistence. Das, was ich in einem früheren Post als nächste Baustelle identifiziert hatte: echtes Auth, Caching, das seinen Platz verdient, verteilte Systeme-Patterns ohne Abstraktions-Schicht darunter. Es ist genau das geworden.

Was ich nicht erwartet hatte: wo die schwierige Arbeit tatsächlich saß. Ich hatte angenommen, es wäre das Implementieren - das Tippen, das Verdrahten, das Debuggen. Das war es nicht. Die schwierige Arbeit war das Entscheiden. Service-Grenzen ziehen, bevor man weiß, ob sie halten. Wählen, wann synchron und wann asynchron - nicht weil ein Pattern schön klingt, sondern weil eine falsche Wahl unter Last Konsequenzen hat, die man erst später sieht.

**Das ist die Kategorie von Lernen, für die ich das Projekt gebaut habe.** Nicht "ich kann das jetzt tippen", sondern "ich verstehe, warum das hier so und nicht anders sein muss."

Das Projekt entstand mit Claude Code als Implementierungshilfe. Der Aufwand verschiebt sich dabei nach oben, nicht weg - weniger Tippen, mehr Beurteilen. Was ich gemerkt habe: wenn das Tippen wegfällt, bleibt das Denken übrig. Und das Schreiben der Architekturentscheidungen ist kein Overhead - es ist der Beweis, dass man die Entscheidung tatsächlich besitzt und nicht nur durchgewunken hat.

Was mich überrascht hat, war das Tempo. Phasen, die ich als Zwei-Wochen-Blöcke geplant hatte, kollabierten in einzelne Sessions. Das sagt etwas darüber, wie ich Projekte in Zukunft plane - und wie wenig Kalenderzeit mit tatsächlichem Aufwand zu tun hat, wenn man fokussiert arbeitet.

V2 ist das Frontend dazu: Angular, TypeScript. Bevor ich da anfange, erst mal einen Moment stehen lassen, was fertig ist.
