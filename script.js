/*
=========================================
  FREQLAB - SCRIPT.JS
  Vanilla JS & Web Audio API Engine
  100% Client-Side Processing & Tuning
=========================================
*/

// --- State Management ---
const AppState = {
    audioCtx: null,
    audioBuffer: null,          // Decoded audio data
    sourceNode: null,           // AudioBufferSourceNode
    analyserNode: null,         // AnalyserNode for spectrum visualization

    // Loaded file metadata
    loadedFileName: "track",

    // Playback state
    isPlaying: false,
    startTime: 0,               // AudioContext time when current session started playing
    startOffset: 0,             // Progress offset in buffer seconds (where we started playing)
    playbackRate: 1.0,          // Current playback rate based on selected tuning

    // UI components & timing
    animationFrameId: null,
    currentTuning: 440,         // Target tuning (Hz)
    standardFrequency: 440,     // Standard reference tuning (Hz)

    // For seeking
    isDraggingSeekBar: false
};

// --- DOM Element Selectors ---
const DOM = {
    fileInput: document.getElementById('audio-file'),
    dropZone: document.getElementById('drop-zone'),
    fileTextPrompt: document.getElementById('file-text-prompt'),
    fileInfo: document.getElementById('file-info'),
    fileName: document.getElementById('selected-file-name'),
    fileSize: document.getElementById('selected-file-size'),

    btnPlay: document.getElementById('btn-play'),
    btnPause: document.getElementById('btn-pause'),
    btnStop: document.getElementById('btn-stop'),
    btnExport: document.getElementById('btn-export'),

    currentTimeDisplay: document.getElementById('current-time'),
    durationDisplay: document.getElementById('duration'),
    seekBar: document.getElementById('seek-bar'),

    tuningSelect: document.getElementById('tuning-select'),
    playbackRateVal: document.getElementById('playback-rate-val'),
    pitchShiftCents: document.getElementById('pitch-shift-cents'),

    fftSizeSelect: document.getElementById('fft-size-select'),
    canvas: document.getElementById('visualizer-canvas')
};

// Canvas drawing context
let canvasCtx = DOM.canvas.getContext('2d');

// --- Initialization ---
function init() {
    setupEventListeners();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

// --- Event Listeners Registration ---
function setupEventListeners() {
    // File upload change
    DOM.fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop event handlers
    DOM.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.add('dragover');
    });

    DOM.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.remove('dragover');
    });

    DOM.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            DOM.fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        }
    });

    // Playback Controls
    DOM.btnPlay.addEventListener('click', () => {
        ensureAudioContext();
        play();
    });

    DOM.btnPause.addEventListener('click', () => {
        pause();
    });

    DOM.btnStop.addEventListener('click', () => {
        stop();
    });

    // WAV Export
    DOM.btnExport.addEventListener('click', () => {
        exportToWav();
    });

    // Seek / Progress bar interactions
    DOM.seekBar.addEventListener('input', () => {
        AppState.isDraggingSeekBar = true;
        // Update current time display as user drags
        const targetTime = (DOM.seekBar.value / 100) * (AppState.audioBuffer ? AppState.audioBuffer.duration : 0);
        DOM.currentTimeDisplay.textContent = formatTime(targetTime);
    });

    DOM.seekBar.addEventListener('change', () => {
        if (!AppState.audioBuffer) return;

        const targetPercent = DOM.seekBar.value;
        const targetTime = (targetPercent / 100) * AppState.audioBuffer.duration;

        seekTo(targetTime);
        AppState.isDraggingSeekBar = false;
    });

    // Tuning Selection
    DOM.tuningSelect.addEventListener('change', (e) => {
        const value = parseInt(e.target.value, 10);
        AppState.currentTuning = value;
        updateTuningParameters();
    });

    // FFT Size selection
    DOM.fftSizeSelect.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (AppState.analyserNode) {
            AppState.analyserNode.fftSize = val;
        }
    });
}

// --- Web Audio Context & Decoding ---
function ensureAudioContext() {
    if (!AppState.audioCtx) {
        // Handle standard & vendor-prefixed implementations
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        AppState.audioCtx = new AudioContextClass();
    }
    // Resume context if suspended due to autoplay policies
    if (AppState.audioCtx.state === 'suspended') {
        AppState.audioCtx.resume();
    }
}

function handleFileSelect() {
    const file = DOM.fileInput.files[0];
    if (!file) return;

    // Cache pure file name without extension
    AppState.loadedFileName = file.name.replace(/\.[^/.]+$/, "");

    // Show selected file information
    DOM.fileName.textContent = file.name;
    DOM.fileSize.textContent = formatBytes(file.size);
    DOM.fileInfo.classList.remove('hidden');
    DOM.fileTextPrompt.textContent = "File loaded successfully";

    // Stop current playback before reading new file
    stop();

    // Disable playback controls while loading
    setPlaybackButtonsState({ loading: true });

    // Read file as ArrayBuffer
    const reader = new FileReader();
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;

        ensureAudioContext();

        // Decode audio data asynchronously
        AppState.audioCtx.decodeAudioData(arrayBuffer)
            .then((decodedBuffer) => {
                AppState.audioBuffer = decodedBuffer;

                // Reset seek and times
                AppState.startOffset = 0;
                DOM.seekBar.value = 0;
                DOM.seekBar.disabled = false;
                DOM.currentTimeDisplay.textContent = "00:00";
                DOM.durationDisplay.textContent = formatTime(AppState.audioBuffer.duration);

                // Enable playback and export controls
                setPlaybackButtonsState({ ready: true });
                console.log("Audio decoded successfully. Duration:", AppState.audioBuffer.duration, "seconds");
            })
            .catch((err) => {
                console.error("Error decoding audio data:", err);
                alert("Failed to decode audio. Please ensure the file is a valid MP3/audio file.");
                setPlaybackButtonsState({ loading: false, ready: false });
            });
    };

    reader.onerror = function(err) {
        console.error("Error reading file:", err);
        alert("Failed to read the selected file.");
    };

    reader.readAsArrayBuffer(file);
}

// --- Dynamic Playback Controls ---
function play() {
    if (!AppState.audioBuffer || AppState.isPlaying) return;

    ensureAudioContext();

    // 1. Create AudioBufferSourceNode (must rebuild as it's single-use)
    AppState.sourceNode = AppState.audioCtx.createBufferSource();
    AppState.sourceNode.buffer = AppState.audioBuffer;

    // 2. Setup AnalyserNode if not already initialized
    if (!AppState.analyserNode) {
        AppState.analyserNode = AppState.audioCtx.createAnalyser();
        AppState.analyserNode.fftSize = parseInt(DOM.fftSizeSelect.value, 10);
    }

    // 3. Connect nodes: Source -> Analyser -> Destination
    AppState.sourceNode.connect(AppState.analyserNode);
    AppState.analyserNode.connect(AppState.audioCtx.destination);

    // 4. Set current playback rate based on chosen tuning
    AppState.sourceNode.playbackRate.value = AppState.playbackRate;

    // 5. Start audio source
    // Ensure standard boundaries
    if (AppState.startOffset < 0) AppState.startOffset = 0;
    if (AppState.startOffset >= AppState.audioBuffer.duration) AppState.startOffset = 0;

    AppState.sourceNode.start(0, AppState.startOffset);

    // Track timestamps
    AppState.isPlaying = true;
    AppState.startTime = AppState.audioCtx.currentTime;

    // Set ended callback to handle auto-progression to stop state
    AppState.sourceNode.onended = handlePlaybackEnded;

    // 6. Update UI
    setPlaybackButtonsState({ playing: true });

    // Start drawing spectrum visualizer loop
    drawSpectrum();
    updateProgressBarLoop();
}

function pause() {
    if (!AppState.isPlaying || !AppState.sourceNode) return;

    // Calculate current accumulated playback offset
    const elapsedRealTime = AppState.audioCtx.currentTime - AppState.startTime;
    AppState.startOffset += elapsedRealTime * AppState.playbackRate;

    // Cleanly stop the audio source node
    try {
        AppState.sourceNode.onended = null; // Prevent triggering ended handler
        AppState.sourceNode.stop();
    } catch (e) {
        console.warn("Source stop error:", e);
    }

    AppState.sourceNode = null;
    AppState.isPlaying = false;

    // Update UI states
    setPlaybackButtonsState({ playing: false, paused: true });
}

function stop() {
    // Stop audio source node if playing
    if (AppState.sourceNode) {
        try {
            AppState.sourceNode.onended = null;
            AppState.sourceNode.stop();
        } catch (e) {
            // Might have already finished
        }
        AppState.sourceNode = null;
    }

    AppState.isPlaying = false;
    AppState.startOffset = 0;

    // Reset UI
    DOM.currentTimeDisplay.textContent = "00:00";
    DOM.seekBar.value = 0;

    if (AppState.audioBuffer) {
        setPlaybackButtonsState({ ready: true });
    } else {
        setPlaybackButtonsState({ ready: false });
    }

    // Draw clear visualizer background
    clearCanvas();
}

function seekTo(targetTimeInSeconds) {
    const wasPlaying = AppState.isPlaying;

    if (wasPlaying) {
        // Stop current playing source first
        pause();
    }

    // Re-assign start offset to requested target
    AppState.startOffset = targetTimeInSeconds;

    // Update UI elements immediately
    DOM.currentTimeDisplay.textContent = formatTime(targetTimeInSeconds);
    DOM.seekBar.value = (targetTimeInSeconds / AppState.audioBuffer.duration) * 100;

    if (wasPlaying) {
        // Resume playing at new seek target
        play();
    }
}

function handlePlaybackEnded() {
    // Triggered when track finishes playing naturally
    stop();
}

// --- Tuning Conversion Calculation ---
function updateTuningParameters() {
    // Calculate the frequency tuning ratio against Standard 440 Hz
    // e.g., 432 / 440 = 0.9818x
    const newPlaybackRate = AppState.currentTuning / AppState.standardFrequency;

    // Update Pitch Cents offset: cents = 1200 * log2(f2/f1)
    const centsOffset = 1200 * Math.log2(newPlaybackRate);

    // Update displayed statistics
    DOM.playbackRateVal.textContent = newPlaybackRate.toFixed(4) + "x";
    DOM.pitchShiftCents.textContent = (centsOffset >= 0 ? "+" : "") + centsOffset.toFixed(1) + " cents";

    // Apply playbackRate modification in real-time to running source node
    if (AppState.isPlaying && AppState.sourceNode) {
        // Calculate accrued position at old rate before updating state
        const elapsedRealTime = AppState.audioCtx.currentTime - AppState.startTime;
        AppState.startOffset += elapsedRealTime * AppState.playbackRate;
        AppState.startTime = AppState.audioCtx.currentTime;

        // Smooth ramp to new speed to avoid clicks
        AppState.sourceNode.playbackRate.setTargetAtTime(newPlaybackRate, AppState.audioCtx.currentTime, 0.05);
    }

    // Now update the playback rate in AppState
    AppState.playbackRate = newPlaybackRate;
}

// --- WAV Export Module ---
function exportToWav() {
    if (!AppState.audioBuffer) return;

    // Indicate processing state visually
    const originalBtnText = DOM.btnExport.innerHTML;
    DOM.btnExport.innerHTML = '<span class="btn-icon">⏳</span> Processing...';
    DOM.btnExport.disabled = true;

    // Temporarily pause main playback so as to not conflict processing resources
    const wasPlaying = AppState.isPlaying;
    if (wasPlaying) {
        pause();
    }

    // Get input specifications
    const numChannels = AppState.audioBuffer.numberOfChannels;
    const sampleRate = AppState.audioBuffer.sampleRate;

    // Scale output duration directly based on the selected tuning ratio
    // Length (samples) = original duration (seconds) / playbackRate * sampleRate
    const targetLength = Math.floor((AppState.audioBuffer.duration / AppState.playbackRate) * sampleRate);

    // 1. Initialize OfflineAudioContext
    const OfflineCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offlineCtx = new OfflineCtxClass(numChannels, targetLength, sampleRate);

    // 2. Create and configure Offline Buffer Source
    const offlineSource = offlineCtx.createBufferSource();
    offlineSource.buffer = AppState.audioBuffer;
    offlineSource.playbackRate.value = AppState.playbackRate;

    // 3. Connect and schedule
    offlineSource.connect(offlineCtx.destination);
    offlineSource.start(0);

    // 4. Perform rendering
    offlineCtx.startRendering()
        .then((renderedBuffer) => {
            console.log("Offline audio rendering finished. Encoding to WAV...");

            // 5. Encode the rendered AudioBuffer to WAV format bytes
            const wavDataView = bufferToWav(renderedBuffer);

            // 6. Assemble download package
            const wavBlob = new Blob([wavDataView], { type: 'audio/wav' });
            const url = URL.createObjectURL(wavBlob);

            // 7. Auto-trigger browser download
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = `${AppState.loadedFileName}-converted-${AppState.currentTuning}Hz.wav`;
            document.body.appendChild(downloadLink);
            downloadLink.click();

            // Cleanup references
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);

            // Reset button state
            DOM.btnExport.innerHTML = originalBtnText;
            DOM.btnExport.disabled = false;

            // Resume audio if it was playing previously
            if (wasPlaying) {
                play();
            }
        })
        .catch((err) => {
            console.error("WAV Export rendering error:", err);
            alert("An error occurred while generating the WAV file.");
            DOM.btnExport.innerHTML = originalBtnText;
            DOM.btnExport.disabled = false;
        });
}

// Custom 16-bit PCM Linear WAV Encoder
function bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // 1 = raw 16-bit PCM (Pulse-Code Modulation)
    const bitDepth = 16;

    // Collect separate channel pointer arrays
    const channels = [];
    let length = 0;
    for (let i = 0; i < numOfChan; i++) {
        channels.push(buffer.getChannelData(i));
    }

    // Total interleaved sample length
    length = buffer.length;

    const bufferSize = length * numOfChan * (bitDepth / 8);
    const arrayBuffer = new ArrayBuffer(44 + bufferSize);
    const view = new DataView(arrayBuffer);

    /* ---- Write RIFF Container Header ---- */
    writeString(view, 0, 'RIFF');                         // ChunkID
    view.setUint32(4, 36 + bufferSize, true);             // ChunkSize
    writeString(view, 8, 'WAVE');                         // Format

    /* ---- Write 'fmt ' Sub-chunk Descriptor ---- */
    writeString(view, 12, 'fmt ');                        // Subchunk1ID
    view.setUint32(16, 16, true);                         // Subchunk1Size (16 for PCM)
    view.setUint16(20, format, true);                     // AudioFormat (1)
    view.setUint16(22, numOfChan, true);                  // NumChannels
    view.setUint32(24, sampleRate, true);                 // SampleRate
    view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true); // ByteRate
    view.setUint16(32, numOfChan * (bitDepth / 8), true); // BlockAlign
    view.setUint16(34, bitDepth, true);                   // BitsPerSample

    /* ---- Write 'data' Sub-chunk Content ---- */
    writeString(view, 36, 'data');                        // Subchunk2ID
    view.setUint32(40, bufferSize, true);                 // Subchunk2Size

    /* ---- Interleave and Encode PCM Samples ---- */
    let offset = 44;
    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numOfChan; channel++) {
            // Get sample [-1.0, 1.0] and clamp
            let sample = channels[channel][i];
            if (sample > 1.0) sample = 1.0;
            if (sample < -1.0) sample = -1.0;

            // Scale to 16-bit signed integer range: [-32768, 32767]
            const pcmSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, pcmSample, true);
            offset += 2;
        }
    }

    return view;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// --- UI Rendering Loops ---

// Real-time Canvas Rendering
function drawSpectrum() {
    if (!AppState.isPlaying || !AppState.analyserNode) {
        // End rendering loop if audio stopped
        return;
    }

    AppState.animationFrameId = requestAnimationFrame(drawSpectrum);

    const bufferLength = AppState.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    AppState.analyserNode.getByteFrequencyData(dataArray);

    const width = DOM.canvas.width;
    const height = DOM.canvas.height;

    // Clear background
    canvasCtx.fillStyle = '#0b0d13';
    canvasCtx.fillRect(0, 0, width, height);

    // Draw logarithmic grid or linear spectrum bars
    const barWidth = (width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const val = dataArray[i]; // value between 0 - 255

        // Dynamic normalization and scaling
        barHeight = (val / 255) * height * 0.9;

        // Gradient styling
        const percent = i / bufferLength;
        const gradient = canvasCtx.createLinearGradient(0, height, 0, height - barHeight);

        if (percent < 0.3) {
            // Cyber Cyan/Green Glow
            gradient.addColorStop(0, 'rgba(0, 240, 255, 0.3)');
            gradient.addColorStop(1, '#00f0ff');
        } else if (percent < 0.7) {
            // Bright Lime Green Accent
            gradient.addColorStop(0, 'rgba(57, 255, 20, 0.3)');
            gradient.addColorStop(1, '#39ff14');
        } else {
            // Purple/Vibrant Neon Pink Accent
            gradient.addColorStop(0, 'rgba(189, 0, 255, 0.3)');
            gradient.addColorStop(1, '#bd00ff');
        }

        canvasCtx.fillStyle = gradient;

        // Rounded bars logic for an organic aesthetics
        canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

        x += barWidth;
        if (x >= width) break;
    }

    // Add overlay effect: subtle neon glow on top frequency peaks
    canvasCtx.fillStyle = 'rgba(0, 240, 255, 0.1)';
    canvasCtx.fillRect(0, 0, width, 2);
}

// Progress / Seekbar Updating
function updateProgressBarLoop() {
    if (!AppState.isPlaying) return;

    if (!AppState.isDraggingSeekBar) {
        // Compute total accumulated playback seconds
        const elapsedRealTime = AppState.audioCtx.currentTime - AppState.startTime;
        const currentProgress = AppState.startOffset + (elapsedRealTime * AppState.playbackRate);
        const duration = AppState.audioBuffer ? AppState.audioBuffer.duration : 0;

        if (duration > 0) {
            // Update seek slider percentage
            const percent = (currentProgress / duration) * 100;
            DOM.seekBar.value = Math.min(percent, 100);

            // Update time indicator
            DOM.currentTimeDisplay.textContent = formatTime(Math.min(currentProgress, duration));
        }
    }

    // Request loop continuation
    requestAnimationFrame(updateProgressBarLoop);
}

// --- Helper Functions ---

// Resize canvas dynamically keeping rendering resolution high
function resizeCanvas() {
    const rect = DOM.canvas.getBoundingClientRect();
    DOM.canvas.width = rect.width * window.devicePixelRatio;
    DOM.canvas.height = rect.height * window.devicePixelRatio;

    // Draw background placeholder immediately
    clearCanvas();
}

function clearCanvas() {
    const width = DOM.canvas.width;
    const height = DOM.canvas.height;
    canvasCtx.fillStyle = '#0b0d13';
    canvasCtx.fillRect(0, 0, width, height);

    // Draw empty spectrum subtle flatline
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, height - 20);
    canvasCtx.lineTo(width, height - 20);
    canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    canvasCtx.lineWidth = 1;
    canvasCtx.stroke();
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function setPlaybackButtonsState({ loading = false, ready = false, playing = false, paused = false }) {
    if (loading) {
        DOM.btnPlay.disabled = true;
        DOM.btnPause.disabled = true;
        DOM.btnStop.disabled = true;
        DOM.btnExport.disabled = true;
        DOM.fileTextPrompt.textContent = "Decoding audio... Please wait.";
        return;
    }

    if (playing) {
        DOM.btnPlay.disabled = true;
        DOM.btnPause.disabled = false;
        DOM.btnStop.disabled = false;
        DOM.btnExport.disabled = false;
    } else if (paused) {
        DOM.btnPlay.disabled = false;
        DOM.btnPause.disabled = true;
        DOM.btnStop.disabled = false;
        DOM.btnExport.disabled = false;
    } else if (ready) {
        DOM.btnPlay.disabled = false;
        DOM.btnPause.disabled = true;
        DOM.btnStop.disabled = true;
        DOM.btnExport.disabled = false;
    } else {
        DOM.btnPlay.disabled = true;
        DOM.btnPause.disabled = true;
        DOM.btnStop.disabled = true;
        DOM.btnExport.disabled = true;
    }
}

// Start app
window.addEventListener('DOMContentLoaded', init);
