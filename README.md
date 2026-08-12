# MP3 Frequency Analyzer 🎵

A lightweight, web-based audio analyzer built with vanilla JavaScript and the Web Audio API. It allows users to upload any MP3 file and inspect its frequency spectrum (in Hertz) in real-time through an interactive canvas visualizer.

🚀 **Live Demo:** [https://anderitmo.github.io/mp3-frequency-analyzer/](https://YOUR-USERNAME.github.io/mp3-frequency-analyzer/)

---

## ✨ Features

- **Local Processing:** 100% client-side analysis — your audio files are never uploaded to a server.
- **Real-Time FFT Spectrum:** Converts audio signals from the time domain to the frequency domain using Fast Fourier Transform (FFT).
- **Hz Mapping:** Accurate mapping of frequency bins to human-audible Hz ranges.
- **Responsive Visualizer:** Smooth canvas rendering using `requestAnimationFrame`.
- **Zero Dependencies:** Pure HTML5, CSS3, and modern JavaScript (no external frameworks required).

---

## 🛠️ How It Works

1. **HTML5 File API:** Reads the local `.mp3` file as an `ArrayBuffer`.
2. **AudioContext:** Decodes the raw audio data into audio buffers.
3. **AnalyserNode:** Performs real-time frequency analysis (`getByteFrequencyData`) via FFT.
4. **HTML5 Canvas:** Renders visual representations of the audio frequencies.

---

## 🚀 Getting Started

### Local Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/YOUR-USERNAME/mp3-frequency-analyzer.git](https://github.com/YOUR-USERNAME/mp3-frequency-analyzer.git)
   cd mp3-frequency-analyzer
