# NEVER. Services Overview

Diese Datei dokumentiert alle Backend- und Frontend-Services der NEVER. Plattform.

---

## Frontend Services

| Service | Datei | Funktion |
|---------|-------|----------|
| **Analysis Coordinator** | `analysisCoordinator.ts` | Orchestriert die Analyse-Pipeline |
| **API Service** | `api.ts` | REST-API Kommunikation |
| **Auth Service** | `authService.ts` | Authentifizierung (aktuell: API-Key basiert) |
| **Backend API V2** | `backendApiServiceV2.ts` | Cloud Run Backend-Kommunikation |
| **Document Export** | `documentExportService.ts` | Export in Word/Excel/PDF |
| **Batch Export** | `batchExportService.ts` | Mehrfach-Export |
| **FFmpeg Service** | `ffmpegService.ts` | Client-seitiges Video-Processing (WASM) |
| **GCS Upload** | `gcsUploadService.ts` | Upload zu Google Cloud Storage |
| **GCS Cleanup** | `gcsCleanupService.ts` | Automatische Löschung nach TTL |
| **Video Intelligence** | `googleVideoIntelligenceService.ts` | Google Video AI Integration |
| **Subtitle Service** | `subtitleService.ts` | Untertitel-Generierung |
| **NLE Export** | `nleExportService.ts` | Export für Schnittsysteme (Premiere, etc.) |
| **Template Service** | `templateService.ts` | Dokumentvorlagen-Management |

---

## Backend Services (Cloud Run)

| Endpunkt | Funktion |
|----------|----------|
| `POST /analyze` | Startet Video-Analyse |
| `GET /status/:jobId` | Job-Status abfragen |
| `GET /results/:jobId` | Analyse-Ergebnisse abrufen |
| `DELETE /job/:jobId` | Job und Daten löschen |

---

## Datenmodell (vereinfacht)

```typescript
// Haupt-Entitäten
Project {
  id, name, videos[], metadata
}

Video {
  id, filename, duration, uploadUrl, status
}

AnalysisJob {
  id, videoId, status, progress, results
}

AnalysisResult {
  transcript, shotlist, synopsis, graphics, fauna
}
```

Vollständige Definitionen siehe `types.ts`.

---

## Externe Abhängigkeiten

### Google Cloud
- `@google/genai` - Gemini AI SDK
- `@google-cloud/storage` - Cloud Storage SDK
- `@google-cloud/video-intelligence` - Video AI SDK
- `firebase-admin` - Firestore SDK

### Frontend
- `react` - UI Framework
- `docx` - Word-Export
- `exceljs` - Excel-Export
- `@ffmpeg/ffmpeg` - Browser Video-Processing
- `i18next` - Internationalisierung
