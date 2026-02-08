# VoxChronicle - Local Whisper Setup Guide

This guide covers installing and configuring a local Whisper backend for privacy-focused, offline transcription with VoxChronicle.

## Table of Contents

1. [Overview](#overview)
2. [System Requirements](#system-requirements)
3. [Installation](#installation)
   - [Windows](#windows-installation)
   - [macOS](#macos-installation)
   - [Linux](#linux-installation)
4. [Model Selection](#model-selection)
5. [Starting the Whisper Server](#starting-the-whisper-server)
6. [VoxChronicle Configuration](#voxchronicle-configuration)
7. [Testing Your Setup](#testing-your-setup)
8. [Troubleshooting](#troubleshooting)
9. [Performance Optimization](#performance-optimization)
10. [Alternative Backends](#alternative-backends)

---

## Overview

VoxChronicle supports **three transcription modes**:

| Mode | Description | Requirements | Best For |
|------|-------------|--------------|----------|
| **API** | OpenAI cloud transcription | Internet + API key | Quick setup, reliable |
| **Local** | Local Whisper backend | Local server running | Privacy, offline use |
| **Auto** | Try local first, fallback to API | Both configured | Best of both worlds |

Local transcription using Whisper offers:

- ✅ **Privacy**: Audio never leaves your machine
- ✅ **Offline**: Works without internet connection
- ✅ **Cost**: No per-minute API charges
- ✅ **Control**: Choose model size and quality
- ⚠️ **Performance**: Depends on your hardware (GPU recommended)
- ⚠️ **Setup**: Requires initial installation

---

## System Requirements

### Minimum Requirements

- **CPU**: Modern multi-core processor (Intel i5/AMD Ryzen 5 or better)
- **RAM**: 8 GB (16 GB recommended for larger models)
- **Storage**: 1-5 GB for Whisper models
- **OS**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+, Debian 11+, etc.)

### Recommended for Real-Time Performance

- **GPU**: NVIDIA GPU with CUDA support (GTX 1060 or better) or Apple Silicon (M1/M2/M3)
- **RAM**: 16 GB+
- **Storage**: SSD for faster model loading

### Performance Expectations

| Hardware | Model Size | Speed (vs realtime) | Quality |
|----------|-----------|---------------------|---------|
| CPU only (i5/Ryzen 5) | tiny/base | 0.5-1x (slower than realtime) | Fair |
| CPU only (i7/Ryzen 7) | small | 0.8-1.5x | Good |
| NVIDIA GTX 1660 | small/medium | 5-10x (5-10x faster) | Good-Excellent |
| NVIDIA RTX 3060+ | large | 10-20x | Excellent |
| Apple M1/M2/M3 | medium/large | 8-15x | Excellent |

---

## Installation

### Windows Installation

#### Option 1: Pre-built Binaries (Easiest)

1. **Download whisper.cpp**

   Visit the [whisper.cpp releases page](https://github.com/ggerganov/whisper.cpp/releases) and download the latest Windows binary:
   ```
   whisper.cpp-win-x64-[version].zip
   ```

2. **Extract the archive**
   ```powershell
   # Extract to a permanent location, e.g.:
   Expand-Archive -Path whisper.cpp-win-x64-*.zip -DestinationPath C:\whisper
   ```

3. **Add to PATH (optional)**
   ```powershell
   # Add whisper to PATH so you can run it from anywhere
   $env:Path += ";C:\whisper"

   # To make permanent, add via System Properties > Environment Variables
   ```

#### Option 2: Build from Source (with CUDA support)

**Prerequisites:**
- Visual Studio 2019+ with C++ tools
- [CMake](https://cmake.org/download/) (3.15+)
- [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) (optional, for GPU acceleration)

**Build steps:**
```powershell
# Clone the repository
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Create build directory
mkdir build
cd build

# Configure with CUDA support (omit -DWHISPER_CUDA=ON for CPU-only)
cmake .. -DWHISPER_CUDA=ON -DCMAKE_BUILD_TYPE=Release

# Build
cmake --build . --config Release

# Server binary will be at: build\bin\Release\server.exe
```

---

### macOS Installation

#### Option 1: Homebrew (Easiest)

```bash
# Install whisper.cpp
brew install whisper-cpp

# The server will be available as 'whisper-cpp-server'
```

#### Option 2: Build from Source (with Metal GPU support)

```bash
# Install dependencies
brew install cmake

# Clone the repository
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Build with Metal GPU acceleration (Apple Silicon)
make clean
WHISPER_METAL=1 make server

# Or build with CMake
mkdir build && cd build
cmake .. -DWHISPER_METAL=ON -DCMAKE_BUILD_TYPE=Release
make

# Server binary will be at: server or build/bin/server
```

---

### Linux Installation

#### Option 1: Package Manager (Ubuntu/Debian)

```bash
# Install build dependencies
sudo apt update
sudo apt install -y build-essential cmake git

# Clone and build whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make server

# Server binary will be at: ./server
```

#### Option 2: Build with CUDA (NVIDIA GPU)

```bash
# Install CUDA Toolkit first:
# https://developer.nvidia.com/cuda-downloads

# Install dependencies
sudo apt install -y build-essential cmake git nvidia-cuda-toolkit

# Clone the repository
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Build with CUDA support
mkdir build && cd build
cmake .. -DWHISPER_CUDA=ON -DCMAKE_BUILD_TYPE=Release
make

# Server binary will be at: build/bin/server
```

#### Option 3: Docker (All Platforms)

```bash
# Pull pre-built image
docker pull ghcr.io/ggerganov/whisper.cpp:latest

# Or build locally
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
docker build -t whisper-cpp .
```

---

## Model Selection

Whisper models come in different sizes with quality/speed tradeoffs.

### Available Models

| Model | Size | Relative Speed | English Quality | Multilingual Quality | Best For |
|-------|------|----------------|-----------------|----------------------|----------|
| **tiny** | 75 MB | Fastest | Fair | Poor | Quick testing only |
| **base** | 142 MB | Very Fast | Good | Fair | Testing, demos |
| **small** | 466 MB | Fast | Very Good | Good | Most users (recommended) |
| **medium** | 1.5 GB | Moderate | Excellent | Very Good | High quality needs |
| **large-v3** | 3.1 GB | Slow | Best | Best | Maximum accuracy |

### Downloading Models

**Automatic download (recommended):**

```bash
# Navigate to whisper.cpp directory
cd whisper.cpp

# Download a model (e.g., small)
bash ./models/download-ggml-model.sh small

# Models are saved to: models/ggml-small.bin
```

**Windows PowerShell:**
```powershell
cd C:\whisper
.\models\download-ggml-model.ps1 small
```

**Manual download:**

Visit the [Hugging Face model repository](https://huggingface.co/ggerganov/whisper.cpp/tree/main) and download directly:
```bash
# Example: Download small model
curl -L -o models/ggml-small.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

### Recommendation

**Start with the `small` model** - it provides excellent quality at reasonable speed for most hardware.

---

## Starting the Whisper Server

Once whisper.cpp is installed and a model is downloaded, start the HTTP server.

### Basic Server Start

**Linux/macOS:**
```bash
cd whisper.cpp

# Start server with small model on default port 8080
./server -m models/ggml-small.bin -p 8080

# You should see:
# whisper_init_from_file: loading model from 'models/ggml-small.bin'
# HTTP server listening at http://0.0.0.0:8080
```

**Windows:**
```powershell
cd C:\whisper

# Start server
.\build\bin\Release\server.exe -m models\ggml-small.bin -p 8080

# Or if using pre-built binary:
.\server.exe -m models\ggml-small.bin -p 8080
```

**Docker:**
```bash
# Run with model (mount models directory)
docker run -d \
  --name whisper-server \
  -p 8080:8080 \
  -v $(pwd)/models:/models \
  whisper-cpp \
  -m /models/ggml-small.bin -p 8080
```

### Server Options

```bash
# Common options:
./server \
  -m models/ggml-small.bin  # Model file (required)
  -p 8080                    # Port (default: 8080)
  -t 4                       # Number of threads (default: auto)
  --host 0.0.0.0            # Bind address (default: 0.0.0.0)
  --convert                  # Convert audio to WAV automatically
```

### With GPU Acceleration

**NVIDIA CUDA:**
```bash
# Server will auto-detect and use GPU if built with CUDA
./server -m models/ggml-small.bin -p 8080

# Check console for "CUDA enabled" message
```

**Apple Metal (M1/M2/M3):**
```bash
# Metal is automatically used if built with WHISPER_METAL=1
./server -m models/ggml-small.bin -p 8080

# Check console for "Metal enabled" message
```

### Running as a Background Service

**Linux (systemd):**

Create `/etc/systemd/system/whisper.service`:
```ini
[Unit]
Description=Whisper.cpp HTTP Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/whisper.cpp
ExecStart=/home/your-username/whisper.cpp/server -m models/ggml-small.bin -p 8080
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable whisper
sudo systemctl start whisper
sudo systemctl status whisper
```

**macOS (launchd):**

Create `~/Library/LaunchAgents/com.whisper.server.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.whisper.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/whisper-cpp-server</string>
        <string>-m</string>
        <string>/Users/your-username/whisper.cpp/models/ggml-small.bin</string>
        <string>-p</string>
        <string>8080</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Load and start:
```bash
launchctl load ~/Library/LaunchAgents/com.whisper.server.plist
launchctl start com.whisper.server
```

**Windows (NSSM - Non-Sucking Service Manager):**

```powershell
# Install NSSM from https://nssm.cc/download
# Or via Chocolatey:
choco install nssm

# Install service
nssm install WhisperServer "C:\whisper\server.exe" "-m C:\whisper\models\ggml-small.bin -p 8080"
nssm set WhisperServer AppDirectory "C:\whisper"
nssm start WhisperServer
```

---

## VoxChronicle Configuration

Once your Whisper server is running, configure VoxChronicle to use it.

### In Foundry VTT

1. **Navigate to Module Settings**
   ```
   Settings → Module Settings → VoxChronicle
   ```

2. **Configure Transcription Mode**
   - **Transcription Mode**: Choose one:
     - `API Only` - Use OpenAI only (requires API key)
     - `Local Whisper` - Use local server only
     - `Auto (Local + API Fallback)` - Try local first, fallback to API (recommended)

3. **Set Whisper Backend URL**
   - **Whisper Backend URL**: `http://localhost:8080`
   - Change if your server runs on a different port or host

4. **Configure Speaker Settings**
   - Map speaker IDs to player names in the **Speaker Labels** section

5. **Optional: Set Language**
   - **Transcription Language**: Choose your game's language for better accuracy

### Configuration Examples

**Privacy-focused (local only):**
```
Transcription Mode: Local Whisper
Whisper Backend URL: http://localhost:8080
OpenAI API Key: (leave empty)
```

**Reliability-focused (API only):**
```
Transcription Mode: API Only
OpenAI API Key: sk-...
Whisper Backend URL: (leave empty)
```

**Best of both worlds (auto):**
```
Transcription Mode: Auto (Local + API Fallback)
Whisper Backend URL: http://localhost:8080
OpenAI API Key: sk-...
```

---

## Testing Your Setup

### 1. Check Server Health

**In your browser:**
```
http://localhost:8080/health
```

You should see a success response or 404 (both indicate server is running).

**Using curl:**
```bash
curl http://localhost:8080/health
# or
curl http://localhost:8080/
```

### 2. Test with VoxChronicle

1. Open Foundry VTT with your world
2. Open the VoxChronicle recorder controls (left sidebar)
3. Look for the **transcription mode indicator** badge:
   - 🟢 **Green "Local"** = Backend connected
   - 🟡 **Yellow "Checking..."** = Connection in progress
   - 🔴 **Red "Unavailable"** = Backend not reachable
   - 🔵 **Blue "API"** = Using OpenAI API

4. **Test recording:**
   - Click **Start Recording**
   - Speak for 10-20 seconds
   - Click **Stop Recording**
   - Check console (F12) for transcription logs

### 3. Manual API Test

```bash
# Create a test audio file (or use an existing one)
# Test transcription
curl http://localhost:8080/inference \
  -F "file=@test-audio.wav" \
  -F "language=en" \
  -F "response_format=json"

# Should return JSON with transcription
```

---

## Troubleshooting

### Server Not Starting

**Problem:** `cannot find model file`

**Solution:**
```bash
# Ensure model path is correct
ls -l models/ggml-small.bin

# Re-download model if missing
bash models/download-ggml-model.sh small
```

---

**Problem:** `Address already in use` (port 8080)

**Solution:**
```bash
# Check what's using port 8080
# Linux/macOS:
lsof -i :8080

# Windows:
netstat -ano | findstr :8080

# Option 1: Stop the conflicting process
# Option 2: Use a different port
./server -m models/ggml-small.bin -p 8081

# Update VoxChronicle setting:
# Whisper Backend URL: http://localhost:8081
```

---

**Problem:** `Permission denied` when starting server

**Solution:**
```bash
# Make server executable (Linux/macOS)
chmod +x server

# Or run with explicit interpreter
bash server -m models/ggml-small.bin
```

---

### Connection Issues

**Problem:** VoxChronicle shows "Unavailable" status

**Checklist:**
1. ✅ Is the Whisper server running?
   ```bash
   # Check if server is responding
   curl http://localhost:8080/health
   ```

2. ✅ Is the URL correct in VoxChronicle settings?
   - Default: `http://localhost:8080`
   - Must include `http://` prefix

3. ✅ Is Foundry running on the same machine as Whisper?
   - If remote, use server IP: `http://192.168.1.100:8080`
   - Ensure firewall allows connections

4. ✅ Check browser console (F12) for detailed errors

---

**Problem:** Connection timeout during transcription

**Solution:**
```bash
# Increase timeout in server start (if supported)
./server -m models/ggml-small.bin -p 8080 --timeout 600

# Or use a faster model
./server -m models/ggml-base.bin -p 8080

# Or increase threads
./server -m models/ggml-small.bin -p 8080 -t 8
```

---

### Transcription Quality Issues

**Problem:** Poor transcription accuracy

**Solutions:**

1. **Use a larger model:**
   ```bash
   # Switch from small to medium
   ./server -m models/ggml-medium.bin -p 8080
   ```

2. **Set correct language in VoxChronicle:**
   - Settings → VoxChronicle → Transcription Language
   - Choose your game's language (e.g., "English", "Italiano")

3. **Improve audio quality:**
   - Use a better microphone
   - Reduce background noise
   - Enable noise suppression in VoxChronicle audio settings

4. **Check audio format:**
   - Whisper prefers WAV, FLAC, or MP3
   - WebM should work but may need conversion
   - Start server with `--convert` flag to auto-convert

---

**Problem:** No speaker diarization (all text unlabeled)

**Note:** Most whisper.cpp builds do **not** include speaker diarization.

**Solutions:**

1. **Use OpenAI API mode** for diarization:
   - Set Mode to "Auto" and configure API key
   - API transcription includes speaker labels

2. **Try alternative backends** with diarization:
   - [faster-whisper](https://github.com/guillaumekln/faster-whisper) with pyannote
   - [whisperx](https://github.com/m-bain/whisperX)
   - See [Alternative Backends](#alternative-backends) below

3. **Manual speaker labeling:**
   - Use VoxChronicle's speaker labeling UI after transcription
   - Map timestamps to speakers manually

---

### Performance Issues

**Problem:** Transcription is very slow (slower than realtime)

**Solutions:**

1. **Enable GPU acceleration:**
   ```bash
   # Rebuild with CUDA (NVIDIA) or Metal (Apple)
   # See Installation sections above

   # Verify GPU is being used (check console output)
   ./server -m models/ggml-small.bin -p 8080
   # Should see "CUDA enabled" or "Metal enabled"
   ```

2. **Use a smaller model:**
   ```bash
   ./server -m models/ggml-base.bin -p 8080
   ```

3. **Increase CPU threads:**
   ```bash
   # Set threads to number of CPU cores
   ./server -m models/ggml-small.bin -p 8080 -t 8
   ```

4. **Close other applications:**
   - Free up RAM and CPU resources during transcription

---

**Problem:** High RAM usage

**Solutions:**

1. **Use a smaller model:**
   - tiny: ~1 GB RAM
   - base: ~1 GB RAM
   - small: ~2 GB RAM
   - medium: ~5 GB RAM
   - large: ~10 GB RAM

2. **Reduce concurrent requests:**
   - Only run one transcription at a time

3. **Restart server between sessions:**
   - Memory may accumulate over long running periods

---

### Logs and Debugging

**Enable verbose logging in Whisper server:**
```bash
# Check server console output for errors
./server -m models/ggml-small.bin -p 8080

# Output shows:
# - Model loading progress
# - Incoming requests
# - Processing time
# - Errors
```

**Check VoxChronicle logs:**
```javascript
// In browser console (F12):
// Look for VoxChronicle logs with [LocalWhisperService] or [WhisperBackend] prefix

// Enable debug logging:
Logger.setLevel(Logger.LogLevel.DEBUG)
```

**Test API manually:**
```bash
# Detailed curl test with timing
time curl -v http://localhost:8080/inference \
  -F "file=@test.wav" \
  -F "language=en" \
  -F "response_format=json"
```

---

## Performance Optimization

### Hardware Acceleration

**NVIDIA GPU (CUDA):**

1. Install [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads)
2. Rebuild whisper.cpp with CUDA:
   ```bash
   cmake .. -DWHISPER_CUDA=ON
   make
   ```
3. Server automatically uses GPU when available

**Apple Silicon (Metal):**

1. Ensure Xcode Command Line Tools installed
2. Build with Metal support:
   ```bash
   WHISPER_METAL=1 make server
   ```
3. Metal provides 8-15x speedup on M1/M2/M3

**AMD GPU (ROCm) - Experimental:**

1. Install ROCm drivers
2. Build with HIP support (experimental):
   ```bash
   cmake .. -DWHISPER_HIPBLAS=ON
   make
   ```

### Model Optimization

**Quantized models (smaller + faster):**

```bash
# Download quantized models (if available)
# These use less RAM and are faster with minimal quality loss
./models/download-ggml-model.sh small-q5_0

# Start with quantized model
./server -m models/ggml-small-q5_0.bin -p 8080
```

**Core ML (macOS/iOS):**

```bash
# Build with Core ML support for Apple devices
cmake .. -DWHISPER_COREML=ON
make
```

### Server Tuning

```bash
# Optimal settings for different scenarios:

# High performance (GPU available):
./server \
  -m models/ggml-medium.bin \
  -p 8080 \
  -t 4 \
  --convert

# Balanced (CPU only):
./server \
  -m models/ggml-small.bin \
  -p 8080 \
  -t $(nproc) \
  --convert

# Low resource (old hardware):
./server \
  -m models/ggml-base.bin \
  -p 8080 \
  -t 2
```

---

## Alternative Backends

VoxChronicle supports any Whisper server with a compatible HTTP API. Here are alternatives to whisper.cpp:

### faster-whisper

[faster-whisper](https://github.com/guillaumekln/faster-whisper) is optimized for speed and supports speaker diarization.

**Install:**
```bash
pip install faster-whisper

# With diarization support
pip install pyannote.audio
```

**Start server:**
```bash
# Clone a compatible server implementation
git clone https://github.com/fedirz/faster-whisper-server
cd faster-whisper-server
pip install -r requirements.txt

# Start server
uvicorn main:app --host 0.0.0.0 --port 8080

# Configure VoxChronicle:
# Whisper Backend URL: http://localhost:8080
```

---

### WhisperX

[WhisperX](https://github.com/m-bain/whisperX) adds word-level timestamps and speaker diarization.

**Install:**
```bash
pip install whisperx

# Run as server (requires custom wrapper)
# See WhisperX documentation for server setup
```

---

### Whisper.cpp Docker with GPU

**NVIDIA GPU:**
```bash
docker run -d \
  --name whisper-gpu \
  --gpus all \
  -p 8080:8080 \
  -v $(pwd)/models:/models \
  whisper-cpp-cuda \
  -m /models/ggml-small.bin -p 8080
```

---

### Remote Whisper Server

Run Whisper on a powerful server and access from multiple clients:

**On the server:**
```bash
# Start with external access
./server -m models/ggml-medium.bin -p 8080 --host 0.0.0.0

# Configure firewall to allow port 8080
# Linux:
sudo ufw allow 8080/tcp
```

**On Foundry VTT client:**
```
Whisper Backend URL: http://192.168.1.100:8080
# Replace with your server's IP address
```

**Security considerations:**
- Use HTTPS if possible (requires reverse proxy like nginx)
- Consider authentication (not built into whisper.cpp)
- Use VPN or SSH tunnel for remote access:
  ```bash
  # SSH tunnel from client to server
  ssh -L 8080:localhost:8080 user@server

  # Then use:
  # Whisper Backend URL: http://localhost:8080
  ```

---

## Frequently Asked Questions

### Do I need an OpenAI API key for local mode?

**No.** If you set Mode to "Local Whisper", VoxChronicle will only use your local server. API key is optional.

### Can I use both local and API?

**Yes.** Set Mode to "Auto" and configure both. VoxChronicle tries local first, falls back to API if unavailable.

### Does local transcription support speaker diarization?

**Most whisper.cpp builds do not include diarization.** The local backend provides basic transcription without speaker labels. For diarization, use:
- Auto mode (falls back to API which has diarization)
- Alternative backends like faster-whisper with pyannote
- Manual speaker labeling in VoxChronicle UI

### How accurate is local transcription vs OpenAI API?

**Quality is comparable** when using the same model size:
- Local "small" model ≈ OpenAI Whisper small
- Local "large-v3" model ≈ OpenAI API quality

OpenAI API uses a tuned version of Whisper large-v3, so it may be slightly more accurate, but the difference is often negligible.

### Can I run the Whisper server on a different machine?

**Yes.** Start the server with `--host 0.0.0.0` and configure VoxChronicle with the server's IP:
```
http://192.168.1.100:8080
```

### Does local mode work offline?

**Yes.** Once models are downloaded and the server is running, no internet connection is required.

### What about privacy? Is audio stored anywhere?

**No.** whisper.cpp processes audio in memory and doesn't store files. Audio is transcribed and discarded immediately. Check your server implementation if using alternatives.

### Can I use this with other applications?

**Yes.** Any application that can send audio to an HTTP endpoint can use your Whisper server. It's not VoxChronicle-specific.

---

## Additional Resources

- [whisper.cpp GitHub](https://github.com/ggerganov/whisper.cpp)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [Whisper Model Card](https://github.com/openai/whisper/blob/main/model-card.md)
- [VoxChronicle Documentation](../README.md)
- [VoxChronicle API Reference](./API_REFERENCE.md)

---

## Getting Help

If you encounter issues not covered in this guide:

1. **Check server logs** for error messages
2. **Check browser console** (F12) for VoxChronicle errors
3. **Test server independently** with curl
4. **Visit the GitHub Issues** page for VoxChronicle
5. **Join the community Discord** (link in README)

---

**Happy transcribing!** 🎙️✨
