/**
 * Audio routing, processing, and playback
 * @author Ben Jordan
 */

let ctx = new AudioContext();
let dac = ctx.destination;
let foa = Omnitone.createFOARenderer(ctx);

let source;
let sourceBuffer;

let W = ctx.createGain(); W.gain.value *= 1.0;
let X = ctx.createGain(); X.gain.value *= 1.0;
let Y = ctx.createGain(); Y.gain.value *= 1.0;
let Z = ctx.createGain(); Z.gain.value *= 1.0;

let Xr = ctx.createGain();
let Yr = ctx.createGain();

let foainput = ctx.createChannelMerger(4);
let BformatGain = ctx.createGain();
BformatGain.gain.value = 10;
let outputGain = ctx.createGain();
outputGain.gain.value = .30;

let isPlaying = false;
let hasSelected = false;

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

/**
 * B format player
 */
function play_BFormat() {
    if (isPlaying === true) {
        B1.stop();
        B2.stop();
        B3.stop();
        B4.stop();
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

/**
 * A format player
 */
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

function disconnectNodes()
{
    if(format === 'A')
    {
        if(convolve)
        {
            source.disconnect(A1);
            source.disconnect(A2);
            source.disconnect(A3);
            source.disconnect(A4);

            A2.disconnect(NegA2);
            A3.disconnect(NegA3);
            A4.disconnect(NegA4);
            A1.disconnect(W);
            A2.disconnect(W);
            A3.disconnect(W);
            A4.disconnect(W);
            A1.disconnect(X);
            A2.disconnect(X);
            NegA3.disconnect(X);
            NegA4.disconnect(X);
            A1.disconnect(Y);
            NegA2.disconnect(Y);
            A3.disconnect(Y);
            NegA4.disconnect(Y);
            A1.disconnect(Z);
            NegA2.disconnect(Z);
            NegA3.disconnect(Z);
            A4.disconnect(Z);
        }
        else
        {
            source.disconnect(NegA2);
            source.disconnect(NegA3);
            source.disconnect(NegA4);
            source.disconnect(W);
            source.disconnect(W);
            source.disconnect(W);
            source.disconnect(W);
            source.disconnect(X);
            source.disconnect(X);
            NegA3.disconnect(X);
            NegA4.disconnect(X);
            source.disconnect(Y);
            NegA2.disconnect(Y);
            source.disconnect(Y);
            NegA4.disconnect(Y);
            source.disconnect(Z);
            NegA2.disconnect(Z);
            NegA3.disconnect(Z);
            source.disconnect(Z);
        }
        foa.output.disconnect(outputGain);
    }
    else if(format === 'B')
    {
        B1.disconnect(W);
        B2.disconnect(X);
        B3.disconnect(Y);
        B4.disconnect(Z);
        foa.output.disconnect(BformatGain);
        BformatGain.disconnect(outputGain);
    }

    W.disconnect(foainput, 0, 0);
    Y.disconnect(Yr);
    Yr.disconnect(foainput, 0, 1);
    Z.disconnect(foainput, 0, 2);
    X.disconnect(Xr);
    Xr.disconnect(foainput, 0, 3);
    foainput.disconnect(foa.input);
    outputGain.disconnect(dac);
}

/**
 * Connects 4 channel audio to the ambisonic renderer
 */
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

/**
 * Convolves the source file
 */
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

/**
 * Converts A format source to B format
 */
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

/**
 * Converts dry source to B format
 */
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

/**
 * Connects B format audio to 4 gain nodes
 */
function mapB()
{
    B1.connect(W);
    B2.connect(X);
    B3.connect(Y);
    B4.connect(Z);
}

/**
 * Combines 4 gain nodes to create 4 channel ambisonic input
 */
function combineB()
{
    W.connect(foainput, 0, 0);
    Y.connect(Yr);
    Yr.connect(foainput, 0, 1);
    Z.connect(foainput, 0, 2);
    X.connect(Xr);
    Xr.connect(foainput, 0, 3);
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
/**
 * Initializes A format convolution
 */
function initAmbisonicA()
{
    loadA1();
    A1.buffer = A1buffer;
    loadA2();
    A2.buffer = A2buffer;
    loadA3();
    A3.buffer = A3buffer;
    loadA4();
    A4.buffer = A4buffer;
}

/**
 * Initializes B format source audio
 */
function initAmbisonicB()
{
    B1 = ctx.createBufferSource();
    B2 = ctx.createBufferSource();
    B3 = ctx.createBufferSource();
    B4 = ctx.createBufferSource();
    ctx.decodeAudioData(bfile1, (data) => B1buffer = data);
    B1.buffer = B1buffer;
    ctx.decodeAudioData(bfile2, (data) => B2buffer = data);
    B2.buffer = B2buffer;
    ctx.decodeAudioData(bfile3, (data) => B3buffer = data);
    B3.buffer = B3buffer;
    ctx.decodeAudioData(bfile4, (data) => B4buffer = data);
    B4.buffer = B4buffer;
}

function loadAmbisonicB()
{
    B1 = ctx.createBufferSource();
    B2 = ctx.createBufferSource();
    B3 = ctx.createBufferSource();
    B4 = ctx.createBufferSource();
    loadB1();
    B1.buffer = B1buffer;
    loadB2();
    B2.buffer = B2buffer;
    loadB3();
    B3.buffer = B3buffer;
    loadB4();
    B4.buffer = B4buffer;
}

/**
 * Loads A format
 */
function loadA1()
{
    let request = new XMLHttpRequest();
    if (room === "BridgeCommunityChurch" || room === "ChristChurchCathedral" 
        || room === "DowntownPresbyterianChurch" || room === "FirstBaptistChurchCapitolHill" 
        || room === "HolyTrinityEpiscopalChurch" || room === "UnitedMethodistChurch") {
        request.open("GET", reverb + "5.wav", true);
    } else {
        request.open("GET", reverb + "1.wav", true);
    }
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => A1buffer = data);
    };
    request.send();
}

/**
 * Loads A format
 */
function loadA2()
{
    let request = new XMLHttpRequest();
    if (room === "BridgeCommunityChurch" || room === "ChristChurchCathedral" 
        || room === "DowntownPresbyterianChurch" || room === "FirstBaptistChurchCapitolHill" 
        || room === "HolyTrinityEpiscopalChurch" || room === "UnitedMethodistChurch") {
        request.open("GET", reverb + "6.wav", true);
    } else {
        request.open("GET", reverb + "2.wav", true);
    }
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => A2buffer = data);
    };
    request.send();
}

/**
 * Loads A format
 */
function loadA3()
{
    let request = new XMLHttpRequest();
    if (room === "BridgeCommunityChurch" || room === "ChristChurchCathedral" 
        || room === "DowntownPresbyterianChurch" || room === "FirstBaptistChurchCapitolHill" 
        || room === "HolyTrinityEpiscopalChurch" || room === "UnitedMethodistChurch") {
        request.open("GET", reverb + "7.wav", true);
    } else {
        request.open("GET", reverb + "3.wav", true);
    }
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => A3buffer = data);
    };
    request.send();
}

/**
 * Loads A format
 */
function loadA4()
{
    let request = new XMLHttpRequest();
    if (room === "BridgeCommunityChurch" || room === "ChristChurchCathedral" 
        || room === "DowntownPresbyterianChurch" || room === "FirstBaptistChurchCapitolHill" 
        || room === "HolyTrinityEpiscopalChurch" || room === "UnitedMethodistChurch") {
        request.open("GET", reverb + "8.wav", true);
    } else {
        request.open("GET", reverb + "4.wav", true);
    }
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => A4buffer = data);
    };
    request.send();
}

/**
 * Loads B format
 * @param reverb The url
 */
function loadB1()
{
    let request = new XMLHttpRequest();
    request.open("GET", bfile1, true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B1buffer = data);
    };
    request.send();
}

/**
 * Loads B format
 */
function loadB2()
{
    let request = new XMLHttpRequest();
    request.open("GET", bfile2, true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B2buffer = data);
    };
    request.send();
}

/**
 * Loads B format
 */
function loadB3()
{
    let request = new XMLHttpRequest();
    request.open("GET", bfile3, true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B3buffer = data);
    };
    request.send();
}

/**
 * Loads B format
 */
function loadB4()
{
    let request = new XMLHttpRequest();
    request.open("GET", bfile4, true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        ctx.decodeAudioData(request.response, (data) => B4buffer = data);
    };
    request.send();
}


