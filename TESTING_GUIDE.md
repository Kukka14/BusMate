# BusMate ActiveShift Page - Quick Start Testing Guide

## Pre-Test Checklist

### Backend Requirements
- [ ] Python 3.9+ running
- [ ] Flask app running on http://localhost:5000 (or configured port)
- [ ] All required packages installed:
  ```bash
  pip install flask flask-socketio tensorflow torch mediapipe opencv-python numpy
  ```
- [ ] Required model files in place:
  - [ ] `backend/emotion_model.h5`
  - [ ] `backend/Drowsiness/model1_best.pth` through `model5_best.pth`
  - [ ] `backend/RSA&HA/RSA/` directory with SegFormer model
  - [ ] `backend/yolov8n.pt` for object detection

### Frontend Requirements
- [ ] React app running on http://localhost:5174
- [ ] Browser with camera access enabled
- [ ] Camera hardware connected and available
- [ ] Preferably 2 webcams (one for driver, one for road)

### Browser Console Setup
- [ ] Open DevTools (F12)
- [ ] Go to Console tab
- [ ] Keep console visible during testing to monitor debug logs

## Testing Procedure

### Phase 1: Initial Connection (1-2 minutes)

1. **Navigate to Active Shift Page**
   - Go to http://localhost:5174/driver/drowsiness
   - Should show "READY" status
   - Check console for initialization messages

2. **Grant Camera Permission**
   - Browser will ask for camera access
   - Click "Allow"
   - Check console for: `[Camera Debug] Permission granted`

3. **Select Cameras** (if multiple available)
   - Driver camera dropdown should show available cameras
   - Road camera dropdown should show available cameras
   - Verify both are selected

4. **Verify Debug Status Bar**
   - Should show red indicators (disconnected) for all models
   - Frame counts should show "Em: 0 frames | Dw: 0 frames | Road: waiting"

### Phase 2: Start Shift (2-3 minutes)

5. **Click "Start Shift" Button**
   - Status should change to "SHIFT ACTIVE"
   - Watch browser console for logs

6. **Verify Camera Grid**
   - 4 camera panels should appear below status bar
   - Should see live video feeds in each panel (may take a few seconds)
   - If black: Check camera permissions and browser autoplay policy

7. **Check Console for Initialization**
   - Look for messages:
     ```
     [Emotion] Socket connected
     [Drowsiness] Socket connected
     [Emotion] Frame sent to server
     [Drowsiness] Frame sent to server
     [RSA] Received scene data (after 1.5s)
     [Road Sign] Received detection (after 1.5s)
     ```

### Phase 3: Data Flow Verification (3-5 minutes)

8. **Verify Emotion Detection**
   - Debug bar should show: "Em: connected ✓ data"
   - Emotion panel should show:
     - BVI gauge (starts green, changes based on emotions)
     - Emotion probabilities (happy, sad, angry, neutral, etc.)
   - Console logs: `[Emotion] Frame sent to server` every 300ms
   - Check console for actual prediction: `[Emotion] Received prediction: {...}`

9. **Verify Drowsiness Detection**
   - Debug bar should show: "Dw: connected ✓ data"
   - Drowsiness panel should show:
     - Confidence gauge (0-100%)
     - Verdict: "Alert" (green) or "Drowsy" (red)
     - Facial features:
       - EAR (Eye Aspect Ratio): 0-1, warn if <0.25
       - MAR (Mouth Aspect Ratio): 0-1, warn if >0.6
       - Pitch: degrees, warn if >20°
       - Yaw: degrees, warn if >30°
       - PERCLOS: percentage, warn if >30%
     - Model ensemble bars showing M1-M5 confidence
   - Console logs: `[Drowsiness] Frame sent to server` every 200ms
   - Check console for actual result: `[Drowsiness] Received result: {...}`

10. **Verify Road Scene Analysis**
    - Debug bar should show: "RS: analyzing" (after first frame)
    - Road Scene panel should show:
      - Segmentation overlay image
      - Hazard score (0-100)
      - Hazard level (Low/Medium/High)
      - Scene elements with percentages
    - Console logs: `[RSA] Received scene data: {...}` every 1.5s

11. **Verify Road Sign Detection**
    - Debug bar should show: "RSi: (may have or not data)"
    - Road Sign panel should show:
      - Detected road signs if present
      - Classification name (Speed limit, Stop sign, etc.)
      - Confidence percentage
      - Detection status (Normal/Warning)
    - Console logs: `[Road Sign] Received detection: {...}` when sign detected

### Phase 4: Problem Diagnosis (if needed)

If any panel shows no data:

**Emotion Not Working:**
- Check console for: `[Emotion] Socket connected` - if missing, socket not connecting
- Check console for frame send errors - if present, video not ready
- Manually check: `videoRef.current.readyState` in console
- Verify emotion_model.h5 exists and loads

**Drowsiness Not Working:**
- Check console for: `[Drowsiness] Socket connected`
- Verify all 5 model files (model1_best.pth through model5_best.pth) exist
- Check for "dwInFlight" logs - if present, responses coming back fast

**Road Scene Not Working:**
- Check console for: `[RSA] Received scene data` or errors
- Verify RSA&HA/RSA directory exists with config and model files
- Check for HTTP error messages: `[RSA] Fetch error: HTTP 503`
- May need: `pip install transformers safetensors torch`

**Road Sign Not Working:**
- Check console for: `[Road Sign] Received detection` or errors
- Verify yolov8n.pt exists
- Check for HTTP error messages
- Road signs may not be in training data - try looking for different signs

**Videos Not Showing (Black Screen):**
- Press F12 to check console
- Look for camera permission error
- Try: Settings > Privacy and security > Camera > Allow localhost:5174
- Check: videoRef.readyState in console - should be 4 (HAVE_ENOUGH_DATA)
- Try clicking "Enable Camera" button if visible
- Try refreshing page (F5)

### Phase 5: End Shift (1 minute)

12. **Click "End Shift" Button**
    - Shift should stop
    - Camera feeds should stop sending frames
    - Analytics summary should show
    - Check console for clean disconnect: `[Emotion] Socket disconnected`

## Expected Console Output

**Initial Load:**
```
[Camera Debug] Permission granted
[Camera Debug] Found 2 cameras: [{id: "...", label: "Camera1"}, {id: "...", label: "Camera2"}]
[Camera] Permission granted with constraint: {...}
```

**Shift Start:**
```
Connected to GPS2IP stream
[Emotion] Socket connected
[Drowsiness] Socket connected
```

**Continuous (Every Few Seconds):**
```
[Emotion] Frame sent to server
[Emotion] Received prediction: {"ok":true,"emotion":"happy","confidence":0.92,...}
[Drowsiness] Frame sent to server
[Drowsiness] Received result: {"ok":true,"verdict":"Alert","confidence":0.23,...}
[RSA] Received scene data: {"original":"data:image/jpeg;...","overlay":"...","hazard":{...}}
[Road Sign] Received detection: {"class_name":"Speed Limit 50","confidence":0.85,...}
```

## Success Indicators

All 4 panels working correctly when you see:
- ✅ "Em: connected ✓ data" in status bar
- ✅ "Dw: connected ✓ data" in status bar
- ✅ "RS: analyzing" in status bar
- ✅ "RSi: (data shown)" in status bar
- ✅ All 4 camera panels display live video feeds
- ✅ Emotion probabilities update in real-time
- ✅ Drowsiness confidence and facial features update every 200ms
- ✅ Road segmentation and hazard score appears every 1.5s
- ✅ Road signs detected when present in frame
- ✅ No red error indicators in console
- ✅ No repeating socket errors

## Performance Targets

- Frame send latency: <100ms
- Response latency: <500ms (typically 200-300ms)
- UI update latency: <50ms
- Console should not show "Frame already in flight" repeatedly

## Troubleshooting Common Issues

### Issue: "Socket not connected, skipping frame"
**Cause:** Socket connection not established
**Fix:** 
- Check backend is running and accessible
- Verify SOCKET_URL in frontend config
- Check browser network tab for socket.io connection

### Issue: "Video not ready, skipping frame"
**Cause:** Video stream not loaded
**Fix:**
- Check camera permissions
- Try different camera in dropdown
- Reload page
- Check camera isn't in use by another application

### Issue: Models showing "—" for all values
**Cause:** No face detected or model not processing
**Fix:**
- Face visible in camera? Try moving closer
- Check console for model errors
- Verify model files exist
- Check backend logs for processing errors

### Issue: Road Scene showing only original image, no overlay
**Cause:** Segmentation model didn't process
**Fix:**
- Check RSA&HA/RSA directory exists
- Install required packages: `pip install transformers`
- Check backend logs for model loading errors
- May need CUDA GPU for performance

## Next Steps After Testing

1. If all panels working:
   - Deploy to production
   - Monitor server logs for model performance
   - Collect user feedback

2. If some panels not working:
   - Check specific backend logs for that model
   - Verify all dependencies installed
   - Check model file integrity
   - Run individual model tests

3. Performance optimization:
   - Monitor frame processing time
   - Consider reducing frame resolution if slow
   - Monitor memory usage during long shifts
   - Profile socket message throughput
