# NEVER. Video Analysis Platform - External Audit Package

## Zweck dieses Pakets

Dieses Paket enthält alle relevanten Dateien, um die NEVER. Videoanalyse-Plattform zu verstehen und Dokumentation für folgende Stakeholder zu erstellen:

- Head of Production
- Legal / Compliance
- IT / Security

---

## Enthaltene Dateien

### Dokumentation

| Datei | Beschreibung |
|-------|--------------|
| `README.md` | Hauptdokumentation, Features, Setup |
| `WHATS_NEW.md` | Changelog / Release Notes |
| `INTEGRATION_GUIDE.md` | Technische Integrationsdokumentation |
| `PRO_MODE_TECHNICAL_OVERVIEW.md` | Detaillierte technische Architektur |
| `SETUP_GUIDE.md` | Installationsanleitung |
| `QUICK_START.md` | Schnellstart-Anleitung |

### Technische Spezifikation

| Datei | Beschreibung |
|-------|--------------|
| `package.json` | Frontend-Dependencies |
| `backend-package.json` | Backend-Dependencies |
| `types.ts` | TypeScript-Definitionen (Datenmodell) |
| `services-overview.md` | Übersicht aller Services |
| `architecture-diagram.md` | Architektur-Diagramm |

---

## Was die App macht (Kurzfassung)

**NEVER.** ist eine KI-gestützte Plattform zur automatischen Videoanalyse für Film- und TV-Produktion.

### Kernfunktionen

1. **Automatische Videoanalyse** - KI analysiert Bildinhalt, erkennt Szenen, Personen, Objekte
2. **Transkription** - Vollständige Spracherkennung mit Timecodes (DE/EN)
3. **Shotlist-Generierung** - Automatische Katalogisierung aller Einstellungen
4. **Szenenprotokolle** - Strukturierte Dokumentation im Branchenstandard
5. **Export** - Word, Excel, PDF in professionellen Formaten

### Zielgruppe

- Post-Production Teams
- Producer & Redakteure
- Archive / MAM-Systeme

---

## Externe Dienste (für Legal relevant)

| Dienst | Anbieter | Funktion |
|--------|----------|----------|
| **Gemini AI** | Google | Video- und Sprachanalyse |
| **Cloud Storage** | Google | Temporäre Videospeicherung |
| **Firestore** | Google | Job-Status und Metadaten |
| **Vercel** | Vercel Inc. | Frontend-Hosting |

### Datenfluss

```
User Upload → Google Cloud Storage → Gemini AI Analyse → Firestore → Export/Download
```

Videos werden nach Verarbeitung automatisch gelöscht (TTL konfigurierbar).

---

## Offene Fragen für Dokumentation

### Für Legal
- AVV mit Google Cloud erforderlich?
- Gemini Terms of Service (AI-Training mit Uploads?)
- DSGVO bei erkennbaren Personen in Videos?
- Urheberrecht: Cloud-Verarbeitung lizenzierter Inhalte?

### Für IT
- SSO/Azure AD Integration nicht implementiert
- Security Audit ausstehend
- Load Testing für konzernweiten Einsatz

### Für Production
- Pilotprojekt definieren
- Workflow-Integration in bestehende Systeme
- Erfolgskriterien festlegen

---

## Entwicklung

**Entwickler:** Markus Mooslechner  
**Position:** Director of Innovation  
**Organisation:** Terra Mater Studios

**Stand:** Januar 2026
