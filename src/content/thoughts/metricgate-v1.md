---
title: "MetricGate V1"
description: "Was beim Bauen eines Quota- und Rate-Limiting-Backends hängen geblieben ist - und was nicht."
date: "2026-06-03T12:00:00"
readMin: 3
draft: false
---

MetricGate V1 ist fertig. Ein Backend, das in Echtzeit entscheidet, ob ein API-Call erlaubt ist, mit Tenant-Hierarchien, Cache-Invalidierungskaskaden und Event-Driven-Persistence. In einem früheren Post hatte ich aufgeschrieben, was mir fehlt: echtes Auth, Caching, das seinen Platz verdient, verteilte Systeme-Patterns ohne Abstraktions-Schicht darunter. Genau das ist es geworden.

Was ich nicht erwartet hatte, ist, wo die schwierige Arbeit tatsächlich saß. Ich war davon ausgegangen, dass es das Implementieren ist, also das Tippen, das Verdrahten, das Debuggen. War es nicht. Die schwierige Arbeit war das Entscheiden. Service-Grenzen ziehen, bevor man weiß, ob sie halten. Wählen, wann synchron und wann asynchron, wohl wissend, dass eine falsche Wahl unter Last Konsequenzen hat, die man erst spät zu sehen bekommt.

Für diese Art von Lernen hatte ich das Projekt gebaut. Nicht „ich kann das jetzt tippen", sondern „ich verstehe, warum es hier so und nicht anders sein muss."

Entstanden ist es mit Claude Code als Implementierungshilfe. Der Aufwand verschiebt sich dabei nach oben, weniger Tippen, mehr Beurteilen. Wenn das Tippen wegfällt, bleibt das Denken übrig. Und das Schreiben der Architekturentscheidungen ist für mich kein Overhead, sondern die Probe darauf, ob ich eine Entscheidung wirklich verstanden oder nur abgenickt habe.

Überrascht hat mich das Tempo. Phasen, die ich als Zwei-Wochen-Blöcke geplant hatte, kollabierten in einzelne Sessions. Das ändert etwas daran, wie ich Projekte künftig plane, und es hat mir gezeigt, wie wenig Kalenderzeit mit tatsächlichem Aufwand zu tun hat, wenn man konzentriert arbeitet.

V2 ist das Frontend dazu: Angular, TypeScript. Bevor ich da anfange, lasse ich einen Moment stehen, was fertig ist.
