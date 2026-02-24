# NEVER. System Architecture

## Architektur-Diagramm

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Vercel)                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  React SPA                                                       │    │
│  │  • Video Upload UI                                               │    │
│  │  • Analysis Dashboard                                            │    │
│  │  • Export Generator (Word/Excel/PDF)                             │    │
│  │  • FFmpeg WASM (Thumbnail-Generierung)                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
│  Google Cloud        │ │  Cloud Run       │ │  Firebase                 │
│  Storage             │ │  (Backend)       │ │  Firestore                │
│                      │ │                  │ │                          │
│  • Video Upload      │ │  • Express API   │ │  • Job Status            │
│  • Signed URLs       │ │  • Gemini AI     │ │  • Analysis Metadata     │
│  • Auto-Cleanup      │ │  • Orchestrator  │ │  • Project Config        │
│                      │ │                  │ │                          │
└──────────────────────┘ └──────────────────┘ └──────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      Google Gemini AI         │
                    │                               │
                    │  • Video Analysis             │
                    │  • Speech-to-Text             │
                    │  • Scene Detection            │
                    │  • Object Recognition         │
                    │  • Content Understanding      │
                    └───────────────────────────────┘
```

---

## Datenfluss

```
1. VIDEO UPLOAD
   User → [HTTPS] → Vercel Frontend → [Signed URL] → GCS Bucket

2. ANALYSE STARTEN
   Frontend → [POST /analyze] → Cloud Run → [Job erstellt] → Firestore

3. AI VERARBEITUNG
   Cloud Run → [Video URI] → Gemini AI → [Strukturierte Analyse] → Cloud Run

4. ERGEBNIS SPEICHERN
   Cloud Run → [Results] → Firestore → [Realtime Update] → Frontend

5. EXPORT
   Frontend → [Generate] → Word/Excel/PDF → [Download] → User

6. CLEANUP
   GCS → [TTL expired] → Auto-Delete
```

---

## Sicherheitsmerkmale

| Bereich | Implementierung |
|---------|-----------------|
| Transport | HTTPS (TLS 1.3) |
| Upload | Signed URLs mit Ablaufzeit |
| API | CORS-Konfiguration |
| Storage | GCS IAM, keine öffentlichen URLs |
| Daten | Automatische Löschung nach Verarbeitung |

---

## Fehlende Enterprise-Features

| Feature | Status |
|---------|--------|
| SSO (Azure AD / SAML) | ❌ Nicht implementiert |
| Rollen-basierte Zugriffskontrolle | ❌ Nicht implementiert |
| Audit Logging | ❌ Nicht implementiert |
| Multi-Tenant Isolation | ❌ Nicht implementiert |
| SLA Monitoring | ❌ Nicht implementiert |
