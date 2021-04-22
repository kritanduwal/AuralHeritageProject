let ctx = new AudioContext();
let dac = ctx.destination;
let foa = Omnitone.createFOARenderer(ctx);
let theta = 0;

let B1 = ctx.createBufferSource();
let B1buffer;
let B2 = ctx.createBufferSource();
let B2buffer;
let B3 = ctx.createBufferSource();
let B3buffer;
let B4 = ctx.createBufferSource()
let B4buffer;

let W = ctx.createGain(); W.gain.value *= 1.0;
let X = ctx.createGain(); X.gain.value *= 1.0;
let Y = ctx.createGain(); Y.gain.value *= 1.0;
let Z = ctx.createGain(); Z.gain.value *= 1.0;

let Xr = ctx.createGain();
let Yr = ctx.createGain();
let Zr = ctx.createGain();

let foainput = ctx.createChannelMerger(4);

let outputGain = ctx.createGain();
outputGain.gain.value = .30;

let numClicks = 0;

let isPlaying = false;

function initAmbisonicB()
{
    loadB1();
    B1.buffer = B1buffer;
    loadB2();
    B2.buffer = B2buffer;
    loadB3();
    B3.buffer = B3buffer;
    loadB4();
    B4.buffer = B4buffer;
}

function mapB()
{
    B1.connect(W);
    B2.connect(X);
    B3.connect(Y);
    B4.connect(Z);
}

function play_BFormat() {
    if (isPlaying === true) {
        source.stop();
        isPlaying = false;
    } else {
        source = ctx.createBufferSource();
        source.buffer = sourceBuffer;

        mapB();
        combineB();
        omnitoneSetup();
        source.loop = true;
        source.start();
        isPlaying = true;
    }
}

function loadB1()
{
    let request = new XMLHttpRequest();
    request.open("GET", "Ambisonic Files/B/ambix_local_W.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B1buffer = data);
    };
    request.send();
}

function loadB2()
{
    let request = new XMLHttpRequest();
    request.open("GET", "Ambisonic Files/B/ambix_local_X.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B2buffer = data);
    };
    request.send();
}

function loadB3()
{
    let request = new XMLHttpRequest();
    request.open("GET", "Ambisonic Files/B/ambix_local_Y.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B3buffer = data);
    };
    request.send();
}

function loadB4()
{
    let request = new XMLHttpRequest();
    request.open("GET", "Ambisonic Files/B/ambix_local_Z.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B4buffer = data);
    };
    request.send();
}
