let ctx = new AudioContext();
let dac = ctx.destination;
let foa = Omnitone.createFOARenderer(ctx);
let theta = 0;

let source;
let sourceBuffer;

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


let B1 = ctx.createConvolver();
let B1buffer;
let B2 = ctx.createConvolver();
let B2buffer;
let B3 = ctx.createConvolver();
let B3buffer;
let B4 = ctx.createConvolver();
let B4buffer;

function initAmbisonicB(reverb)
{
    loadB1(reverb);
    B1.buffer = B1buffer;
    loadB2(reverb);
    B2.buffer = B2buffer;
    loadB3(reverb);
    B3.buffer = B3buffer;
    loadB4(reverb);
    B4.buffer = B4buffer;
}

function convolveSource()
{
    if(convolve)
    {
        source.connect(B1);
        source.connect(B2);
        source.connect(B3);
        source.connect(B4);
    }
}

function mapB()
{
    B1.connect(W);
    B2.connect(Y);
    B3.connect(Z);
    B4.connect(X);
}

function play_BFormat() {
    if (isPlaying === true) {
        source.stop();
        isPlaying = false;
    } else {
        source = ctx.createBufferSource();
        source.buffer = sourceBuffer;

        convolveSource();
        mapB();
        combineB();
        omnitoneSetup();
        source.loop = true;
        source.start();
        isPlaying = true;
    }
}

function loadB1(reverb)
{
    let request = new XMLHttpRequest();
    request.open("GET", reverb + "1.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B1buffer = data);
    };
    request.send();
}

function loadB2(reverb)
{
    let request = new XMLHttpRequest();
    request.open("GET", reverb + "2.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B2buffer = data);
    };
    request.send();
}

function loadB3(reverb)
{
    let request = new XMLHttpRequest();
    request.open("GET", reverb + "3.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B3buffer = data);
    };
    request.send();
}

function loadB4(reverb)
{
    let request = new XMLHttpRequest();
    request.open("GET", reverb + "4.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B4buffer = data);
    };
    request.send();
}
