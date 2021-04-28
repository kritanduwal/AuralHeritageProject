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
let BformatGain = ctx.createGain();
BformatGain.gain.value = 10;
let outputGain = ctx.createGain();
outputGain.gain.value = .30;

let numClicks = 0;

let isPlaying = false;


let A1 = ctx.createConvolver();
let A1buffer;
let A2 = ctx.createConvolver();
let A2buffer;
let A3 = ctx.createConvolver();
let A3buffer;
let A4 = ctx.createConvolver();
let A4buffer;

let NegA2 = ctx.createGain();
NegA2.gain.value = -1.0;
let NegA3 = ctx.createGain();
NegA3.gain.value = -1.0;
let NegA4 = ctx.createGain();
NegA4.gain.value = -1.0;

let B1;
let B1buffer;
let B2;
let B2buffer;
let B3;
let B3buffer;
let B4;
let B4buffer;

//play functions

function play_BFormat() {
    if (isPlaying === true) {
        B1.stop();
        B2.stop();
        B3.stop();
        B4.stop();
        foa.output.disconnect(BformatGain);
        initAmbisonicB();
        isPlaying = false;
    } else {
        mapB();
        combineB();
        omnitoneSetup();
        B1.loop = true;
        B2.loop = true;
        B3.loop = true;
        B4.loop = true;
        B1.start();
        B2.start();
        B3.start();
        B4.start();
        isPlaying = true;
    }
}


function play_AFormat() {
    if (isPlaying === true) {
        source.stop();
        isPlaying = false;
    } else {
        source = ctx.createBufferSource();
        source.buffer = sourceBuffer;

        convolveSource();
        combineB();
        omnitoneSetup();
        source.loop = true;
        source.start();
        isPlaying = true;
    }
}

//audio routing

function omnitoneSetup()
{
    foa.setRenderingMode('ambisonic');
    foa.initialize().then(function() {
        foainput.connect(foa.input);
        if(format === 'A')
        {
            foa.output.connect(outputGain);
        }
        else if(format === 'B')
        {
            foa.output.connect(BformatGain);
            BformatGain.connect(outputGain);
        }
        outputGain.connect(dac);
    }, function (onInitializationError) {
        console.error(onInitializationError)
    });
}

function convolveSource()
{
    if(convolve)
    {
        source.connect(A1);
        source.connect(A2);
        source.connect(A3);
        source.connect(A4);
        AtoB();
    }
    else
    {
        AtoBNoConv();
    }
}

function AtoB()
{
    A2.connect(NegA2);
    A3.connect(NegA3);
    A4.connect(NegA4);
    //W
    A1.connect(W);
    A2.connect(W);
    A3.connect(W);
    A4.connect(W);

    //X
    A1.connect(X);
    A2.connect(X);
    NegA3.connect(X);
    NegA4.connect(X);

    //Y
    A1.connect(Y);
    NegA2.connect(Y);
    A3.connect(Y);
    NegA4.connect(Y);

    //Z
    A1.connect(Z);
    NegA2.connect(Z);
    NegA3.connect(Z);
    A4.connect(Z);
}

function AtoBNoConv()
{
    source.connect(NegA2);
    source.connect(NegA3);
    source.connect(NegA4);
    //W
    source.connect(W);
    source.connect(W);
    source.connect(W);
    source.connect(W);

    //X
    source.connect(X);
    source.connect(X);
    NegA3.connect(X);
    NegA4.connect(X);

    //Y
    source.connect(Y);
    NegA2.connect(Y);
    source.connect(Y);
    NegA4.connect(Y);

    //Z
    source.connect(Z);
    NegA2.connect(Z);
    NegA3.connect(Z);
    source.connect(Z);
}

function mapB()
{
    B1.connect(W);
    B2.connect(X);
    B3.connect(Y);
    B4.connect(Z);
}

function combineB()
{
    W.connect(foainput, 0, 0);
    Y.connect(Yr);
    Yr.connect(foainput, 0, 1);
    Z.connect(Zr);
    Zr.connect(foainput, 0, 2);
    X.connect(Xr);
    Xr.connect(foainput, 0, 3);
}

//file loading


function urlExists(url)
{
    let http = new XMLHttpRequest();
    let reverb = url + "1.wav";
    http.open('GET', reverb, false);
    http.send();
    return http.status !== 404;
}

function loadSource(url)
{
    let request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => sourceBuffer = data);
    };
    request.send();
}

function initAmbisonicA(reverb)
{
    loadA1(reverb);
    A1.buffer = A1buffer;
    loadA2(reverb);
    A2.buffer = A2buffer;
    loadA3(reverb);
    A3.buffer = A3buffer;
    loadA4(reverb);
    A4.buffer = A4buffer;
}

function initAmbisonicB()
{
    B1 = ctx.createBufferSource();
    B2 = ctx.createBufferSource();
    B3 = ctx.createBufferSource();
    B4 = ctx.createBufferSource()
    loadB1();
    B1.buffer = B1buffer;
    loadB2();
    B2.buffer = B2buffer;
    loadB3();
    B3.buffer = B3buffer;
    loadB4();
    B4.buffer = B4buffer;
}

function loadA1(reverb)
{
    let request = new XMLHttpRequest();
    request.open("GET", reverb + "1.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => A1buffer = data);
    };
    request.send();
}

function loadA2(reverb)
{
    let request = new XMLHttpRequest();
    request.open("GET", reverb + "2.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => A2buffer = data);
    };
    request.send();
}

function loadA3(reverb)
{
    let request = new XMLHttpRequest();
    request.open("GET", reverb + "3.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => A3buffer = data);
    };
    request.send();
}

function loadA4(reverb)
{
    let request = new XMLHttpRequest();
    request.open("GET", reverb + "4.wav", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => A4buffer = data);
    };
    request.send();
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


