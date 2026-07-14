/**
 * Audio routing, processing, and playback
 * @author Ben Jordan, Kritan Duwal
 */

let ctx = new AudioContext();

let source;
let sourceBuffer;

let isPlaying = false;

// Room reverberation (Convolution Mix) control
let convolutionMix = 1.0; // start with full convolution mix
let stereoDryGain = null;
let stereoWetGainLeft = null;
let stereoWetGainRight = null;
let stereoLBuffer;
let stereoRBuffer;

/**
 * Sets the convolution mix amount
 * @param mix Value from 0 to 1
 */
function setConvolutionMix(mix) {
    convolutionMix = mix;
    const now = ctx.currentTime;

    if (stereoDryGain && stereoWetGainLeft && stereoWetGainRight) {
        stereoDryGain.gain.linearRampToValueAtTime(Math.min(1.0, Math.pow(0.35, (10 * mix - 1) / 9)), now + 0.05);
        stereoWetGainLeft.gain.linearRampToValueAtTime(mix, now + 0.05);
        stereoWetGainRight.gain.linearRampToValueAtTime(mix, now + 0.05);
    }
}

/**
 * Initializes Stereo format convolution
 */
async function initStereoConvolution(irLeftUrl, irRightUrl)
{
    // Load IRs
    stereoLBuffer = await loadAudioBuffer(ctx, irLeftUrl);
    stereoRBuffer = await loadAudioBuffer(ctx, irRightUrl);
}

// Utility to load audio buffer from a URL
async function loadAudioBuffer(audioContext, url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
}

function updatePlayButton() {
    const btn = document.getElementById('play');
    if (!btn) return;
    btn.textContent = isPlaying ? 'pause_circle_filled' : 'play_circle_filled';
    btn.classList.toggle('playing', isPlaying);
}

/**
 * Stereo format player
 */
async function playStereoFormat() {
    if (isPlaying === true) {
        if (source) {
            source.stop();
        }
        isPlaying = false;
        updatePlayButton();
        return;
    } else {
        irLeftUrl = reverb + "1.wav";
        irRightUrl = reverb + "2.wav";
        await initStereoConvolution(irLeftUrl, irRightUrl);

        // Create source
        source = ctx.createBufferSource();
        source.buffer = sourceBuffer;
        // Create convolver nodes
        convolverLeft = ctx.createConvolver();
        convolverLeft.buffer = stereoLBuffer;
        convolverRight = ctx.createConvolver();
        convolverRight.buffer = stereoRBuffer;
        // Create splitter and connect mono source to both convolvers
        const splitter = ctx.createChannelSplitter(1);
        merger = ctx.createChannelMerger(2);
        // Create gain nodes for wet/dry mix
        stereoDryGain = ctx.createGain();
        stereoWetGainLeft = ctx.createGain();
        stereoWetGainRight = ctx.createGain();
        // Set initial mix values
        stereoDryGain.gain.value = Math.min(1.0, Math.pow(0.35, (10 * convolutionMix - 1) / 9));
        stereoWetGainLeft.gain.value = convolutionMix;
        stereoWetGainRight.gain.value = convolutionMix;
        // Connect source to both dry and wet paths
        source.connect(splitter);
        source.connect(stereoDryGain);
        // Wet path: source -> convolver -> gain -> merger
        splitter.connect(convolverLeft, 0);
        splitter.connect(convolverRight, 0);
        convolverLeft.connect(stereoWetGainLeft);
        convolverRight.connect(stereoWetGainRight);
        stereoWetGainLeft.connect(merger, 0, 0);  // Left channel
        stereoWetGainRight.connect(merger, 0, 1); // Right channel
        // Dry path: source -> gain -> merger
        stereoDryGain.connect(merger, 0, 0);
        stereoDryGain.connect(merger, 0, 1);
        // Connect to output
        merger.connect(ctx.destination);
        // Start playback
        source.loop = true;
        source.start();
        isPlaying = true;
        updatePlayButton();

        //downloadConvolvedAudio(); // Uncomment to download the convolved output for testing
    }
}

/**
 * Renders the convolved (wet+dry mixed) output offline and downloads it as a WAV file.
 * Mirrors the live graph built in playStereoFormat() but through an OfflineAudioContext
 * so it can be rendered without playback. Useful for testing the convolution result.
 */
async function downloadConvolvedAudio() {
    if (!sourceBuffer || !stereoLBuffer || !stereoRBuffer) {
        console.warn('downloadConvolvedAudio: source or impulse responses not loaded yet.');
        return;
    }

    const offlineCtx = new OfflineAudioContext(2, sourceBuffer.length, ctx.sampleRate);

    const offlineSource = offlineCtx.createBufferSource();
    offlineSource.buffer = sourceBuffer;

    const convolverL = offlineCtx.createConvolver();
    convolverL.buffer = stereoLBuffer;
    const convolverR = offlineCtx.createConvolver();
    convolverR.buffer = stereoRBuffer;

    const splitter = offlineCtx.createChannelSplitter(1);
    const merger = offlineCtx.createChannelMerger(2);

    const dryGain = offlineCtx.createGain();
    const wetGainLeft = offlineCtx.createGain();
    const wetGainRight = offlineCtx.createGain();
    dryGain.gain.value = Math.min(1.0, Math.pow(0.35, (10 * convolutionMix - 1) / 9));
    wetGainLeft.gain.value = convolutionMix;
    wetGainRight.gain.value = convolutionMix;

    offlineSource.connect(splitter);
    offlineSource.connect(dryGain);
    splitter.connect(convolverL, 0);
    splitter.connect(convolverR, 0);
    convolverL.connect(wetGainLeft);
    convolverR.connect(wetGainRight);
    wetGainLeft.connect(merger, 0, 0);
    wetGainRight.connect(merger, 0, 1);
    dryGain.connect(merger, 0, 0);
    dryGain.connect(merger, 0, 1);
    merger.connect(offlineCtx.destination);

    offlineSource.start();
    const renderedBuffer = await offlineCtx.startRendering();

    const wavBlob = audioBufferToWav(renderedBuffer);
    const url = URL.createObjectURL(wavBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'convolved-output.wav';
    link.click();
    URL.revokeObjectURL(url);
}

/**
 * Encodes an AudioBuffer into a 16-bit PCM WAV file Blob
 */
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;

    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channels.push(buffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, channels[ch][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            offset += 2;
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

//file loading

/**
 * Checks if a file exists
 * @param url The file url
 * @returns {boolean} if the file exists
 */
function urlExists(url)
{
    let http = new XMLHttpRequest();
    let reverb = url + "1.wav";
    http.open('GET', reverb, false);
    http.send();
    return http.status !== 404;
}

/**
 * Loads a source file
 * @param url The source file
 */
function initSource(file)
{
    ctx.decodeAudioData(file, (data) => sourceBuffer = data);
}

function loadSource()
{
    let request = new XMLHttpRequest();
    request.open("GET", 'Source Files/Clarinet.wav', true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => sourceBuffer = data);
    };
    request.send();
}
