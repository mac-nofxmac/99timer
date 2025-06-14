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
app.post('/upload-font', upload.single('font'), (req, res) => {
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
    // Send current state to new clients
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
  
    socket.on('pauseToggle', (pauseState) => {
    isPaused = pauseState;
    timerState.paused = pauseState;  // keep in sync
    io.emit('update', timerState);
});

    
	socket.on('stop', () => {
        timerState.running = false;
        io.emit('update', timerState);
        clearInterval(interval);
    });

   socket.on('reset', () => {
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


    socket.on('setCustomFont', ({ name, url }) => {
        timerState.customFont = { name, url };
        io.emit('update', timerState);
    });


    socket.on('setFont', ({ size, color, family, warningThreshold, warningColor }) => {
    if (size) timerState.fontSize = size;
    if (color) timerState.fontColor = color;
    if (family) timerState.fontFamily = family;
    if (warningThreshold !== undefined) timerState.warningThreshold = warningThreshold;
    if (warningColor) timerState.warningColor = warningColor;
    io.emit('update', timerState);
});


    socket.on('resetFont', ({ size, color, family }) => {
        timerState.fontSize = size;
        timerState.fontColor = color;
        timerState.fontFamily = family;
        timerState.customFont = null;  // Clear custom font
        io.emit('update', timerState);
    });

});

http.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});

