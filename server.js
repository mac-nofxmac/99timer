const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');

// Store uploaded fonts in public/fonts folder
const storage = multer.diskStorage({
    destination: './public/fonts',
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// Create fonts folder if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('./public/fonts')) {
    fs.mkdirSync('./public/fonts');
}

// Upload route
app.post('/upload-font', upload.single('font'), (req, res) => { // Handles font file uploads. Depends on: multer, express.
    res.send({ success: true, filename: req.file.originalname });
});


app.use(express.static('public'));

let timerState = {
    time: 0,
    running: false,
    paused: false,
	fontSize: '10vw',
    fontColor: '#FFFFFF',
    fontFamily: 'Arial, sans-serif',
    customFont: null,
    warningThreshold: 30,
    warningColor: '#FFA500'
};

let interval;
let isPaused = false;

io.on('connection', (socket) => {
    // Send current state to new clients. Depends on: socket.io, timerState.
    socket.emit('update', timerState);

    socket.on('start', (timeInSeconds) => {
        timerState.time = timeInSeconds;
        timerState.originalDuration = timeInSeconds; // NEW
		timerState.running = true;
        io.emit('update', timerState);

        clearInterval(interval);
        interval = setInterval(() => {
            if (timerState.running && !isPaused) {
                timerState.time--;
                io.emit('update', timerState);

                if (timerState.time <= -5940) {
                    timerState.running = false;
                    clearInterval(interval);
                }
            }
        }, 1000);
    });
  
    socket.on('pauseToggle', (pauseState) => { // Toggles the pause state of the timer. Depends on: socket.io, timerState.
    isPaused = pauseState;
    timerState.paused = pauseState;  // keep in sync
    io.emit('update', timerState);
});

    
	socket.on('stop', () => { // Stops the timer. Depends on: socket.io, timerState.
        timerState.running = false;
        io.emit('update', timerState);
        clearInterval(interval);
    });

   socket.on('reset', () => { // Resets the timer to 0. Depends on: socket.io, timerState.
       timerState.time = 0;
    timerState.running = false;      // auto-resume
    timerState.paused = false;      // reset pause state in timerState
    isPaused = false;               // reset internal flag
    io.emit('update', timerState);

    clearInterval(interval);
    interval = setInterval(() => {
        if (timerState.running && !timerState.paused) {
            timerState.time--;
            io.emit('update', timerState);

            if (timerState.time <= -5940) {
                timerState.running = false;
                clearInterval(interval);
            }
        }
    }, 1000);
});

socket.on('adjustTime', ({ unit, value }) => { // Adjusts the live timer by a specified amount, with validation.
    // --- Server-side functional check: Prevent adjustment if conditions are not met ---
    // Conditions for prevention:
    // 1. Timer is neither running nor paused.
    // 2. Timer time is at or below zero.
    if ((!timerState.running && !timerState.paused) || timerState.time <= 0) {
        console.log("Server: Adjustment request rejected. Timer not active or time is zero/negative.");
        // Optionally, you could emit an 'adjustmentRejected' event back to the client
        return; // Stop processing this request
    }
    // --- End of server-side check ---

    if (unit === 'seconds') {
        timerState.time += value;

        // Ensure timer doesn't go below a reasonable negative threshold (e.g., -99:59 or -5999 seconds)
        if (timerState.time < -5999) {
            timerState.time = -5999;
        }

        // If the timer is not running, and an adjustment is made,
        // also adjust originalDuration to keep progress bar consistent for future starts.
        if (!timerState.running) {
            timerState.originalDuration = (timerState.originalDuration || 0) + value;
            if (timerState.originalDuration < 0) timerState.originalDuration = 0;
        }
    }
    io.emit('update', timerState); // Broadcast the updated timer state to all clients
});

    socket.on('setCustomFont', ({ name, url }) => { // Sets a custom font for the timer display. Depends on: socket.io, timerState.
        timerState.customFont = { name, url };
        io.emit('update', timerState);
    });


    socket.on('setFont', ({ size, color, family, warningThreshold, warningColor }) => { // Sets font attributes for the timer display. Depends on: socket.io, timerState.
        if (size) timerState.fontSize = size;
    if (color) timerState.fontColor = color;
    if (family) timerState.fontFamily = family;
    if (warningThreshold !== undefined) timerState.warningThreshold = warningThreshold;
    if (warningColor) timerState.warningColor = warningColor;
    io.emit('update', timerState);
});


    socket.on('resetFont', ({ size, color, family }) => { // Resets the font to default settings. Depends on: socket.io, timerState.
        timerState.fontSize = size;
        timerState.fontColor = color;
        timerState.fontFamily = family;
        timerState.customFont = null;  // Clear custom font
        io.emit('update', timerState);
    });

});

http.listen(9959, () => {
    console.log('Server running at http://localhost:9959');
});
