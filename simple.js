// RTC client instance
let client = null;

// Declare variables for the local tracks
let localAudioTrack = null; 
let localVideoTrack = null; 
let remoteUsers = {};
let isJoined = false;
let isMuted = false;
let isVideoMuted = false;
let isCapturing = false;
let isVideoCapturing = false;
let cameraDevices = new Map(); // Store camera devices with their IDs and names
let microphoneDevices = new Map(); // Store microphone devices with their IDs and names

// User state
const userState = {
    isMicMuted: false,
    isMicCapturing: true,
    isCameraMuted: false,
    isCameraCapturing: true
};

// Variable Connection parameters
let channel = null; // Will be set when joining
let uid = 0; // User ID

// Generate random alphanumeric string of specified length
function generateRandomChannel(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    document.getElementById('channel').value = result;
    return result;
}

// Initialize the AgoraRTC client
function initializeClient() {
    client = AgoraRTC.createClient({ mode: "rtc", codec: "vp9" });
    setupEventListeners();
}

// Handle client events
function setupEventListeners() {

    //create remote container with UID as label on remote user join
    client.on("user-joined", async (user) => {
        console.log(`user ${user} joined channel`);
        displayRemoteUser(user)
    });

    //remove remote user container on remote user left
    client.on("user-left", (user) => {
        console.log(`user ${user} left channel`);
        const remotePlayerContainer = document.getElementById(user.uid);
        remotePlayerContainer && remotePlayerContainer.remove();
    });

    //subscribe to remote user media and play remote video/audio
    client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        console.log("subscribe success");

        if (mediaType === "video") {
            playRemoteVideo(user);
        }

        if (mediaType === "audio") {
            user.audioTrack.play();
        }
    });

    client.on("user-unpublished", (use, mediaType) => {
        const remotePlayerContainer = document.getElementById(user.uid);
        remotePlayerContainer && remotePlayerContainer.remove();
    });

    client.on("connection-state-change", (cur, prev, reason) => {
        if (cur === "DISCONNECTED") {
            log(`WebSocket Connection state changed to ${cur} from ${prev} for reason ${reason}.`);
        } else {
            log(`WebSocket Connection state changed to ${cur}.`);
        }
    });

    client.on("peerconnection-state-change", (curState, revState) => {
        if (curState === "disconnected") {
            log(`Media PeerConnection state changed to ${curState} from ${revState}.`);
        } else {
            log(`Media PeerConnection state changed to ${curState}.`);
        }
    });
}

function log(message) {
    document.getElementById("log").appendChild(document.createElement('div')).append(message)
};

// Update microphone and camera button states based on track availability and user state
function updateButtonStates() {
    const captureMicButton = document.getElementById('captureMic');
    const muteMicButton = document.getElementById('muteMic');
    const captureCameraButton = document.getElementById('captureCamera');
    const muteCameraButton = document.getElementById('muteCamera');
    
    // If buttons don't exist yet, return early
    if (!captureMicButton || !muteMicButton || !captureCameraButton || !muteCameraButton) {
        return;
    }

    // Get all button elements first
    const micStatus = captureMicButton.querySelector('.mic-status');
    const micIcon = captureMicButton.querySelector('svg');
    const muteMicIcon = muteMicButton.querySelector('svg');
    const cameraStatus = captureCameraButton.querySelector('.camera-status');
    const cameraIcon = captureCameraButton.querySelector('svg');
    const muteCameraIcon = muteCameraButton.querySelector('svg');

    // If any required elements are missing, return early
    if (!micStatus || !micIcon || !muteMicIcon || !cameraStatus || !cameraIcon || !muteCameraIcon) {
        return;
    }

    // Update microphone controls
    if (localAudioTrack) {
        if (userState.isMicMuted) {
            // Microphone is muted
            captureMicButton.disabled = true;
            muteMicButton.disabled = false;
            micStatus.className = 'mic-status muted';
            micIcon.style.stroke = 'black';
        } else {
            // Microphone is not muted
            captureMicButton.disabled = false;
            muteMicButton.disabled = !userState.isMicCapturing;

            if (userState.isMicCapturing) {
                micStatus.className = 'mic-status capturing';
                micIcon.style.stroke = 'white';
            } else {
                micStatus.className = 'mic-status not-capturing';
                micIcon.style.stroke = 'black';
            }
        }

        muteMicIcon.style.stroke = userState.isMicMuted ? '#f44336' : 'white';
    } else {
        captureMicButton.disabled = true;
        muteMicButton.disabled = true;
        micStatus.className = 'mic-status not-joined';
        micIcon.style.stroke = 'black';
        muteMicIcon.style.stroke = 'grey';
    }

    // Update camera controls
    if (localVideoTrack) {
        if (userState.isCameraMuted) {
            // Camera is muted
            captureCameraButton.disabled = true;
            muteCameraButton.disabled = false;
            cameraStatus.className = 'camera-status muted';
            cameraIcon.style.stroke = 'black';
        } else {
            // Camera is not muted
            captureCameraButton.disabled = false;
            muteCameraButton.disabled = !userState.isCameraCapturing;

            if (userState.isCameraCapturing) {
                cameraStatus.className = 'camera-status capturing';
                cameraIcon.style.stroke = 'white';
            } else {
                cameraStatus.className = 'camera-status not-capturing';
                cameraIcon.style.stroke = 'black';
            }
        }

        muteCameraIcon.style.stroke = userState.isCameraMuted ? '#f44336' : 'white';
    } else {
        captureCameraButton.disabled = true;
        muteCameraButton.disabled = true;
        cameraStatus.className = 'camera-status not-joined';
        cameraIcon.style.stroke = 'black';
        muteCameraIcon.style.stroke = 'grey';
    }

    // Ensure buttons maintain their scale during state changes
    [captureMicButton, muteMicButton, captureCameraButton, muteCameraButton].forEach(button => {
        if (!button.style.transform) {
            button.style.transform = 'scale(0.6)';
        }
    });
}

// Handle microphone capture toggle
async function toggleMicrophoneCapture() {
    if (!localAudioTrack) return;

    try {
        userState.isMicCapturing = !userState.isMicCapturing;
        await localAudioTrack.setEnabled(userState.isMicCapturing);
        updateButtonStates();
        updateLocalVideoCameraIcon();
    } catch (error) {
        console.error('Error toggling microphone capture:', error);
        log('Error toggling microphone capture: ' + error.message);
    }
}

// Handle microphone mute toggle
async function toggleMicrophoneMute() {
    if (!localAudioTrack || !userState.isMicCapturing) return;

    try {
        userState.isMicMuted = !userState.isMicMuted;
        await localAudioTrack.setMuted(userState.isMicMuted);
        updateButtonStates();
        updateLocalVideoCameraIcon();
    } catch (error) {
        console.error('Error toggling microphone mute:', error);
        log('Error toggling microphone mute: ' + error.message);
    }
}

// Handle camera capture toggle
async function toggleCameraCapture() {
    if (!localVideoTrack) return;

    try {
        userState.isCameraCapturing = !userState.isCameraCapturing;
        await localVideoTrack.setEnabled(userState.isCameraCapturing);
        updateButtonStates();
        updateLocalVideoCameraIcon();
    } catch (error) {
        console.error('Error toggling camera capture:', error);
        log('Error toggling camera capture: ' + error.message);
    }
}

// Handle camera mute toggle
async function toggleCameraMute() {
    if (!localVideoTrack || !userState.isCameraCapturing) return;

    try {
        userState.isCameraMuted = !userState.isCameraMuted;
        await localVideoTrack.setMuted(userState.isCameraMuted);
        updateButtonStates();
        updateLocalVideoCameraIcon();
    } catch (error) {
        console.error('Error toggling camera mute:', error);
        log('Error toggling camera mute: ' + error.message);
    }
}

// Create local audio and video tracks
async function createLocalTracks() {
    try {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localVideoTrack = await AgoraRTC.createCameraVideoTrack({encoderConfig: "720p_3"});
        
        // Ensure tracks are enabled
        await localAudioTrack.setEnabled(true);
        await localVideoTrack.setEnabled(true);
        
        // Update user state to match track state
        userState.isMicCapturing = true;
        userState.isCameraCapturing = true;
        userState.isMicMuted = false;
        userState.isCameraMuted = false;
        
        // Update button states after track creation
        updateButtonStates();
    } catch (error) {
        console.error('Error creating local tracks:', error);
        throw error;
    }
}

// Publish local audio and video tracks
async function publishLocalTracks() {
    await client.publish([localAudioTrack, localVideoTrack]);
}

// Display local video
function displayLocalVideo() {
    const localPlayerContainer = document.createElement("div");
    localPlayerContainer.id = uid;
    localPlayerContainer.style.width = "1280px";
    localPlayerContainer.style.height = "720px";
    localPlayerContainer.style.position = "relative";

    // Create device icon container
    const deviceIconContainer = document.createElement("div");
    deviceIconContainer.style.position = "absolute";
    deviceIconContainer.style.top = "20px";
    deviceIconContainer.style.right = "20px";
    deviceIconContainer.style.transform = "none";
    deviceIconContainer.style.display = "none"; // Initially hidden
    deviceIconContainer.style.zIndex = "2";
    deviceIconContainer.style.gap = "60px";
    deviceIconContainer.style.justifyContent = "center";
    deviceIconContainer.style.alignItems = "center";

    // Add camera icon SVG
    const cameraIcon = document.createElement("div");
    cameraIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="grey" stroke-width="2" width="32" height="32">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
        </svg>
    `;

    // Add microphone icon SVG
    const micIcon = document.createElement("div");
    micIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="grey" stroke-width="2" width="32" height="32">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
    `;

    deviceIconContainer.appendChild(cameraIcon);
    deviceIconContainer.appendChild(micIcon);
    localPlayerContainer.appendChild(deviceIconContainer);
    document.getElementById('video-container').appendChild(localPlayerContainer);
    localVideoTrack.play(localPlayerContainer);

    // Store references to the icons for later updates
    localPlayerContainer.deviceIconContainer = deviceIconContainer;
    localPlayerContainer.cameraIcon = cameraIcon.querySelector('svg');
    localPlayerContainer.micIcon = micIcon.querySelector('svg');
}

// Update device icons in local video container
function updateLocalVideoCameraIcon() {
    const localPlayerContainer = document.getElementById(uid);
    if (!localPlayerContainer || !localPlayerContainer.deviceIconContainer) return;

    const iconContainer = localPlayerContainer.deviceIconContainer;
    const cameraIcon = localPlayerContainer.cameraIcon;
    const micIcon = localPlayerContainer.micIcon;

    // Helper function to style icons
    const styleIcon = (icon, show) => {
        if (show) {
            icon.style.stroke = "#f44336"; // Red color
            icon.style.transform = "scale(2)"; // 200% larger
        } else {
            icon.style.stroke = "grey";
            icon.style.transform = "scale(1)";
        }
    };

    // Determine when to show camera icon
    const showCamera = !userState.isCameraCapturing || userState.isCameraMuted;
    
    // Determine when to show mic icon
    const showMic = !userState.isMicCapturing || userState.isMicMuted;

    // Show/hide container based on whether any icons should be shown
    iconContainer.style.display = (showCamera || showMic) ? "flex" : "none";

    // Style the icons
    styleIcon(cameraIcon, showCamera);
    styleIcon(micIcon, showMic);

    // Hide individual icons if they shouldn't be shown
    cameraIcon.style.display = showCamera ? "block" : "none";
    micIcon.style.display = showMic ? "block" : "none";
}

// Display remote video
function displayRemoteUser(user) {
    const remotePlayerContainer = document.createElement("div");
    remotePlayerContainer.id = user.uid.toString();
    remotePlayerContainer.style.width = "640px";
    remotePlayerContainer.style.height = "480px";
    remotePlayerContainer.style.position = "relative";
    
    // Create a div for the user ID text
    const uidText = document.createElement("div");
    uidText.textContent = `Remote user ${user.uid}`;
    uidText.style.position = "absolute";
    uidText.style.top = "50%";
    uidText.style.left = "50%";
    uidText.style.transform = "translate(-50%, -50%)";
    uidText.style.color = "white";
    uidText.style.fontSize = "24px";
    uidText.style.textShadow = "2px 2px 4px rgba(0,0,0,0.5)";
    uidText.style.zIndex = "1";
    
    document.body.append(remotePlayerContainer);
    remotePlayerContainer.appendChild(uidText);
}

// Play remote video in the container
function playRemoteVideo(user) {
    const remotePlayerContainer = document.getElementById(user.uid);
    if (remotePlayerContainer) {
        user.videoTrack.play(remotePlayerContainer);
    }
}

// Leave the channel and clean up
async function leaveChannel() {
    // Close local tracks
    if (localAudioTrack) {
        localAudioTrack.close();
        localAudioTrack = null;
    }
    if (localVideoTrack) {
        localVideoTrack.close();
        localVideoTrack = null;
    }

    // Remove local video container
    const localPlayerContainer = document.getElementById(uid);
    localPlayerContainer && localPlayerContainer.remove();

    // Remove all remote video containers
    client.remoteUsers.forEach((user) => {
        const playerContainer = document.getElementById(user.uid);
        playerContainer && playerContainer.remove();
    });

    // Leave the channel
    await client.leave();

    // Reset user state
    userState.isMicMuted = false;
    userState.isMicCapturing = false;
    userState.isCameraMuted = false;
    userState.isCameraCapturing = false;
    
    // Reset button states
    const captureMicButton = document.getElementById('captureMic');
    const muteMicButton = document.getElementById('muteMic');
    const captureCameraButton = document.getElementById('captureCamera');
    const muteCameraButton = document.getElementById('muteCamera');
    
    if (captureMicButton && muteMicButton && captureCameraButton && muteCameraButton) {
        [captureMicButton, muteMicButton, captureCameraButton, muteCameraButton].forEach(btn => btn.disabled = true);
        
        const micStatus = captureMicButton.querySelector('.mic-status');
        const micIcon = captureMicButton.querySelector('svg');
        const muteMicIcon = muteMicButton.querySelector('svg');
        const cameraStatus = captureCameraButton.querySelector('.camera-status');
        const cameraIcon = captureCameraButton.querySelector('svg');
        const muteCameraIcon = muteCameraButton.querySelector('svg');
        
        if (micStatus && micIcon && muteMicIcon && cameraStatus && cameraIcon && muteCameraIcon) {
            micStatus.className = 'mic-status not-joined';
            cameraStatus.className = 'camera-status not-joined';
            [micIcon, cameraIcon].forEach(icon => icon.style.stroke = 'black');
            [muteMicIcon, muteCameraIcon].forEach(icon => icon.style.stroke = 'grey');
        }
    }
    
    if (window.setLeaveButtonState) window.setLeaveButtonState(false);

    // Reset header state
    const header = document.getElementById('header');
    header.classList.remove('collapsed');
    window.headerCollapsed = false;

    // Clear the video container
    const videoContainer = document.getElementById('video-container');
    videoContainer.innerHTML = '';

    // Clear the log
    const log = document.getElementById('log');
    log.innerHTML = '';

    // Reset join button color to white
    const joinButton = document.getElementById('join');
    if (joinButton) {
        joinButton.style.backgroundColor = 'white';
    }

    // Disable and clear camera and microphone selects
    const cameraSelect = document.getElementById('cameraSelect');
    const microphoneSelect = document.getElementById('microphoneSelect');
    
    if (cameraSelect) {
        cameraSelect.disabled = true;
        cameraSelect.innerHTML = '<option value="">Select Camera</option>';
    }
    
    if (microphoneSelect) {
        microphoneSelect.disabled = true;
        microphoneSelect.innerHTML = '<option value="">Select Microphone</option>';
    }
}

// Set up button click handlers
function setupButtonHandlers() {
    const joinButton = document.getElementById("join");
    const leaveButton = document.getElementById("leave");

    // Style Join and Leave buttons
    [joinButton, leaveButton].forEach(button => {
        if (button) {
            // Base styles
            button.style.borderRadius = '20px';
            button.style.boxShadow = '4px 4px 8px rgba(0, 194, 255, 0.5)';
            button.style.transition = 'all 0.3s ease-in-out';
            button.style.backgroundColor = 'white';

            // Add hover effects
            button.addEventListener('mouseenter', () => {
                if (!button.disabled) {
                    button.style.boxShadow = '2px 2px 4px rgba(0, 194, 255, 0.3)';
                    button.style.backgroundColor = '#00c2ff';
                }
            });

            button.addEventListener('mouseleave', () => {
                if (!button.disabled) {
                    button.style.boxShadow = '4px 4px 8px rgba(0, 194, 255, 0.5)';
                    button.style.backgroundColor = 'white';
                }
            });
        }
    });

    joinButton.onclick = joinChannel;
    leaveButton.onclick = leaveChannel;
    document.getElementById("captureMic").onclick = toggleMicrophoneCapture;
    document.getElementById("muteMic").onclick = toggleMicrophoneMute;
    document.getElementById("captureCamera").onclick = toggleCameraCapture;
    document.getElementById("muteCamera").onclick = toggleCameraMute;

    // Add camera select change handler
    const cameraSelect = document.getElementById('cameraSelect');
    if (cameraSelect) {
        cameraSelect.addEventListener('change', async (e) => {
            if (e.target.value && localVideoTrack) {
                try {
                    // Store current device ID from the select value
                    const previousDeviceId = e.target.value;
                    const previousDeviceName = cameraDevices.get(previousDeviceId) || 'Unknown Camera';
                    const newDeviceId = e.target.value;
                    const newDeviceName = cameraDevices.get(newDeviceId) || 'Unknown Camera';
                    
                    log(`Switching camera from: ${previousDeviceName} (${previousDeviceId}) to: ${newDeviceName} (${newDeviceId})`);
                    
                    // Try to switch to new camera
                    await localVideoTrack.setDevice(e.target.value);
                    log(`Successfully switched to camera: ${newDeviceName} (${newDeviceId})`);
                } catch (error) {
                    console.error('Error switching camera:', error);
                    log(`Error switching camera: ${error.message}`);
                    
                    // If switching failed, try to switch back to previous device
                    if (previousDeviceId) {
                        try {
                            await localVideoTrack.setDevice(previousDeviceId);
                            // Reset select to previous value
                            cameraSelect.value = previousDeviceId;
                            log(`Reverted to previous camera: ${previousDeviceName} (${previousDeviceId})`);
                        } catch (fallbackError) {
                            console.error('Error switching back to previous camera:', fallbackError);
                            log(`Error switching back to previous camera: ${fallbackError.message}`);
                        }
                    }
                }
            }
        });
    }

    // Add microphone select change handler
    const microphoneSelect = document.getElementById('microphoneSelect');
    if (microphoneSelect) {
        microphoneSelect.addEventListener('change', async (e) => {
            if (e.target.value && localAudioTrack) {
                try {
                    // Store current device ID from the select value
                    const previousDeviceId = e.target.value;
                    const previousDeviceName = microphoneDevices.get(previousDeviceId) || 'Unknown Microphone';
                    const newDeviceId = e.target.value;
                    const newDeviceName = microphoneDevices.get(newDeviceId) || 'Unknown Microphone';
                    
                    log(`Switching microphone from: ${previousDeviceName} (${previousDeviceId}) to: ${newDeviceName} (${newDeviceId})`);
                    
                    // Try to switch to new microphone
                    await localAudioTrack.setDevice(e.target.value);
                    log(`Successfully switched to microphone: ${newDeviceName} (${newDeviceId})`);
                } catch (error) {
                    console.error('Error switching microphone:', error);
                    log(`Error switching microphone: ${error.message}`);
                    
                    // If switching failed, try to switch back to previous device
                    if (previousDeviceId) {
                        try {
                            await localAudioTrack.setDevice(previousDeviceId);
                            // Reset select to previous value
                            microphoneSelect.value = previousDeviceId;
                            log(`Reverted to previous microphone: ${previousDeviceName} (${previousDeviceId})`);
                        } catch (fallbackError) {
                            console.error('Error switching back to previous microphone:', fallbackError);
                            log(`Error switching back to previous microphone: ${fallbackError.message}`);
                        }
                    }
                }
            }
        });
    }

    // Add hover animations for control buttons
    const controlButtons = ['captureMic', 'muteMic', 'captureCamera', 'muteCamera'];
    controlButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            // Set initial size
            button.style.transform = 'scale(0.6)';
            button.style.transition = 'transform 0.3s ease-in-out';

            // Add hover effects
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'scale(1)';
            });

            button.addEventListener('mouseleave', () => {
                button.style.transform = 'scale(0.6)';
            });
        }
    });
}

// Start the basic call
function startBasicCall() {
    initializeClient();
    window.onload = () => {
        setupButtonHandlers();
        // Set global font family
        document.body.style.fontFamily = 'Jokker, Arial, sans-serif';
    };
}

// Join a channel and publish local media
async function joinChannel() {
    try {
        log("Joining channel...");
        const appId = document.getElementById('appId').value;
        const channelInput = document.getElementById('channel').value;
        channel = channelInput || generateRandomChannel(5);
        log(`Using channel name: ${channel}`);
        
        // Initialize client if needed
        if (!client) {
            initializeClient();
        }
        
        uid = await client.join(appId, channel, null, 0);
        console.log(`Join resolved to UID: ${uid}.`);
        log(`Join resolved to UID: ${uid}.`);
        
        // Reset user state for new connection
        userState.isMicMuted = false;
        userState.isMicCapturing = true;
        userState.isCameraMuted = false;
        userState.isCameraCapturing = true;
        
        // Get available cameras and populate dropdown
        try {
            const cameras = await AgoraRTC.getCameras();
            console.log('Available cameras:', cameras);
            const cameraSelect = document.getElementById('cameraSelect');
            if (cameraSelect) {
                // Clear existing options
                cameraSelect.innerHTML = '';
                
                // Add default option
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = 'Select Camera';
                cameraSelect.appendChild(defaultOption);
                
                // Add camera options
                cameras.forEach(camera => {
                    console.log('Adding camera:', camera);
                    const option = document.createElement('option');
                    option.value = camera.deviceId;
                    option.textContent = camera.label || `Camera ${camera.deviceId}`;
                    cameraSelect.appendChild(option);
                });
                
                // Enable the select
                cameraSelect.disabled = false;
                
                // If we have cameras, select the first one
                if (cameras.length > 0) {
                    cameraSelect.value = cameras[0].deviceId;
                    // Trigger the change event to set the initial camera
                    cameraSelect.dispatchEvent(new Event('change'));
                }
            } else {
                console.error('Camera select element not found');
            }
        } catch (error) {
            console.error('Error getting cameras:', error);
            log('Error getting cameras: ' + error.message);
        }
        
        // Create and publish tracks
        await createLocalTracks();
        await publishLocalTracks();
        
        // Display video
        displayLocalVideo();
        console.log("Publish success!");
        
        // Enable control buttons and update their states
        const captureMicButton = document.getElementById('captureMic');
        const muteMicButton = document.getElementById('muteMic');
        const captureCameraButton = document.getElementById('captureCamera');
        const muteCameraButton = document.getElementById('muteCamera');
        
        if (captureMicButton && muteMicButton && captureCameraButton && muteCameraButton) {
            // Enable buttons
            captureMicButton.disabled = false;
            muteMicButton.disabled = false;
            captureCameraButton.disabled = false;
            muteCameraButton.disabled = false;
            
            // Update status classes directly
            const micStatus = captureMicButton.querySelector('.mic-status');
            const micIcon = captureMicButton.querySelector('svg');
            const muteMicIcon = muteMicButton.querySelector('svg');
            const cameraStatus = captureCameraButton.querySelector('.camera-status');
            const cameraIcon = captureCameraButton.querySelector('svg');
            const muteCameraIcon = muteCameraButton.querySelector('svg');
            
            if (micStatus && micIcon && muteMicIcon && cameraStatus && cameraIcon && muteCameraIcon) {
                // Set capturing state
                micStatus.className = 'mic-status capturing';
                cameraStatus.className = 'camera-status capturing';
                micIcon.style.stroke = 'white';
                cameraIcon.style.stroke = 'white';
                muteMicIcon.style.stroke = 'white';
                muteCameraIcon.style.stroke = 'white';
            }
        }
        
        if (window.setLeaveButtonState) window.setLeaveButtonState(true);

        // Set join button color to blue
        const joinButton = document.getElementById('join');
        if (joinButton) {
            joinButton.style.backgroundColor = '#00c2ff';
        }

        // Initialize camera and microphone lists after joining
        await updateCameraList();
        await updateMicrophoneList();
    } catch (error) {
        console.error('Error joining channel:', error);
        log('Error joining channel: ' + error.message);
        // Reset button states on error
        updateButtonStates();
    }
}

// Add camera change listener
AgoraRTC.on("camera-changed", async (info) => {
    console.log("Camera changed!", info.state, info.device);
    log(`Camera device changed: ${info.state} - Device: ${info.device.label || info.device.deviceId}`);
    if (info.state === "ACTIVE") {
        // Refresh camera list when a camera is connected
        await updateCameraList();
    }
});

// Add microphone change listener
AgoraRTC.on("microphone-changed", async (info) => {
    console.log("Microphone changed!", info.state, info.device);
    log(`Microphone device changed: ${info.state} - Device: ${info.device.label || info.device.deviceId}`);
    if (info.state === "ACTIVE") {
        // Refresh microphone list when a microphone is connected
        await updateMicrophoneList();
    }
});

// Function to update camera list
async function updateCameraList() {
    try {
        const cameras = await AgoraRTC.getCameras();
        console.log("Available cameras:", cameras);
        
        // Clear existing devices
        cameraDevices.clear();
        
        // Store camera devices
        cameras.forEach(camera => {
            cameraDevices.set(camera.deviceId, camera.label);
        });
        
        // Log the updated camera devices map
        log("Updated camera devices:");
        cameraDevices.forEach((label, deviceId) => {
            log(`- ${label || 'Unnamed Camera'} (${deviceId})`);
        });
        
        // Update select element
        const cameraSelect = document.getElementById("cameraSelect");
        if (!cameraSelect) {
            console.error("Camera select element not found");
            return;
        }
        
        // Clear existing options except the first one
        while (cameraSelect.options.length > 1) {
            cameraSelect.remove(1);
        }
        
        // Add camera options
        cameras.forEach(camera => {
            const option = document.createElement("option");
            option.value = camera.deviceId;
            option.text = camera.label || `Camera ${cameraSelect.options.length}`;
            cameraSelect.appendChild(option);
        });
        
        // Enable select if we have cameras
        cameraSelect.disabled = cameras.length === 0;
        
        // Select first camera if available
        if (cameras.length > 0) {
            cameraSelect.value = cameras[0].deviceId;
        }
    } catch (error) {
        console.error("Error updating camera list:", error);
        log(`Error updating camera list: ${error.message}`);
    }
}

// Function to update microphone list
async function updateMicrophoneList() {
    try {
        const microphones = await AgoraRTC.getMicrophones();
        console.log("Available microphones:", microphones);
        
        // Clear existing devices
        microphoneDevices.clear();
        
        // Store microphone devices
        microphones.forEach(microphone => {
            microphoneDevices.set(microphone.deviceId, microphone.label);
        });
        
        // Log the updated microphone devices map
        log("Updated microphone devices:");
        microphoneDevices.forEach((label, deviceId) => {
            log(`- ${label || 'Unnamed Microphone'} (${deviceId})`);
        });
        
        // Update select element
        const microphoneSelect = document.getElementById("microphoneSelect");
        if (!microphoneSelect) {
            console.error("Microphone select element not found");
            return;
        }
        
        // Clear existing options except the first one
        while (microphoneSelect.options.length > 1) {
            microphoneSelect.remove(1);
        }
        
        // Add microphone options
        microphones.forEach(microphone => {
            const option = document.createElement("option");
            option.value = microphone.deviceId;
            option.text = microphone.label || `Microphone ${microphoneSelect.options.length}`;
            microphoneSelect.appendChild(option);
        });
        
        // Enable select if we have microphones
        microphoneSelect.disabled = microphones.length === 0;
        
        // Select first microphone if available
        if (microphones.length > 0) {
            microphoneSelect.value = microphones[0].deviceId;
        }
    } catch (error) {
        console.error("Error updating microphone list:", error);
        log(`Error updating microphone list: ${error.message}`);
    }
}

startBasicCall();