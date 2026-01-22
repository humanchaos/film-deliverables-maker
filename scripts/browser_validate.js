/**
 * Browser Console Validation Script
 * 
 * Paste this into the browser console after analysis completes
 * to validate all results and timecodes.
 * 
 * Usage: Copy entire file, paste in browser console, call validateResults()
 */

(function () {
    'use strict';

    // Timecode parsing utility
    function tcToSeconds(tc) {
        if (!tc) return 0;
        const parts = tc.split(':').map(Number);
        if (parts.length === 4) return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 25;
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    }

    function formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // Find the results in the page
    function findResults() {
        // Try various common storage patterns
        if (window.__ANALYSIS_RESULTS__) return window.__ANALYSIS_RESULTS__;
        if (window.analysisResults) return window.analysisResults;

        // Try React state (common pattern)
        const root = document.getElementById('root');
        if (root && root._reactRootContainer) {
            try {
                const state = root._reactRootContainer._internalRoot.current.memoizedState;
                // Navigate through React tree... this is fragile
            } catch (e) { }
        }

        // Fallback: look for results in localStorage
        try {
            const stored = localStorage.getItem('lastAnalysisResults');
            if (stored) return JSON.parse(stored);
        } catch (e) { }

        return null;
    }

    // Main validation function
    window.validateResults = function (results) {
        results = results || findResults();

        if (!results) {
            console.error('❌ No results found. Pass results object: validateResults(yourResultsObject)');
            console.log('Tip: You can also call: validateResults(window.YOUR_RESULTS_VARIABLE)');
            return;
        }

        console.log('%c╔════════════════════════════════════════════════════════════════════╗', 'color: #00f');
        console.log('%c║  60+ MINUTE VIDEO ANALYSIS - BROWSER VALIDATION                   ║', 'color: #00f');
        console.log('%c╚════════════════════════════════════════════════════════════════════╝', 'color: #00f');
        console.log('');

        const report = {
            modules: {},
            passed: 0,
            failed: 0,
            warnings: 0
        };

        // ================= SHOT LIST =================
        console.log('%c📹 SHOT LIST', 'font-weight: bold; font-size: 14px');
        const shots = results.shotList || [];

        if (shots.length === 0) {
            console.log('  ❌ EMPTY - No shots found');
            report.failed++;
        } else {
            console.log(`  ✓ ${shots.length} shots found`);

            // Check first/last
            console.log(`  First shot: ${shots[0].tcIn}`);
            console.log(`  Last shot:  ${shots[shots.length - 1].tcOut}`);

            // Check for overlaps
            let overlaps = 0;
            let gaps = 0;
            for (let i = 1; i < shots.length; i++) {
                const prevEnd = tcToSeconds(shots[i - 1].tcOut);
                const currStart = tcToSeconds(shots[i].tcIn);
                if (currStart < prevEnd - 0.5) overlaps++;
                if (currStart - prevEnd > 10) gaps++;
            }

            if (overlaps > 0) {
                console.log(`  ⚠️ ${overlaps} overlapping shots`);
                report.warnings++;
            } else {
                console.log('  ✓ No overlapping shots');
            }

            if (gaps > 0) {
                console.log(`  ⚠️ ${gaps} gaps >10 seconds`);
                report.warnings++;
            }

            // Check for negative durations
            const negative = shots.filter(s => tcToSeconds(s.tcOut) <= tcToSeconds(s.tcIn));
            if (negative.length > 0) {
                console.log(`  ❌ ${negative.length} shots with negative duration`);
                report.failed++;
            } else {
                console.log('  ✓ All durations positive');
            }

            // Check descriptions
            const generic = shots.filter(s => !s.description || /^Shot \d+$/.test(s.description));
            console.log(`  📝 ${shots.length - generic.length}/${shots.length} have AI descriptions`);

            report.modules.shotList = { count: shots.length, overlaps, gaps };
            report.passed++;
        }
        console.log('');

        // ================= TRANSCRIPTION =================
        console.log('%c🎤 TRANSCRIPTION', 'font-weight: bold; font-size: 14px');
        const transcription = results.transcription || {};
        const segments = transcription.segments || [];

        if (segments.length === 0) {
            console.log('  ❌ EMPTY - No segments found');
            report.failed++;
        } else {
            console.log(`  ✓ ${segments.length} segments found`);

            // Word count
            const fullText = transcription.fullText || transcription.text || '';
            const wordCount = fullText.split(/\s+/).filter(w => w).length;
            console.log(`  📝 ${wordCount} words total`);

            // Time range
            console.log(`  First segment: ${segments[0].startTime}`);
            console.log(`  Last segment:  ${segments[segments.length - 1].endTime}`);

            // Speaker analysis
            const speakers = new Set(segments.map(s => s.speaker));
            console.log(`  👥 ${speakers.size} speakers: ${[...speakers].join(', ')}`);

            // Time ordering
            let timeIssues = 0;
            for (let i = 1; i < segments.length; i++) {
                if (tcToSeconds(segments[i].startTime) < tcToSeconds(segments[i - 1].endTime) - 1) {
                    timeIssues++;
                }
            }
            if (timeIssues > 0) {
                console.log(`  ⚠️ ${timeIssues} time ordering issues`);
                report.warnings++;
            } else {
                console.log('  ✓ Segments in chronological order');
            }

            report.modules.transcription = { segments: segments.length, words: wordCount, speakers: speakers.size };
            report.passed++;
        }
        console.log('');

        // ================= FAUNA =================
        console.log('%c🦁 FAUNA', 'font-weight: bold; font-size: 14px');
        const fauna = results.fauna || [];

        if (fauna.length === 0) {
            console.log('  ℹ️ No fauna sightings (may be valid for non-nature content)');
        } else {
            console.log(`  ✓ ${fauna.length} sightings found`);

            const species = new Set(fauna.map(f => f.latinName || f.commonName));
            console.log(`  🦎 ${species.size} unique species`);

            // Categories
            const categories = {};
            fauna.forEach(f => {
                categories[f.category] = (categories[f.category] || 0) + 1;
            });
            console.log(`  📊 Categories: ${JSON.stringify(categories)}`);

            // Sample sightings
            console.log('  Sample sightings:');
            fauna.slice(0, 5).forEach(f => {
                console.log(`    ${f.timecode} - ${f.commonName} (${f.latinName})`);
            });

            report.modules.fauna = { count: fauna.length, species: species.size };
        }
        report.passed++;
        console.log('');

        // ================= GRAPHICS =================
        console.log('%c📺 GRAPHICS', 'font-weight: bold; font-size: 14px');
        const graphics = results.graphics || {};
        const graphicsEntries = graphics.graphics || [];
        const lowerThirds = graphics.lowerThirds || [];

        console.log(`  Title: "${graphics.programTitle || 'Not detected'}"`);
        console.log(`  Runtime: ${graphics.runtime || 'Not detected'}`);
        console.log(`  📋 ${graphicsEntries.length} graphics entries`);
        console.log(`  👤 ${lowerThirds.length} lower thirds`);

        if (lowerThirds.length > 0) {
            console.log('  Lower thirds:');
            lowerThirds.slice(0, 5).forEach(lt => {
                console.log(`    ${lt.timecodeIn} - "${lt.text || lt.content}"`);
            });
        }

        report.modules.graphics = { entries: graphicsEntries.length, lowerThirds: lowerThirds.length };
        report.passed++;
        console.log('');

        // ================= CAST =================
        console.log('%c👥 CAST / BIO', 'font-weight: bold; font-size: 14px');
        const cast = results.bio || [];

        if (cast.length === 0) {
            console.log('  ℹ️ No cast detected (may be valid)');
        } else {
            console.log(`  ✓ ${cast.length} people found`);

            cast.forEach(p => {
                const identified = p.isIdentified !== false;
                console.log(`    ${identified ? '✓' : '?'} ${p.name} - ${p.title || 'Unknown'} (first seen: ${p.firstAppearance || 'N/A'})`);
            });

            report.modules.cast = { count: cast.length };
        }
        report.passed++;
        console.log('');

        // ================= SYNOPSIS =================
        console.log('%c📝 SYNOPSIS', 'font-weight: bold; font-size: 14px');
        const synopsis = results.synopsis || {};

        console.log(`  Title: "${synopsis.title || 'Not generated'}"`);
        console.log(`  Logline: "${(synopsis.oneLine || '').substring(0, 80)}${synopsis.oneLine?.length > 80 ? '...' : ''}"`);
        console.log(`  Summary: ${(synopsis.paragraph || '').length} chars`);
        console.log(`  Full Synopsis: ${(synopsis.fullSynopsis || '').length} chars`);
        console.log(`  Themes: "${synopsis.keyThemes || 'Not detected'}"`);
        console.log(`  Audience: "${synopsis.targetAudience || 'Not detected'}"`);

        report.modules.synopsis = {
            hasTitle: !!synopsis.title,
            hasLogline: !!synopsis.oneLine,
            hasSummary: (synopsis.paragraph || '').length > 50
        };
        report.passed++;
        console.log('');

        // ================= FINAL SUMMARY =================
        console.log('%c═══════════════════════════════════════════════════════════════════════', 'color: #888');
        console.log('%c📊 VALIDATION SUMMARY', 'font-weight: bold; font-size: 14px');
        console.log(`  ✓ Passed: ${report.passed}`);
        console.log(`  ❌ Failed: ${report.failed}`);
        console.log(`  ⚠️ Warnings: ${report.warnings}`);
        console.log('');

        if (report.failed === 0) {
            console.log('%c  ✅ ALL CHECKS PASSED', 'color: green; font-weight: bold');
        } else {
            console.log('%c  ❌ SOME CHECKS FAILED', 'color: red; font-weight: bold');
        }

        console.log('');
        console.log('Full report object available at: window.lastValidationReport');
        window.lastValidationReport = report;

        return report;
    };

    // Also expose a helper to manually set results
    window.setAnalysisResults = function (results) {
        window.__ANALYSIS_RESULTS__ = results;
        console.log('Results stored. Now call: validateResults()');
    };

    console.log('%c🔍 Validation script loaded!', 'color: green; font-weight: bold');
    console.log('Call validateResults() to validate analysis results');
    console.log('Or call validateResults(yourResultsObject) with your results');

})();
