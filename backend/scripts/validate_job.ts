#!/usr/bin/env npx ts-node
/**
 * Live Job Validator
 * 
 * Validates a completed job from Firestore against the 60+ minute
 * video analysis test requirements.
 * 
 * Usage: npx ts-node scripts/validate_job.ts <JOB_ID>
 */

import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION & INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0431510360';

// Initialize Firebase
let db: FirebaseFirestore.Firestore;
try {
    // Try to initialize with application default credentials
    initializeApp({
        projectId,
    });
    db = getFirestore();
} catch (e) {
    console.error('Failed to initialize Firebase. Make sure GOOGLE_APPLICATION_CREDENTIALS is set.');
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMECODE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function timecodeToSeconds(tc: string): number {
    if (!tc) return 0;
    const parts = tc.split(':').map(Number);
    if (parts.length === 4) {
        // HH:MM:SS:FF
        return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 25;
    } else if (parts.length === 3) {
        // HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
}

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface ValidationCheck {
    name: string;
    passed: boolean;
    details: string;
    severity: 'critical' | 'warning' | 'info';
}

interface ModuleValidation {
    module: string;
    passed: boolean;
    checks: ValidationCheck[];
    summary: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function validateShotList(shots: any[], videoDuration: number): ModuleValidation {
    const checks: ValidationCheck[] = [];
    const shotArray = shots || [];

    // Check 1: Non-empty
    checks.push({
        name: 'Has shots',
        passed: shotArray.length > 0,
        details: `${shotArray.length} shots found`,
        severity: 'critical',
    });

    if (shotArray.length === 0) {
        return { module: 'shotList', passed: false, checks, summary: 'EMPTY - No shots detected' };
    }

    // Check 2: First shot starts near 00:00:00
    const firstShotStart = timecodeToSeconds(shotArray[0]?.tcIn);
    checks.push({
        name: 'First shot starts near beginning',
        passed: firstShotStart < 5,
        details: `First shot starts at ${shotArray[0]?.tcIn} (${firstShotStart.toFixed(2)}s)`,
        severity: 'warning',
    });

    // Check 3: Last shot ends near video duration
    const lastShotEnd = timecodeToSeconds(shotArray[shotArray.length - 1]?.tcOut);
    const durationDiff = Math.abs(videoDuration - lastShotEnd);
    checks.push({
        name: 'Last shot ends near video end',
        passed: durationDiff < 30,
        details: `Last shot ends at ${shotArray[shotArray.length - 1]?.tcOut} (video: ${formatDuration(videoDuration)})`,
        severity: 'warning',
    });

    // Check 4: Valid timecode format
    const validFormats = shotArray.every((s: any) =>
        s.tcIn && s.tcOut &&
        (/^\d{2}:\d{2}:\d{2}:\d{2}$/.test(s.tcIn) || /^\d{2}:\d{2}:\d{2}$/.test(s.tcIn))
    );
    checks.push({
        name: 'Valid timecode format',
        passed: validFormats,
        details: validFormats ? 'All timecodes valid' : 'Invalid timecode format detected',
        severity: 'critical',
    });

    // Check 5: No overlapping shots
    let overlaps = 0;
    for (let i = 1; i < shotArray.length; i++) {
        const prevEnd = timecodeToSeconds(shotArray[i - 1]?.tcOut);
        const currStart = timecodeToSeconds(shotArray[i]?.tcIn);
        if (currStart < prevEnd - 0.5) { // 0.5s tolerance
            overlaps++;
        }
    }
    checks.push({
        name: 'No overlapping shots',
        passed: overlaps === 0,
        details: overlaps === 0 ? 'All shots sequential' : `${overlaps} overlapping shots found`,
        severity: 'critical',
    });

    // Check 6: No massive gaps (>10 seconds)
    let largeGaps = 0;
    for (let i = 1; i < shotArray.length; i++) {
        const prevEnd = timecodeToSeconds(shotArray[i - 1]?.tcOut);
        const currStart = timecodeToSeconds(shotArray[i]?.tcIn);
        if (currStart - prevEnd > 10) {
            largeGaps++;
        }
    }
    checks.push({
        name: 'No large gaps between shots',
        passed: largeGaps === 0,
        details: largeGaps === 0 ? 'Continuous coverage' : `${largeGaps} gaps >10s found`,
        severity: 'warning',
    });

    // Check 7: Positive durations
    const negativeDurations = shotArray.filter((s: any) =>
        timecodeToSeconds(s.tcOut) <= timecodeToSeconds(s.tcIn)
    ).length;
    checks.push({
        name: 'All shots have positive duration',
        passed: negativeDurations === 0,
        details: negativeDurations === 0 ? 'All durations valid' : `${negativeDurations} shots with invalid duration`,
        severity: 'critical',
    });

    // Check 8: Has descriptions (not all generic)
    const genericDescriptions = shotArray.filter((s: any) =>
        !s.description || /^Shot \d+$/.test(s.description)
    ).length;
    const hasRealDescriptions = genericDescriptions < shotArray.length * 0.5;
    checks.push({
        name: 'Has AI-generated descriptions',
        passed: hasRealDescriptions,
        details: `${shotArray.length - genericDescriptions}/${shotArray.length} shots have descriptions`,
        severity: 'warning',
    });

    const passed = checks.filter(c => c.severity === 'critical').every(c => c.passed);
    return {
        module: 'shotList',
        passed,
        checks,
        summary: `${shotArray.length} shots, ${overlaps} overlaps, ${genericDescriptions} generic descriptions`,
    };
}

function validateTranscription(transcription: any, videoDuration: number): ModuleValidation {
    const checks: ValidationCheck[] = [];
    const segments = transcription?.segments || [];

    // Check 1: Non-empty
    checks.push({
        name: 'Has transcription segments',
        passed: segments.length > 0,
        details: `${segments.length} segments found`,
        severity: 'critical',
    });

    if (segments.length === 0) {
        return { module: 'transcription', passed: false, checks, summary: 'EMPTY - No segments' };
    }

    // Check 2: Valid time format
    const validFormats = segments.every((s: any) =>
        s.startTime && s.endTime &&
        /^\d{2}:\d{2}:\d{2}$/.test(s.startTime)
    );
    checks.push({
        name: 'Valid time format (HH:MM:SS)',
        passed: validFormats,
        details: validFormats ? 'All times valid' : 'Invalid time format detected',
        severity: 'critical',
    });

    // Check 3: Speaker labels
    const validSpeakers = segments.every((s: any) =>
        s.speaker && /^SPEAKER_\d{2}$/.test(s.speaker)
    );
    checks.push({
        name: 'Valid speaker labels',
        passed: validSpeakers,
        details: validSpeakers ? 'All speakers formatted correctly' : 'Invalid speaker format',
        severity: 'warning',
    });

    // Check 4: Has text content
    const emptySegments = segments.filter((s: any) => !s.text || s.text.trim().length === 0).length;
    checks.push({
        name: 'Segments have text',
        passed: emptySegments === 0,
        details: emptySegments === 0 ? 'All segments have text' : `${emptySegments} empty segments`,
        severity: 'warning',
    });

    // Check 5: Time progression (no time travel)
    let timeIssues = 0;
    for (let i = 1; i < segments.length; i++) {
        const prevEnd = timecodeToSeconds(segments[i - 1]?.endTime);
        const currStart = timecodeToSeconds(segments[i]?.startTime);
        if (currStart < prevEnd - 1) { // 1s tolerance
            timeIssues++;
        }
    }
    checks.push({
        name: 'Segments are chronological',
        passed: timeIssues === 0,
        details: timeIssues === 0 ? 'All segments in order' : `${timeIssues} time ordering issues`,
        severity: 'critical',
    });

    // Check 6: Full text matches
    const fullText = transcription?.fullText || transcription?.text || '';
    const hasFullText = fullText.length > 100;
    checks.push({
        name: 'Has full text',
        passed: hasFullText,
        details: `Full text: ${fullText.length} characters`,
        severity: 'info',
    });

    // Check 7: Reasonable word count for duration
    const wordCount = fullText.split(/\s+/).length;
    const expectedMinWords = videoDuration / 60 * 50; // ~50 words per minute minimum
    checks.push({
        name: 'Reasonable word count',
        passed: wordCount > expectedMinWords,
        details: `${wordCount} words (expected min: ${Math.round(expectedMinWords)})`,
        severity: 'info',
    });

    const passed = checks.filter(c => c.severity === 'critical').every(c => c.passed);
    return {
        module: 'transcription',
        passed,
        checks,
        summary: `${segments.length} segments, ${wordCount} words`,
    };
}

function validateFauna(fauna: any[], videoDuration: number): ModuleValidation {
    const checks: ValidationCheck[] = [];
    const sightings = fauna || [];

    // Check 1: Has results (can be empty for non-nature videos)
    checks.push({
        name: 'Fauna detection ran',
        passed: Array.isArray(fauna),
        details: `${sightings.length} sightings found`,
        severity: 'info',
    });

    if (sightings.length === 0) {
        return { module: 'fauna', passed: true, checks, summary: '0 sightings (may be valid)' };
    }

    // Check 2: Valid timecodes
    const validTimecodes = sightings.every((s: any) =>
        s.timecode && /^\d{2}:\d{2}:\d{2}$/.test(s.timecode)
    );
    checks.push({
        name: 'Valid timecode format',
        passed: validTimecodes,
        details: validTimecodes ? 'All timecodes valid' : 'Invalid timecode format',
        severity: 'critical',
    });

    // Check 3: Timecodes within duration
    const outOfRange = sightings.filter((s: any) =>
        timecodeToSeconds(s.timecode) > videoDuration + 10
    ).length;
    checks.push({
        name: 'Timecodes within video duration',
        passed: outOfRange === 0,
        details: outOfRange === 0 ? 'All sightings within video' : `${outOfRange} sightings outside video`,
        severity: 'critical',
    });

    // Check 4: Required fields
    const hasRequiredFields = sightings.every((s: any) =>
        s.commonName && s.latinName && s.category
    );
    checks.push({
        name: 'Has required fields',
        passed: hasRequiredFields,
        details: hasRequiredFields ? 'All required fields present' : 'Missing required fields',
        severity: 'warning',
    });

    // Check 5: Unique species count
    const uniqueSpecies = new Set(sightings.map((s: any) => s.latinName)).size;
    checks.push({
        name: 'Species diversity',
        passed: true,
        details: `${uniqueSpecies} unique species`,
        severity: 'info',
    });

    const passed = checks.filter(c => c.severity === 'critical').every(c => c.passed);
    return {
        module: 'fauna',
        passed,
        checks,
        summary: `${sightings.length} sightings, ${uniqueSpecies} species`,
    };
}

function validateGraphics(graphics: any, videoDuration: number): ModuleValidation {
    const checks: ValidationCheck[] = [];
    const entries = graphics?.graphics || [];
    const lowerThirds = graphics?.lowerThirds || [];
    const allEntries = [...entries, ...lowerThirds];

    // Check 1: Has entries
    checks.push({
        name: 'Has graphics entries',
        passed: allEntries.length > 0,
        details: `${entries.length} graphics, ${lowerThirds.length} lower thirds`,
        severity: 'info',
    });

    if (allEntries.length === 0) {
        return { module: 'graphics', passed: true, checks, summary: '0 entries (may be valid)' };
    }

    // Check 2: Valid timecodes
    const validTimecodes = allEntries.every((e: any) =>
        (e.timecodeIn || e.tcIn) && (e.timecodeOut || e.tcOut)
    );
    checks.push({
        name: 'Has timecodes',
        passed: validTimecodes,
        details: validTimecodes ? 'All entries have timecodes' : 'Missing timecodes',
        severity: 'warning',
    });

    // Check 3: Has content
    const hasContent = allEntries.every((e: any) =>
        e.content || e.text || e.description
    );
    checks.push({
        name: 'Entries have content',
        passed: hasContent,
        details: hasContent ? 'All entries have content' : 'Some entries missing content',
        severity: 'warning',
    });

    // Check 4: Program title
    const hasTitle = graphics?.programTitle && graphics.programTitle.length > 0;
    checks.push({
        name: 'Program title extracted',
        passed: hasTitle,
        details: hasTitle ? `Title: "${graphics.programTitle}"` : 'No title found',
        severity: 'info',
    });

    const passed = checks.filter(c => c.severity === 'critical').every(c => c.passed);
    return {
        module: 'graphics',
        passed,
        checks,
        summary: `${entries.length} graphics, ${lowerThirds.length} lower thirds`,
    };
}

function validateCast(cast: any[], videoDuration: number): ModuleValidation {
    const checks: ValidationCheck[] = [];
    const people = cast || [];

    // Check 1: Has people
    checks.push({
        name: 'Has cast members',
        passed: people.length > 0,
        details: `${people.length} people found`,
        severity: 'info',
    });

    if (people.length === 0) {
        return { module: 'cast', passed: true, checks, summary: '0 people (may be valid)' };
    }

    // Check 2: Valid first appearance timecodes
    const validTimecodes = people.every((p: any) =>
        p.firstAppearance && /^\d{2}:\d{2}:\d{2}$/.test(p.firstAppearance)
    );
    checks.push({
        name: 'Valid firstAppearance timecodes',
        passed: validTimecodes,
        details: validTimecodes ? 'All timecodes valid' : 'Invalid timecodes',
        severity: 'warning',
    });

    // Check 3: Has names
    const hasNames = people.every((p: any) => p.name && p.name.length > 0);
    checks.push({
        name: 'All people have names',
        passed: hasNames,
        details: hasNames ? 'All names present' : 'Missing names',
        severity: 'warning',
    });

    // Check 4: Has biographies
    const hasBios = people.filter((p: any) => p.biography && p.biography.length > 20).length;
    checks.push({
        name: 'Has biographies',
        passed: hasBios > 0,
        details: `${hasBios}/${people.length} have biographies`,
        severity: 'info',
    });

    // Check 5: Identified vs unidentified
    const identified = people.filter((p: any) => p.isIdentified).length;
    checks.push({
        name: 'Identified people',
        passed: true,
        details: `${identified}/${people.length} identified by name`,
        severity: 'info',
    });

    const passed = checks.filter(c => c.severity === 'critical').every(c => c.passed);
    return {
        module: 'cast',
        passed,
        checks,
        summary: `${people.length} people, ${identified} identified`,
    };
}

function validateSynopsis(synopsis: any): ModuleValidation {
    const checks: ValidationCheck[] = [];

    // Check 1: Has title
    const hasTitle = synopsis?.title && synopsis.title.length > 0;
    checks.push({
        name: 'Has title',
        passed: hasTitle,
        details: hasTitle ? `"${synopsis.title}"` : 'No title',
        severity: 'critical',
    });

    // Check 2: Has logline
    const hasLogline = synopsis?.oneLine && synopsis.oneLine.length > 0;
    checks.push({
        name: 'Has logline',
        passed: hasLogline,
        details: hasLogline ? `${synopsis.oneLine.length} chars` : 'No logline',
        severity: 'warning',
    });

    // Check 3: Has summary
    const hasSummary = synopsis?.paragraph && synopsis.paragraph.length > 50;
    checks.push({
        name: 'Has summary',
        passed: hasSummary,
        details: hasSummary ? `${synopsis.paragraph.length} chars` : 'No summary',
        severity: 'warning',
    });

    // Check 4: Has full synopsis
    const hasFullSynopsis = synopsis?.fullSynopsis && synopsis.fullSynopsis.length > 100;
    checks.push({
        name: 'Has full synopsis',
        passed: hasFullSynopsis,
        details: hasFullSynopsis ? `${synopsis.fullSynopsis.length} chars` : 'No full synopsis',
        severity: 'warning',
    });

    // Check 5: Has themes
    const hasThemes = synopsis?.keyThemes && synopsis.keyThemes.length > 0;
    checks.push({
        name: 'Has themes',
        passed: hasThemes,
        details: hasThemes ? `"${synopsis.keyThemes}"` : 'No themes',
        severity: 'info',
    });

    const passed = checks.filter(c => c.severity === 'critical').every(c => c.passed);
    return {
        module: 'synopsis',
        passed,
        checks,
        summary: hasTitle ? `"${synopsis.title}"` : 'MISSING SYNOPSIS',
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
    const jobId = process.argv[2];

    if (!jobId) {
        console.error('Usage: npx ts-node scripts/validate_job.ts <JOB_ID>');
        process.exit(1);
    }

    console.log('╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  LIVE JOB VALIDATION: 60+ Minute Video Analysis                            ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`Job ID: ${jobId}`);
    console.log();

    // Fetch job from Firestore
    console.log('[ FETCHING JOB DATA ]');
    console.log('─'.repeat(78));

    try {
        const jobDoc = await db.collection('jobs').doc(jobId).get();

        if (!jobDoc.exists) {
            console.error('Job not found in Firestore');
            process.exit(1);
        }

        const job = jobDoc.data() as any;
        console.log(`Status: ${job.status}`);
        console.log(`Created: ${job.createdAt?.toDate?.() || 'Unknown'}`);

        if (job.status !== 'completed') {
            console.error(`Job status is "${job.status}", expected "completed"`);
            process.exit(1);
        }

        const videoDuration = job.input?.duration || 3600;
        console.log(`Video Duration: ${formatDuration(videoDuration)} (${videoDuration}s)`);

        const results = job.results;
        if (!results) {
            console.error('No results found in job');
            process.exit(1);
        }

        console.log();

        // Validate each module
        console.log('[ RUNNING VALIDATION CHECKS ]');
        console.log('─'.repeat(78));

        const validations: ModuleValidation[] = [
            validateShotList(results.shotList?.shots || results.shotList, videoDuration),
            validateTranscription(results.transcription, videoDuration),
            validateFauna(results.fauna?.sightings || results.fauna, videoDuration),
            validateGraphics(results.graphics, videoDuration),
            validateCast(results.cast?.people || results.bio, videoDuration),
            validateSynopsis(results.synopsis),
        ];

        for (const validation of validations) {
            const statusIcon = validation.passed ? '✓' : '✗';
            const statusColor = validation.passed ? '\x1b[32m' : '\x1b[31m';
            console.log();
            console.log(`${statusColor}${statusIcon}\x1b[0m MODULE: ${validation.module.toUpperCase()} - ${validation.summary}`);

            for (const check of validation.checks) {
                const checkIcon = check.passed ? '  ✓' : '  ✗';
                const severityColor = check.severity === 'critical' ? (check.passed ? '\x1b[32m' : '\x1b[31m') :
                    check.severity === 'warning' ? (check.passed ? '\x1b[32m' : '\x1b[33m') :
                        '\x1b[36m';
                console.log(`${severityColor}${checkIcon}\x1b[0m [${check.severity.toUpperCase()}] ${check.name}`);
                console.log(`      ${check.details}`);
            }
        }

        console.log();
        console.log('─'.repeat(78));

        // Summary
        const allPassed = validations.every(v => v.passed);
        const totalChecks = validations.reduce((sum, v) => sum + v.checks.length, 0);
        const passedChecks = validations.reduce((sum, v) => sum + v.checks.filter(c => c.passed).length, 0);
        const criticalFailed = validations.flatMap(v => v.checks).filter(c => c.severity === 'critical' && !c.passed);

        if (allPassed) {
            console.log('\x1b[32m╔════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
            console.log('\x1b[32m║  ✓ ALL CRITICAL CHECKS PASSED                                              ║\x1b[0m');
            console.log('\x1b[32m╚════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
        } else {
            console.log('\x1b[31m╔════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
            console.log('\x1b[31m║  ✗ CRITICAL CHECKS FAILED                                                  ║\x1b[0m');
            console.log('\x1b[31m╚════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
            console.log('\nFailed critical checks:');
            criticalFailed.forEach(c => console.log(`  - ${c.name}: ${c.details}`));
        }

        console.log();
        console.log(`Summary: ${passedChecks}/${totalChecks} checks passed`);
        console.log();

        // Generate test report
        console.log('[ TEST REPORT ]');
        console.log('═'.repeat(78));
        console.log(`
TEST REPORT: ${jobId}
${'='.repeat(50)}

Date: ${new Date().toISOString()}
Video Duration: ${formatDuration(videoDuration)}

MODULE RESULTS
--------------
${validations.map(v => `${v.module}: ${v.passed ? '✓ PASS' : '✗ FAIL'} - ${v.summary}`).join('\n')}

CRITICAL CHECKS: ${criticalFailed.length === 0 ? 'ALL PASSED' : `${criticalFailed.length} FAILED`}

OVERALL RESULT: ${allPassed ? 'PASS' : 'FAIL'}
`);

        process.exit(allPassed ? 0 : 1);

    } catch (error) {
        console.error('Error fetching job:', error);
        process.exit(1);
    }
}

main().catch(console.error);
