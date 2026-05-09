const messages = [
    { type: "text", content: "Привіт, нажми пробел" },
    { type: "image", content: "img/privit.jpg" },
];

const terminalScene = document.getElementById("terminalScene");
const cakeScene = document.getElementById("cakeScene");
const output = document.getElementById("terminalOutput");
const introSound = document.getElementById("introSound");
const cakeSound = document.getElementById("cakeSound");
const imageSound = document.getElementById("imageSound");
const burningCake = document.getElementById("burningCake");
const extinguishCake = document.getElementById("extinguishCake");
const heartBurst = document.getElementById("heartBurst");

const redirectClick = 2;
const typingDelay = 45;
const depixelateDuration = 820;
const depixelateHoldDuration = 80;
const depixelateStages = [0.028, 0.045, 0.07, 0.11, 0.17, 0.25, 0.38, 0.56, 0.78, 1];
const introSoundStartTime = 95;
const introSoundFadeDuration = 4000;
const cakeSoundStartTime = 56;
const cakeSoundFadeDuration = 4000;
const asciiTrailChars = [".", ":", "*", "+", "~", "`", "^", "o", "x", "#", "%", "=", "-", "/"];
const asciiTrailMinDistance = 6;
const asciiTrailSpawnInterval = 12;
const asciiTrailStepDistance = 8;
const calibrationDuration = 1500;
const minBlowVolume = 0.018;
const blowMultiplier = 2.4;
const minFlatness = 0.58;
const flatnessBoost = 0.12;
const requiredBlowFrames = 6;
const heartBurstImage = "img/13-132546_zelda-clipart-minecraft-minecraft-heart-png.png";

let clickCount = 0;
let messageIndex = 0;
let sceneTransitionStarted = false;
let introSoundPlayed = false;
let cakeSoundStarted = false;
let isTyping = false;
let introSoundFadeFrame = null;
let cakeSoundFadeFrame = null;
let asciiTrailLayer = null;
let lastTrailPoint = null;
let lastTrailSpawnAt = 0;
let extinguishingStarted = false;
let listeningStarted = false;
let cakeSceneActive = false;
let blowFrames = 0;
let noiseFloor = 0.015;
let flatnessFloor = 0.45;

function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function ensureAsciiTrailLayer() {
    if (asciiTrailLayer) {
        return asciiTrailLayer;
    }

    asciiTrailLayer = document.createElement("div");
    asciiTrailLayer.className = "ascii-trail";
    asciiTrailLayer.setAttribute("aria-hidden", "true");
    document.body.appendChild(asciiTrailLayer);
    return asciiTrailLayer;
}

function spawnAsciiTrailGlyph(x, y) {
    const layer = ensureAsciiTrailLayer();
    const glyph = document.createElement("span");
    const driftX = (Math.random() - 0.5) * 34;
    const driftY = (-10 - (Math.random() * 28));
    const rotation = (Math.random() - 0.5) * 34;
    const scale = 0.85 + (Math.random() * 0.55);

    glyph.className = "ascii-trail__glyph";
    glyph.textContent = asciiTrailChars[Math.floor(Math.random() * asciiTrailChars.length)];
    glyph.style.setProperty("--trail-x", `${x}px`);
    glyph.style.setProperty("--trail-y", `${y}px`);
    glyph.style.setProperty("--trail-drift-x", `${driftX}px`);
    glyph.style.setProperty("--trail-drift-y", `${driftY}px`);
    glyph.style.setProperty("--trail-rotation", `${rotation}deg`);
    glyph.style.setProperty("--trail-scale", String(scale));

    layer.appendChild(glyph);
    glyph.addEventListener("animationend", () => {
        glyph.remove();
    }, { once: true });
}

function handlePointerTrail(event) {
    const now = performance.now();
    const point = { x: event.clientX, y: event.clientY };

    if (lastTrailPoint) {
        const dx = point.x - lastTrailPoint.x;
        const dy = point.y - lastTrailPoint.y;
        const distance = Math.hypot(dx, dy);

        if (distance < asciiTrailMinDistance || (now - lastTrailSpawnAt) < asciiTrailSpawnInterval) {
            return;
        }

        const steps = Math.max(1, Math.floor(distance / asciiTrailStepDistance));

        for (let i = 1; i <= steps; i += 1) {
            const progress = i / steps;
            spawnAsciiTrailGlyph(
                lastTrailPoint.x + (dx * progress),
                lastTrailPoint.y + (dy * progress)
            );
        }
    } else {
        spawnAsciiTrailGlyph(point.x, point.y);
    }

    lastTrailPoint = point;
    lastTrailSpawnAt = now;
}

async function typeText(line, text) {
    const textNode = document.createTextNode("");
    line.appendChild(textNode);

    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.setAttribute("aria-hidden", "true");
    line.appendChild(cursor);

    output.appendChild(line);
    output.scrollTop = output.scrollHeight;

    isTyping = true;
    for (const char of text) {
        textNode.textContent += char;
        output.scrollTop = output.scrollHeight;
        await wait(typingDelay);
    }
    isTyping = false;
}

async function printNextMessage() {
    if (messageIndex >= messages.length || sceneTransitionStarted) {
        return;
    }

    const activeCursor = output.querySelector(".cursor");
    if (activeCursor) {
        activeCursor.remove();
    }

    const msg = messages[messageIndex];
    messageIndex += 1;
    const line = document.createElement("p");
    line.className = "line";

    if (msg.type === "image") {
        const frame = document.createElement("div");
        const canvas = document.createElement("canvas");
        const img = document.createElement("img");

        frame.className = "terminal-image-frame";
        canvas.className = "terminal-image__canvas";
        img.src = msg.content;
        img.className = "terminal-image";
        frame.appendChild(img);
        frame.appendChild(canvas);
        line.appendChild(frame);
        const cursor = document.createElement("span");
        cursor.className = "cursor";
        cursor.setAttribute("aria-hidden", "true");
        line.appendChild(cursor);
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
        animateDepixelation(img);
        playImageSound();
        return;
    }

    await typeText(line, msg.content);
}

function fadeInAudio(audio, duration, frameRefSetter) {
    if (!audio) {
        return;
    }

    audio.volume = 0;
    let frameId = null;
    const startedAt = performance.now();

    function step(now) {
        const progress = Math.min((now - startedAt) / duration, 1);
        audio.volume = progress;

        if (progress < 1) {
            frameId = requestAnimationFrame(step);
            frameRefSetter(frameId);
            return;
        }

        frameRefSetter(null);
    }

    frameId = requestAnimationFrame(step);
    frameRefSetter(frameId);
}

function playIntroSoundOnce() {
    if (!introSound || introSoundPlayed) {
        return;
    }

    introSound.volume = 0;
    const startPlayback = () => {
        introSound.currentTime = introSoundStartTime;
        const playPromise = introSound.play();

        if (playPromise && typeof playPromise.then === "function") {
            playPromise
                .then(() => {
                    introSoundPlayed = true;
                    fadeInAudio(introSound, introSoundFadeDuration, (frameId) => {
                        introSoundFadeFrame = frameId;
                    });
                })
                .catch((error) => {
                    console.warn("Intro sound could not be played.", error);
                });
            return;
        }

        introSoundPlayed = true;
        fadeInAudio(introSound, introSoundFadeDuration, (frameId) => {
            introSoundFadeFrame = frameId;
        });
    };

    if (introSound.readyState >= 1) {
        startPlayback();
        return;
    }

    introSound.addEventListener("loadedmetadata", startPlayback, { once: true });
    introSound.load();
}

function playImageSound() {
    if (!imageSound) {
        return;
    }

    imageSound.currentTime = 0;
    const playPromise = imageSound.play();

    if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
    }
}

function animateDepixelation(image) {
    if (!image) {
        return;
    }

    const frame = image.closest(".terminal-image-frame");
    const canvas = frame?.querySelector(".terminal-image__canvas");

    if (!frame || !canvas) {
        image.classList.add("is-ready");
        return;
    }

    const render = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;

        if (!width || !height) {
            image.classList.add("is-ready");
            canvas.remove();
            return;
        }

        const context = canvas.getContext("2d");
        if (!context) {
            image.classList.add("is-ready");
            canvas.remove();
            return;
        }

        canvas.width = width;
        canvas.height = height;
        const buffer = document.createElement("canvas");
        const bufferContext = buffer.getContext("2d");

        if (!bufferContext) {
            image.classList.add("is-ready");
            canvas.remove();
            return;
        }

        const startedAt = performance.now();

        function drawFrame(now) {
            const elapsed = now - startedAt;
            const animationWindow = Math.max(depixelateDuration - depixelateHoldDuration, 1);
            const normalized = Math.max(0, elapsed - depixelateHoldDuration) / animationWindow;
            const progress = Math.min(normalized, 1);
            const stageIndex = Math.min(
                depixelateStages.length - 1,
                Math.floor(progress * (depixelateStages.length - 1))
            );
            const scale = depixelateStages[stageIndex];
            const sampleWidth = Math.max(1, Math.round(width * scale));
            const sampleHeight = Math.max(1, Math.round(height * scale));

            context.clearRect(0, 0, width, height);
            context.imageSmoothingEnabled = false;
            buffer.width = sampleWidth;
            buffer.height = sampleHeight;
            bufferContext.clearRect(0, 0, sampleWidth, sampleHeight);
            bufferContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
            context.drawImage(buffer, 0, 0, sampleWidth, sampleHeight, 0, 0, width, height);

            if (elapsed < depixelateDuration) {
                requestAnimationFrame(drawFrame);
                return;
            }

            image.classList.add("is-ready");
            canvas.classList.add("is-finished");
            canvas.addEventListener("transitionend", () => {
                canvas.remove();
            }, { once: true });
        }

        requestAnimationFrame(drawFrame);
    };

    if (image.complete) {
        render();
        return;
    }

    image.addEventListener("load", render, { once: true });
    image.addEventListener("error", () => {
        image.classList.add("is-ready");
        canvas.remove();
    }, { once: true });
}

function playVideo(video) {
    if (!video) {
        return;
    }

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
    }
}

function playCakeSoundOnce() {
    if (!cakeSound || cakeSoundStarted) {
        return;
    }

    cakeSound.volume = 0;
    const startPlayback = () => {
        cakeSound.currentTime = cakeSoundStartTime;
        const playPromise = cakeSound.play();

        if (playPromise && typeof playPromise.then === "function") {
            playPromise
                .then(() => {
                    cakeSoundStarted = true;
                    fadeInAudio(cakeSound, cakeSoundFadeDuration, (frameId) => {
                        cakeSoundFadeFrame = frameId;
                    });
                })
                .catch(() => {});
            return;
        }

        cakeSoundStarted = true;
        fadeInAudio(cakeSound, cakeSoundFadeDuration, (frameId) => {
            cakeSoundFadeFrame = frameId;
        });
    };

    if (cakeSound.readyState >= 1) {
        startPlayback();
        return;
    }

    cakeSound.addEventListener("loadedmetadata", startPlayback, { once: true });
    cakeSound.load();
}

function spawnHeartItem() {
    if (!heartBurst) {
        return;
    }

    const heart = document.createElement("img");
    const startX = Math.random() * window.innerWidth;
    const startY = (Math.random() * window.innerHeight * 0.88) + (window.innerHeight * 0.06);
    const spreadX = (Math.random() - 0.5) * Math.min(window.innerWidth * 0.18, 180);
    const spreadY = (-30 - (Math.random() * Math.min(window.innerHeight * 0.18, 140)));
    const size = 14 + Math.random() * 22;
    const duration = 7000 + Math.random() * 5000;
    const delay = Math.random() * 1200;
    const rotation = `${(Math.random() - 0.5) * 80}deg`;

    heart.className = "heart-burst__item";
    heart.src = heartBurstImage;
    heart.alt = "";
    heart.decoding = "async";
    heart.style.setProperty("--heart-x", `${startX}px`);
    heart.style.setProperty("--heart-y", `${startY}px`);
    heart.style.setProperty("--heart-drift-x", `${spreadX}px`);
    heart.style.setProperty("--heart-drift-y", `${spreadY}px`);
    heart.style.setProperty("--heart-size", `${size}px`);
    heart.style.setProperty("--heart-duration", `${duration}ms`);
    heart.style.setProperty("--heart-rotate", rotation);
    heart.style.animationDelay = `${delay}ms`;

    heartBurst.appendChild(heart);
    heart.addEventListener("animationend", () => {
        heart.remove();

        if (!extinguishingStarted) {
            return;
        }

        window.setTimeout(() => {
            if (extinguishingStarted) {
                spawnHeartItem();
            }
        }, 120 + (Math.random() * 500));
    }, { once: true });
}

function spawnHeartBurst() {
    if (!heartBurst) {
        return;
    }

    heartBurst.replaceChildren();

    for (let i = 0; i < 64; i += 1) {
        spawnHeartItem();
    }
}

function extinguishCandles() {
    if (extinguishingStarted || !cakeSceneActive) {
        return;
    }

    extinguishingStarted = true;
    spawnHeartBurst();
    extinguishCake.currentTime = 0;
    extinguishCake.classList.add("is-visible");
    burningCake.pause();
    burningCake.classList.remove("is-visible");
    playVideo(extinguishCake);
}

async function listenForBlow() {
    if (listeningStarted) {
        return;
    }

    listeningStarted = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        listeningStarted = false;
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        });

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            stream.getTracks().forEach((track) => track.stop());
            listeningStarted = false;
            return;
        }

        const audioContext = new AudioContext();
        await audioContext.resume();

        const microphone = audioContext.createMediaStreamSource(stream);
        const highpass = audioContext.createBiquadFilter();
        const analyser = audioContext.createAnalyser();

        highpass.type = "highpass";
        highpass.frequency.value = 1400;
        highpass.Q.value = 0.7;
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.65;

        const timeSamples = new Float32Array(analyser.fftSize);
        const frequencySamples = new Uint8Array(analyser.frequencyBinCount);
        const calibrationStartedAt = performance.now();

        microphone.connect(highpass);
        highpass.connect(analyser);

        function getBandRange(sampleRate, fftSize, minHz, maxHz, binCount) {
            const hzPerBin = sampleRate / fftSize;
            const start = Math.max(0, Math.floor(minHz / hzPerBin));
            const end = Math.min(binCount - 1, Math.ceil(maxHz / hzPerBin));
            return { start, end };
        }

        const blowBand = getBandRange(
            audioContext.sampleRate,
            analyser.fftSize,
            1400,
            9000,
            analyser.frequencyBinCount
        );

        function getRms(samples) {
            let sum = 0;

            for (const sample of samples) {
                sum += sample * sample;
            }

            return Math.sqrt(sum / samples.length);
        }

        function getSpectralFlatness(samples, startBin, endBin) {
            let logSum = 0;
            let linearSum = 0;
            let count = 0;

            for (let i = startBin; i <= endBin; i += 1) {
                const energy = (samples[i] / 255) + 1e-6;
                logSum += Math.log(energy);
                linearSum += energy;
                count += 1;
            }

            if (count === 0 || linearSum === 0) {
                return 0;
            }

            const geometricMean = Math.exp(logSum / count);
            const arithmeticMean = linearSum / count;
            return geometricMean / arithmeticMean;
        }

        function checkVolume() {
            if (extinguishingStarted || !cakeSceneActive) {
                stream.getTracks().forEach((track) => track.stop());
                audioContext.close();
                listeningStarted = false;
                return;
            }

            if (audioContext.state === "suspended") {
                audioContext.resume().catch(() => {});
            }

            analyser.getFloatTimeDomainData(timeSamples);
            analyser.getByteFrequencyData(frequencySamples);

            const volume = getRms(timeSamples);
            const flatness = getSpectralFlatness(
                frequencySamples,
                blowBand.start,
                blowBand.end
            );
            const isCalibrating = (performance.now() - calibrationStartedAt) < calibrationDuration;

            if (isCalibrating) {
                noiseFloor = (noiseFloor * 0.92) + (volume * 0.08);
                flatnessFloor = (flatnessFloor * 0.92) + (flatness * 0.08);
                requestAnimationFrame(checkVolume);
                return;
            }

            const blowThreshold = Math.max(minBlowVolume, noiseFloor * blowMultiplier);
            const flatnessThreshold = Math.max(minFlatness, flatnessFloor + flatnessBoost);
            const isBlowing = volume > blowThreshold && flatness > flatnessThreshold;

            if (isBlowing) {
                blowFrames += 1;
            } else {
                blowFrames = 0;
                noiseFloor = (noiseFloor * 0.97) + (volume * 0.03);
                flatnessFloor = (flatnessFloor * 0.97) + (flatness * 0.03);
            }

            if (blowFrames >= requiredBlowFrames) {
                extinguishCandles();
                return;
            }

            requestAnimationFrame(checkVolume);
        }

        checkVolume();
    } catch (error) {
        listeningStarted = false;
    }
}

function showCakeScene() {
    if (sceneTransitionStarted) {
        return;
    }

    sceneTransitionStarted = true;
    cakeSceneActive = true;
    blowFrames = 0;
    noiseFloor = 0.015;
    flatnessFloor = 0.45;

    if (introSoundFadeFrame !== null) {
        cancelAnimationFrame(introSoundFadeFrame);
        introSoundFadeFrame = null;
    }

    if (introSound && !introSound.paused) {
        introSound.pause();
        introSound.currentTime = 0;
    }

    playVideo(burningCake);
    playCakeSoundOnce();
    listenForBlow();

    terminalScene.classList.add("is-hidden");
    cakeScene.classList.remove("is-hidden");
}

printNextMessage();

document.addEventListener("pointerdown", playIntroSoundOnce, { once: true });
document.addEventListener("keydown", playIntroSoundOnce, { once: true });
document.addEventListener("pointermove", handlePointerTrail);

function handleProgressInput(event) {
    if (isTyping) {
        return;
    }

    if (cakeSceneActive) {
        event.preventDefault();
        extinguishCandles();
        return;
    }

    event.preventDefault();
    clickCount += 1;

    if (clickCount >= redirectClick) {
        showCakeScene();
        return;
    }

    printNextMessage();
}

document.addEventListener("keydown", (event) => {
    if (event.code !== "Space") {
        return;
    }

    handleProgressInput(event);
});

document.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse") {
        return;
    }

    handleProgressInput(event);
});
