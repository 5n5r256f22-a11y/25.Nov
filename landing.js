const startButton = document.querySelector(".game-start");
const backgroundArtwork = document.querySelector(".background-artwork");
const bus = document.querySelector(".bus");
const passenger = document.querySelector(".passenger");
const sceneArrows = document.querySelectorAll(".scene-arrow");
const cleaningScene = document.querySelector("#cleaningScene");
const cameraVideo = document.querySelector("#handCamera");
const exitButton = document.querySelector("#exitGame");
const frostCanvas = document.querySelector("#frostCanvas");
const wipeCursor = document.querySelector("#wipeCursor");
const cleaningStatus = document.querySelector("#cleaningStatus");
const frostContext = frostCanvas?.getContext("2d");

if (
  !startButton ||
  !backgroundArtwork ||
  !bus ||
  !passenger ||
  !cleaningScene ||
  !cameraVideo ||
  !exitButton ||
  !frostCanvas ||
  !wipeCursor ||
  !cleaningStatus ||
  !frostContext
) {
  throw new Error("The window-cleaning scene is missing required elements.");
}

let cameraStream = null;
let handLandmarker = null;
let handFrame = null;
let handTrackingSession = 0;
let lastVideoTime = -1;
let previousHandPoint = null;

function setCleaningStatus(message) {
  if (cleaningStatus.textContent !== message) {
    cleaningStatus.textContent = message;
  }
}

function drawFrostLayer() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  frostCanvas.width = Math.round(width * pixelRatio);
  frostCanvas.height = Math.round(height * pixelRatio);
  frostContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  frostContext.globalCompositeOperation = "source-over";
  frostContext.globalAlpha = 1;

  const frost = frostContext.createLinearGradient(0, 0, width, height);
  frost.addColorStop(0, "rgba(244, 249, 253, 0.84)");
  frost.addColorStop(0.52, "rgba(235, 243, 249, 0.78)");
  frost.addColorStop(1, "rgba(248, 251, 254, 0.85)");
  frostContext.fillStyle = frost;
  frostContext.fillRect(0, 0, width, height);

  for (let index = 0; index < 8; index += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = 80 + Math.random() * 180;
    const haze = frostContext.createRadialGradient(x, y, 0, x, y, radius);
    haze.addColorStop(0, "rgba(255, 255, 255, 0.22)");
    haze.addColorStop(1, "rgba(238, 246, 252, 0)");
    frostContext.fillStyle = haze;
    frostContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

function wipeFrost(from, to) {
  frostContext.save();
  frostContext.globalCompositeOperation = "destination-out";
  frostContext.globalAlpha = 1;
  frostContext.lineCap = "round";
  frostContext.lineJoin = "round";
  frostContext.lineWidth = Math.max(54, Math.min(108, window.innerWidth * 0.075));
  frostContext.strokeStyle = "#000";
  frostContext.beginPath();
  frostContext.moveTo(from.x, from.y);
  frostContext.lineTo(to.x, to.y);
  frostContext.stroke();
  frostContext.restore();
}

function trackHand(timestamp) {
  if (
    handLandmarker &&
    cameraVideo.readyState >= 2 &&
    cameraVideo.currentTime !== lastVideoTime
  ) {
    lastVideoTime = cameraVideo.currentTime;
    const result = handLandmarker.detectForVideo(cameraVideo, timestamp);
    const indexTip = result.landmarks?.[0]?.[8];

    if (!indexTip) {
      previousHandPoint = null;
      wipeCursor.hidden = true;
      setCleaningStatus("Show your hand to the camera. Move it left and right to clear the frost.");
    } else {
      const point = {
        x: (1 - indexTip.x) * window.innerWidth,
        y: indexTip.y * window.innerHeight
      };
      wipeCursor.hidden = false;
      wipeCursor.style.left = `${point.x}px`;
      wipeCursor.style.top = `${point.y}px`;

      if (previousHandPoint) {
        const horizontalMovement = Math.abs(point.x - previousHandPoint.x);
        const verticalMovement = Math.abs(point.y - previousHandPoint.y);
        if (horizontalMovement > 1 && horizontalMovement > verticalMovement * 0.55) {
          wipeFrost(previousHandPoint, point);
        }
      }

      previousHandPoint = point;
      setCleaningStatus("Move your hand left and right to clear the frost and reveal the picture.");
    }
  }

  handFrame = requestAnimationFrame(trackHand);
}

function stopCamera() {
  if (handFrame !== null) {
    cancelAnimationFrame(handFrame);
    handFrame = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (handLandmarker) {
    handLandmarker.close();
    handLandmarker = null;
  }

  cameraVideo.pause();
  cameraVideo.srcObject = null;
  previousHandPoint = null;
  wipeCursor.hidden = true;
}

function isActiveSession(session) {
  return session === handTrackingSession && !cleaningScene.hidden;
}

async function startHandTracking(session) {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access requires HTTPS or localhost.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    if (!isActiveSession(session)) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    cameraStream = stream;
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    if (!isActiveSession(session)) return;

    const { FilesetResolver, HandLandmarker } = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
    );
    if (!isActiveSession(session)) return;

    const visionFiles = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    if (!isActiveSession(session)) return;

    const landmarker = await HandLandmarker.createFromOptions(visionFiles, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "CPU"
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
    if (!isActiveSession(session)) {
      landmarker.close();
      return;
    }

    handLandmarker = landmarker;
    setCleaningStatus("Move your hand left and right to clear the frost and reveal the picture.");
    handFrame = requestAnimationFrame(trackHand);
  } catch (error) {
    if (!isActiveSession(session)) return;

    console.error("Could not start local camera hand tracking.", error);
    stopCamera();
    const message = error.name === "NotAllowedError"
      ? "Camera permission is required. Allow access, then refresh the page."
      : error.message === "Camera access requires HTTPS or localhost."
        ? "Camera access requires HTTPS or localhost."
        : error.name === "NotFoundError"
          ? "No camera was found."
          : "Could not start the camera or hand-tracking model. Check the camera and internet connection.";
    setCleaningStatus(message);
  }
}

let busAudioContext = null;
let busEngineOscillator = null;
let busEnginePulseOscillator = null;
let busEngineFilter = null;
let busEngineGain = null;
let busNoiseBuffer = null;
let gameMusicGain = null;
let busAudioFrame = null;
let lastBusPhase = null;
let lastBusAudioUpdate = 0;
let gameMusicNextNoteTime = 0;
let gameMusicStep = 0;
let gameMusicStarted = false;
let busAudioResumePending = false;
let busAudioUnavailable = false;
const gameMusicMelody = [
  72, null, 76, 79, null, 76, 74, null,
  67, null, 72, 76, 79, null, 76, null,
  72, null, 76, 81, null, 79, 76, null,
  74, null, 72, 76, null, 74, 72, null
];
const gameMusicChordRoots = [48, 53, 55, 48];
const gameMusicStepDuration = 60 / 112 / 2;

function playBrakeSound() {
  const startTime = busAudioContext.currentTime;
  const source = busAudioContext.createBufferSource();
  const filter = busAudioContext.createBiquadFilter();
  const gain = busAudioContext.createGain();

  source.buffer = busNoiseBuffer;
  filter.type = "bandpass";
  filter.frequency.value = 1100;
  filter.Q.value = 0.7;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.045, startTime + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.9);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(busAudioContext.destination);
  source.start(startTime);
  source.stop(startTime + 0.95);
}

function playBusDoorSound(isOpening) {
  const startTime = busAudioContext.currentTime;
  const source = busAudioContext.createBufferSource();
  const filter = busAudioContext.createBiquadFilter();
  const noiseGain = busAudioContext.createGain();
  const motor = busAudioContext.createOscillator();
  const motorGain = busAudioContext.createGain();

  source.buffer = busNoiseBuffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(isOpening ? 650 : 1150, startTime);
  filter.frequency.exponentialRampToValueAtTime(isOpening ? 1450 : 420, startTime + 0.42);
  filter.Q.value = 0.8;
  noiseGain.gain.setValueAtTime(0.0001, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.04, startTime + 0.06);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.62);
  source.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(busAudioContext.destination);
  source.start(startTime);
  source.stop(startTime + 0.65);

  motor.type = "triangle";
  motor.frequency.setValueAtTime(isOpening ? 105 : 145, startTime);
  motor.frequency.exponentialRampToValueAtTime(isOpening ? 72 : 88, startTime + 0.38);
  motorGain.gain.setValueAtTime(0.0001, startTime);
  motorGain.gain.exponentialRampToValueAtTime(isOpening ? 0.026 : 0.032, startTime + 0.04);
  motorGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.44);
  motor.connect(motorGain);
  motorGain.connect(busAudioContext.destination);
  motor.start(startTime);
  motor.stop(startTime + 0.46);
}

function playRestaurantDoorSound() {
  const startTime = busAudioContext.currentTime;
  const doorSource = busAudioContext.createBufferSource();
  const doorFilter = busAudioContext.createBiquadFilter();
  const doorGain = busAudioContext.createGain();

  doorSource.buffer = busNoiseBuffer;
  doorFilter.type = "bandpass";
  doorFilter.frequency.setValueAtTime(620, startTime);
  doorFilter.frequency.exponentialRampToValueAtTime(1450, startTime + 0.18);
  doorFilter.frequency.exponentialRampToValueAtTime(480, startTime + 0.5);
  doorFilter.Q.value = 1.1;
  doorGain.gain.setValueAtTime(0.0001, startTime);
  doorGain.gain.exponentialRampToValueAtTime(0.024, startTime + 0.06);
  doorGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.55);
  doorSource.connect(doorFilter);
  doorFilter.connect(doorGain);
  doorGain.connect(busAudioContext.destination);
  doorSource.start(startTime);
  doorSource.stop(startTime + 0.58);
}

function playButtonHoverSound() {
  if (!busAudioContext || busAudioContext.state !== "running") return;

  const startTime = busAudioContext.currentTime;
  const oscillator = busAudioContext.createOscillator();
  const gain = busAudioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(820, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(410, startTime + 0.08);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.05, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.09);
  oscillator.connect(gain);
  gain.connect(busAudioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + 0.1);
}

function playGameMusicNote(midiNote, startTime, duration, volume, waveform, sustained = false) {
  const oscillator = busAudioContext.createOscillator();
  const filter = busAudioContext.createBiquadFilter();
  const gain = busAudioContext.createGain();

  oscillator.type = waveform;
  oscillator.frequency.value = 440 * 2 ** ((midiNote - 69) / 12);
  filter.type = "lowpass";
  filter.frequency.value = waveform === "sine" ? 900 : 1700;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.025);
  if (sustained) {
    gain.gain.exponentialRampToValueAtTime(volume * 0.55, startTime + duration * 0.75);
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(gameMusicGain);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function scheduleGameMusic() {
  const now = busAudioContext.currentTime;

  if (gameMusicNextNoteTime < now - gameMusicStepDuration) {
    const skippedSteps = Math.floor((now - gameMusicNextNoteTime) / gameMusicStepDuration) + 1;
    gameMusicStep = (gameMusicStep + skippedSteps) % gameMusicMelody.length;
    gameMusicNextNoteTime += skippedSteps * gameMusicStepDuration;
  }

  while (gameMusicNextNoteTime < now + 0.12) {
    const step = gameMusicStep;
    const startTime = gameMusicNextNoteTime;
    const note = gameMusicMelody[step];
    if (note !== null) {
      playGameMusicNote(note, startTime, gameMusicStepDuration * 0.9, 0.085, "triangle");
    }

    if (step % 8 === 0) {
      const root = gameMusicChordRoots[step / 8];
      const chordDuration = gameMusicStepDuration * 7.5;
      playGameMusicNote(root, startTime, chordDuration, 0.04, "sine", true);
      playGameMusicNote(root + 12, startTime, chordDuration, 0.012, "triangle", true);
      playGameMusicNote(root + 16, startTime, chordDuration, 0.01, "triangle", true);
      playGameMusicNote(root + 19, startTime, chordDuration, 0.01, "triangle", true);
    }

    gameMusicStep = (step + 1) % gameMusicMelody.length;
    gameMusicNextNoteTime += gameMusicStepDuration;
  }
}

function playPassengerGreeting() {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") {
    console.warn("Passenger greeting is not supported by this browser.");
    return;
  }

  const greeting = new SpeechSynthesisUtterance("Cheers!");
  greeting.lang = "en-US";
  greeting.rate = 0.95;
  greeting.pitch = 0.9;
  greeting.volume = 0.8;
  greeting.voice = window.speechSynthesis.getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith("en")) || null;
  greeting.onerror = (event) => {
    console.error("Could not play passenger greeting.", event.error);
  };
  window.speechSynthesis.speak(greeting);
}

function playEngineStartSound() {
  const startTime = busAudioContext.currentTime;
  const oscillator = busAudioContext.createOscillator();
  const filter = busAudioContext.createBiquadFilter();
  const gain = busAudioContext.createGain();

  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(48, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(135, startTime + 0.35);
  oscillator.frequency.exponentialRampToValueAtTime(78, startTime + 0.9);
  oscillator.frequency.exponentialRampToValueAtTime(55, startTime + 1.7);
  filter.type = "lowpass";
  filter.frequency.value = 720;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.075, startTime + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.8);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(busAudioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + 1.85);
}

function updateBusAudio() {
  busAudioFrame = null;
  if (!busAudioContext || busAudioContext.state !== "running") return;

  let phase = null;
  if (cleaningScene.hidden && !bus.hidden) {
    const animation = bus.getAnimations().find((item) => item.animationName === "bus-route");
    const currentTime = animation?.currentTime;
    const duration = Number(animation?.effect?.getTiming().duration);
    if (typeof currentTime === "number" && Number.isFinite(duration) && duration > 0) {
      phase = currentTime % duration;
    }
  }

  let targetGain = 0;
  let engineFrequency = 45;
  if (phase !== null) {
    const phaseSeconds = phase / 1000;
    if (lastBusPhase !== null && phase >= lastBusPhase) {
      const duration = Number(bus.getAnimations().find((item) => item.animationName === "bus-route")
        ?.effect?.getTiming().duration);
      if (lastBusPhase < duration * 0.25 && phase >= duration * 0.25) {
        playBrakeSound();
      }
      if (lastBusPhase < duration * 0.26 && phase >= duration * 0.26) {
        playBusDoorSound(true);
      }
      if (lastBusPhase < duration * 0.31 && phase >= duration * 0.31) {
        playPassengerGreeting();
      }
      if (lastBusPhase < duration * 0.445 && phase >= duration * 0.445) {
        playBusDoorSound(false);
      }
      if (lastBusPhase < duration * 0.5 && phase >= duration * 0.5) {
        playEngineStartSound();
      }
      if (lastBusPhase < duration * 0.6 && phase >= duration * 0.6) {
        playRestaurantDoorSound();
      }
    }

    if (phaseSeconds < 5) {
      targetGain = 0.065 * Math.min(phaseSeconds / 1.2, 1);
      engineFrequency = 52 + phaseSeconds * 2.2;
    } else if (phaseSeconds < 10) {
      targetGain = 0.022;
      engineFrequency = 43;
    } else {
      const departureSeconds = phaseSeconds - 10;
      targetGain = 0.075 * Math.max(0, 1 - departureSeconds / 10);
      engineFrequency = 55 + 58 * Math.exp(-departureSeconds / 1.1);
    }
  }

  lastBusPhase = phase;
  const now = busAudioContext.currentTime;
  if (!gameMusicStarted) {
    gameMusicGain.gain.setTargetAtTime(0.34, now, 0.6);
    gameMusicNextNoteTime = now + 0.08;
    gameMusicStarted = true;
  }
  scheduleGameMusic();

  if (now - lastBusAudioUpdate >= 0.08) {
    busEngineGain.gain.setTargetAtTime(targetGain, now, 0.12);
    busEngineOscillator.frequency.setTargetAtTime(engineFrequency, now, 0.1);
    busEnginePulseOscillator.frequency.setTargetAtTime(7 + engineFrequency * 0.06, now, 0.1);
    busEngineFilter.frequency.setTargetAtTime(220 + engineFrequency * 5, now, 0.15);
    lastBusAudioUpdate = now;
  }

  busAudioFrame = requestAnimationFrame(updateBusAudio);
}

function enableBusAudio() {
  if (busAudioUnavailable) return;

  try {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error("Web Audio is not supported by this browser.");
    }

    if (!busAudioContext) {
      busAudioContext = new AudioContextConstructor();
      busEngineOscillator = busAudioContext.createOscillator();
      busEngineFilter = busAudioContext.createBiquadFilter();
      busEngineGain = busAudioContext.createGain();
      gameMusicGain = busAudioContext.createGain();
      busNoiseBuffer = busAudioContext.createBuffer(
        1,
        Math.floor(busAudioContext.sampleRate * 1.1),
        busAudioContext.sampleRate
      );
      const noise = busNoiseBuffer.getChannelData(0);
      for (let index = 0; index < noise.length; index += 1) {
        noise[index] = Math.random() * 2 - 1;
      }

      busEngineOscillator.type = "sawtooth";
      busEngineOscillator.frequency.value = 45;
      busEngineFilter.type = "lowpass";
      busEngineFilter.frequency.value = 420;
      busEngineGain.gain.value = 0;
      gameMusicGain.gain.value = 0;
      const enginePulse = busAudioContext.createGain();
      const pulseDepth = busAudioContext.createGain();
      busEnginePulseOscillator = busAudioContext.createOscillator();
      busEnginePulseOscillator.frequency.value = 9;
      enginePulse.gain.value = 0.8;
      pulseDepth.gain.value = 0.16;
      busEnginePulseOscillator.connect(pulseDepth);
      pulseDepth.connect(enginePulse.gain);
      busEngineOscillator.connect(busEngineFilter);
      busEngineFilter.connect(enginePulse);
      enginePulse.connect(busEngineGain);
      busEngineGain.connect(busAudioContext.destination);
      gameMusicGain.connect(busAudioContext.destination);
      busEngineOscillator.start();
      busEnginePulseOscillator.start();
    }

    if (busAudioContext.state === "running") {
      if (busAudioFrame === null) {
        busAudioFrame = requestAnimationFrame(updateBusAudio);
      }
      document.removeEventListener("pointerdown", enableBusAudio);
      document.removeEventListener("keydown", enableBusAudio);
      return;
    }

    if (busAudioResumePending) return;
    busAudioResumePending = true;
    void busAudioContext.resume().then(() => {
      busAudioResumePending = false;
      document.removeEventListener("pointerdown", enableBusAudio);
      document.removeEventListener("keydown", enableBusAudio);
      if (busAudioFrame === null) {
        busAudioFrame = requestAnimationFrame(updateBusAudio);
      }
    }).catch((error) => {
      busAudioResumePending = false;
      console.error("Could not enable bus sound.", error);
    });
  } catch (error) {
    busAudioUnavailable = true;
    console.error("Could not initialize bus sound.", error);
  }
}

document.addEventListener("pointerdown", enableBusAudio);
document.addEventListener("keydown", enableBusAudio);

document.querySelectorAll(".game-start, .exit-game, .scene-arrow").forEach((control) => {
  control.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") playButtonHoverSound();
  });
});

startButton.addEventListener("click", () => {
  const session = ++handTrackingSession;
  backgroundArtwork.src = "images/guildhall.jpg";
  backgroundArtwork.alt = "An illustration of a Guildhall building";
  startButton.hidden = true;
  bus.hidden = true;
  passenger.hidden = true;
  sceneArrows.forEach((arrow) => {
    arrow.hidden = true;
  });
  cleaningScene.hidden = false;
  drawFrostLayer();
  setCleaningStatus("Connecting to the camera. Please allow access.");
  void startHandTracking(session);
});

exitButton.addEventListener("click", () => {
  handTrackingSession += 1;
  stopCamera();
  backgroundArtwork.src = "images/rosa.jpg";
  backgroundArtwork.alt = "A colorful drawing of buildings along a street";
  cleaningScene.hidden = true;
  bus.hidden = false;
  passenger.hidden = false;
  sceneArrows.forEach((arrow) => {
    arrow.hidden = false;
  });
  startButton.hidden = false;

  bus.style.animation = "none";
  passenger.style.animation = "none";
  startButton.style.animation = "none";
  void bus.offsetWidth;
  bus.style.animation = "";
  passenger.style.animation = "";
  startButton.style.animation = "";
});

window.addEventListener("resize", () => {
  if (!cleaningScene.hidden) {
    drawFrostLayer();
  }
});

window.addEventListener("pagehide", () => {
  handTrackingSession += 1;
  stopCamera();
}, { once: true });
