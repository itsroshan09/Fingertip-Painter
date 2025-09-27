// app.js — Fingertip Painter (robust + premium UI)
// Save together with index.html and styles.css

const video = document.getElementById('video');
const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');

const toggleCameraBtn = document.getElementById('toggleCameraBtn');
const clearBtn = document.getElementById('clearBtn');
const undoBtn = document.getElementById('undoBtn');
const exportBtn = document.getElementById('exportBtn');
const modeEl = document.getElementById('mode');
const outputEl = document.getElementById('output');
const brushSizeInput = document.getElementById('brushSize');
const brushColorInput = document.getElementById('brushColor');
const includeVideoCheckbox = document.getElementById('includeVideo');

// state
let cameraInstance = null;     // MediaPipe Camera helper instance (if used)
let fallbackStream = null;     // MediaStream when using fallback
let fallbackInterval = null;   // interval id for fallback send
let isCameraOn = false;

let drawingMode = false;
let lastPinch = false;
let lastPressTime = 0;
const DOUBLE_PRESS_WINDOW = 400; // ms

let smoothed = { x: 0, y: 0, init: false };
const SMOOTHING_ALPHA = 0.25;
const MIN_DIST = 2;

// strokes is array of stroke arrays; each stroke is array of {x,y,brush,color}
let strokes = [];
let currentStroke = null;

// Setup canvas resolution to video when metadata ready
function setCanvasSize() {
  const w = video.videoWidth || video.clientWidth || 640;
  const h = video.videoHeight || video.clientHeight || 480;
  canvas.width = w;
  canvas.height = h;
}

// draw everything (strokes + current stroke + indicator)
function drawAll(indicator) {
  // clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw stored strokes
  for (const stroke of strokes) {
    if (!stroke || stroke.length === 0) continue;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = stroke[0].brush || 6;
    ctx.strokeStyle = stroke[0].color || '#00C888';
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
    ctx.stroke();
  }

  // current stroke
  if (currentStroke && currentStroke.length > 0) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = currentStroke[0].brush || parseInt(brushSizeInput.value, 10);
    ctx.strokeStyle = currentStroke[0].color || brushColorInput.value;
    ctx.beginPath();
    ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
    for (let i = 1; i < currentStroke.length; i++) ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
    ctx.stroke();
  }

  // fingertip indicator
  if (indicator) {
    ctx.beginPath();
    ctx.fillStyle = indicator.pinch ? 'rgba(255,80,80,0.95)' : 'rgba(255,255,255,0.9)';
    const r = Math.max(6, parseInt(brushSizeInput.value, 10) / 2);
    ctx.arc(indicator.x, indicator.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// pinch detection using normalized landmarks
function isPinch(landmarks) {
  if (!landmarks || landmarks.length < 9) return false;
  const dx = landmarks[4].x - landmarks[8].x;
  const dy = landmarks[4].y - landmarks[8].y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < 0.06;
}

// MediaPipe Hands setup
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.6
});

hands.onResults(onResults);

// results callback
function onResults(results) {
  if (!video.videoWidth) return;
  setCanvasSize();

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    // convert normalized to pixel coords
    // our video is mirrored via CSS (to appear natural); mirror x so drawing matches user's finger
    const px = (1 - landmarks[8].x) * canvas.width;
    const py = landmarks[8].y * canvas.height;

    // smoothing
    if (!smoothed.init) {
      smoothed.x = px; smoothed.y = py; smoothed.init = true;
    } else {
      smoothed.x += SMOOTHING_ALPHA * (px - smoothed.x);
      smoothed.y += SMOOTHING_ALPHA * (py - smoothed.y);
    }

    const pinchNow = isPinch(landmarks);

    // rising edge detection for pinch
    if (pinchNow && !lastPinch) {
      const now = performance.now();
      if (now - lastPressTime < DOUBLE_PRESS_WINDOW) {
        // double-pinch toggles drawing mode
        drawingMode = !drawingMode;
        modeEl.textContent = drawingMode ? 'Drawing' : 'Idle';
        if (drawingMode) {
          // start new stroke
          currentStroke = [];
          // include brush metadata on first point
          currentStroke.push({ x: smoothed.x, y: smoothed.y, brush: parseInt(brushSizeInput.value, 10), color: brushColorInput.value });
          strokes.push(currentStroke);
        } else {
          // finish current stroke
          currentStroke = null;
        }
      }
      lastPressTime = now;
    }
    lastPinch = pinchNow;

    // if in drawing mode, append points if moved enough
    if (drawingMode && currentStroke) {
      const last = currentStroke.length ? currentStroke[currentStroke.length - 1] : null;
      if (!last || Math.hypot(smoothed.x - last.x, smoothed.y - last.y) > MIN_DIST) {
        currentStroke.push({ x: smoothed.x, y: smoothed.y, brush: parseInt(brushSizeInput.value, 10), color: brushColorInput.value });
      }
    }

    drawAll({ x: smoothed.x, y: smoothed.y, pinch: pinchNow });
  } else {
    // no hand detected; still render strokes
    drawAll(null);
  }
}

/* ---------------- Camera control (MediaPipe Camera helper OR fallback) ---------------- */

async function startCamera() {
  // If already started via fallback, don't reinit
  if (isCameraOn) return;
  setCanvasSize();

  // prefer MediaPipe Camera helper if available
  if (typeof Camera !== 'undefined') {
    try {
      cameraInstance = new Camera(video, {
        onFrame: async () => { await hands.send({ image: video }); },
        width: 1280,
        height: 720,
        facingMode: 'user'
      });
      await cameraInstance.start();
      // mirror video visually
      video.style.transform = 'scaleX(-1)';
      isCameraOn = true;
      toggleCameraBtn.textContent = 'Stop Camera';
      return;
    } catch (err) {
      // fallback to getUserMedia if Camera helper fails
      console.warn('MediaPipe Camera helper failed, falling back to getUserMedia:', err);
    }
  }

  // fallback getUserMedia
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } });
    fallbackStream = stream;
    video.srcObject = stream;
    await video.play();
    video.style.transform = 'scaleX(-1)';
    // send frames at ~30fps
    fallbackInterval = setInterval(() => {
      hands.send({ image: video }).catch((e) => {/* swallow */});
    }, 1000 / 30);
    isCameraOn = true;
    toggleCameraBtn.textContent = 'Stop Camera';
  } catch (err) {
    console.error('getUserMedia failed:', err);
    alert('Camera start failed. Make sure you gave permission and are running on https or localhost.');
  }
}

function stopCamera() {
  // stop MediaPipe Camera helper
  if (cameraInstance && typeof cameraInstance.stop === 'function') {
    try { cameraInstance.stop(); } catch (e) { /* ignore */ }
    cameraInstance = null;
  }
  // stop fallback stream
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
  }
  if (fallbackStream) {
    try {
      fallbackStream.getTracks().forEach(t => t.stop());
    } catch (e) { /* ignore */ }
    fallbackStream = null;
  }
  // clear video src
  try { video.srcObject = null; } catch (e) { /* ignore */ }
  isCameraOn = false;
  toggleCameraBtn.textContent = 'Start Camera';
}

/* ---------------- UI wiring ---------------- */

toggleCameraBtn.addEventListener('click', async () => {
  if (!isCameraOn) {
    await startCamera();
  } else {
    stopCamera();
  }
});

// Clear all strokes
clearBtn.addEventListener('click', () => {
  strokes = [];
  currentStroke = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Undo last stroke
undoBtn.addEventListener('click', () => {
  if (strokes.length) {
    strokes.pop();
    currentStroke = null;
    drawAll(null);
  }
});

// Export function: draws to an offscreen canvas and produces dataURL
exportBtn.addEventListener('click', async () => {
  if (canvas.width === 0 || canvas.height === 0) {
    alert('Canvas not ready yet. Start the camera and try again.');
    return;
  }

  const includeVideo = includeVideoCheckbox.checked;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;
  const outCtx = outCanvas.getContext('2d');

  if (includeVideo && (isCameraOn || video.srcObject)) {
    // draw mirrored video frame (mirror horizontally so export matches preview)
    outCtx.save();
    outCtx.translate(outCanvas.width, 0);
    outCtx.scale(-1, 1);
    try {
      outCtx.drawImage(video, 0, 0, outCanvas.width, outCanvas.height);
    } catch (e) {
      console.warn('Drawing video frame failed (may be cross-origin or not ready):', e);
      // fallback: fill dark bg
      outCtx.fillStyle = '#081018';
      outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
    }
    outCtx.restore();
  } else {
    // transparent background; fill with subtle dark background for visibility
    outCtx.fillStyle = 'rgba(8,16,24,1)';
    outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  }

  // draw strokes on outCtx (same logic used in drawAll)
  for (const stroke of strokes) {
    if (!stroke || stroke.length === 0) continue;
    outCtx.lineJoin = 'round';
    outCtx.lineCap = 'round';
    outCtx.lineWidth = stroke[0].brush || parseInt(brushSizeInput.value, 10);
    outCtx.strokeStyle = stroke[0].color || brushColorInput.value;
    outCtx.beginPath();
    outCtx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) outCtx.lineTo(stroke[i].x, stroke[i].y);
    outCtx.stroke();
  }

  // prepare image element & download link
  const dataURL = outCanvas.toDataURL('image/png');
  const img = document.createElement('img');
  img.src = dataURL;
  img.alt = 'Exported drawing';
  img.loading = 'lazy';
  // download link
  const dl = document.createElement('a');
  dl.href = dataURL;
  dl.download = 'fingertip-paint.png';
  dl.textContent = 'Download PNG';
  dl.className = 'btn success';
  // wrap in container
  const wrapper = document.createElement('div');
  wrapper.appendChild(img);
  wrapper.appendChild(dl);
  outputEl.prepend(wrapper);
});

/* ---------------- Helpers: set canvas size when metadata ready ---------------- */
video.addEventListener('loadedmetadata', () => {
  setCanvasSize();
});

// ensure canvas matches element size on resize
window.addEventListener('resize', () => {
  setCanvasSize();
});


/* --- Placeholder for AI Image Generation API --- */
// NOTE: In a real application, you would replace this with a fetch() call
// to an actual Image-to-Image AI generation API (e.g., Stable Diffusion via Replicate/OpenAI/etc.)
async function generateImageWithAI(imageBase64, userPrompt) {
    console.log(`Sending image to AI with prompt: "${userPrompt.substring(0, 30)}..."`);
    // Simulate network delay and processing time
    await new Promise(resolve => setTimeout(resolve, 3500)); 

    // --- REAL API INTEGRATION GOES HERE ---
    /*
    const apiKey = "YOUR_API_KEY"; // Keep this secure, use environment variables or a backend proxy!
    const endpoint = "YOUR_IMAGE_TO_IMAGE_ENDPOINT"; 

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}` 
        },
        body: JSON.stringify({
            image: imageBase64, // The base64 data of the drawing
            prompt: userPrompt,
            // ... other model parameters (steps, guidance_scale, etc.)
        })
    });

    if (!response.ok) {
        throw new Error(`AI API failed: ${response.statusText}`);
    }

    const data = await response.json();
    // Assuming the API returns a data object where 'generatedImageUrl' is the result
    return data.generatedImageUrl || 'https://via.placeholder.com/640x480?text=AI+Generated+Image'; 
    */

    // Placeholder result (replace with actual result from your API)
    return 'https://picsum.photos/640/480?random=' + Math.random(); // Dummy result image
}
/* ------------------------------------------------------------------- */
