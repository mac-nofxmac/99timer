const socket = io();

const timerEl = document.getElementById('timer');
const progressBarTop = document.getElementById('progressBarTop');
const progressBarBottom = document.getElementById('progressBarBottom');

function formatTime(seconds) {
    seconds = Math.abs(seconds);
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

socket.on('update', (state) => { // Updates the timer display based on the received state. Depends on: formatTime(), DOM elements ('timer', 'progressBarTop', 'progressBarBottom').
    // Update timer display
    if (timerEl) {
        timerEl.textContent = formatTime(state.time);
        timerEl.style.fontSize = state.fontSize;
        timerEl.style.fontFamily = state.customFont ? state.customFont.name : state.fontFamily;

        // Flashing behavior
        if (state.time <= 0 && state.time >= -3600) {
            timerEl.classList.add('flashing');
        } else {
            timerEl.classList.remove('flashing');
            timerEl.style.color = state.time <= state.warningThreshold && state.time > 0
                ? state.warningColor
                : state.fontColor;
        }

        // Inject custom font if needed
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

    // Update progress bars
    if (progressBarTop && progressBarBottom) {
        const totalTime = state.originalDuration || 5999;
        const percent = Math.max(0, state.time / totalTime);

        const barColor = state.time <= state.warningThreshold && state.time > 0
            ? state.warningColor
            : state.fontColor;

        progressBarTop.style.transformOrigin = 'center';     //progressBarTop.style.transformOrigin = 'left';
        progressBarTop.style.transform = `scaleX(${percent})`;
        progressBarTop.style.backgroundColor = barColor;

        progressBarBottom.style.transformOrigin = 'center';
        progressBarBottom.style.transform = `scaleX(${percent})`;
        progressBarBottom.style.backgroundColor = barColor;
    }
});


socket.on('update', (state) => { // Updates the preview timer in the control panel. Depends on: DOM elements ('timePreview', 'livePreviewToggle'), updateTimePreview(), updatePreviewAppearance().
    const previewEl = document.getElementById('timePreview');
    const toggleEl = document.getElementById('livePreviewToggle');

    if (!previewEl || !toggleEl) return;

    if (toggleEl.checked) {
        // Live timer mode
        const seconds = Math.abs(state.time);
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
        previewEl.textContent = `${mins}:${secs}`;

        // Style updates
        if (state.time <= 0 && state.time >= -3600) {
            previewEl.classList.add('flashing');
        } else {
            previewEl.classList.remove('flashing');
            if (state.time <= state.warningThreshold && state.time > 0) {
                previewEl.style.color = state.warningColor;
            } else {
                previewEl.style.color = state.fontColor;
            }
        }

        updatePreviewAppearance(state);
        previewEl.style.fontFamily = state.customFont?.name || state.fontFamily;
    } else {
        // Static input preview mode
        updateTimePreview();
		//updatePreviewAppearance(state); // this does font sizing and color
    }
});

socket.on('update', (state) => { // Updates the pause button text. Depends on: DOM element ('pauseBtn').
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.textContent = state.paused ? 'Resume ??' : 'Pause';
    }
});


function startTimer() { // Starts the timer with the specified duration. Depends on: DOM elements ('minutesInput', 'secondsInput'), updateTimePreview(), socket.emit('start').
    let minutes = parseInt(document.getElementById('minutesInput').value) || 0;
    let seconds = parseInt(document.getElementById('secondsInput').value) || 0;

    // Clamp seconds to 0�59
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

let isPaused = false;

function togglePause() { // Toggles the pause state of the timer. Depends on: socket.emit('pauseToggle'), DOM element ('pauseBtn').
    isPaused = !isPaused;
    socket.emit('pauseToggle', isPaused);

    // Optional: update button label
    const btn = document.getElementById('pauseBtn');
    btn.textContent = isPaused ? 'Resume' : 'Pause';
}


function stopTimer() { // Stops the timer. Depends on: socket.emit('stop').
    socket.emit('stop');
}

function resetTimer() { // Resets the timer. Depends on: socket.emit('reset').
    socket.emit('reset');
}

function applyFont() {
    const size = document.getElementById('fontSizeInput').value;
    const color = document.getElementById('fontColorInput').value;
    const family = document.getElementById('fontFamilySelect').value;
    const warningThreshold = parseInt(document.getElementById('warningThresholdInput').value);
    const warningColor = document.getElementById('warningColorInput').value;

    socket.emit('setFont', { size, color, family, warningThreshold, warningColor });

    const toggleEl = document.getElementById('livePreviewToggle');
    if (toggleEl && !toggleEl.checked) {
        // Only update preview style manually if live preview is OFF
        updatePreviewAppearance({
            fontSize: size,
            fontColor: color,
            fontFamily: family
        });
    }
}


function uploadFont() { // Uploads a custom font file. Depends on: DOM element ('fontFileInput'), fetch API, socket.emit('setCustomFont').
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

                // 2. Apply to preview
                document.getElementById('timePreview').style.fontFamily = fontName;

                // 3. Notify display page to use the font
                socket.emit('setCustomFont', { name: fontName, url: fontUrl });
            }
        });
}

function resetFont() { // Resets the font to default settings. Depends on: DOM elements ('fontSizeInput', 'fontColorInput', 'fontFamilySelect'), socket.emit('resetFont').
    const size = document.getElementById('fontSizeInput').value;
    const color = document.getElementById('fontColorInput').value;
    const family = document.getElementById('fontFamilySelect').value;

    // Emit regular font settings and null out custom font
    socket.emit('resetFont', { size, color, family });
	
	// Reset preview font family
    const styleTag = document.getElementById('dynamic-font-preview');
    if (styleTag) styleTag.remove();

    document.getElementById('timePreview').style.fontFamily = family;
}

function updateTimePreview() { // Updates the time preview in the control panel based on input fields. Depends on: DOM elements ('minutesInput', 'secondsInput', 'timePreview').
    let minutesInput = document.getElementById('minutesInput');
    let secondsInput = document.getElementById('secondsInput');
    let minutes = parseInt(minutesInput.value) || 0;
    let seconds = parseInt(secondsInput.value) || 0;

    // Clamp seconds to 0�59
    if (seconds > 59) seconds = 59;
    if (seconds < 0) seconds = 0;

    // Total time in seconds
    let totalSeconds = (minutes * 60) + seconds;

    // Clamp total to 99:59 (5999 seconds)
    if (totalSeconds > 5999) totalSeconds = 5999;

    // Recalculate minutes/seconds from clamped total
    minutes = Math.floor(totalSeconds / 60);
    seconds = totalSeconds % 60;

    // Update input fields with clamped values
    minutesInput.value = minutes;
    secondsInput.value = seconds;

    // Update preview display
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    document.getElementById('timePreview').textContent = `${mm}:${ss}`;
}

function updatePreviewAppearance(state) { // Updates the appearance of the time preview. Depends on: DOM element ('timePreview').
    const previewEl = document.getElementById('timePreview');
    if (!previewEl) return;

    // Scale font size proportionally (e.g. reduce by 70%)
    const originalSize = parseFloat(state.fontSize);
    const scaledSize = Math.floor(parseFloat(state.fontSize)) * 3.2; //<-- this changes the preview font size ratio
    previewEl.style.fontSize = `${scaledSize}px`;

    previewEl.style.fontSize = scaledSize;
    previewEl.style.color = state.fontColor;
    previewEl.style.fontFamily = state.customFont?.name || state.fontFamily;

    // Optional: apply flashing or warning color
    const currentTime = state.time;
    if (state.warningThreshold && currentTime <= state.warningThreshold && currentTime > 0) {
        previewEl.style.color = state.warningColor;
        previewEl.classList.remove('flashing');
    } else if (currentTime <= 0) {
        previewEl.classList.add('flashing');
    } else {
        previewEl.classList.remove('flashing');
    }
}


function setPreset(mins, secs) { // Sets preset time values in the input fields. Depends on: DOM elements ('minutesInput', 'secondsInput'), updateTimePreview().
    document.getElementById('minutesInput').value = mins;
    document.getElementById('secondsInput').value = secs;
    updateTimePreview();
}




// Attach event listeners after DOM loads
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('minutesInput').addEventListener('input', updateTimePreview);
    document.getElementById('secondsInput').addEventListener('input', updateTimePreview);
    updateTimePreview(); // Initialize preview on load
}); 