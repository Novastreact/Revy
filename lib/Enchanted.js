class EnhancedProgressTracker {
    constructor(progressBar, updateInterval = 50, totalSize, totalFiles, startTime) {
        this.progressBar = progressBar;
        this.updateInterval = updateInterval;
        this.remainingUpdateInterval = 250; // NEW: Update interval khusus untuk Remaining (500ms)
        this.copiedFiles = 0;
        this.copiedSize = 0;
        this.lastUpdateTime = Date.now();
        this.lastProgressUpdate = 0;
        this.lastRemainingUpdate = 0; // NEW: Waktu terakhir update Remaining
        this.startTime = startTime;
        this.totalSize = Math.max(1, totalSize || 1); // Prevent zero division
        this.totalFiles = Math.max(0, totalFiles || 0);

        // Speed tracking with smoothing - FIXED for large files
        this.bytesAtLastUpdate = 0;
        this.timeAtLastUpdate = startTime;
        this.emaSpeed = 0.0; // MB/s EMA for displayed speed
        this.alphaSpeed = 0.25; // Reduced alpha for more stable speed (was 0.35)
        this.maxSpikeMultiplier = 3.0; // Reduced spike tolerance (was 4.0)
        this.minTimeForInstantCalc = 0.1; // Increased minimum time (was 0.05)
        this.speedUpdateInterval = 250; // Increased update interval (was 250ms)
        this.lastSpeedUpdate = startTime;
        this.noProgressDecayFactor = 0.95; // Less aggressive decay (was 0.92)

        // Sliding window for recent instant speeds (in MB/s) - ENHANCED
        this.speedSamples = [];
        this.sampleWindow = 5; // Reduced window size for stability (was 8)
        this.sampleTimestamps = [];

        // ETA smoothing (separate EMA) - ENHANCED
        this.emaEtaSeconds = null;
        this.alphaEta = 0.15; // Even lower alpha for smoother ETA (was 0.20)

        // Enhanced ETA stability tracking - IMPROVED
        this.etaHistory = [];
        this.etaHistoryWindow = 8; // Increased window (was 5)
        this.minEtaStabilitySeconds = 3; // Increased stability time (was 2)
        this.etaStabilityThreshold = 0.25; // Tighter threshold (was 0.3)

        // NEW: Large file handling
        this.isLargeOperation = totalSize > (1024 * 1024 * 1024); // 1GB+
        this.largeFileMinSpeed = 0.1; // Minimum fallback speed for large files (MB/s)
        this.maxReasonableEta = 86400; // Maximum 24 hours ETA display

        // NEW: Menyimpan nilai ETA terakhir untuk digunakan saat update Remaining
        this.lastEtaValue = '0s';
    }

    updateProgress(filePath, fileSize, startTime) {
        // Called for a completed small file
        this.copiedFiles++;
        this.copiedSize += fileSize;
        this._updateProgressDisplay();
    }

    updateProgressChunk(chunkSize) {
        // Called while streaming large files
        this.copiedSize += chunkSize;
        this._updateProgressDisplay();
    }

    fileCompleted(filePath, fileSize) {
        // Called when a streamed file finishes
        this.copiedFiles++;
        // copiedSize already incremented by chunks
        this._updateProgressDisplay();
    }

    _pushSpeedSample(instantSpeed) {
        // ENHANCED: Better validation for large file scenarios
        if (!isFinite(instantSpeed) || instantSpeed <= 0 || instantSpeed > 10000) {
            return; // Reject unrealistic speeds (>10GB/s)
        }

        this.speedSamples.push(instantSpeed);
        this.sampleTimestamps.push(Date.now());

        // keep window size
        while (this.speedSamples.length > this.sampleWindow) {
            this.speedSamples.shift();
            this.sampleTimestamps.shift();
        }
    }

    _filteredSpeedFromSamples() {
        const arr = this.speedSamples.slice();
        if (arr.length === 0) return 0;

        // For large operations, use more conservative filtering
        if (this.isLargeOperation && arr.length >= 3) {
            // Remove outliers (top and bottom 20% for large files)
            arr.sort((a, b) => a - b);
            const removeCount = Math.floor(arr.length * 0.2);
            const filtered = arr.slice(removeCount, arr.length - removeCount);
            if (filtered.length > 0) {
                return filtered.reduce((sum, val) => sum + val, 0) / filtered.length;
            }
        }

        // Standard median approach
        arr.sort((a, b) => a - b);
        const mid = Math.floor(arr.length / 2);
        if (arr.length % 2 === 1) return arr[mid];
        return (arr[mid - 1] + arr[mid]) / 2;
    }

    _calculateStableEta(rawEtaSeconds) {
        // ENHANCED: Better handling for large file operations

        // Immediate validation - prevent INF/NaN
        if (!isFinite(rawEtaSeconds) || rawEtaSeconds < 0 || rawEtaSeconds > this.maxReasonableEta) {
            rawEtaSeconds = this.maxReasonableEta; // Cap at 24 hours
        }

        // Add to history
        this.etaHistory.push({
            eta: rawEtaSeconds,
            timestamp: Date.now()
        });

        // Keep only recent history
        while (this.etaHistory.length > this.etaHistoryWindow) {
            this.etaHistory.shift();
        }

        // Check if we have enough history for stability analysis
        if (this.etaHistory.length < 3) {
            return Math.min(rawEtaSeconds, this.maxReasonableEta);
        }

        // Calculate variance in recent ETAs with outlier removal
        const recentEtas = this.etaHistory.map(h => h.eta)
            .filter(eta => isFinite(eta) && eta > 0 && eta <= this.maxReasonableEta);

        if (recentEtas.length < 2) {
            return Math.min(rawEtaSeconds, this.maxReasonableEta);
        }

        // For large operations, be more aggressive about outlier removal
        if (this.isLargeOperation && recentEtas.length >= 5) {
            recentEtas.sort((a, b) => a - b);
            const q1 = recentEtas[Math.floor(recentEtas.length * 0.25)];
            const q3 = recentEtas[Math.floor(recentEtas.length * 0.75)];
            const iqr = q3 - q1;
            const lowerBound = q1 - 1.5 * iqr;
            const upperBound = q3 + 1.5 * iqr;

            const filteredEtas = recentEtas.filter(eta => eta >= lowerBound && eta <= upperBound);
            if (filteredEtas.length >= 2) {
                const mean = filteredEtas.reduce((sum, eta) => sum + eta, 0) / filteredEtas.length;
                return Math.min(mean, this.maxReasonableEta);
            }
        }

        const mean = recentEtas.reduce((sum, eta) => sum + eta, 0) / recentEtas.length;
        const variance = recentEtas.reduce((sum, eta) => sum + Math.pow(eta - mean, 2), 0) / recentEtas.length;
        const stdDev = Math.sqrt(variance);

        // If variance is low relative to mean, use the smoothed value
        const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;

        if (coefficientOfVariation <= this.etaStabilityThreshold) {
            // Use weighted average favoring recent values
            let weightedSum = 0;
            let totalWeight = 0;

            for (let i = 0; i < recentEtas.length; i++) {
                const weight = i + 1; // More recent = higher weight
                weightedSum += recentEtas[i] * weight;
                totalWeight += weight;
            }

            const result = weightedSum / totalWeight;
            return Math.min(result, this.maxReasonableEta);
        }

        return Math.min(rawEtaSeconds, this.maxReasonableEta);
    }

    /**
     * Format ETA display with automatic unit conversion - ENHANCED
     * Rules:
     * 1. ≤ 300 seconds → display in seconds (rounded)
     * 2. > 300 and ≤ 3600 seconds → display in minutes (1 decimal)
     * 3. > 3600 seconds → display in hours (1 decimal)
     * 4. ALWAYS prevent INF, NaN, or unrealistic values
     */
    _formatEtaDisplay(etaSeconds) {
        // CRITICAL: Comprehensive input validation to prevent INF
        if (!isFinite(etaSeconds) || isNaN(etaSeconds) || etaSeconds < 0) {
            return '0s';
        }

        // Cap extremely large ETAs
        if (etaSeconds > this.maxReasonableEta) {
            const hours = this.maxReasonableEta / 3600;
            return `${hours.toFixed(1)}h+`;
        }

        // If very close to zero, show 0s
        if (etaSeconds < 1) {
            return '0s';
        }

        // Rule 1: ≤ 300 seconds → display in seconds (rounded)
        if (etaSeconds <= 300) {
            const seconds = Math.round(etaSeconds);
            return `${Math.max(0, seconds)}s`;
        }

        // Rule 2: > 300 and ≤ 3600 seconds → display in minutes (1 decimal)
        if (etaSeconds <= 3600) {
            const minutes = etaSeconds / 60;
            const formattedMinutes = Math.max(0, minutes).toFixed(1);
            return `${formattedMinutes}m`;
        }

        // Rule 3: > 3600 seconds → display in hours (1 decimal)
        const hours = etaSeconds / 3600;
        const formattedHours = Math.max(0, hours).toFixed(1);
        return `${formattedHours}h`;
    }

    _updateProgressDisplay() {
        const now = Date.now();

        // Update progress bar with higher frequency for smoother animation
        if (now - this.lastProgressUpdate >= this.updateInterval) {
            // Calculate percentage based on bytes transferred
            const percentage = this.totalSize > 0 ?
                Math.min(100, Math.round((this.copiedSize / this.totalSize) * 100)) : 0;

            // Speed & ETA calculation (COMPLETELY REWRITTEN for large file stability)
            let displaySpeed = '0.0';
            let eta = this.lastEtaValue; // Gunakan nilai ETA terakhir secara default

            const timeSinceLastSpeedCalc = now - this.lastSpeedUpdate;
            const timeDeltaSec = (now - this.timeAtLastUpdate) / 1000.0;
            const bytesDelta = this.copiedSize - this.bytesAtLastUpdate;

            // NEW: Hitung ETA hanya jika sudah 500ms sejak update Remaining terakhir
            const shouldUpdateRemaining = now - this.lastRemainingUpdate >= this.remainingUpdateInterval;

            // Only recalculate speed if enough time has passed
            if (timeSinceLastSpeedCalc >= this.speedUpdateInterval) {
                let instantSpeed = 0.0;

                // ENHANCED: More robust instant speed calculation
                if (timeDeltaSec >= this.minTimeForInstantCalc && bytesDelta > 0) {
                    instantSpeed = (bytesDelta / (1024 * 1024)) / timeDeltaSec; // MB/s

                    // Additional validation for large files
                    if (this.isLargeOperation) {
                        // For large files, cap instant speed to reasonable values
                        instantSpeed = Math.min(instantSpeed, 2000); // Max 2GB/s
                        instantSpeed = Math.max(instantSpeed, 0.01); // Min 0.01MB/s
                    }
                }

                if (instantSpeed > 0) {
                    // IMPROVED: Better spike detection for large files
                    if (this.emaSpeed > 0) {
                        const ratio = instantSpeed / this.emaSpeed;
                        if (ratio > this.maxSpikeMultiplier) {
                            instantSpeed = this.emaSpeed * this.maxSpikeMultiplier;
                        }
                    }
                    this._pushSpeedSample(instantSpeed);
                } else {
                    // No progress: decay emaSpeed slightly
                    this.emaSpeed = this.emaSpeed * this.noProgressDecayFactor;
                    if (this.emaSpeed < 0.01) this.emaSpeed = 0;
                }

                // Get filtered speed from recent samples
                const filteredFromSamples = this._filteredSpeedFromSamples();

                // Update EMA speed with enhanced logic
                if (this.emaSpeed <= 0) {
                    this.emaSpeed = filteredFromSamples > 0 ? filteredFromSamples : instantSpeed;
                } else if (filteredFromSamples > 0) {
                    this.emaSpeed = (this.alphaSpeed * filteredFromSamples) + ((1 - this.alphaSpeed) * this.emaSpeed);
                }

                // Ensure EMA speed is always positive and reasonable
                this.emaSpeed = Math.max(0.01, Math.min(this.emaSpeed, 2000));

                // Save markers for next calculation
                this.bytesAtLastUpdate = this.copiedSize;
                this.timeAtLastUpdate = now;
                this.lastSpeedUpdate = now;
            }

            // Determine display speed with fallback logic
            if (this.emaSpeed > 0.01) {
                displaySpeed = this.emaSpeed.toFixed(1);
            } else {
                // Use average since start as fallback
                const totalSeconds = Math.max(1, (now - this.startTime) / 1000);
                const avgSinceStart = Math.max(0.01, (this.copiedSize / (1024 * 1024)) / totalSeconds);
                displaySpeed = avgSinceStart.toFixed(1);
            }

            // NEW: Hitung ETA hanya jika sudah waktunya update Remaining
            if (shouldUpdateRemaining) {
                // --- COMPLETELY REWRITTEN ETA CALCULATION - NO MORE INF ---
                const remainingBytes = Math.max(0, this.totalSize - this.copiedSize);

                if (remainingBytes <= 0 || this.copiedSize >= this.totalSize) {
                    // Transfer complete
                    this.emaEtaSeconds = 0;
                    eta = '0s';
                } else {
                    // Determine the most reliable speed for ETA calculation
                    let speedForEta = this.emaSpeed;

                    // For large operations, be more conservative
                    if (this.isLargeOperation || speedForEta <= 0.01) {
                        const totalSeconds = Math.max(1, (now - this.startTime) / 1000);
                        const avgSinceStart = (this.copiedSize / (1024 * 1024)) / totalSeconds;

                        // Use the higher of EMA speed or average (more conservative)
                        speedForEta = Math.max(speedForEta, avgSinceStart);
                    }

                    // CRITICAL: Ensure speed is never zero or too small
                    const safeSpeedForEta = Math.max(this.largeFileMinSpeed, speedForEta);

                    // Calculate raw ETA with additional safeguards
                    let rawEtaSeconds;
                    try {
                        rawEtaSeconds = (remainingBytes / (1024 * 1024)) / safeSpeedForEta;

                        // Additional validation
                        if (!isFinite(rawEtaSeconds) || rawEtaSeconds < 0) {
                            rawEtaSeconds = this.maxReasonableEta;
                        }
                    } catch (error) {
                        rawEtaSeconds = this.maxReasonableEta;
                    }

                    // Apply stability filter
                    const stableEtaSeconds = this._calculateStableEta(rawEtaSeconds);

                    // Smooth with EMA
                    if (this.emaEtaSeconds === null) {
                        this.emaEtaSeconds = stableEtaSeconds;
                    } else {
                        this.emaEtaSeconds = (this.alphaEta * stableEtaSeconds) + ((1 - this.alphaEta) * this.emaEtaSeconds);
                    }

                    // Final validation and capping
                    this.emaEtaSeconds = Math.max(0, Math.min(this.emaEtaSeconds, this.maxReasonableEta));

                    // Format with guaranteed safe value
                    eta = this._formatEtaDisplay(this.emaEtaSeconds);
                }
                // --- END REWRITTEN ETA CALCULATION ---

                // Simpan nilai ETA terakhir dan update waktu update Remaining
                this.lastEtaValue = eta;
                this.lastRemainingUpdate = now;
            }

            // Format transferred amount with validation
            const transferredMB = Math.max(0, this.copiedSize / (1024 * 1024)).toFixed(1);
            const totalMB = Math.max(0, this.totalSize / (1024 * 1024)).toFixed(1);

            const filesDen = this.totalFiles > 0 ? this.totalFiles : Math.max(1, this.copiedFiles);
            const filesProgressDisplay = `${this.copiedFiles}/${filesDen}`;

            // Update progress bar with error handling
            try {
                this.progressBar.update(percentage, {
                    speed: `${displaySpeed} MB/s`,
                    transferred: `${transferredMB} MB`,
                    totalSize: `${totalMB} MB`,
                    filesProgress: filesProgressDisplay,
                    eta: eta
                });
            } catch (e) {
                // Progress bar might be externally stopped
            }

            this.lastProgressUpdate = now;
        }
    }

    // Call at end to ensure final state is displayed
    finalize() {
        const now = Date.now();
        const totalSeconds = Math.max(1, (now - this.startTime) / 1000);
        const avgSpeed = Math.max(0.01, (this.copiedSize / (1024 * 1024)) / totalSeconds);
        const transferredMB = Math.max(0, this.copiedSize / (1024 * 1024)).toFixed(1);
        const totalMB = Math.max(0, this.totalSize / (1024 * 1024)).toFixed(1);

        // Ensure copiedFiles equals totalFiles if totalFiles known
        const finalFiles = this.totalFiles > 0 ? this.totalFiles : this.copiedFiles;

        try {
            const finalSpeed = Math.max(0.01, this.emaSpeed) > 0.01
                ? Math.max(0.01, this.emaSpeed).toFixed(1)
                : avgSpeed.toFixed(1);

            // Set final ETA as 0s
            this.progressBar.update(100, {
                speed: `${finalSpeed} MB/s`,
                transferred: `${transferredMB} MB`,
                totalSize: `${totalMB} MB`,
                filesProgress: `${finalFiles}/${finalFiles}`,
                eta: '0s'
            });
        } catch (err) {
            // Silent error handling for finalization
        }
    }
}
// Export singleton instance
module.exports = new RevyCore();
