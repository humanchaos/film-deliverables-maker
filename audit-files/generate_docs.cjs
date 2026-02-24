const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const fs = require('fs');

// ============================================
// DOCUMENT 1: HEAD OF PRODUCTION
// ============================================
const docProduction = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({ text: 'NEVER. Video Analysis Platform', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: 'Briefing für Head of Production', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: 'Servus Media Networks', alignment: AlignmentType.CENTER }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Zusammenfassung', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: 'NEVER. ist eine KI-gestützte Plattform zur automatischen Videoanalyse. Sie erstellt aus Rohmaterial strukturierte Produktionsdokumente - Transkripte, Shotlists und Szenenprotokolle - in Minuten statt Stunden.' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Entwickelt von', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun({ text: 'Markus Mooslechner', bold: true })] }),
            new Paragraph({ text: 'Director of Innovation, Terra Mater Studios' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Was die Plattform kann', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun({ text: 'Automatische Videoanalyse: ', bold: true }), new TextRun('KI analysiert Bildinhalt, Sprache und Schnittstruktur mit Timecodes')] }),
            new Paragraph({ children: [new TextRun({ text: 'Transkription: ', bold: true }), new TextRun('Vollständige Spracherkennung in DE/EN')] }),
            new Paragraph({ children: [new TextRun({ text: 'Shotlist-Generierung: ', bold: true }), new TextRun('Automatische Katalogisierung aller Einstellungen')] }),
            new Paragraph({ children: [new TextRun({ text: 'Szenenprotokolle: ', bold: true }), new TextRun('Branchenstandard-Dokumentation')] }),
            new Paragraph({ children: [new TextRun({ text: 'Export: ', bold: true }), new TextRun('Word, Excel, PDF')] }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Zielgruppe im Konzern', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: 'Post-Production Teams - Schnellere Sichtung und Dokumentation' }),
            new Paragraph({ text: 'Producer & Redakteure - Content-Überblick ohne stundenlanges Sichten' }),
            new Paragraph({ text: 'Archive - Automatisierte Metadaten für MAM-Systeme' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Aktueller Status', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun({ text: 'BETA-PHASE', bold: true, color: 'E67E22' })] }),
            new Paragraph({ text: 'Die Plattform ist funktional und wird bei Terra Mater Studios produktiv eingesetzt.' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Offene Fragen (für Sie)', heading: HeadingLevel.HEADING_1, thematicBreak: true }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '1. Pilotprojekt definieren', bold: true })] }),
            new Paragraph({ text: 'Welche Produktion eignet sich als Testlauf? Ideal: abgeschlossenes Projekt mit bekanntem Material.' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '2. Anwender identifizieren', bold: true })] }),
            new Paragraph({ text: 'Welche Teams sollen die Plattform zuerst nutzen? Wer gibt Feedback?' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '3. Workflow-Integration', bold: true })] }),
            new Paragraph({ text: 'Wie fügt sich NEVER. in bestehende Post-Production-Workflows ein? Schnittstellen zu MAM?' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '4. Erfolgskriterien', bold: true })] }),
            new Paragraph({ text: 'Wie messen wir den Nutzen? Zeitersparnis? Qualität der Dokumentation?' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Nächste Schritte', heading: HeadingLevel.HEADING_1, thematicBreak: true }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: '[ ] Legal-Freigabe einholen (siehe separates Legal-Dokument)' }),
            new Paragraph({ text: '[ ] IT-Security-Review durchführen (siehe separates IT-Dokument)' }),
            new Paragraph({ text: '[ ] Pilotprojekt und Testgruppe definieren' }),
            new Paragraph({ text: '[ ] Kickoff-Meeting mit Production, Legal, IT' }),
            new Paragraph({ text: '[ ] 4-Wochen Pilotphase durchführen' }),
            new Paragraph({ text: '[ ] Evaluation und Go/No-Go Entscheidung' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Zeitplan (Vorschlag)', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: 'Woche 1-2: Legal & IT Freigabe' }),
            new Paragraph({ text: 'Woche 3: Onboarding Pilotgruppe' }),
            new Paragraph({ text: 'Woche 4-7: Pilotbetrieb' }),
            new Paragraph({ text: 'Woche 8: Evaluation' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'Kontakt: ', bold: true }), new TextRun('Markus Mooslechner | Director of Innovation | Terra Mater Studios')] }),
            new Paragraph({ children: [new TextRun({ text: 'Stand: Januar 2026', italics: true, color: '666666' })], alignment: AlignmentType.RIGHT }),
        ]
    }]
});

// ============================================
// DOCUMENT 2: LEGAL
// ============================================
const docLegal = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({ text: 'NEVER. Video Analysis Platform', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: 'Legal & Compliance Briefing', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Übersicht', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: 'NEVER. ist eine KI-Plattform zur automatischen Videoanalyse. Videos werden zur Analyse an externe Cloud-Dienste übertragen. Dieses Dokument fasst die rechtlich relevanten Aspekte zusammen.' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Datenfluss', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: '1. User lädt Video über Web-Interface hoch' }),
            new Paragraph({ text: '2. Video wird temporär in Google Cloud Storage gespeichert' }),
            new Paragraph({ text: '3. Google Gemini AI analysiert das Video (Bild + Sprache)' }),
            new Paragraph({ text: '4. Ergebnisse werden in Firebase/Firestore gespeichert' }),
            new Paragraph({ text: '5. User lädt strukturierte Dokumente herunter' }),
            new Paragraph({ text: '6. Video wird nach Verarbeitung gelöscht (konfigurierbar)' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Externe Dienste & Anbieter', heading: HeadingLevel.HEADING_1, thematicBreak: true }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'Google Cloud Platform (Gemini AI, Storage, Firestore)', bold: true })] }),
            new Paragraph({ text: 'Anbieter: Google Ireland Limited (EU)' }),
            new Paragraph({ text: 'Funktion: Video-Analyse, temporäre Speicherung, Metadaten-DB' }),
            new Paragraph({ text: 'EU-Datenresidenz: Konfigurierbar (Region europe-west)' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'Vercel', bold: true })] }),
            new Paragraph({ text: 'Anbieter: Vercel Inc. (USA)' }),
            new Paragraph({ text: 'Funktion: Hosting der Web-Oberfläche (nur statische Assets, keine Videodaten)' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Kernfragen zur Klärung', heading: HeadingLevel.HEADING_1, thematicBreak: true }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '1. URHEBERRECHT: Dürfen lizenzierte Inhalte hochgeladen werden?', bold: true, color: 'C0392B' })] }),
            new Paragraph({ text: 'Videos werden zur Analyse an Google übertragen. Prüfung erforderlich:' }),
            new Paragraph({ text: '- Erlauben Lizenzverträge mit Rechteinhabern Cloud-Verarbeitung?' }),
            new Paragraph({ text: '- Gilt die Übertragung als Kopie im Sinne des Urheberrechts?' }),
            new Paragraph({ text: '- Welche Einschränkungen gelten für Co-Produktionen?' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '2. GOOGLE TERMS OF SERVICE: AI-Training?', bold: true, color: 'C0392B' })] }),
            new Paragraph({ text: 'Zu prüfen in den Google Gemini API Terms:' }),
            new Paragraph({ text: '- Werden hochgeladene Videos für AI-Training verwendet?' }),
            new Paragraph({ text: '- Welche Rechte erhält Google an den Inhalten?' }),
            new Paragraph({ text: '- Gibt es Enterprise-Vereinbarungen mit No-Training-Garantie?' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '3. DSGVO: Personenbezogene Daten in Videos?', bold: true, color: 'C0392B' })] }),
            new Paragraph({ text: 'Falls Personen in Videos erkennbar sind:' }),
            new Paragraph({ text: '- Gelten Gesichter/Stimmen als personenbezogene Daten?' }),
            new Paragraph({ text: '- Ist ein AVV mit Google ausreichend oder Einwilligung nötig?' }),
            new Paragraph({ text: '- Rechtsgrundlage: Berechtigtes Interesse vs. Einwilligung?' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '4. VERTRAULICHKEIT: Unveröffentlichte Produktionen', bold: true, color: 'C0392B' })] }),
            new Paragraph({ text: 'Schutz von Pre-Release Content:' }),
            new Paragraph({ text: '- Welche Vertraulichkeitsgarantien bietet Google?' }),
            new Paragraph({ text: '- Ist zusätzliches NDA mit Google erforderlich?' }),
            new Paragraph({ text: '- Zugriffsbeschränkungen auf Google-Seite?' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Erforderliche Verträge', heading: HeadingLevel.HEADING_1, thematicBreak: true }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: '[ ] AVV (Auftragsverarbeitungsvertrag) mit Google Cloud Platform' }),
            new Paragraph({ text: '[ ] Google Gemini API Terms of Service Review' }),
            new Paragraph({ text: '[ ] Vercel DPA (Data Processing Agreement)' }),
            new Paragraph({ text: '[ ] Ggf. Anpassung bestehender Lizenzverträge mit Rechteinhabern' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Open Source Lizenzen', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun({ text: 'FFmpeg (LGPL 2.1): ', bold: true }), new TextRun('Video-Verarbeitung im Browser. Keine Modifikationen, LGPL-konform.')] }),
            new Paragraph({ children: [new TextRun({ text: 'React, Express, etc. (MIT): ', bold: true }), new TextRun('Keine Einschränkungen.')] }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'Kontakt: ', bold: true }), new TextRun('Markus Mooslechner | Director of Innovation | Terra Mater Studios')] }),
            new Paragraph({ children: [new TextRun({ text: 'Stand: Januar 2026', italics: true, color: '666666' })], alignment: AlignmentType.RIGHT }),
        ]
    }]
});

// ============================================
// DOCUMENT 3: IT
// ============================================
const docIT = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({ text: 'NEVER. Video Analysis Platform', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: 'IT & Security Briefing', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Systemübersicht', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: 'NEVER. ist eine Web-Applikation zur KI-gestützten Videoanalyse. Die Architektur besteht aus einem Frontend (SPA) und einem Backend (Cloud Run).' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Architektur', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun({ text: 'Frontend: ', bold: true }), new TextRun('React 18 + Vite, gehostet auf Vercel')] }),
            new Paragraph({ children: [new TextRun({ text: 'Backend: ', bold: true }), new TextRun('Node.js/Express auf Google Cloud Run')] }),
            new Paragraph({ children: [new TextRun({ text: 'Datenbank: ', bold: true }), new TextRun('Firebase Firestore (NoSQL)')] }),
            new Paragraph({ children: [new TextRun({ text: 'Storage: ', bold: true }), new TextRun('Google Cloud Storage')] }),
            new Paragraph({ children: [new TextRun({ text: 'AI: ', bold: true }), new TextRun('Google Gemini API (gemini-2.0-flash)')] }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Technologie-Stack', heading: HeadingLevel.HEADING_1, thematicBreak: true }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'Frontend Dependencies', bold: true })] }),
            new Paragraph({ text: 'React 18.3.1, Vite 6.2.0, TypeScript 5.8, TailwindCSS 3.4' }),
            new Paragraph({ text: 'i18next (Internationalisierung), docx/exceljs (Export)' }),
            new Paragraph({ text: 'FFmpeg WASM (Client-side Video-Verarbeitung)' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'Backend Dependencies', bold: true })] }),
            new Paragraph({ text: 'Node.js 20+, Express 4.18, TypeScript 5.3' }),
            new Paragraph({ text: '@google/genai 0.14.0, firebase-admin 12.0' }),
            new Paragraph({ text: '@google-cloud/storage 7.7, @google-cloud/video-intelligence 5.0' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Datenfluss & Sicherheit', heading: HeadingLevel.HEADING_1, thematicBreak: true }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: '1. Video-Upload: Browser -> Cloud Storage (HTTPS, signed URLs)' }),
            new Paragraph({ text: '2. Analyse-Trigger: Cloud Run verarbeitet Job' }),
            new Paragraph({ text: '3. AI-Verarbeitung: Gemini API analysiert Video' }),
            new Paragraph({ text: '4. Ergebnisse: Firestore speichert Metadaten' }),
            new Paragraph({ text: '5. Cleanup: Videos werden nach TTL gelöscht' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Authentifizierung (aktueller Stand)', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun({ text: 'ACHTUNG: ', bold: true, color: 'C0392B' }), new TextRun('Aktuell keine Enterprise-Auth implementiert')] }),
            new Paragraph({ text: 'Für konzernweiten Einsatz erforderlich: SSO via Azure AD / SAML' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Offene Punkte für IT', heading: HeadingLevel.HEADING_1, thematicBreak: true }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '1. Security Audit', bold: true })] }),
            new Paragraph({ text: '[ ] Penetration Testing der Web-Applikation' }),
            new Paragraph({ text: '[ ] Code Review (insb. API-Endpoints)' }),
            new Paragraph({ text: '[ ] Dependency Vulnerability Scan' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '2. SSO Integration', bold: true })] }),
            new Paragraph({ text: '[ ] Azure AD / SAML Integration planen' }),
            new Paragraph({ text: '[ ] Rollen- und Berechtigungskonzept definieren' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '3. Infrastruktur', bold: true })] }),
            new Paragraph({ text: '[ ] Load Testing für parallele Nutzung' }),
            new Paragraph({ text: '[ ] Backup & Recovery Strategie' }),
            new Paragraph({ text: '[ ] Monitoring & Alerting Setup' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: '4. Netzwerk', bold: true })] }),
            new Paragraph({ text: '[ ] Firewall-Regeln für Cloud Run Endpoints' }),
            new Paragraph({ text: '[ ] VPN-Zugang oder IP-Whitelisting?' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: 'Externe Endpoints', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: 'Frontend: https://[domain].vercel.app' }),
            new Paragraph({ text: 'Backend: https://gemini-backend-v2-[hash].run.app' }),
            new Paragraph({ text: 'Storage: gs://[bucket].appspot.com' }),
            new Paragraph({ text: '' }),

            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'Kontakt: ', bold: true }), new TextRun('Markus Mooslechner | Director of Innovation | Terra Mater Studios')] }),
            new Paragraph({ children: [new TextRun({ text: 'Stand: Januar 2026', italics: true, color: '666666' })], alignment: AlignmentType.RIGHT }),
        ]
    }]
});

// Generate all documents
async function generateAll() {
    const buffer1 = await Packer.toBuffer(docProduction);
    fs.writeFileSync('audit-files/NEVER_Briefing_Head_of_Production.docx', buffer1);
    console.log('1/3 Head of Production document created');

    const buffer2 = await Packer.toBuffer(docLegal);
    fs.writeFileSync('audit-files/NEVER_Briefing_Legal.docx', buffer2);
    console.log('2/3 Legal document created');

    const buffer3 = await Packer.toBuffer(docIT);
    fs.writeFileSync('audit-files/NEVER_Briefing_IT.docx', buffer3);
    console.log('3/3 IT document created');

    console.log('\nAll documents saved to audit-files/');
}

generateAll();
