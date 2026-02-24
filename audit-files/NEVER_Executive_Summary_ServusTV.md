# NEVER. Video Analysis Platform
## Executive Summary für Servus Media Networks

---

## Was ist NEVER.?

**NEVER.** ist eine KI-gestützte Videoanalyse-Plattform, die Rohmaterial automatisch analysiert und strukturierte Produktionsdokumente generiert – von Transkripten über Shotlists bis hin zu fertigen Szenenprotokollen.

---

## Kernfunktionen

| Funktion | Beschreibung |
|----------|--------------|
| **Automatische Videoanalyse** | KI analysiert Bildinhalt, Sprache und Schnittstruktur |
| **Transkription** | Vollständige Spracherkennung mit Timecodes |
| **Shotlist-Generierung** | Automatische Katalogisierung aller Einstellungen |
| **Szenenprotokolle** | Strukturierte Dokumentation für Post-Production |
| **Multi-Format Export** | Word, Excel, PDF – branchenübliche Formate |
| **Mehrsprachigkeit** | Interface und Output in DE/EN |

---

## Zielgruppe

- **Post-Production Teams** – Schnellere Sichtung und Dokumentation
- **Producer & Redakteure** – Effiziente Content-Übersicht ohne stundenlanges Sichten
- **Archive & MAM-Systeme** – Automatisierte Metadaten-Generierung

---

## Aktueller Status

> ⚠️ **Beta-Phase**

Die Plattform ist funktional und wird intern produktiv eingesetzt. Für einen **konzernweiten Rollout** sind folgende Schritte erforderlich:

| Bereich | Status | Nächste Schritte |
|---------|--------|------------------|
| Kernfunktionalität | ✅ Stabil | - |
| Security Audit | 🔄 Ausstehend | Penetration Testing |
| Skalierung | 🔄 Ausstehend | Load Testing für Parallelbetrieb |
| SSO/Enterprise Auth | ❌ Nicht implementiert | Azure AD / SAML Integration |
| SLA & Support | ❌ Nicht definiert | Service Level Agreement |

---

## Technologie-Stack (für Legal/IT)

### Externe Dienste (AVV erforderlich)

| Dienst | Anbieter | Funktion | Datenschutz |
|--------|----------|----------|-------------|
| **Gemini AI** | Google | Video- & Sprachanalyse | EU-Datenresidenz möglich |
| **Cloud Storage** | Google | Temporäre Videospeicherung | Löschung nach Verarbeitung |
| **Firestore** | Google | Job-Status & Metadaten | Keine personenbezogenen Daten |
| **Vercel** | Vercel Inc. (USA) | Frontend Hosting | Statische Assets |

### Lizenzierung

| Komponente | Lizenz | Risiko |
|------------|--------|--------|
| React, Express, TailwindCSS | MIT | ✅ Kein Risiko |
| FFmpeg (WASM) | LGPL 2.1 | ⚠️ Prüfung empfohlen |

---

## Empfohlene Legal-Prüfung

1. **Auftragsverarbeitungsvertrag (AVV)** mit Google Cloud Platform
2. **Vercel DPA** für Frontend-Hosting
3. **FFmpeg LGPL-Lizenz** – Compliance-Check (keine Modifikationen = unkritisch)
4. **Interne Datenklassifizierung** – Welche Inhalte dürfen verarbeitet werden?

---

## Kontakt

Für technische Rückfragen und Demo-Zugang:

**[Ihr Name / Kontaktdaten hier einfügen]**

---

*Stand: Januar 2026*
