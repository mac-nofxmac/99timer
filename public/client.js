const socket = io();

let currentTimerState = null; // Stores the latest timer state received from the server

// Common utility function for time formatting
function formatTime(seconds) {
    seconds = Math.abs(seconds);
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

// Function to format time for EST display (HH:MM)
function formatEstimatedTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// *** SINGLE CONSOLIDATED socket.on('update') LISTENER ***
socket.on('update', (state) => {
    // --- PART 1: Update Timer Display (primarily for display.html) ---
    const timerEl = document.getElementById('timer');
    const progressBarTop = document.getElementById('progressBarTop');
    const progressBarBottom = document.getElementById('progressBarBottom');

    if (timerEl) {
        timerEl.textContent = formatTime(state.time);
        timerEl.style.fontSize = state.fontSize; // Apply main fontSize for the display page (e.g., '10vw')
        timerEl.style.fontFamily = state.customFont ? state.customFont.name : state.fontFamily;

        // Flashing behavior for main timer
        if (state.time <= 0 && state.time >= -3600) {
            timerEl.classList.add('flashing');
        } else {
            timerEl.classList.remove('flashing');
            timerEl.style.color = state.time <= state.warningThreshold && state.time > 0
                ? state.warningColor
                : state.fontColor;
        }

        // Inject custom font if needed for main timer
        if (state.customFont) {
            const styleId = 'dynamic-font';
            let styleTag = document.getElementById(styleId);
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = styleId;
                document.head.appendChild(styleTag);
            }
            styleTag.textContent = `
                @font-face {
                    font-family: '${state.customFont.name}';
                    src: url('${state.customFont.url}');
                }
            `;
        } else {
            const styleTag = document.getElementById('dynamic-font');
            if (styleTag) styleTag.remove();
        }
    }

    // Update progress bars (if elements exist)
    if (progressBarTop && progressBarBottom) {
        const totalTime = state.originalDuration || 5999; // Fallback for originalDuration if not set
        const percent = (totalTime > 0) ? Math.max(0, state.time / totalTime) : 0; // Prevent division by zero

        const barColor = state.time <= state.warningThreshold && state.time > 0
            ? state.warningColor
            : state.fontColor;

        progressBarTop.style.transformOrigin = 'center';
        progressBarTop.style.transform = `scaleX(${percent})`;
        progressBarTop.style.backgroundColor = barColor;

        progressBarBottom.style.transformOrigin = 'center';
        progressBarBottom.style.transform = `scaleX(${percent})`;
        progressBarBottom.style.backgroundColor = barColor;
    }


    // --- PART 2: Update Control Panel elements (primarily for control.html) ---
    const previewEl = document.getElementById('timePreview');
    const toggleEl = document.getElementById('livePreviewToggle');
    const pauseBtn = document.getElementById('pauseBtn');
    const addAdjustmentBtn = document.getElementById('addAdjustmentBtn');
    const subtractAdjustmentBtn = document.getElementById('subtractAdjustmentBtn');
    const liveAdjustMinutesInput = document.getElementById('liveAdjustMinutesInput');
    const liveAdjustSecondsInput = document.getElementById('liveAdjustSecondsInput');
    const estimatedTimeDisplay = document.getElementById('estimatedTimeDisplay'); // Get the new element

    // Only proceed with control panel specific updates if essential preview elements exist
    if (previewEl && toggleEl) {
        currentTimerState = state; // Store the current state globally for control.html-specific functions

        // Update Pause button text
        if (pauseBtn) {
            pauseBtn.textContent = state.paused ? 'Resume ??' : 'Pause';
        }
        if (pauseBtn) {
            pauseBtn.textContent = state.paused ? 'Resume ??' : 'Pause';
        
            // Add flashing effect when paused
            if (state.paused) {
                pauseBtn.classList.add('pause-flash');
            } else {
                pauseBtn.classList.remove('pause-flash');
            }
        }
        

        // Logic to determine if LIVE ADJUSTMENT controls should be enabled
        const enableAdjustmentControls = (state.running || state.paused) && state.time > 0;

        // Apply disabled state to LIVE ADJUSTMENT elements ONLY if they are found
        if (addAdjustmentBtn) addAdjustmentBtn.disabled = !enableAdjustmentControls;
        if (subtractAdjustmentBtn) subtractAdjustmentBtn.disabled = !enableAdjustmentControls;
        if (liveAdjustMinutesInput) liveAdjustMinutesInput.disabled = !enableAdjustmentControls;
        if (liveAdjustSecondsInput) liveAdjustSecondsInput.disabled = !enableAdjustmentControls;


        // Handle preview display based on toggle state
        if (toggleEl.checked) {
            // Live timer mode: uses state.time from the server
            const seconds = Math.abs(state.time);
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
            previewEl.textContent = `${mins}:${secs}`;

            // Style updates for live preview, using the corrected updatePreviewAppearance
            updatePreviewAppearance(state);
            previewEl.style.fontFamily = state.customFont?.name || state.fontFamily; // Ensure font family is applied here too
        } else {
            // Static input preview mode: uses local input field values
            updateTimePreview();
            // In static mode, ensure the preview appearance also reflects current settings
            updatePreviewAppearance(state);
        }

        // Update estimated time display
        if (estimatedTimeDisplay) {
            if (state.time > 0 && state.running) {
                const now = new Date();
                const estimatedEndTime = new Date(now.getTime() + state.time * 1000);
                estimatedTimeDisplay.textContent = `EST: ${formatEstimatedTime(estimatedEndTime)}`;
            } else if (state.time <= 0 && (state.running || state.paused)) {
                estimatedTimeDisplay.textContent = 'Overtime';
            } else {
                estimatedTimeDisplay.textContent = ''; // Clear if timer is stopped/reset
            }
        }
    }
});


// All other functions from your original client.js file
function startTimer() {
    let minutes = parseInt(document.getElementById('minutesInput').value) || 0;
    let seconds = parseInt(document.getElementById('secondsInput').value) || 0;

    // Clamp seconds to 0-59
    if (seconds > 59) seconds = 59;
    if (seconds < 0) seconds = 0;

    // Clamp total time to max 99:59 (5999 seconds)
    let totalSeconds = (minutes * 60) + seconds;
    if (totalSeconds > 5999) totalSeconds = 5999;

    // Recalculate cleaned minutes/seconds and update fields (optional)
    minutes = Math.floor(totalSeconds / 60);
    seconds = totalSeconds % 60;
    document.getElementById('minutesInput').value = minutes;
    document.getElementById('secondsInput').value = seconds;
    updateTimePreview(); // optional sync

    socket.emit('start', totalSeconds);
}

function togglePause() {
    if (currentTimerState) {
        socket.emit('pauseToggle', !currentTimerState.paused);
    }
}

function stopTimer() {
    socket.emit('stop');
}

function resetTimer() {
    socket.emit('reset');
}

function applyFont() {
    const size = document.getElementById('fontSizeInput').value;
    const color = document.getElementById('fontColorInput').value;
    const family = document.getElementById('fontFamilySelect').value;

    // Retrieve warning threshold in minutes and seconds
    const warningThresholdMinutes = parseInt(document.getElementById('warningThresholdMinutes').value) || 0;
    const warningThresholdSeconds = parseInt(document.getElementById('warningThresholdSeconds').value) || 0;
    const warningColor = document.getElementById('warningColorInput').value;

    // Send minutes and seconds separately to the server
    socket.emit('setFont', {
        size, color, family, warningThresholdMinutes, warningThresholdSeconds, warningColor
    });

    // For immediate visual feedback on the control preview, even if not in live mode:
    const toggleEl = document.getElementById('livePreviewToggle');
    const totalWarningSeconds = (warningThresholdMinutes * 60) + warningThresholdSeconds; // Calculate total seconds for preview
    if (toggleEl && !toggleEl.checked) {
        // Use a dummy state object for updatePreviewAppearance if currentTimerState isn't yet fully updated
        updatePreviewAppearance({
            fontSize: size, // This will be used for scaling now
            fontColor: color,
            fontFamily: family,
            warningThreshold: totalWarningSeconds, // Use total seconds for the preview update
            warningColor: warningColor,
            time: currentTimerState ? currentTimerState.time : 0 // Use current timer time for flashing logic
        });
    }
}

function uploadFont() {
    const fileInput = document.getElementById('fontFileInput');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a font file.');
        return;
    }

    const formData = new FormData();
    formData.append('font', file);

    fetch('/upload-font', {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const fontName = file.name.split('.')[0];
                const fontUrl = `/fonts/${data.filename}`;

                // 1. Inject @font-face rule into the control page
                const styleId = 'dynamic-font-preview';
                let styleTag = document.getElementById(styleId);
                if (!styleTag) {
                    styleTag = document.createElement('style');
                    styleTag.id = styleId;
                    document.head.appendChild(styleTag);
                }
                styleTag.textContent = `
                    @font-face {
                        font-family: '${fontName}';
                        src: url('${fontUrl}');
                    }
                `;

                // 2. Apply to preview directly (this ensures immediate feedback)
                document.getElementById('timePreview').style.fontFamily = fontName;

                // 3. Notify display page to use the font
                socket.emit('setCustomFont', { name: fontName, url: fontUrl });
            }
        })
        .catch(error => {
            console.error('Error uploading font:', error);
            alert('Failed to upload font.');
        });
}

function resetFont() {
    // Reset font settings to default (assuming Arial, #FFFFFF, etc. are defaults)
    const defaultSize = '30vw';
    const defaultColor = '#FFFFFF';
    const defaultFamily = 'Arial, sans-serif';
    const defaultWarningThreshold = 30; // Changed to number
    const defaultWarningColor = '#FFA500';

    document.getElementById('fontSizeInput').value = defaultSize;
    document.getElementById('fontColorInput').value = defaultColor;
    document.getElementById('fontFamilySelect').value = defaultFamily;
    document.getElementById('warningThresholdInput').value = defaultWarningThreshold;
    document.getElementById('warningColorInput').value = defaultWarningColor;

    // Emit regular font settings and null out custom font
    socket.emit('resetFont', { 
        size: defaultSize, 
        color: defaultColor, 
        family: defaultFamily,
        warningThreshold: defaultWarningThreshold,
        warningColor: defaultWarningColor
    }); 

    // Reset preview font family by removing the dynamic style tag
    const styleTag = document.getElementById('dynamic-font-preview');
    if (styleTag) styleTag.remove();

    // Revert preview font family to the default selected one
    document.getElementById('timePreview').style.fontFamily = defaultFamily; // Use the defaultFamily variable

    // Re-apply current settings to ensure preview updates visually
    applyFont();
}

function updateTimePreview() {
    let minutesInput = document.getElementById('minutesInput');
    let secondsInput = document.getElementById('secondsInput');
    let minutes = parseInt(minutesInput.value) || 0;
    let seconds = parseInt(secondsInput.value) || 0;

    // Clamp seconds to 0-59
    if (seconds > 59) seconds = 59;
    if (seconds < 0) seconds = 0;

    let totalSeconds = (minutes * 60) + seconds;
    if (totalSeconds > 5999) totalSeconds = 5999; // Max 99:59

    minutes = Math.floor(totalSeconds / 60);
    seconds = totalSeconds % 60;

    minutesInput.value = minutes;
    secondsInput.value = seconds;

    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    document.getElementById('timePreview').textContent = `${mm}:${ss}`;
}

// *** IMPORTANT CHANGE HERE: Re-introduced custom scaling for CONTROL PANEL PREVIEW ***
function updatePreviewAppearance(state) {
    const previewEl = document.getElementById('timePreview');
    if (!previewEl) return;

    // Use the user's custom scaling for the preview font size
    // parseFloat('10vw') will result in 10. We then multiply by 3.2 and add 'px' unit.
    const baseFontSizeValue = parseFloat(state.fontSize) || 10; // Extract numeric value, default to 10
    const scaleInput = document.getElementById('previewScaleInput');
    const scaleFactor = scaleInput ? parseFloat(scaleInput.value) || 1 : 3.2;
    const scaledPreviewFontSize = baseFontSizeValue * scaleFactor;

    previewEl.style.fontSize = `${scaledPreviewFontSize}px`; // Apply with 'px' unit

    previewEl.style.color = state.fontColor;
    previewEl.style.fontFamily = state.customFont?.name || state.fontFamily;

    // Apply flashing or warning color
    if (state.time <= 0 && state.time >= -3600) {
        previewEl.classList.add('flashing');
        previewEl.style.color = '#ff0000'; // Explicitly red for flashing
    } else if (state.warningThreshold && state.time <= state.warningThreshold && state.time > 0) {
        previewEl.style.color = state.warningColor;
    } else {
        previewEl.classList.remove('flashing');
        previewEl.style.color = state.fontColor; // Revert to default color
    }
}


function setPreset(mins, secs) {
    document.getElementById('minutesInput').value = mins;
    document.getElementById('secondsInput').value = secs;
    updateTimePreview();
}

function applyTotalLiveAdjustment(isSubtract) {
    if (!currentTimerState || (!currentTimerState.running && !currentTimerState.paused) || currentTimerState.time <= 0) {
        console.log("Adjustment prevented (client-side): Timer is not active or time is zero/negative.");
        return;
    }

    const liveAdjustMinutesInput = document.getElementById('liveAdjustMinutesInput');
    const liveAdjustSecondsInput = document.getElementById('liveAdjustSecondsInput');

    let minutes = parseInt(liveAdjustMinutesInput.value) || 0;
    let seconds = parseInt(liveAdjustSecondsInput.value) || 0;

    if (isNaN(minutes) || minutes < 0) minutes = 0;
    if (isNaN(seconds) || seconds < 0) seconds = 0;

    let totalAdjustmentInSeconds = (minutes * 60) + seconds;

    if (isSubtract) {
        totalAdjustmentInSeconds = -totalAdjustmentInSeconds;
    }

    socket.emit('adjustTime', { unit: 'seconds', value: totalAdjustmentInSeconds });

    liveAdjustMinutesInput.value = 0;
    liveAdjustSecondsInput.value = 0;
}


// Attach ALL event listeners after DOM loads
window.addEventListener('DOMContentLoaded', () => {
    // Main timer setup input listeners
    document.getElementById('minutesInput').addEventListener('input', updateTimePreview);
    document.getElementById('secondsInput').addEventListener('input', updateTimePreview);
    updateTimePreview(); // Initialize main preview on load

    // Auto-activate live preview and apply font settings on load
    const livePreviewToggle = document.getElementById('livePreviewToggle');
    if (livePreviewToggle) {
        livePreviewToggle.checked = true; // Set checkbox to checked
        // The socket.on('update') listener will handle updating the preview
        // when livePreviewToggle.checked is true.
    }
    applyFont(); // Apply current font settings

    // Live preview toggle listener
    if (livePreviewToggle) {
        livePreviewToggle.addEventListener('change', () => {
            if (!livePreviewToggle.checked) {
                updateTimePreview();
            }
        });
    }

    // Update file input label when file is selected
    const fontFileInput = document.getElementById('fontFileInput');
    if (fontFileInput) {
        fontFileInput.addEventListener('change', function(e) {
            const label = e.target.nextElementSibling;
            if (e.target.files.length > 0) {
                label.textContent = e.target.files[0].name;
            } else {
                label.textContent = 'Choose Font File';
            }
        });
    }

    // Explicitly attach event listeners for buttons if they are not already using onclick in HTML
    const startBtn = document.getElementById('startBtn');
    if (startBtn) startBtn.addEventListener('click', startTimer);

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.addEventListener('click', togglePause);

    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) stopBtn.addEventListener('click', stopTimer);

    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetTimer);

    const applyFontBtn = document.getElementById('applyFontBtn');
    if (applyFontBtn) applyFontBtn.addEventListener('click', applyFont);

    const uploadFontBtn = document.getElementById('uploadFontBtn');
    if (uploadFontBtn) uploadFontBtn.addEventListener('click', uploadFont);

    const resetFontBtn = document.getElementById('resetFontBtn');
    if (resetFontBtn) resetFontBtn.addEventListener('click', resetFont);
});