/**
 * Audio routing, processing, and playback
 * @author Ben Jordan, Kritan Duwal
 */

let ctx = new AudioContext();

let source;
let sourceBuffer;

let isPlaying = false;

// Convolution mix control
let convolutionMix = 1.0; // start with full convolution mix
let stereoDryGain = null;
let stereoWetGainLeft = null;
let stereoWetGainRight = null;
let stereoL = ctx.createConvolver();
let stereoLBuffer;
let stereoR = ctx.createConvolver();
let stereoRBuffer;

/**
 * Sets the convolution mix amount
 * @param mix Value from 0 to 1
 */
function setConvolutionMix(mix) {
    convolutionMix = mix;
    const now = ctx.currentTime;

    if (stereoDryGain && stereoWetGainLeft && stereoWetGainRight) {
        stereoDryGain.gain.linearRampToValueAtTime(1 - (mix/2), now + 0.05);
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

/**
 * Stereo format player
 */
async function playStereoFormat() {
    if (isPlaying === true) {
        if (source) {
            source.stop();
        }
        isPlaying = false;
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
        stereoDryGain.gain.value = 1 - (convolutionMix / 2);
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
    }
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
