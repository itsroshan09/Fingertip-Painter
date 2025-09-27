# Fingertip Painter



**Fingertip Painter** is a modern, web-based drawing application that allows users to draw on a live camera feed using finger gestures. Powered by **MediaPipe Hands**, this app supports real-time fingertip detection and smooth drawing for a premium, minimal aesthetic experience.

---

## 🚀 Features

- **Real-time hand tracking** using MediaPipe.
- **Double-pinch gesture** to toggle drawing mode.
- **Customizable brush**: adjust size and color.
- **Undo/clear strokes** easily.
- **Export drawings** as PNG images, with optional camera background.
- Premium, minimal, and responsive UI.
- Placeholder for AI-powered image generation from your drawings.

---

## 🎨 How it Works

1. **Hand detection**: MediaPipe detects 21 hand landmarks.
2. **Gesture detection**: Pinch (thumb tip + index tip) toggles drawing mode.
3. **Smooth strokes**: Finger positions are smoothed and stored as strokes.
4. **Export**: Compose strokes and optionally include the camera snapshot for export.

---

## 🛠️ Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Libraries**:
  - [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker)
- **Browser Support**: Chrome, Edge (HTTPS or localhost required)

---

## 💻 Getting Started

### Prerequisites

- Modern browser with camera access (Chrome/Edge recommended)
- Local server (optional, but recommended) to serve files securely

### Steps

1. Clone the repository:
```bash
git clone https://github.com/itsroshan09/Fingertip-Painter.git
