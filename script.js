const stone = document.querySelector("#stone");
const cardOverlay = document.querySelector("#cardOverlay");
const cardImage = document.querySelector("#cardImage");
const cardName = document.querySelector("#cardName");
const cardYear = document.querySelector("#cardYear");
const cardDescription = document.querySelector("#cardDescription");
const cursorTrail = document.querySelector("#cursorTrail");
const startGameButton = document.querySelector("#startGame");
const gameOverlay = document.querySelector("#gameOverlay");
const closeGameButton = document.querySelector("#closeGame");
const retryGameButton = document.querySelector("#retryGame");
const gameCamera = document.querySelector("#gameCamera");
const gameStatus = document.querySelector("#gameStatus");
const gameScore = document.querySelector("#gameScore");
const handPointer = document.querySelector("#handPointer");
const drinkGameLaunch = document.querySelector("#drinkGameLaunch");
const drinkOverlay = document.querySelector("#drinkOverlay");
const closeDrinkGameButton = document.querySelector("#closeDrinkGame");
const startDrinkGameButton = document.querySelector("#startDrinkGame");
const retryDrinkGameButton = document.querySelector("#retryDrinkGame");
const drinkCamera = document.querySelector("#drinkCamera");
const drinkCup = document.querySelector("#drinkCup");
const drinkLiquid = document.querySelector("#drinkLiquid");
const drinkScore = document.querySelector("#drinkScore");
const drinkStatus = document.querySelector("#drinkStatus");
const characters = [...document.querySelectorAll(".character-zone")].map((element) => {
  const character = {
    element,
    id: element.dataset.characterId,
    name: element.dataset.characterName,
    x: Number(element.dataset.x),
    y: Number(element.dataset.y),
    width: Number(element.dataset.width),
    height: Number(element.dataset.height),
    count: 0,
    collected: false
  };
  element.style.setProperty("--x", `${character.x * 100}%`);
  element.style.setProperty("--y", `${character.y * 100}%`);
  element.style.setProperty("--width", `${character.width * 100}%`);
  element.style.setProperty("--height", `${character.height * 100}%`);
  return character;
});

function updateBackgroundForTime() {
  const hour = new Date().getHours();
  document.body.classList.toggle("night-mode", hour >= 16 || hour < 4);
}

updateBackgroundForTime();
window.setInterval(updateBackgroundForTime, 60_000);

const kings = [
  {
    name: "King Cadred",
    year: "945",
    image: "images/king 1.JPG",
    description: "A royal figure crowned in red, associated with the coronation stone and the authority of the old kingdom."
  },
  {
    name: "Coronation King",
    year: "946",
    image: "images/coronation stone.jpg",
    description: "An imagined guardian of the stone, remembered through the carved symbols of kingship and ceremony."
  }
];

let currentKing = 0;
let cardOpen = false;
let lastTrailPoint = null;
let distanceToNextDot = 7;
let gameOpen = false;
let gameSession = 0;
let gameStream = null;
let handLandmarker = null;
let gameFrame = null;
let lastVideoTime = -1;
let activeCharacterId = null;
let lastSelectionAt = Number.NEGATIVE_INFINITY;
let collectedCount = 0;
let drinkOpen = false;
let drinkSession = 0;
let drinkStream = null;
let faceLandmarker = null;
let drinkFrame = null;
let lastFaceVideoTime = -1;
let lastPourTimestamp = null;
let mouthIsOpen = false;
let drinkActive = false;
let fillLevel = 0;

function showKing(index) {
  const king = kings[index];
  cardImage.src = king.image;
  cardImage.alt = `${king.name} illustration`;
  cardName.textContent = king.name;
  cardYear.textContent = king.year;
  cardDescription.textContent = king.description;
}

function setGameStatus(message) {
  if (gameStatus.textContent !== message) {
    gameStatus.textContent = message;
  }
}

function stopGameResources() {
  if (gameFrame !== null) {
    cancelAnimationFrame(gameFrame);
    gameFrame = null;
  }

  if (gameStream) {
    gameStream.getTracks().forEach((track) => track.stop());
    gameStream = null;
  }

  if (handLandmarker) {
    handLandmarker.close();
    handLandmarker = null;
  }

  gameCamera.pause();
  gameCamera.srcObject = null;
  gameCamera.hidden = true;
  handPointer.hidden = true;
  characters.forEach((character) => character.element.classList.remove("selected"));
  activeCharacterId = null;
}

function closeMiniGame() {
  gameOpen = false;
  gameSession += 1;
  stopGameResources();
  gameOverlay.classList.remove("open");
  gameOverlay.setAttribute("aria-hidden", "true");
  retryGameButton.hidden = true;
  startGameButton.disabled = false;
}

function resetCharacterProgress() {
  collectedCount = 0;
  gameScore.textContent = `Collected: 0 / ${characters.length}`;
  characters.forEach((character) => {
    character.count = 0;
    character.collected = false;
    character.element.classList.remove("selected", "collected");
    character.element.querySelector(".character-count").textContent = "0 / 5";
  });
}

function registerCharacterSelection(character) {
  if (character.collected) {
    setGameStatus(`${character.name} is already collected.`);
    return;
  }

  character.count += 1;
  const countLabel = character.element.querySelector(".character-count");
  if (character.count === 5) {
    character.collected = true;
    character.element.classList.add("collected");
    countLabel.textContent = "Collected";
    collectedCount += 1;
    gameScore.textContent = `Collected: ${collectedCount} / ${characters.length}`;
    setGameStatus(`${character.name} collected!`);
  } else {
    countLabel.textContent = `${character.count} / 5`;
    setGameStatus(`${character.name}: ${character.count} / 5 selections.`);
  }
}

function updateHandSelection(x, y, timestamp) {
  handPointer.hidden = false;
  handPointer.style.left = `${x * 100}%`;
  handPointer.style.top = `${y * 100}%`;

  const selectedCharacter = characters.find((character) =>
    x >= character.x &&
    x <= character.x + character.width &&
    y >= character.y &&
    y <= character.y + character.height
  );

  characters.forEach((character) => {
    character.element.classList.toggle("selected", character === selectedCharacter);
  });

  if (!selectedCharacter) {
    activeCharacterId = null;
    setGameStatus("Move your hand over an outlined figure.");
    return;
  }

  if (selectedCharacter.id !== activeCharacterId) {
    activeCharacterId = selectedCharacter.id;
    if (timestamp - lastSelectionAt >= 600) {
      registerCharacterSelection(selectedCharacter);
      lastSelectionAt = timestamp;
    }
  }
}

function trackHand(timestamp) {
  if (!gameOpen || !handLandmarker) return;

  if (gameCamera.readyState >= 2 && gameCamera.currentTime !== lastVideoTime) {
    lastVideoTime = gameCamera.currentTime;
    const result = handLandmarker.detectForVideo(gameCamera, timestamp);
    const wrist = result.landmarks?.[0]?.[0];

    if (!wrist) {
      handPointer.hidden = true;
      activeCharacterId = null;
      characters.forEach((character) => character.element.classList.remove("selected"));
      setGameStatus("Raise one hand in front of the camera.");
    } else if (wrist.y > 0.72) {
      handPointer.hidden = true;
      activeCharacterId = null;
      characters.forEach((character) => character.element.classList.remove("selected"));
      setGameStatus("Raise your hand a little higher.");
    } else {
      const handX = 1 - wrist.x;
      updateHandSelection(handX, wrist.y, timestamp);
    }
  }

  gameFrame = requestAnimationFrame(trackHand);
}

async function startMiniGame() {
  const session = ++gameSession;
  gameOpen = true;
  gameOverlay.classList.add("open");
  gameOverlay.setAttribute("aria-hidden", "false");
  retryGameButton.hidden = true;
  startGameButton.disabled = true;
  resetCharacterProgress();
  setGameStatus("Allow camera access to start hand tracking.");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access requires HTTPS or localhost.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });

    if (!gameOpen || session !== gameSession) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    gameStream = stream;
    gameCamera.hidden = false;
    gameCamera.srcObject = stream;
    await gameCamera.play();

    const { FilesetResolver, HandLandmarker } = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
    );
    if (!gameOpen || session !== gameSession) return;

    const visionFiles = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    if (!gameOpen || session !== gameSession) return;

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

    if (!gameOpen || session !== gameSession) {
      landmarker.close();
      return;
    }

    handLandmarker = landmarker;
    lastVideoTime = -1;
    activeCharacterId = null;
    lastSelectionAt = Number.NEGATIVE_INFINITY;
    setGameStatus("Move your raised hand over a figure. Re-enter to select it five times.");
    gameFrame = requestAnimationFrame(trackHand);
  } catch (error) {
    if (!gameOpen || session !== gameSession) return;
    console.error("Could not start the camera hand-tracking game.", error);
    stopGameResources();
    setGameStatus(
      error.name === "NotAllowedError"
        ? "Camera access was denied. Allow camera access, then try again."
        : "Could not start camera hand tracking. Check your camera and try again."
    );
    retryGameButton.hidden = false;
    startGameButton.disabled = false;
  }
}

function setDrinkStatus(message) {
  if (drinkStatus.textContent !== message) {
    drinkStatus.textContent = message;
  }
}

function resetDrinkGame() {
  fillLevel = 0;
  mouthIsOpen = false;
  drinkActive = false;
  lastPourTimestamp = null;
  drinkLiquid.style.height = "0%";
  drinkCup.classList.remove("overflowing");
  drinkCup.setAttribute("aria-label", "Empty cup");
  drinkScore.textContent = "Score: 0";
}

function stopDrinkResources() {
  if (drinkFrame !== null) {
    cancelAnimationFrame(drinkFrame);
    drinkFrame = null;
  }

  if (drinkStream) {
    drinkStream.getTracks().forEach((track) => track.stop());
    drinkStream = null;
  }

  if (faceLandmarker) {
    faceLandmarker.close();
    faceLandmarker = null;
  }

  drinkCamera.pause();
  drinkCamera.srcObject = null;
  drinkCamera.hidden = true;
}

function closeDrinkGame() {
  drinkOpen = false;
  drinkSession += 1;
  stopDrinkResources();
  drinkOverlay.classList.remove("open");
  drinkOverlay.setAttribute("aria-hidden", "true");
  startDrinkGameButton.hidden = false;
  startDrinkGameButton.disabled = false;
  retryDrinkGameButton.hidden = true;
  resetDrinkGame();
}

function openDrinkGame() {
  drinkOpen = true;
  drinkOverlay.classList.add("open");
  drinkOverlay.setAttribute("aria-hidden", "false");
  startDrinkGameButton.hidden = false;
  startDrinkGameButton.disabled = false;
  retryDrinkGameButton.hidden = true;
  resetDrinkGame();
  setDrinkStatus("Open your mouth to pour. Close it to lock your score before the cup overflows.");
}

function updateDrinkFill() {
  const visibleFill = Math.min(fillLevel, 100);
  drinkLiquid.style.height = `${visibleFill}%`;
  drinkScore.textContent = `Score: ${Math.floor(visibleFill)}`;
  drinkCup.setAttribute("aria-label", `Cup filled to ${Math.floor(visibleFill)} percent`);
  drinkCup.classList.toggle("overflowing", fillLevel >= 110);
}

function loseDrinkGame() {
  drinkActive = false;
  mouthIsOpen = false;
  drinkScore.textContent = "Score: 0 — overflow!";
  setDrinkStatus("The cup overflowed. Try again and close your mouth sooner.");
  retryDrinkGameButton.hidden = false;
  startDrinkGameButton.disabled = false;
  stopDrinkResources();
}

function finishDrinkGame() {
  drinkActive = false;
  mouthIsOpen = false;
  drinkScore.textContent = `Final score: ${Math.floor(Math.min(fillLevel, 100))}`;
  setDrinkStatus("Score locked! Play again to try another pour.");
  retryDrinkGameButton.hidden = false;
  stopDrinkResources();
}

function trackMouth(timestamp) {
  if (!drinkOpen || !drinkActive || !faceLandmarker) return;

  if (drinkCamera.readyState >= 2 && drinkCamera.currentTime !== lastFaceVideoTime) {
    lastFaceVideoTime = drinkCamera.currentTime;
    const result = faceLandmarker.detectForVideo(drinkCamera, timestamp);
    const landmarks = result.faceLandmarks?.[0];

    if (!landmarks) {
      mouthIsOpen = false;
      lastPourTimestamp = timestamp;
      setDrinkStatus("Face not detected. Move into the camera frame.");
    } else {
      const upperLip = landmarks[13];
      const lowerLip = landmarks[14];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const eyeWidth = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
      const mouthRatio = eyeWidth
        ? Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y) / eyeWidth
        : 0;
      const wasMouthOpen = mouthIsOpen;

      if (!mouthIsOpen && mouthRatio > 0.18) mouthIsOpen = true;
      if (mouthIsOpen && mouthRatio < 0.12) mouthIsOpen = false;

      const elapsed = lastPourTimestamp === null
        ? 0
        : Math.min((timestamp - lastPourTimestamp) / 1000, 0.1);
      lastPourTimestamp = timestamp;

      if (mouthIsOpen) {
        fillLevel += elapsed * 28;
        updateDrinkFill();

        if (fillLevel >= 110) {
          loseDrinkGame();
          return;
        }

        const pouringStatus = fillLevel >= 100
          ? "Cup is full! Close your mouth now."
          : fillLevel >= 85
            ? "Almost full! Close your mouth soon."
            : "Mouth open — pouring. Close it to lock your score.";
        setDrinkStatus(pouringStatus);
      } else if (wasMouthOpen) {
        finishDrinkGame();
        return;
      } else {
        setDrinkStatus("Open your mouth to pour; closing it locks your score.");
      }
    }
  }

  drinkFrame = requestAnimationFrame(trackMouth);
}

async function startDrinkGame() {
  const session = ++drinkSession;
  startDrinkGameButton.hidden = true;
  retryDrinkGameButton.hidden = true;
  resetDrinkGame();
  setDrinkStatus("Allow camera access to start mouth tracking.");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access requires HTTPS or localhost.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });

    if (!drinkOpen || session !== drinkSession) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    drinkStream = stream;
    drinkCamera.hidden = false;
    drinkCamera.srcObject = stream;
    await drinkCamera.play();

    const { FilesetResolver, FaceLandmarker } = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
    );
    if (!drinkOpen || session !== drinkSession) return;

    const visionFiles = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    if (!drinkOpen || session !== drinkSession) return;

    const landmarker = await FaceLandmarker.createFromOptions(visionFiles, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "CPU"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    if (!drinkOpen || session !== drinkSession) {
      landmarker.close();
      return;
    }

    faceLandmarker = landmarker;
    drinkActive = true;
    lastFaceVideoTime = -1;
    lastPourTimestamp = null;
    setDrinkStatus("Open your mouth to pour. Close it to lock your score before the cup overflows.");
    drinkFrame = requestAnimationFrame(trackMouth);
  } catch (error) {
    if (!drinkOpen || session !== drinkSession) return;
    console.error("Could not start the camera mouth-tracking game.", error);
    stopDrinkResources();
    setDrinkStatus(
      error.name === "NotAllowedError"
        ? "Camera access was denied. Allow camera access, then try again."
        : "Could not start mouth tracking. Check your camera and try again."
    );
    retryDrinkGameButton.hidden = false;
  }
}

document.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse") return;

  const point = { x: event.clientX, y: event.clientY };
  if (!lastTrailPoint) {
    lastTrailPoint = point;
    return;
  }

  const dx = point.x - lastTrailPoint.x;
  const dy = point.y - lastTrailPoint.y;
  const distance = Math.hypot(dx, dy);
  let distanceAlongPath = 0;

  while (distanceAlongPath + distanceToNextDot <= distance) {
    distanceAlongPath += distanceToNextDot;
    const dot = document.createElement("span");
    dot.className = "cursor-trail-dot";
    dot.style.left = `${lastTrailPoint.x + (dx * distanceAlongPath) / distance}px`;
    dot.style.top = `${lastTrailPoint.y + (dy * distanceAlongPath) / distance}px`;
    const stitchAngle = Math.atan2(dy, dx);
    dot.style.setProperty("--stitch-angle", `${stitchAngle}rad`);
    dot.addEventListener("animationend", () => dot.remove(), { once: true });
    cursorTrail.append(dot);
    distanceToNextDot = 7;
  }

  distanceToNextDot -= distance - distanceAlongPath;
  lastTrailPoint = point;
});

stone.addEventListener("click", () => {
  if (cardOpen) {
    cardOverlay.classList.remove("open");
    cardOverlay.setAttribute("aria-hidden", "true");
    stone.setAttribute("aria-expanded", "false");
    stone.setAttribute("aria-label", "Open a king card");
    cardOpen = false;
    currentKing = (currentKing + 1) % kings.length;
    showKing(currentKing);
  } else {
    showKing(currentKing);
    cardOverlay.classList.add("open");
    cardOverlay.setAttribute("aria-hidden", "false");
    stone.setAttribute("aria-expanded", "true");
    stone.setAttribute("aria-label", "Close king card");
    cardOpen = true;
  }
});

document.querySelector(".king-card").addEventListener("click", () => {
  if (!cardOpen) return;
  cardOverlay.classList.remove("open");
  cardOverlay.setAttribute("aria-hidden", "true");
  stone.setAttribute("aria-expanded", "false");
  stone.setAttribute("aria-label", "Open a king card");
  cardOpen = false;
  currentKing = (currentKing + 1) % kings.length;
  showKing(currentKing);
});

startGameButton.addEventListener("click", (event) => {
  event.stopPropagation();
  startMiniGame();
});

closeGameButton.addEventListener("click", closeMiniGame);
retryGameButton.addEventListener("click", startMiniGame);
drinkGameLaunch.addEventListener("click", openDrinkGame);
closeDrinkGameButton.addEventListener("click", closeDrinkGame);
startDrinkGameButton.addEventListener("click", startDrinkGame);
retryDrinkGameButton.addEventListener("click", startDrinkGame);

characters.forEach((character) => {
  character.element.addEventListener("click", () => registerCharacterSelection(character));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (drinkOpen) {
      closeDrinkGame();
    } else if (gameOpen) {
      closeMiniGame();
    }
  }
});
